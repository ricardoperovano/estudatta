"""Revisões espaçadas: agendadas a partir de sessões de estudo, concluídas por ação explícita
ou por uma sessão de revisão do mesmo tópico. Intervalos por usuário (padrão 1, 7 e 30 dias)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, ValidationFailed
from app.core.timeutil import today_in, utcnow
from app.models.activity import Activity
from app.models.content import Subject, Topic
from app.models.session import SessionDayAllocation, StudySession
from app.models.study import Revision
from app.models.user import User, UserPreferences

LEARNING_TYPES = ("teoria", "leitura", "aula", "pratica")
DEFAULT_INTERVALS = [1, 7, 30]


def intervals_for(db: Session, user: User) -> tuple[bool, list[int]]:
    prefs = db.get(UserPreferences, user.id)
    if prefs is None:
        return True, list(DEFAULT_INTERVALS)
    ints = [int(x) for x in (prefs.revision_intervals or DEFAULT_INTERVALS) if 1 <= int(x) <= 365]
    return bool(prefs.revisions_enabled), (sorted(set(ints)) or list(DEFAULT_INTERVALS))


def validate_intervals(values: list[int]) -> list[int]:
    try:
        ints = sorted({int(v) for v in values})
    except (TypeError, ValueError) as exc:
        raise ValidationFailed(
            "Intervalos precisam ser números de dias.", code="bad_intervals"
        ) from exc
    if not 1 <= len(ints) <= 6 or ints[0] < 1 or ints[-1] > 365:
        raise ValidationFailed("Use de 1 a 6 intervalos, entre 1 e 365 dias.", code="bad_intervals")
    return ints


def _session_local_date(db: Session, sess: StudySession) -> date:
    if sess.local_date:
        return sess.local_date
    last = (
        db.execute(
            select(SessionDayAllocation.local_date)
            .where(SessionDayAllocation.session_id == sess.id)
            .order_by(SessionDayAllocation.local_date.desc())
        )
        .scalars()
        .first()
    )
    return last or today_in(sess.timezone)


def _title(db: Session, sess_or_rev) -> str:
    if sess_or_rev.topic_id:
        t = db.get(Topic, sess_or_rev.topic_id)
        if t:
            subj = db.get(Subject, t.subject_id)
            return f"{subj.title} · {t.title}" if subj else t.title
    if sess_or_rev.subject_id:
        s = db.get(Subject, sess_or_rev.subject_id)
        if s:
            return s.title
    return "Revisão"


def _pending_for(db: Session, user: User, activity_id, topic_id, subject_id):
    q = select(Revision).where(
        Revision.user_id == user.id,
        Revision.activity_id == activity_id,
        Revision.status == "pending",
    )
    q = (
        q.where(Revision.topic_id == topic_id)
        if topic_id
        else q.where(Revision.topic_id.is_(None), Revision.subject_id == subject_id)
    )
    return list(db.execute(q.order_by(Revision.due_date)).scalars())


def on_session_recorded(db: Session, user: User, sess: StudySession) -> None:
    """Hook chamado após registrar uma sessão válida. Idempotente por (sessão, etapa)."""
    if sess.status != "finished" or not (sess.topic_id or sess.subject_id):
        return
    enabled, ints = intervals_for(db, user)
    if not enabled:
        return
    if sess.study_type == "revisao":
        pending = _pending_for(db, user, sess.activity_id, sess.topic_id, sess.subject_id)
        if pending:
            complete(db, user, pending[0], session_id=sess.id)
        return
    if sess.study_type not in LEARNING_TYPES:
        return
    if _pending_for(db, user, sess.activity_id, sess.topic_id, sess.subject_id):
        return  # já existe revisão agendada para este conteúdo
    exists = db.execute(
        select(Revision).where(Revision.source_session_id == sess.id, Revision.step == 1)
    ).scalar_one_or_none()
    if exists is not None:
        return
    studied_on = _session_local_date(db, sess)
    db.add(
        Revision(
            user_id=user.id,
            activity_id=sess.activity_id,
            subject_id=sess.subject_id,
            topic_id=sess.topic_id,
            source_session_id=sess.id,
            title=_title(db, sess),
            step=1,
            interval_days=ints[0],
            due_date=studied_on + timedelta(days=ints[0]),
        )
    )
    db.flush()


def get_revision(db: Session, user: User, revision_id: uuid.UUID) -> Revision:
    r = db.get(Revision, revision_id)
    if r is None or r.user_id != user.id:
        raise NotFound("Revisão não encontrada.")
    return r


def complete(
    db: Session, user: User, rev: Revision, *, session_id: uuid.UUID | None = None
) -> Revision | None:
    """Conclui a etapa e agenda a próxima (a partir de hoje). Retorna a próxima revisão, se houver."""
    if rev.status != "pending":
        return None
    act = db.get(Activity, rev.activity_id)
    today = today_in(act.timezone if act else user.timezone)
    rev.status = "done"
    rev.done_at = utcnow()
    rev.done_session_id = session_id
    _, ints = intervals_for(db, user)
    nxt = None
    if rev.step < len(ints):
        interval = ints[rev.step]
        nxt = Revision(
            user_id=user.id,
            activity_id=rev.activity_id,
            subject_id=rev.subject_id,
            topic_id=rev.topic_id,
            source_session_id=rev.source_session_id,
            title=rev.title,
            step=rev.step + 1,
            interval_days=interval,
            due_date=today + timedelta(days=interval),
        )
        existing = (
            db.execute(
                select(Revision).where(
                    Revision.source_session_id == rev.source_session_id,
                    Revision.step == rev.step + 1,
                )
            ).scalar_one_or_none()
            if rev.source_session_id
            else None
        )
        if existing is None:
            db.add(nxt)
        else:
            nxt = existing
    db.flush()
    return nxt


def skip(db: Session, rev: Revision) -> None:
    if rev.status == "pending":
        rev.status = "skipped"
        db.flush()


def reschedule(db: Session, rev: Revision, due: date) -> None:
    if rev.status != "pending":
        raise ValidationFailed("Só revisões pendentes podem ser reagendadas.", code="bad_state")
    rev.due_date = due
    db.flush()


def list_revisions(
    db: Session,
    user: User,
    *,
    status: str | None = "pending",
    until: date | None = None,
    activity_id=None,
    limit: int = 100,
) -> list[Revision]:
    q = select(Revision).where(Revision.user_id == user.id)
    if status:
        q = q.where(Revision.status == status)
    if until:
        q = q.where(Revision.due_date <= until)
    if activity_id:
        q = q.where(Revision.activity_id == activity_id)
    order = Revision.due_date if status == "pending" else Revision.done_at.desc()
    return list(db.execute(q.order_by(order).limit(limit)).scalars())


def summary(db: Session, user: User) -> dict:
    today = today_in(user.timezone)
    pending = list_revisions(db, user, status="pending", until=today + timedelta(days=7), limit=500)
    return {
        "today": today,
        "overdue": sum(1 for r in pending if r.due_date < today),
        "due_today": sum(1 for r in pending if r.due_date == today),
        "next_7_days": sum(1 for r in pending if today < r.due_date <= today + timedelta(days=7)),
    }
