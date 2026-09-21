"""Revisões espaçadas, simulados, análise do estudo (próxima matéria, edital, desempenho) e
gamificação (XP, níveis, conquistas, desafios, recordes)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.i18n import _
from app.models.user import User
from app.schemas.common import OkResponse, ORMModel
from app.services import activities as activity_service
from app.services import gamification as gami
from app.services import insights as insights_service
from app.services import mock_exams as mock_service
from app.services import revisions as revision_service

router = APIRouter(tags=["study"])


# ---------------------------------------------------------------- revisões
class RevisionOut(ORMModel):
    id: UUID
    activity_id: UUID
    subject_id: UUID | None
    topic_id: UUID | None
    title: str
    step: int
    interval_days: int
    due_date: date
    status: str
    done_at: datetime | None
    overdue: bool = False


class RevisionSummaryOut(BaseModel):
    today: date
    overdue: int
    due_today: int
    next_7_days: int


class RevisionRescheduleIn(BaseModel):
    due_date: date


def _rev_out(r, today: date) -> RevisionOut:
    o = RevisionOut.model_validate(r)
    o.overdue = r.status == "pending" and r.due_date < today
    return o


@router.get("/revisions", response_model=list[RevisionOut])
def list_revisions(
    status: Literal["pending", "done", "skipped"] | None = "pending",
    until: date | None = None,
    activity_id: UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RevisionOut]:
    from app.core.timeutil import today_in

    today = today_in(user.timezone)
    return [
        _rev_out(r, today)
        for r in revision_service.list_revisions(
            db, user, status=status, until=until, activity_id=activity_id, limit=limit
        )
    ]


@router.get("/revisions/summary", response_model=RevisionSummaryOut)
def revisions_summary(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> RevisionSummaryOut:
    return RevisionSummaryOut(**revision_service.summary(db, user))


@router.post("/revisions/{revision_id}/done", response_model=RevisionOut | None)
def revision_done(
    revision_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> RevisionOut | None:
    from app.core.timeutil import today_in

    rev = revision_service.get_revision(db, user, revision_id)
    nxt = revision_service.complete(db, user, rev)
    gami.evaluate(db, user)
    db.commit()
    return _rev_out(nxt, today_in(user.timezone)) if nxt else None


@router.post("/revisions/{revision_id}/skip", response_model=OkResponse)
def revision_skip(
    revision_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    revision_service.skip(db, revision_service.get_revision(db, user, revision_id))
    db.commit()
    return OkResponse(message=_("Revisão dispensada."))


@router.post("/revisions/{revision_id}/reschedule", response_model=RevisionOut)
def revision_reschedule(
    revision_id: UUID,
    payload: RevisionRescheduleIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RevisionOut:
    from app.core.timeutil import today_in

    rev = revision_service.get_revision(db, user, revision_id)
    revision_service.reschedule(db, rev, payload.due_date)
    db.commit()
    return _rev_out(rev, today_in(user.timezone))


# ---------------------------------------------------------------- simulados
class MockSubjectIn(BaseModel):
    subject_id: UUID | None = None
    subject_title: str | None = Field(default=None, max_length=160)
    total: int = Field(ge=0, le=1000)
    correct: int = Field(ge=0, le=1000)


class MockExamIn(BaseModel):
    title: str = Field(default="Simulado", min_length=1, max_length=200)
    taken_on: date
    total_questions: int | None = Field(default=None, ge=1, le=5000)
    correct: int | None = Field(default=None, ge=0, le=5000)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    notes: str | None = Field(default=None, max_length=2000)
    subjects: list[MockSubjectIn] | None = None


class MockExamUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    taken_on: date | None = None
    total_questions: int | None = Field(default=None, ge=1, le=5000)
    correct: int | None = Field(default=None, ge=0, le=5000)
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    notes: str | None = Field(default=None, max_length=2000)
    subjects: list[MockSubjectIn] | None = None


class MockSubjectOut(ORMModel):
    subject_id: UUID | None
    subject_title: str
    total: int
    correct: int


class MockExamOut(ORMModel):
    id: UUID
    activity_id: UUID
    title: str
    taken_on: date
    total_questions: int
    correct: int
    duration_minutes: int | None
    notes: str | None
    percent: float | None = None
    subjects: list[MockSubjectOut] = []


class MockSubjectStat(BaseModel):
    subject_id: UUID | None
    subject_title: str
    total: int
    correct: int
    percent: float | None
    last_percent: float | None


class MockOverviewOut(BaseModel):
    exams: list[MockExamOut]
    count: int
    best_percent: float | None
    last_percent: float | None
    change_from_previous: float | None
    subjects: list[MockSubjectStat]


def _exam_out(e) -> MockExamOut:
    o = MockExamOut.model_validate(e)
    o.percent = mock_service.percent(e)
    return o


@router.get("/activities/{activity_id}/mock-exams", response_model=MockOverviewOut)
def mock_overview(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> MockOverviewOut:
    act = activity_service.get_activity(db, user, activity_id)
    ov = mock_service.overview(db, user, act)
    return MockOverviewOut(
        **{
            **ov,
            "exams": [_exam_out(e) for e in ov["exams"]],
            "subjects": [MockSubjectStat(**s) for s in ov["subjects"]],
        }
    )


@router.post("/activities/{activity_id}/mock-exams", response_model=MockExamOut, status_code=201)
def mock_create(
    activity_id: UUID,
    payload: MockExamIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MockExamOut:
    act = activity_service.get_activity(db, user, activity_id)
    exam = mock_service.create(
        db, user, act, payload.model_dump(exclude_unset=False, mode="python")
    )
    gami.evaluate(db, user)
    db.commit()
    return _exam_out(mock_service.get_exam(db, user, exam.id))


@router.patch("/mock-exams/{exam_id}", response_model=MockExamOut)
def mock_update(
    exam_id: UUID,
    payload: MockExamUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MockExamOut:
    exam = mock_service.get_exam(db, user, exam_id)
    mock_service.update(db, user, exam, payload.model_dump(exclude_unset=True, mode="python"))
    db.commit()
    return _exam_out(mock_service.get_exam(db, user, exam_id))


@router.delete("/mock-exams/{exam_id}", response_model=OkResponse)
def mock_delete(
    exam_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    db.delete(mock_service.get_exam(db, user, exam_id))
    db.commit()
    return OkResponse(message=_("Simulado excluído."))


# ---------------------------------------------------------------- análise
class NextSubjectOut(BaseModel):
    subject_id: UUID
    subject_title: str
    topic_id: UUID | None
    topic_title: str | None
    weight: int
    difficulty: str
    expected_share: int
    actual_share: int
    reason: str


class CoverageOut(BaseModel):
    topics_total: int
    topics_studied: int
    topics_done: int
    percent_studied: int
    percent_done: int


class TypeSeconds(BaseModel):
    study_type: str
    label: str
    seconds: int


class WeekStatsOut(BaseModel):
    start: date
    end: date
    questions: int
    questions_correct: int
    accuracy: float | None
    pages: int
    questions_goal: int | None
    pages_goal: int | None
    by_type: list[TypeSeconds]


class AccuracyRow(BaseModel):
    subject_id: UUID | None
    subject_title: str
    questions: int
    correct: int
    percent: float | None


class InsightsOut(BaseModel):
    activity_id: UUID
    next_subject: NextSubjectOut | None
    coverage: CoverageOut
    week: WeekStatsOut
    accuracy_by_subject: list[AccuracyRow]


@router.get("/activities/{activity_id}/insights", response_model=InsightsOut)
def activity_insights(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> InsightsOut:
    act = activity_service.get_activity(db, user, activity_id)
    return InsightsOut(**insights_service.activity_insights(db, user, act))


# ---------------------------------------------------------------- gamificação
class LevelOut(BaseModel):
    number: int
    title: str
    xp_into_level: int
    xp_for_next: int
    next_at: int


class AchievementOut(BaseModel):
    code: str
    title: str
    description: str
    category: str
    category_label: str
    icon: str
    target: int
    progress: int
    unlocked: bool
    unlocked_at: datetime | None
    seen: bool


class ChallengeOut(BaseModel):
    code: str
    title: str
    target: int
    progress: int
    unit: str
    done: bool
    xp: int


class ChallengesOut(BaseModel):
    week_start: date
    items: list[ChallengeOut]


class RecordsOut(BaseModel):
    best_week_seconds: int
    best_week_start: date | None
    this_week_seconds: int
    best_streak: int
    current_streak: int
    longest_session_seconds: int
    most_questions_week: int
    best_mock_percent: float | None
    total_seconds: int
    total_questions: int
    total_pages: int


class BonusOut(BaseModel):
    title: str
    points: int
    kind: str
    created_at: datetime


class GamificationOut(BaseModel):
    xp: int
    level: LevelOut
    xp_breakdown: dict[str, int]
    achievements: list[AchievementOut]
    unlocked_count: int
    total_achievements: int
    unseen: list[AchievementOut]
    challenges: ChallengesOut
    records: RecordsOut
    recent_bonus: list[BonusOut]


class SeenIn(BaseModel):
    codes: list[str] | None = None


@router.get("/gamification", response_model=GamificationOut)
def gamification_profile(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> GamificationOut:
    data = gami.profile(db, user)
    db.commit()
    return GamificationOut(**data)


@router.post("/gamification/seen", response_model=OkResponse)
def gamification_seen(
    payload: SeenIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    n = gami.mark_seen(db, user, payload.codes)
    db.commit()
    return OkResponse(message=f"{n} conquista(s) marcada(s) como vistas.")
