"""Simulados: resultado total e por matéria, com evolução ao longo do tempo."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import NotFound, ValidationFailed
from app.models.activity import Activity
from app.models.content import Subject
from app.models.study import MockExam, MockExamSubject
from app.models.user import User


def _pct(correct: int, total: int) -> float | None:
    return round(100 * correct / total, 1) if total else None


def get_exam(db: Session, user: User, exam_id: uuid.UUID) -> MockExam:
    e = db.execute(
        select(MockExam).options(selectinload(MockExam.subjects)).where(MockExam.id == exam_id)
    ).scalar_one_or_none()
    if e is None or e.user_id != user.id:
        raise NotFound("Simulado não encontrado.")
    return e


def _apply(db: Session, user: User, exam: MockExam, act: Activity, data: dict) -> None:
    for k in ("title", "taken_on", "duration_minutes", "notes"):
        if k in data and data[k] is not None:
            setattr(exam, k, data[k])
    rows = data.get("subjects")
    if rows is not None:
        exam.subjects.clear()
        db.flush()
        for i, r in enumerate(rows):
            total, correct = int(r["total"]), int(r["correct"])
            if total < 0 or correct < 0 or correct > total or total > 1000:
                raise ValidationFailed(
                    "Em cada matéria, acertos não podem passar do total.", code="bad_mock_subject"
                )
            sid = r.get("subject_id")
            title = (r.get("subject_title") or "").strip()
            if sid:
                subj = db.get(Subject, sid)
                if subj is None or subj.user_id != user.id or subj.activity_id != act.id:
                    raise ValidationFailed(
                        "Matéria inválida para este objetivo.", code="bad_subject"
                    )
                title = title or subj.title
            if not title:
                raise ValidationFailed("Informe o nome da matéria.", code="bad_mock_subject")
            exam.subjects.append(
                MockExamSubject(
                    subject_id=sid,
                    subject_title=title[:160],
                    total=total,
                    correct=correct,
                    position=i,
                )
            )
        if rows:
            exam.total_questions = sum(int(r["total"]) for r in rows)
            exam.correct = sum(int(r["correct"]) for r in rows)
    if "total_questions" in data and data["total_questions"] is not None and not rows:
        exam.total_questions = int(data["total_questions"])
    if "correct" in data and data["correct"] is not None and not rows:
        exam.correct = int(data["correct"])
    if exam.total_questions is None or exam.total_questions <= 0 or exam.total_questions > 5000:
        raise ValidationFailed("Informe o total de questões do simulado.", code="bad_mock_total")
    if exam.correct is None or exam.correct < 0 or exam.correct > exam.total_questions:
        raise ValidationFailed(
            "Os acertos não podem passar do total de questões.", code="bad_mock_total"
        )


def create(db: Session, user: User, act: Activity, data: dict) -> MockExam:
    exam = MockExam(
        user_id=user.id,
        activity_id=act.id,
        title=(data.get("title") or "Simulado").strip()[:200],
        taken_on=data.get("taken_on") or date.today(),
        total_questions=0,
        correct=0,
    )
    db.add(exam)
    db.flush()
    _apply(db, user, exam, act, data)
    db.flush()
    return exam


def update(db: Session, user: User, exam: MockExam, data: dict) -> MockExam:
    act = db.get(Activity, exam.activity_id)
    _apply(db, user, exam, act, data)
    db.flush()
    return exam


def overview(db: Session, user: User, act: Activity) -> dict:
    exams = list(
        db.execute(
            select(MockExam)
            .options(selectinload(MockExam.subjects))
            .where(MockExam.activity_id == act.id, MockExam.user_id == user.id)
            .order_by(MockExam.taken_on, MockExam.created_at)
        ).scalars()
    )
    by_subject: dict[str, dict] = {}
    for e in exams:
        for s in e.subjects:
            key = str(s.subject_id) if s.subject_id else s.subject_title.lower()
            agg = by_subject.setdefault(
                key,
                {
                    "subject_id": s.subject_id,
                    "subject_title": s.subject_title,
                    "total": 0,
                    "correct": 0,
                    "last_percent": None,
                },
            )
            agg["total"] += s.total
            agg["correct"] += s.correct
            agg["last_percent"] = _pct(s.correct, s.total)
    subjects = sorted(
        ({**v, "percent": _pct(v["correct"], v["total"])} for v in by_subject.values()),
        key=lambda x: x["percent"] if x["percent"] is not None else 101,
    )
    best = max((_pct(e.correct, e.total_questions) or 0 for e in exams), default=None)
    last = _pct(exams[-1].correct, exams[-1].total_questions) if exams else None
    prev = _pct(exams[-2].correct, exams[-2].total_questions) if len(exams) > 1 else None
    return {
        "exams": exams,
        "count": len(exams),
        "best_percent": best,
        "last_percent": last,
        "change_from_previous": (
            round(last - prev, 1) if last is not None and prev is not None else None
        ),
        "subjects": subjects,
    }


def percent(exam: MockExam) -> float | None:
    return _pct(exam.correct, exam.total_questions)
