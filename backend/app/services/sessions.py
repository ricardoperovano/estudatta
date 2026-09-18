"""Sessões: cronômetro, pomodoro, lançamento manual, revisão e trilha de mudanças."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.timeutil import local_datetime_to_utc, today_in, utcnow
from app.domain.intervals import (
    TzPeriod,
    merged_focus_seconds,
    overlaps,
    split_by_local_date,
    truncate_seconds,
)
from app.models.activity import Activity, ActivityTimezone
from app.models.content import Material, Subject, Topic
from app.models.planning import PlannedTask
from app.models.session import SessionDayAllocation, SessionInterval, SessionRevision, StudySession
from app.models.user import User
from app.services.outbox import cancel_pending

LONG_INTERVAL_REVIEW_SECONDS = 4 * 3600  # intervalo de foco improvável sem revisão
MAX_MANUAL_SECONDS = 16 * 3600
MAX_DAY_SECONDS = 24 * 3600
MAX_CLOCK_SKEW = timedelta(minutes=10)
MAX_BACKDATE_DAYS = 366


def _now() -> datetime:
    return truncate_seconds(utcnow())


def get_session(db: Session, user: User, session_id: uuid.UUID) -> StudySession:
    s = db.execute(
        select(StudySession)
        .options(selectinload(StudySession.intervals))
        .where(StudySession.id == session_id)
    ).scalar_one_or_none()
    if s is None or s.user_id != user.id:
        raise NotFound("Sessão não encontrada.")
    return s


def active_session(db: Session, user: User) -> StudySession | None:
    return (
        db.execute(
            select(StudySession)
            .options(selectinload(StudySession.intervals))
            .where(StudySession.user_id == user.id, StudySession.status.in_(["active", "paused"]))
        )
        .scalars()
        .first()
    )


def _validate_refs(
    db: Session, user: User, act: Activity, subject_id, topic_id, material_id, planned_task_id
) -> None:
    if subject_id:
        s = db.get(Subject, subject_id)
        if s is None or s.user_id != user.id or s.activity_id != act.id:
            raise ValidationFailed("Matéria inválida para este objetivo.", code="bad_subject")
    if topic_id:
        t = db.get(Topic, topic_id)
        if t is None or t.user_id != user.id or (subject_id and t.subject_id != subject_id):
            raise ValidationFailed("Tópico inválido.", code="bad_topic")
    if material_id:
        m = db.get(Material, material_id)
        if m is None or m.user_id != user.id:
            raise ValidationFailed("Material inválido.", code="bad_material")
    if planned_task_id:
        pt = db.get(PlannedTask, planned_task_id)
        if pt is None or pt.user_id != user.id:
            raise ValidationFailed("Tarefa inválida.", code="bad_task")


def _client_time(value: datetime | None) -> datetime | None:
    """Horários do cliente são dados não confiáveis: limita desvio de relógio ao futuro."""
    if value is None:
        return None
    v = truncate_seconds(value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC))
    now = _now()
    if v > now + MAX_CLOCK_SKEW:
        raise ValidationFailed(
            "Horário no futuro. Verifique o relógio do aparelho.", code="clock_skew"
        )
    if v < now - timedelta(days=MAX_BACKDATE_DAYS):
        raise ValidationFailed("Data muito antiga para registro.", code="too_old")
    return v


def start_session(
    db: Session,
    user: User,
    act: Activity,
    *,
    kind: str = "timer",
    subject_id=None,
    topic_id=None,
    material_id=None,
    planned_task_id=None,
    note: str | None = None,
    pomodoro_config: dict | None = None,
    client_uuid: uuid.UUID | None = None,
    device_id: str | None = None,
    started_at: datetime | None = None,
) -> tuple[StudySession, bool]:
    """Inicia a sessão. Retorna (sessão, criada_agora). Garante uma única sessão ativa por usuário."""
    if act.status != "active":
        raise ValidationFailed("Este objetivo está pausado ou arquivado.", code="activity_inactive")
    if kind not in ("timer", "pomodoro"):
        raise ValidationFailed("Tipo de sessão inválido.")
    _validate_refs(db, user, act, subject_id, topic_id, material_id, planned_task_id)
    if client_uuid:
        existing = db.execute(
            select(StudySession).where(
                StudySession.user_id == user.id, StudySession.client_uuid == client_uuid
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False
    current = active_session(db, user)
    if current is not None:
        raise Conflict(
            "Já existe uma sessão em andamento.",
            code="session_active",
            details={
                "session_id": str(current.id),
                "activity_id": str(current.activity_id),
                "status": current.status,
                "device_id": current.device_id,
            },
        )
    start = _client_time(started_at) or _now()
    sess = StudySession(
        user_id=user.id,
        activity_id=act.id,
        subject_id=subject_id,
        topic_id=topic_id,
        material_id=material_id,
        planned_task_id=planned_task_id,
        kind=kind,
        entry_mode="timed",
        status="active",
        started_at=start,
        timezone=act.timezone,
        note=note,
        pomodoro_config=pomodoro_config,
        client_uuid=client_uuid,
        device_id=device_id,
    )
    db.add(sess)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        current = active_session(db, user)
        if current is not None:
            raise Conflict(
                "Já existe uma sessão em andamento.",
                code="session_active",
                details={
                    "session_id": str(current.id),
                    "activity_id": str(current.activity_id),
                    "status": current.status,
                    "device_id": current.device_id,
                },
            ) from exc
        raise
    db.add(SessionInterval(session_id=sess.id, kind="focus", started_at=start, block_index=0))
    db.flush()
    cancel_pending(
        db, user_id=user.id, kind="planned_start", activity_id=act.id, reason="session_started"
    )
    cancel_pending(
        db, user_id=user.id, kind="follow_up", activity_id=act.id, reason="session_started"
    )
    db.refresh(sess)
    return sess, True


def _open_interval(sess: StudySession) -> SessionInterval | None:
    for i in sess.intervals:
        if i.ended_at is None:
            return i
    return None


def _check_version(sess: StudySession, expected: int | None) -> None:
    if expected is not None and expected != sess.version:
        raise Conflict(
            "A sessão foi alterada em outro aparelho.",
            code="version_conflict",
            details={"version": sess.version},
        )


def pause_session(
    db: Session,
    sess: StudySession,
    *,
    at: datetime | None = None,
    expected_version: int | None = None,
) -> StudySession:
    _check_version(sess, expected_version)
    if sess.status != "active":
        if sess.status == "paused":
            return sess  # idempotente
        raise Conflict("A sessão não está em andamento.", code="bad_state")
    now = _client_time(at) or _now()
    cur = _open_interval(sess)
    if cur is not None:
        now = max(now, cur.started_at)
        cur.ended_at = now
    db.add(SessionInterval(session_id=sess.id, kind="pause", started_at=now))
    sess.status = "paused"
    sess.version += 1
    db.flush()
    db.refresh(sess)
    return sess


def resume_session(
    db: Session,
    sess: StudySession,
    *,
    at: datetime | None = None,
    expected_version: int | None = None,
) -> StudySession:
    _check_version(sess, expected_version)
    if sess.status != "paused":
        if sess.status == "active":
            return sess
        raise Conflict("A sessão não está pausada.", code="bad_state")
    now = _client_time(at) or _now()
    cur = _open_interval(sess)
    if cur is not None:
        now = max(now, cur.started_at)
        cur.ended_at = now
    blocks = [
        i.block_index for i in sess.intervals if i.kind == "focus" and i.block_index is not None
    ]
    db.add(
        SessionInterval(
            session_id=sess.id,
            kind="focus",
            started_at=now,
            block_index=(max(blocks) + 1) if blocks else 0,
        )
    )
    sess.status = "active"
    sess.version += 1
    db.flush()
    db.refresh(sess)
    return sess


def focus_intervals(
    sess: StudySession, until: datetime | None = None
) -> list[tuple[datetime, datetime]]:
    out = []
    for i in sess.intervals:
        if i.kind != "focus":
            continue
        end = i.ended_at or until
        if end is None:
            continue
        if end > i.started_at:
            out.append((i.started_at, end))
    return out


def elapsed_seconds(sess: StudySession, now: datetime | None = None) -> int:
    now = now or _now()
    return merged_focus_seconds(focus_intervals(sess, until=now))


def tz_history(db: Session, act: Activity) -> list[TzPeriod]:
    rows = db.execute(
        select(ActivityTimezone).where(ActivityTimezone.activity_id == act.id)
    ).scalars()
    return [TzPeriod(r.effective_from, r.timezone) for r in rows]


def reallocate_days(db: Session, sess: StudySession) -> dict[date, int]:
    """Recalcula a atribuição de segundos por dia local (substitui as linhas anteriores)."""
    for a in list(sess.day_allocations):
        db.delete(a)
    db.flush()
    alloc: dict[date, int] = {}
    if sess.status == "finished":
        if sess.entry_mode == "duration":
            if sess.local_date and sess.duration_seconds:
                alloc = {sess.local_date: int(sess.duration_seconds)}
        else:
            act = db.get(Activity, sess.activity_id)
            history = tz_history(db, act) if act else []
            alloc = split_by_local_date(focus_intervals(sess), history, sess.timezone)
    for d, secs in alloc.items():
        db.add(
            SessionDayAllocation(
                session_id=sess.id,
                activity_id=sess.activity_id,
                user_id=sess.user_id,
                local_date=d,
                seconds=secs,
            )
        )
    db.flush()
    return alloc


def _snapshot(sess: StudySession) -> dict:
    return {
        "status": sess.status,
        "entry_mode": sess.entry_mode,
        "started_at": sess.started_at.isoformat() if sess.started_at else None,
        "ended_at": sess.ended_at.isoformat() if sess.ended_at else None,
        "local_date": sess.local_date.isoformat() if sess.local_date else None,
        "duration_seconds": sess.duration_seconds,
        "subject_id": str(sess.subject_id) if sess.subject_id else None,
        "topic_id": str(sess.topic_id) if sess.topic_id else None,
        "material_id": str(sess.material_id) if sess.material_id else None,
        "note": sess.note,
        "page_from": sess.page_from,
        "page_to": sess.page_to,
        "needs_review": sess.needs_review,
        "counts_toward_goal": sess.counts_toward_goal,
    }


def _revision(
    db: Session,
    sess: StudySession,
    user: User,
    action: str,
    before: dict | None,
    after: dict | None,
    reason: str | None,
) -> None:
    db.add(
        SessionRevision(
            session_id=sess.id,
            user_id=user.id,
            action=action,
            before=before,
            after=after,
            reason=reason,
            created_at=utcnow(),
        )
    )


def finish_session(
    db: Session,
    user: User,
    sess: StudySession,
    *,
    at: datetime | None = None,
    note: str | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    subject_id=None,
    topic_id=None,
    confirmed_duration_seconds: int | None = None,
    expected_version: int | None = None,
) -> StudySession:
    _check_version(sess, expected_version)
    if sess.status == "finished":
        return sess
    if sess.status not in ("active", "paused"):
        raise Conflict("A sessão não pode ser encerrada.", code="bad_state")
    now = _client_time(at) or _now()
    cur = _open_interval(sess)
    if cur is not None:
        now = max(now, cur.started_at)
        cur.ended_at = now
    before = _snapshot(sess)
    sess.ended_at = now
    if note is not None:
        sess.note = note
    if page_from is not None:
        sess.page_from = page_from
    if page_to is not None:
        sess.page_to = page_to
    if subject_id is not None:
        sess.subject_id = subject_id
    if topic_id is not None:
        sess.topic_id = topic_id
    total = merged_focus_seconds(focus_intervals(sess))
    longest = max((int((e - s).total_seconds()) for s, e in focus_intervals(sess)), default=0)
    if confirmed_duration_seconds is not None:
        # usuário revisou a duração: consolida como registro por duração no dia de início
        if confirmed_duration_seconds <= 0 or confirmed_duration_seconds > MAX_MANUAL_SECONDS:
            raise ValidationFailed("Duração fora do limite.", code="bad_duration")
        sess.entry_mode = "duration"
        sess.local_date = (
            sess.started_at.astimezone(_zone(sess.timezone)).date()
            if sess.started_at
            else today_in(sess.timezone)
        )
        sess.duration_seconds = int(confirmed_duration_seconds)
        sess.needs_review = False
        sess.review_reason = None
    else:
        sess.duration_seconds = total
        if longest >= LONG_INTERVAL_REVIEW_SECONDS:
            sess.needs_review = True
            sess.review_reason = "long_running"
    if total == 0 and confirmed_duration_seconds is None:
        sess.status = "discarded"
        sess.version += 1
        db.flush()
        return sess
    sess.status = "finished"
    sess.version += 1
    db.flush()
    reallocate_days(db, sess)
    _revision(db, sess, user, "create", before, _snapshot(sess), None)
    db.flush()
    db.refresh(sess)
    return sess


def _zone(tz: str):
    from zoneinfo import ZoneInfo

    return ZoneInfo(tz)


def discard_session(db: Session, user: User, sess: StudySession) -> StudySession:
    if sess.status in ("active", "paused"):
        cur = _open_interval(sess)
        if cur is not None:
            cur.ended_at = _now()
    before = _snapshot(sess)
    sess.status = "discarded"
    sess.version += 1
    db.flush()
    reallocate_days(db, sess)
    _revision(db, sess, user, "delete", before, _snapshot(sess), "descartada")
    db.flush()
    return sess


def find_overlap(
    db: Session, user: User, start: datetime, end: datetime, exclude_id: uuid.UUID | None = None
) -> StudySession | None:
    q = (
        select(StudySession)
        .options(selectinload(StudySession.intervals))
        .where(
            StudySession.user_id == user.id,
            StudySession.status.in_(["finished", "active", "paused"]),
            StudySession.entry_mode == "timed",
            StudySession.started_at < end,
        )
    )
    for other in db.execute(q).scalars():
        if exclude_id and other.id == exclude_id:
            continue
        o_end = other.ended_at or _now()
        if other.started_at and overlaps(start, end, other.started_at, o_end):
            return other
    return None


def manual_session(
    db: Session,
    user: User,
    act: Activity,
    *,
    duration_seconds: int,
    local_date: date,
    start_time: time | None = None,
    subject_id=None,
    topic_id=None,
    material_id=None,
    planned_task_id=None,
    note: str | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    client_uuid: uuid.UUID | None = None,
    device_id: str | None = None,
) -> tuple[StudySession, bool]:
    """Lançamento manual: por duração+data (sem horário) ou com horário (vira sessão com intervalo)."""
    if duration_seconds <= 0 or duration_seconds > MAX_MANUAL_SECONDS:
        raise ValidationFailed(
            "Informe uma duração entre 1 minuto e 16 horas.", code="bad_duration"
        )
    today = today_in(act.timezone)
    if local_date > today:
        raise ValidationFailed(
            "Não é possível registrar tempo em uma data futura.", code="future_date"
        )
    if (today - local_date).days > MAX_BACKDATE_DAYS:
        raise ValidationFailed("Data muito antiga para registro.", code="too_old")
    _validate_refs(db, user, act, subject_id, topic_id, material_id, planned_task_id)
    if client_uuid:
        existing = db.execute(
            select(StudySession).where(
                StudySession.user_id == user.id, StudySession.client_uuid == client_uuid
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing, False
    # plausibilidade: total do dia (todos os objetivos) não pode passar de 24h
    from sqlalchemy import func

    day_total = db.execute(
        select(func.coalesce(func.sum(SessionDayAllocation.seconds), 0)).where(
            SessionDayAllocation.user_id == user.id, SessionDayAllocation.local_date == local_date
        )
    ).scalar_one()
    if int(day_total) + duration_seconds > MAX_DAY_SECONDS:
        raise ValidationFailed(
            "Esse registro ultrapassaria 24 horas no mesmo dia.", code="day_limit"
        )

    sess = StudySession(
        user_id=user.id,
        activity_id=act.id,
        subject_id=subject_id,
        topic_id=topic_id,
        material_id=material_id,
        planned_task_id=planned_task_id,
        kind="manual",
        status="finished",
        timezone=act.timezone,
        note=note,
        page_from=page_from,
        page_to=page_to,
        client_uuid=client_uuid,
        device_id=device_id,
        duration_seconds=int(duration_seconds),
    )
    if start_time is not None:
        start = local_datetime_to_utc(local_date, start_time, act.timezone)
        end = start + timedelta(seconds=duration_seconds)
        if end > _now() + MAX_CLOCK_SKEW:
            raise ValidationFailed("O horário informado termina no futuro.", code="future_time")
        other = find_overlap(db, user, start, end)
        if other is not None:
            raise Conflict(
                "Esse horário se sobrepõe a outra sessão registrada.",
                code="overlap",
                details={"session_id": str(other.id), "activity_id": str(other.activity_id)},
            )
        sess.entry_mode = "timed"
        sess.started_at = start
        sess.ended_at = end
        db.add(sess)
        db.flush()
        db.add(
            SessionInterval(
                session_id=sess.id, kind="focus", started_at=start, ended_at=end, source="client"
            )
        )
    else:
        sess.entry_mode = "duration"
        sess.local_date = local_date
        db.add(sess)
    db.flush()
    db.refresh(sess)
    reallocate_days(db, sess)
    _revision(db, sess, user, "create", None, _snapshot(sess), "registro manual")
    db.flush()
    cancel_pending(
        db, user_id=user.id, kind="follow_up", activity_id=act.id, reason="manual_logged"
    )
    return sess, True


def update_session(
    db: Session,
    user: User,
    sess: StudySession,
    *,
    duration_seconds: int | None = None,
    local_date: date | None = None,
    start_time: time | None = None,
    subject_id=None,
    topic_id=None,
    material_id=None,
    note: str | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    reason: str | None = None,
    expected_version: int | None = None,
    resolve_review: bool = False,
) -> StudySession:
    """Edição retroativa com trilha de mudanças; recalcula a atribuição por dia."""
    _check_version(sess, expected_version)
    if sess.status not in ("finished",):
        raise Conflict("Só sessões encerradas podem ser editadas.", code="bad_state")
    act = db.get(Activity, sess.activity_id)
    _validate_refs(db, user, act, subject_id, topic_id, material_id, None)
    before = _snapshot(sess)
    if subject_id is not None:
        sess.subject_id = subject_id
    if topic_id is not None:
        sess.topic_id = topic_id
    if material_id is not None:
        sess.material_id = material_id
    if note is not None:
        sess.note = note
    if page_from is not None:
        sess.page_from = page_from
    if page_to is not None:
        sess.page_to = page_to
    if duration_seconds is not None or local_date is not None or start_time is not None:
        dur = int(
            duration_seconds if duration_seconds is not None else (sess.duration_seconds or 0)
        )
        if dur <= 0 or dur > MAX_MANUAL_SECONDS:
            raise ValidationFailed("Duração fora do limite.", code="bad_duration")
        d = (
            local_date
            or sess.local_date
            or (
                sess.started_at.astimezone(_zone(sess.timezone)).date()
                if sess.started_at
                else today_in(sess.timezone)
            )
        )
        if d > today_in(sess.timezone):
            raise ValidationFailed("Data futura.", code="future_date")
        if start_time is not None:
            start = local_datetime_to_utc(d, start_time, sess.timezone)
            end = start + timedelta(seconds=dur)
            other = find_overlap(db, user, start, end, exclude_id=sess.id)
            if other is not None:
                raise Conflict(
                    "Esse horário se sobrepõe a outra sessão.",
                    code="overlap",
                    details={"session_id": str(other.id)},
                )
            for i in list(sess.intervals):
                db.delete(i)
            db.flush()
            db.add(
                SessionInterval(
                    session_id=sess.id,
                    kind="focus",
                    started_at=start,
                    ended_at=end,
                    source="client",
                )
            )
            sess.entry_mode = "timed"
            sess.started_at = start
            sess.ended_at = end
            sess.local_date = None
        else:
            # ao editar a duração de uma sessão cronometrada, ela passa a registro por duração
            sess.entry_mode = "duration"
            sess.local_date = d
        sess.duration_seconds = dur
    if resolve_review:
        sess.needs_review = False
        sess.review_reason = None
    sess.version += 1
    db.flush()
    db.refresh(sess)
    reallocate_days(db, sess)
    _revision(
        db, sess, user, "review" if resolve_review else "update", before, _snapshot(sess), reason
    )
    db.flush()
    return sess


def delete_session(db: Session, user: User, sess: StudySession, reason: str | None = None) -> None:
    before = _snapshot(sess)
    sess.status = "discarded"
    sess.version += 1
    db.flush()
    reallocate_days(db, sess)
    _revision(db, sess, user, "delete", before, _snapshot(sess), reason)
    db.flush()


def list_sessions(
    db: Session,
    user: User,
    *,
    activity_id: uuid.UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = 50,
    offset: int = 0,
    include_discarded: bool = False,
) -> list[StudySession]:
    q = (
        select(StudySession)
        .options(selectinload(StudySession.day_allocations))
        .where(StudySession.user_id == user.id)
    )
    if not include_discarded:
        q = q.where(StudySession.status != "discarded")
    if activity_id:
        q = q.where(StudySession.activity_id == activity_id)
    if start or end:
        sub = select(SessionDayAllocation.session_id).where(SessionDayAllocation.user_id == user.id)
        if start:
            sub = sub.where(SessionDayAllocation.local_date >= start)
        if end:
            sub = sub.where(SessionDayAllocation.local_date <= end)
        q = q.where(StudySession.id.in_(sub))
    q = q.order_by(StudySession.created_at.desc()).limit(limit).offset(offset)
    return list(db.execute(q).scalars())
