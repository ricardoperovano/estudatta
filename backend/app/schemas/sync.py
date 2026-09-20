from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.sessions import SessionOut

SyncKind = Literal[
    "session.manual",
    "session.start",
    "session.pause",
    "session.resume",
    "session.finish",
    "session.discard",
    "task.complete",
    "task.uncomplete",
]
SyncStatus = Literal["applied", "duplicate", "rejected", "conflict"]


class SyncOperationIn(BaseModel):
    op_id: UUID
    # `str` (e não `SyncKind`) de propósito: um tipo desconhecido é rejeitado por operação
    # (`unknown_kind`) sem derrubar o lote inteiro com 422.
    kind: str = Field(min_length=1, max_length=32)
    payload: dict[str, Any] = Field(default_factory=dict)
    client_created_at: datetime | None = None


class SyncBatchIn(BaseModel):
    device_id: str | None = Field(default=None, max_length=64)
    operations: list[SyncOperationIn] = Field(min_length=1, max_length=200)


class SyncErrorOut(BaseModel):
    code: str
    message: str
    details: Any = None


class SyncResultOut(BaseModel):
    op_id: UUID
    status: SyncStatus
    result: dict[str, Any] | None = None
    error: SyncErrorOut | None = None


class SyncBatchOut(BaseModel):
    results: list[SyncResultOut]
    server_time: datetime


class SyncStatusOut(BaseModel):
    server_time: datetime
    active_session: SessionOut | None
    last_sync_at: datetime | None


# --- Payloads por tipo de operação (validados no serviço) --------------------


class ManualPayload(BaseModel):
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
    pages_read: int | None = Field(default=None, ge=0, le=5000)
    study_type: str | None = Field(default=None, max_length=16)
    questions_total: int | None = Field(default=None, ge=0, le=5000)
    questions_correct: int | None = Field(default=None, ge=0, le=5000)


class StartPayload(BaseModel):
    activity_id: UUID
    kind: Literal["timer", "pomodoro"] = "timer"
    client_uuid: UUID | None = None
    started_at: datetime | None = None
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    material_id: UUID | None = None
    planned_task_id: UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    pomodoro_config: dict | None = None
    study_type: str | None = Field(default=None, max_length=16)


class SessionRefPayload(BaseModel):
    session_id: UUID | None = None
    client_uuid: UUID | None = None
    at: datetime | None = None
    expected_version: int | None = None


class FinishPayload(SessionRefPayload):
    note: str | None = Field(default=None, max_length=2000)
    page_from: int | None = Field(default=None, ge=0, le=100000)
    page_to: int | None = Field(default=None, ge=0, le=100000)
    pages_read: int | None = Field(default=None, ge=0, le=5000)
    study_type: str | None = Field(default=None, max_length=16)
    questions_total: int | None = Field(default=None, ge=0, le=5000)
    questions_correct: int | None = Field(default=None, ge=0, le=5000)
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    confirmed_duration_seconds: int | None = Field(default=None, ge=60, le=57600)


class TaskPayload(BaseModel):
    task_id: UUID
    expected_version: int | None = None
    completed_at: datetime | None = None
