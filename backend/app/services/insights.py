"""Análise do estudo por objetivo: próxima matéria sugerida (ciclo equilibrado por peso e
dificuldade), edital coberto, desempenho em questões, páginas e metas semanais, tempo por tipo."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutil import today_in
from app.models.activity import Activity
from app.models.content import Subject, Topic
from app.models.session import SessionDayAllocation, StudySession
from app.models.user import User

DIFFICULTY_FACTOR = {"facil": 0.8, "media": 1.0, "dificil": 1.3}
TYPE_LABEL = {
    "teoria": "Teoria",
    "questoes": "Questões",
    "revisao": "Revisão",
    "leitura": "Leitura",
    "aula": "Aula",
    "simulado": "Simulado",
    "pratica": "Prática",
    "outro": "Outro",
}
WINDOW_DAYS = 14


def _valid_sessions(activity_id):
    return (
        StudySession.activity_id == activity_id,
        StudySession.status == "finished",
        StudySession.counts_toward_goal.is_(True),
        StudySession.needs_review.is_(False),
    )


def pages_of(s: StudySession) -> int:
    if s.page_from and s.page_to and s.page_to >= s.page_from:
        return min(2000, s.page_to - s.page_from + 1)
    return 0


def week_bounds(d: date) -> tuple[date, date]:
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)


def seconds_by_subject(db: Session, act: Activity, start: date, end: date) -> dict:
    rows = db.execute(
        select(StudySession.subject_id, func.sum(SessionDayAllocation.seconds))
        .join(SessionDayAllocation, SessionDayAllocation.session_id == StudySession.id)
        .where(
            *_valid_sessions(act.id),
            SessionDayAllocation.local_date >= start,
            SessionDayAllocation.local_date <= end,
        )
        .group_by(StudySession.subject_id)
    ).all()
    return {sid: int(sec or 0) for sid, sec in rows}


def next_subject(db: Session, act: Activity) -> dict | None:
    """Ciclo equilibrado: a matéria com menor tempo recente em relação ao peso × dificuldade.
    Determinístico: desempate pela ordem da matéria."""
    subjects = list(
        db.execute(
            select(Subject)
            .where(Subject.activity_id == act.id, Subject.archived_at.is_(None))
            .order_by(Subject.sort_order, Subject.created_at)
        ).scalars()
    )
    if not subjects:
        return None
    today = today_in(act.timezone)
    recent = seconds_by_subject(db, act, today - timedelta(days=WINDOW_DAYS - 1), today)
    total_weight = sum(
        max(1, s.weight) * DIFFICULTY_FACTOR.get(s.difficulty, 1.0) for s in subjects
    )
    total_recent = sum(recent.get(s.id, 0) for s in subjects)
    best = None
    for idx, s in enumerate(subjects):
        share = max(1, s.weight) * DIFFICULTY_FACTOR.get(s.difficulty, 1.0) / total_weight
        done = recent.get(s.id, 0)
        ratio = done / share if share else done
        key = (ratio, idx)
        if best is None or key < best[0]:
            best = (key, s, share, done)
    _, subj, share, done = best
    topic = (
        db.execute(
            select(Topic)
            .where(Topic.subject_id == subj.id, Topic.status != "done")
            .order_by(Topic.status.desc(), Topic.sort_order, Topic.created_at)
        )
        .scalars()
        .first()
    )
    expected = round(share * 100)
    actual = round(100 * done / total_recent) if total_recent else 0
    if total_recent == 0:
        reason = "Nenhuma matéria estudada nos últimos 14 dias: comece pela primeira do ciclo."
    else:
        reason = f"Recebeu {actual}% do seu tempo nos últimos 14 dias; pelo peso e dificuldade, o equilíbrio seria {expected}%."
    return {
        "subject_id": subj.id,
        "subject_title": subj.title,
        "topic_id": topic.id if topic else None,
        "topic_title": topic.title if topic else None,
        "weight": subj.weight,
        "difficulty": subj.difficulty,
        "expected_share": expected,
        "actual_share": actual,
        "reason": reason,
    }


def coverage(db: Session, act: Activity) -> dict:
    topics = list(
        db.execute(
            select(Topic)
            .join(Subject, Subject.id == Topic.subject_id)
            .where(Subject.activity_id == act.id, Subject.archived_at.is_(None))
        ).scalars()
    )
    studied_ids = set(
        db.execute(
            select(StudySession.topic_id)
            .where(*_valid_sessions(act.id), StudySession.topic_id.is_not(None))
            .distinct()
        ).scalars()
    )
    total = len(topics)
    done = sum(1 for t in topics if t.status == "done")
    studied = sum(1 for t in topics if t.status != "not_started" or t.id in studied_ids)
    return {
        "topics_total": total,
        "topics_studied": studied,
        "topics_done": done,
        "percent_studied": round(100 * studied / total) if total else 0,
        "percent_done": round(100 * done / total) if total else 0,
    }


def _sessions_between(db: Session, act: Activity, start: date, end: date) -> list[StudySession]:
    ids = select(SessionDayAllocation.session_id).where(
        SessionDayAllocation.activity_id == act.id,
        SessionDayAllocation.local_date >= start,
        SessionDayAllocation.local_date <= end,
    )
    return list(
        db.execute(
            select(StudySession).where(*_valid_sessions(act.id), StudySession.id.in_(ids))
        ).scalars()
    )


def accuracy_by_subject(db: Session, act: Activity, since: date | None = None) -> list[dict]:
    q = select(StudySession).where(
        *_valid_sessions(act.id),
        StudySession.questions_total.is_not(None),
        StudySession.questions_total > 0,
    )
    sessions = list(db.execute(q).scalars())
    if since:
        keep = set(
            db.execute(
                select(SessionDayAllocation.session_id).where(
                    SessionDayAllocation.activity_id == act.id,
                    SessionDayAllocation.local_date >= since,
                )
            ).scalars()
        )
        sessions = [s for s in sessions if s.id in keep]
    titles = {
        s.id: s.title
        for s in db.execute(select(Subject).where(Subject.activity_id == act.id)).scalars()
    }
    agg: dict = defaultdict(lambda: [0, 0])
    for s in sessions:
        agg[s.subject_id][0] += s.questions_total or 0
        agg[s.subject_id][1] += s.questions_correct or 0
    out = [
        {
            "subject_id": sid,
            "subject_title": titles.get(sid, "Sem matéria"),
            "questions": t,
            "correct": c,
            "percent": round(100 * c / t, 1) if t else None,
        }
        for sid, (t, c) in agg.items()
    ]
    return sorted(out, key=lambda x: x["percent"] if x["percent"] is not None else 101)


def week_stats(db: Session, act: Activity, on: date | None = None) -> dict:
    today = on or today_in(act.timezone)
    start, end = week_bounds(today)
    sessions = _sessions_between(db, act, start, end)
    q_total = sum(s.questions_total or 0 for s in sessions)
    q_correct = sum(s.questions_correct or 0 for s in sessions)
    pages = sum(pages_of(s) for s in sessions)
    by_type: dict[str, int] = defaultdict(int)
    alloc = db.execute(
        select(StudySession.study_type, func.sum(SessionDayAllocation.seconds))
        .join(SessionDayAllocation, SessionDayAllocation.session_id == StudySession.id)
        .where(
            *_valid_sessions(act.id),
            SessionDayAllocation.local_date >= start,
            SessionDayAllocation.local_date <= end,
        )
        .group_by(StudySession.study_type)
    ).all()
    for t, sec in alloc:
        by_type[t or "teoria"] += int(sec or 0)
    return {
        "start": start,
        "end": end,
        "questions": q_total,
        "questions_correct": q_correct,
        "accuracy": round(100 * q_correct / q_total, 1) if q_total else None,
        "pages": pages,
        "questions_goal": act.weekly_questions_goal,
        "pages_goal": act.weekly_pages_goal,
        "by_type": [
            {"study_type": k, "label": TYPE_LABEL.get(k, k), "seconds": v}
            for k, v in sorted(by_type.items(), key=lambda kv: -kv[1])
        ],
    }


def activity_insights(db: Session, user: User, act: Activity) -> dict:
    return {
        "activity_id": act.id,
        "next_subject": next_subject(db, act),
        "coverage": coverage(db, act),
        "week": week_stats(db, act),
        "accuracy_by_subject": accuracy_by_subject(db, act),
    }
