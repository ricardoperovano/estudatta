"""Relatórios: resumo por período, histórico de sessões, exportação CSV e progresso de conteúdo.

Nada aqui pontua fluência ou chance de aprovação. Tempo registrado mede constância; o
progresso de conteúdo (tópicos/tarefas) é uma métrica separada.
"""

from __future__ import annotations

import calendar as pycal
import csv
import io
import uuid
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ValidationFailed
from app.core.timeutil import today_in
from app.domain.balance import DayBalance, day_span, streak
from app.models.activity import Activity
from app.models.content import Material, Subject, Topic
from app.models.planning import PlannedTask
from app.models.session import SessionDayAllocation, StudySession
from app.models.user import User
from app.services import balance as balance_service
from app.services import content as content_service
from app.services.activities import get_activity, list_activities

WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
WEEKDAY_IN = ["na", "na", "na", "na", "na", "no", "no"]
CLOSING = "Tempo registrado mede constância, não aprendizado."
MAX_EXPORT_DAYS = 400


# --- Período ---------------------------------------------------------------


def week_starts_on(user: User) -> int:
    prefs = user.preferences
    v = prefs.week_starts_on if prefs else 0
    return v if 0 <= int(v) <= 6 else 0


def period_bounds(period: str, d: date, wso: int = 0) -> tuple[date, date]:
    if period == "day":
        return d, d
    if period == "week":
        start = d - timedelta(days=(d.weekday() - wso) % 7)
        return start, start + timedelta(days=6)
    if period == "month":
        last = pycal.monthrange(d.year, d.month)[1]
        return d.replace(day=1), d.replace(day=last)
    raise ValidationFailed("Período inválido (use day, week ou month).", code="bad_period")


def _activities(db: Session, user: User, activity_id: uuid.UUID | None) -> list[Activity]:
    if activity_id is not None:
        return [get_activity(db, user, activity_id)]
    return [a for a in list_activities(db, user, include_archived=True)]


# --- Resumo ----------------------------------------------------------------


def _act_rows(db: Session, act: Activity, start: date, end: date):
    """(dias completos do objetivo até hoje, linhas do período por data, hoje)."""
    today = today_in(act.timezone)
    all_days = balance_service.compute_activity_balances(db, act)
    rows: dict[date, DayBalance] = {
        d.local_date: d for d in all_days if start <= d.local_date <= end
    }
    missing = [d for d in day_span(start, end) if d not in rows]
    if missing:
        for pt in balance_service.project_targets(db, act, min(missing), max(missing)):
            if pt.local_date not in rows:
                rows[pt.local_date] = pt
    return all_days, rows, today


def _join_pt(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " e " + items[-1]


def _day_label(d: date, period: str) -> str:
    if period == "week":
        return WEEKDAY_NAMES[d.weekday()]
    return f"dia {d.day}"


def _day_in(d: date, period: str, start: date, end: date) -> str:
    if start <= d <= end:
        if period == "week":
            return f"{WEEKDAY_IN[d.weekday()]} {WEEKDAY_NAMES[d.weekday()]}"
        return f"no dia {d.day}"
    return f"no dia {d.day}/{d.month}"


def reading_text(
    period: str,
    start: date,
    end: date,
    per_day: list[dict],
    gaps: dict[date, list[date]],
    recovered_by_src: dict[date, int],
    *,
    today: date,
    policy_none: bool,
) -> str:
    """Frase curta e honesta sobre o período, derivada de `recovered_from` do saldo.

    Nunca diz "você não estudou": só existe falta de registro."""
    rows = {r["local_date"]: r for r in per_day}
    sentences: list[str] = []
    mentioned: set[date] = set()
    for src in sorted(gaps)[:3]:
        row = rows.get(src)
        dests = sorted(set(gaps[src]))
        if row is None:
            sentences.append(
                f"O tempo pendente do dia {src.day}/{src.month} foi recuperado "
                f"{_join_pt([_day_in(x, period, start, end) for x in dests])}."
            )
            continue
        mentioned.add(src)
        label = _day_label(src, period).capitalize()
        state = "ficou sem registro" if row["logged"] == 0 else "ficou abaixo da meta"
        full = recovered_by_src.get(src, 0) >= row["deficit"]
        what = "o tempo foi recuperado" if full else "parte do tempo foi recuperada"
        sentences.append(
            f"{label} {state} e {what} {_join_pt([_day_in(x, period, start, end) for x in dests])}."
        )
    open_days = [
        r
        for r in per_day
        if r["local_date"] < today
        and r["target"] > 0
        and r["deficit"] > 0
        and r["local_date"] not in mentioned
        and recovered_by_src.get(r["local_date"], 0) < r["deficit"]
    ]
    no_log = [r for r in open_days if r["logged"] == 0]
    partial = [r for r in open_days if r["logged"] > 0]
    tail = (
        " a meta desses dias não é transferida para os próximos."
        if policy_none
        else " esse tempo segue como pendência."
    )
    if no_log:
        labels = [_day_label(r["local_date"], period) for r in no_log]
        verb = "ficou" if len(labels) == 1 else "ficaram"
        sentences.append(f"{_join_pt(labels).capitalize()} {verb} sem registro;{tail}")
    if partial:
        labels = [_day_label(r["local_date"], period) for r in partial]
        verb = "ficou" if len(labels) == 1 else "ficaram"
        sentences.append(f"{_join_pt(labels).capitalize()} {verb} abaixo da meta;{tail}")
    if not sentences:
        planned_so_far = [r for r in per_day if r["target"] > 0 and r["local_date"] <= today]
        if planned_so_far:
            sentences.append("Todos os dias com meta até aqui tiveram registro.")
        else:
            sentences.append("Nenhum dia com meta neste período.")
    return " ".join(sentences) + " " + CLOSING


def _by_subject(
    db: Session, user: User, act_ids: list[uuid.UUID], start: date, end: date
) -> list[dict]:
    if not act_ids:
        return []
    q = (
        select(StudySession.subject_id, func.sum(SessionDayAllocation.seconds))
        .join(StudySession, StudySession.id == SessionDayAllocation.session_id)
        .where(
            SessionDayAllocation.user_id == user.id,
            SessionDayAllocation.activity_id.in_(act_ids),
            SessionDayAllocation.local_date >= start,
            SessionDayAllocation.local_date <= end,
            StudySession.status == "finished",
            StudySession.counts_toward_goal.is_(True),
            StudySession.needs_review.is_(False),
        )
        .group_by(StudySession.subject_id)
    )
    rows = [(sid, int(s or 0)) for sid, s in db.execute(q).all() if int(s or 0) > 0]
    ids = [sid for sid, _ in rows if sid is not None]
    titles = (
        {s.id: s.title for s in db.execute(select(Subject).where(Subject.id.in_(ids))).scalars()}
        if ids
        else {}
    )
    out = [
        {
            "subject_id": sid,
            "title": titles.get(sid, "Sem matéria") if sid else "Sem matéria",
            "logged": secs,
        }
        for sid, secs in rows
    ]
    out.sort(key=lambda r: (-r["logged"], r["title"]))
    return out


def _sessions_stats(
    db: Session, user: User, act_ids: list[uuid.UUID], start: date, end: date
) -> tuple[int, int]:
    if not act_ids:
        return 0, 0
    sub = select(SessionDayAllocation.session_id).where(
        SessionDayAllocation.user_id == user.id,
        SessionDayAllocation.activity_id.in_(act_ids),
        SessionDayAllocation.local_date >= start,
        SessionDayAllocation.local_date <= end,
    )
    q = select(func.count(StudySession.id), func.sum(StudySession.duration_seconds)).where(
        StudySession.id.in_(sub),
        StudySession.status == "finished",
        StudySession.counts_toward_goal.is_(True),
        StudySession.needs_review.is_(False),
    )
    n, total = db.execute(q).one()
    n = int(n or 0)
    return n, (int(total or 0) // n if n else 0)


def summary(
    db: Session, user: User, *, period: str, on: date, activity_id: uuid.UUID | None = None
) -> dict:
    wso = week_starts_on(user)
    start, end = period_bounds(period, on, wso)
    acts = _activities(db, user, activity_id)
    user_today = today_in(user.timezone)

    per_date: dict[date, list[DayBalance]] = defaultdict(list)
    by_activity = []
    pending_open = 0
    gaps: dict[date, list[date]] = defaultdict(list)
    recovered_by_src: dict[date, int] = defaultdict(int)
    history: dict[date, list[DayBalance]] = defaultdict(list)
    for act in acts:
        all_days, rows, today = _act_rows(db, act, start, end)
        for d in all_days:
            history[d.local_date].append(d)
        for d, row in rows.items():
            per_date[d].append(row)
            for src, secs in row.recovered_from:
                gaps[src].append(d)
                recovered_by_src[src] += secs
        today_row = next((d for d in all_days if d.local_date == today), None)
        if today_row is not None and act.status != "archived":
            pending_open += today_row.pending_prior
        logged = sum(r.logged for r in rows.values())
        target = sum(r.target for r in rows.values())
        by_activity.append(
            {
                "activity_id": act.id,
                "title": act.title,
                "logged": logged,
                "target": target,
                "percent": round(100.0 * logged / target, 1) if target else None,
            }
        )

    per_day = []
    for d in day_span(start, end):
        rows = per_date.get(d, [])
        target = sum(r.target for r in rows)
        with_goal = [r for r in rows if r.target > 0]
        in_range = [r for r in rows if r.in_range]
        is_paused = bool(in_range) and all(r.is_paused for r in in_range)
        per_day.append(
            {
                "local_date": d,
                "target": target,
                "logged": sum(r.logged for r in rows),
                "goal_met": bool(with_goal) and all(r.goal_met for r in with_goal),
                "is_rest": target == 0 and not is_paused,
                "is_paused": is_paused,
                "deficit": sum(r.deficit for r in rows),
                "recovered": sum(r.recovered for r in rows),
            }
        )

    # sequência: dia planejado conta quando todos os objetivos com meta a cumpriram
    agg_history: list[DayBalance] = []
    for d in sorted(history):
        rows = history[d]
        with_goal = [r for r in rows if r.target > 0]
        agg_history.append(
            DayBalance(
                local_date=d,
                target=sum(r.target for r in rows),
                logged=sum(r.logged for r in rows),
                carry_in=0,
                missing_today=0,
                pending_prior=0,
                remaining_total=0,
                carry_out=0,
                recovered=0,
                extra=0,
                forgiven=0,
                is_rest=not with_goal,
                is_paused=False,
                in_range=True,
                goal_met=bool(with_goal) and all(r.goal_met for r in with_goal),
                rule_version=0,
                daily_limit=0,
            )
        )
    streak_current, streak_best = streak(agg_history, user_today)

    act_ids = [a.id for a in acts]
    sessions_count, avg_session = _sessions_stats(db, user, act_ids, start, end)
    policy_none = bool(acts) and all(a.recovery_policy == "none" for a in acts)
    return {
        "period": period,
        "start": start,
        "end": end,
        "planned_seconds": sum(r["target"] for r in per_day),
        "logged_seconds": sum(r["logged"] for r in per_day),
        "goal_days_planned": sum(1 for r in per_day if r["target"] > 0),
        "goal_days_met": sum(1 for r in per_day if r["goal_met"]),
        "days_with_log": sum(1 for r in per_day if r["logged"] > 0),
        "pending_open_seconds": pending_open,
        "recovered_seconds": sum(r["recovered"] for r in per_day),
        "extra_seconds": sum(r.extra for rows in per_date.values() for r in rows),
        "streak_current": streak_current,
        "streak_best": streak_best,
        "by_activity": by_activity,
        "by_subject": _by_subject(db, user, act_ids, start, end),
        "per_day": per_day,
        "sessions_count": sessions_count,
        "avg_session_seconds": avg_session,
        "reading": reading_text(
            period,
            start,
            end,
            per_day,
            gaps,
            recovered_by_src,
            today=user_today,
            policy_none=policy_none,
        ),
    }


# --- Sessões ---------------------------------------------------------------


def _titles(db: Session, sessions: list[StudySession]) -> dict[str, dict]:
    def load(model, ids):
        ids = [i for i in ids if i is not None]
        if not ids:
            return {}
        return {r.id: r.title for r in db.execute(select(model).where(model.id.in_(ids))).scalars()}

    return {
        "activity": load(Activity, {s.activity_id for s in sessions}),
        "subject": load(Subject, {s.subject_id for s in sessions}),
        "topic": load(Topic, {s.topic_id for s in sessions}),
        "material": load(Material, {s.material_id for s in sessions}),
    }


def list_sessions(
    db: Session,
    user: User,
    *,
    start: date | None,
    end: date | None,
    activity_id: uuid.UUID | None,
    limit: int,
    offset: int,
) -> tuple[list[StudySession], dict[str, dict]]:
    if activity_id is not None:
        get_activity(db, user, activity_id)
    if start and end:
        if end < start:
            raise ValidationFailed("A data final precisa ser igual ou depois da inicial.")
    q = (
        select(StudySession)
        .options(selectinload(StudySession.intervals))
        .where(StudySession.user_id == user.id, StudySession.status == "finished")
    )
    if activity_id is not None:
        q = q.where(StudySession.activity_id == activity_id)
    if start or end:
        sub = select(SessionDayAllocation.session_id).where(SessionDayAllocation.user_id == user.id)
        if start:
            sub = sub.where(SessionDayAllocation.local_date >= start)
        if end:
            sub = sub.where(SessionDayAllocation.local_date <= end)
        q = q.where(StudySession.id.in_(sub))
    # Mais recente primeiro pelo dia local em que a sessão contou (vale para cronômetro e para
    # lançamento por duração), depois início, criação e id: ordem total, estável entre páginas.
    last_day = (
        select(
            SessionDayAllocation.session_id.label("session_id"),
            func.max(SessionDayAllocation.local_date).label("last_date"),
        )
        .where(SessionDayAllocation.user_id == user.id)
        .group_by(SessionDayAllocation.session_id)
        .subquery()
    )
    q = (
        q.outerjoin(last_day, last_day.c.session_id == StudySession.id)
        .order_by(
            last_day.c.last_date.desc().nulls_last(),
            StudySession.started_at.desc().nulls_last(),
            StudySession.created_at.desc(),
            StudySession.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    rows = list(db.execute(q).scalars())
    return rows, _titles(db, rows)


# --- CSV -------------------------------------------------------------------


def export_csv(
    db: Session, user: User, *, start: date, end: date, activity_id: uuid.UUID | None
) -> str:
    if end < start:
        raise ValidationFailed("A data final precisa ser igual ou depois da inicial.")
    if (end - start).days > MAX_EXPORT_DAYS:
        raise ValidationFailed(
            f"Período longo demais (máximo {MAX_EXPORT_DAYS} dias).", code="range_too_long"
        )
    acts = _activities(db, user, activity_id)
    act_ids = [a.id for a in acts]
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(
        [
            "data_local",
            "objetivo",
            "materia",
            "topico",
            "material",
            "segundos",
            "minutos",
            "tipo",
            "modo",
            "inicio_utc",
            "fim_utc",
            "paginas",
            "observacao",
            "conta_no_saldo",
            "precisa_revisao",
        ]
    )
    if act_ids:
        q = (
            select(SessionDayAllocation, StudySession)
            .join(StudySession, StudySession.id == SessionDayAllocation.session_id)
            .where(
                SessionDayAllocation.user_id == user.id,
                SessionDayAllocation.activity_id.in_(act_ids),
                SessionDayAllocation.local_date >= start,
                SessionDayAllocation.local_date <= end,
                StudySession.status == "finished",
            )
            .order_by(
                SessionDayAllocation.local_date, StudySession.started_at, StudySession.created_at
            )
        )
        pairs = db.execute(q).all()
        titles = _titles(db, [s for _, s in pairs])
        for alloc, s in pairs:
            pages = f"{s.page_from or ''}-{s.page_to or ''}" if (s.page_from or s.page_to) else ""
            w.writerow(
                [
                    alloc.local_date.isoformat(),
                    titles["activity"].get(s.activity_id, ""),
                    titles["subject"].get(s.subject_id, "") if s.subject_id else "",
                    titles["topic"].get(s.topic_id, "") if s.topic_id else "",
                    titles["material"].get(s.material_id, "") if s.material_id else "",
                    alloc.seconds,
                    round(alloc.seconds / 60, 1),
                    s.kind,
                    s.entry_mode,
                    s.started_at.isoformat() if s.started_at else "",
                    s.ended_at.isoformat() if s.ended_at else "",
                    pages,
                    (s.note or "").replace("\n", " ").replace("\r", " "),
                    "sim" if s.counts_toward_goal else "nao",
                    "sim" if s.needs_review else "nao",
                ]
            )
    return "﻿" + buf.getvalue()


# --- Conteúdo --------------------------------------------------------------


def content_report(db: Session, user: User, act: Activity) -> dict:
    subjects = content_service.list_subjects(db, user, act)
    topics = content_service.list_topics(db, user, [s.id for s in subjects])
    tasks = list(
        db.execute(
            select(PlannedTask).where(
                PlannedTask.activity_id == act.id, PlannedTask.user_id == user.id
            )
        ).scalars()
    )
    topics_by_subject: dict[uuid.UUID, list[Topic]] = defaultdict(list)
    for t in topics:
        topics_by_subject[t.subject_id].append(t)
    tasks_by_subject: dict[uuid.UUID | None, list[PlannedTask]] = defaultdict(list)
    for t in tasks:
        tasks_by_subject[t.subject_id].append(t)

    def row(subject_id, title, color, tps: list[Topic], tks: list[PlannedTask]) -> dict:
        done = [t for t in tps if t.status == "done"]
        return {
            "subject_id": subject_id,
            "title": title,
            "color": color,
            "topics_total": len(tps),
            "topics_done": len(done),
            "topics_in_progress": sum(1 for t in tps if t.status == "in_progress"),
            "topics_not_started": sum(1 for t in tps if t.status == "not_started"),
            "percent_done": round(100.0 * len(done) / len(tps), 1) if tps else 0.0,
            "estimated_minutes_total": sum(int(t.estimated_minutes or 0) for t in tps),
            "estimated_minutes_done": sum(int(t.estimated_minutes or 0) for t in done),
            "tasks_total": len(tks),
            "tasks_done": sum(1 for t in tks if t.status == "done"),
            "tasks_skipped": sum(1 for t in tks if t.status == "skipped"),
            "tasks_planned": sum(1 for t in tks if t.status == "planned"),
        }

    by_subject = [
        row(s.id, s.title, s.color, topics_by_subject.get(s.id, []), tasks_by_subject.get(s.id, []))
        for s in subjects
    ]
    if tasks_by_subject.get(None):
        by_subject.append(row(None, "Sem matéria", None, [], tasks_by_subject[None]))
    total = len(topics)
    done = sum(1 for t in topics if t.status == "done")
    return {
        "activity_id": act.id,
        "subjects_total": len(subjects),
        "topics_total": total,
        "topics_done": done,
        "topics_in_progress": sum(1 for t in topics if t.status == "in_progress"),
        "percent_done": round(100.0 * done / total, 1) if total else 0.0,
        "tasks_total": len(tasks),
        "tasks_done": sum(1 for t in tasks if t.status == "done"),
        "tasks_skipped": sum(1 for t in tasks if t.status == "skipped"),
        "tasks_planned": sum(1 for t in tasks if t.status == "planned"),
        "by_subject": by_subject,
        "note": "Progresso de conteúdo e tempo registrado são medidas diferentes: "
        "concluir um tópico não lança minutos, e estudar não conclui tópicos.",
    }
