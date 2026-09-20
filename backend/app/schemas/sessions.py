from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

# mesma lista de app.services.sessions.STUDY_TYPES
StudyTypeLit = Literal[
    "teoria", "questoes", "revisao", "leitura", "aula", "simulado", "pratica", "outro"
]


class SessionStart(BaseModel):
    activity_id: UUID
    kind: Literal["timer", "pomodoro"] = "timer"
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    material_id: UUID | None = None
    planned_task_id: UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    pomodoro_config: dict | None = None
    client_uuid: UUID | None = None
    started_at: datetime | None = None
    study_type: StudyTypeLit | None = None


class SessionTransition(BaseModel):
    at: datetime | None = None
    expected_version: int | None = None


class SessionFinish(SessionTransition):
    note: str | None = Field(default=None, max_length=2000)
    page_from: int | None = Field(default=None, ge=0, le=100000)
    page_to: int | None = Field(default=None, ge=0, le=100000)
    pages_read: int | None = Field(default=None, ge=0, le=5000)  # "li N páginas": avança o marcador
    study_type: StudyTypeLit | None = None
    questions_total: int | None = Field(default=None, ge=0, le=5000)
    questions_correct: int | None = Field(default=None, ge=0, le=5000)
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    confirmed_duration_seconds: int | None = Field(default=None, ge=60, le=57600)


class SessionManual(BaseModel):
    activity_id: UUID
    duration_seconds: int = Field(ge=60, le=57600)
    local_date: date
    start_time: time | None = None
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    material_id: UUID | None = None
    planned_task_id: UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    page_from: int | None = Field(default=None, ge=0, le=100000)
    page_to: int | None = Field(default=None, ge=0, le=100000)
    pages_read: int | None = Field(default=None, ge=0, le=5000)  # "li N páginas": avança o marcador
    study_type: StudyTypeLit | None = None
    questions_total: int | None = Field(default=None, ge=0, le=5000)
    questions_correct: int | None = Field(default=None, ge=0, le=5000)
    client_uuid: UUID | None = None


class SessionUpdate(BaseModel):
    duration_seconds: int | None = Field(default=None, ge=60, le=57600)
    local_date: date | None = None
    start_time: time | None = None
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    material_id: UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    page_from: int | None = None
    page_to: int | None = None
    pages_read: int | None = Field(default=None, ge=0, le=5000)  # "li N páginas": avança o marcador
    study_type: StudyTypeLit | None = None
    questions_total: int | None = Field(default=None, ge=0, le=5000)
    questions_correct: int | None = Field(default=None, ge=0, le=5000)
    reason: str | None = Field(default=None, max_length=300)
    expected_version: int | None = None
    resolve_review: bool = False
    clear_questions: bool = False  # apaga questões/acertos (ex.: trocou para um tipo sem questões)


class IntervalOut(ORMModel):
    id: UUID
    kind: str
    started_at: datetime
    ended_at: datetime | None
    block_index: int | None


class SessionOut(ORMModel):
    id: UUID
    activity_id: UUID
    subject_id: UUID | None
    topic_id: UUID | None
    material_id: UUID | None
    planned_task_id: UUID | None
    kind: str
    entry_mode: str
    status: str
    started_at: datetime | None
    ended_at: datetime | None
    local_date: date | None
    duration_seconds: int | None
    timezone: str
    note: str | None
    page_from: int | None
    page_to: int | None
    study_type: str = "teoria"
    questions_total: int | None = None
    questions_correct: int | None = None
    pomodoro_config: dict | None
    client_uuid: UUID | None
    device_id: str | None
    needs_review: bool
    review_reason: str | None
    version: int
    counts_toward_goal: bool
    created_at: datetime
    intervals: list[IntervalOut] = Field(default_factory=list)
    elapsed_seconds: int = 0
    server_time: datetime | None = None


class SessionRevisionOut(ORMModel):
    id: UUID
    action: str
    before: dict | None
    after: dict | None
    reason: str | None
    created_at: datetime
