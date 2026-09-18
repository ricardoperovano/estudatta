from __future__ import annotations

from datetime import date, datetime, time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

TaskKind = Literal["study", "checklist"]
TaskStatus = Literal["planned", "done", "skipped"]


class TaskCreate(BaseModel):
    activity_id: UUID
    title: str = Field(min_length=1, max_length=200)
    kind: TaskKind = "study"
    local_date: date
    start_time: time | None = None
    estimated_seconds: int | None = Field(default=None, ge=0, le=86_400)
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    material_id: UUID | None = None
    page_from: int | None = Field(default=None, ge=0, le=100_000)
    page_to: int | None = Field(default=None, ge=0, le=100_000)
    priority: int = Field(default=2, ge=1, le=3)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    pinned: bool = False


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    kind: TaskKind | None = None
    local_date: date | None = None
    start_time: time | None = None
    clear_start_time: bool = False
    estimated_seconds: int | None = Field(default=None, ge=0, le=86_400)
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    material_id: UUID | None = None
    page_from: int | None = Field(default=None, ge=0, le=100_000)
    page_to: int | None = Field(default=None, ge=0, le=100_000)
    priority: int | None = Field(default=None, ge=1, le=3)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    pinned: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)
    expected_version: int | None = None


class RescheduleIn(BaseModel):
    local_date: date
    start_time: time | None = None
    clear_start_time: bool = False
    expected_version: int | None = None


class TaskOut(BaseModel):
    id: UUID | None
    series_id: UUID | None
    activity_id: UUID
    subject_id: UUID | None
    topic_id: UUID | None
    material_id: UUID | None
    title: str
    notes: str | None
    kind: str
    local_date: date
    original_date: date | None
    start_time: str | None
    estimated_seconds: int | None
    page_from: int | None
    page_to: int | None
    priority: int
    due_date: date | None
    pinned: bool
    status: str
    completed_at: datetime | None
    recovery_seconds: int
    sort_order: int
    version: int
    virtual: bool = False


class SeriesCreate(BaseModel):
    activity_id: UUID
    title: str = Field(min_length=1, max_length=200)
    weekdays: list[int] = Field(min_length=1, max_length=7)
    start_date: date
    end_date: date | None = None
    start_time: time | None = None
    estimated_seconds: int | None = Field(default=None, ge=0, le=86_400)
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    kind: TaskKind = "checklist"

    @field_validator("weekdays")
    @classmethod
    def _weekdays(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("weekdays deve conter valores de 0 (segunda) a 6 (domingo)")
        return sorted(set(v))


class SeriesUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)
    start_date: date | None = None
    end_date: date | None = None
    clear_end_date: bool = False
    start_time: time | None = None
    clear_start_time: bool = False
    estimated_seconds: int | None = Field(default=None, ge=0, le=86_400)
    subject_id: UUID | None = None
    topic_id: UUID | None = None
    kind: TaskKind | None = None
    active: bool | None = None

    @field_validator("weekdays")
    @classmethod
    def _weekdays(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return v
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("weekdays deve conter valores de 0 (segunda) a 6 (domingo)")
        return sorted(set(v))


class SeriesOut(BaseModel):
    id: UUID
    activity_id: UUID
    title: str
    weekdays: list[int]
    start_date: date
    end_date: date | None
    start_time: str | None
    estimated_seconds: int | None
    subject_id: UUID | None
    topic_id: UUID | None
    kind: str
    active: bool


class OccurrenceIn(BaseModel):
    """Alterações aplicadas à ocorrência ao materializá-la (todas opcionais)."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    start_time: time | None = None
    clear_start_time: bool = False
    estimated_seconds: int | None = Field(default=None, ge=0, le=86_400)
    status: TaskStatus | None = None
    pinned: bool | None = None
    priority: int | None = Field(default=None, ge=1, le=3)


class CalendarActivityOut(BaseModel):
    activity_id: UUID
    title: str
    target_seconds: int
    logged_seconds: int
    recovery_seconds: int
    planned_seconds: int
    daily_limit_seconds: int
    is_rest: bool
    is_paused: bool
    in_range: bool


class CalendarDayOut(BaseModel):
    """Um dia local do calendário.

    - `target_seconds`: meta do dia (soma dos objetivos).
    - `logged_seconds`: tempo aceito no saldo (passado/hoje; 0 no futuro).
    - `recovery_seconds`: alocação do plano de recuperação aplicado para o dia.
    - `planned_seconds`: soma das estimativas das tarefas de estudo ainda planejadas
      (inclui ocorrências virtuais de séries). Essa duração OCUPA a disponibilidade da
      meta; não é uma obrigação extra.
    - `available_seconds = target_seconds` (0 em descanso/pausa).
    - `daily_limit_seconds`: teto diário (soma dos objetivos).
    - `overload_seconds = max(0, planned_seconds - daily_limit_seconds)`.
    - `over_capacity = planned_seconds > daily_limit_seconds`.
    """

    local_date: date
    is_today: bool
    target_seconds: int
    logged_seconds: int
    recovery_seconds: int
    planned_seconds: int
    available_seconds: int
    daily_limit_seconds: int
    overload_seconds: int
    over_capacity: bool
    is_rest: bool
    is_paused: bool
    tasks: list[TaskOut]
    activities: list[CalendarActivityOut]


class CalendarOut(BaseModel):
    start: date
    end: date
    days: list[CalendarDayOut]


class AutoPlanIn(BaseModel):
    start: date
    end: date
    task_ids: list[UUID] | None = None


class AutoPlanMove(BaseModel):
    task_id: UUID
    title: str
    from_date: date
    to_date: date


class AutoPlanUnplaced(BaseModel):
    task_id: UUID
    title: str
    local_date: date
    reason: Literal["nao_coube", "sem_estimativa"]


class AutoPlanDay(BaseModel):
    local_date: date
    is_active: bool
    target_seconds: int
    fixed_seconds: int
    before_seconds: int
    after_seconds: int
    before: list[UUID]
    after: list[UUID]


class AutoPlanOut(BaseModel):
    start: date
    end: date
    applied: bool
    moves: list[AutoPlanMove]
    unplaced: list[AutoPlanUnplaced]
    days: list[AutoPlanDay]


class WeekActivityOut(BaseModel):
    id: UUID
    title: str
    color: str | None
    timezone: str


class WeekPrintOut(BaseModel):
    start: date
    end: date
    generated_at: datetime
    week_starts_on: int
    activities: list[WeekActivityOut]
    days: list[CalendarDayOut]
    target_seconds: int
    planned_seconds: int
    recovery_seconds: int
