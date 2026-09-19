from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

Category = Literal[
    "ingles",
    "idioma",
    "concurso",
    "faculdade",
    "certificacao",
    "curso",
    "outro_estudo",
    "leitura",
    "pratica",
    "rotina",
    "personalizado",
]


class GoalRuleIn(BaseModel):
    minutes_by_weekday: dict[str, int] | None = None
    active_days: list[int] | None = None
    daily_minutes: int = Field(default=60, ge=1, le=1440)
    daily_limit_minutes: int = Field(default=120, ge=1, le=1440)
    effective_from: date | None = None
    note: str | None = Field(default=None, max_length=200)


class ActivityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: Category = "outro_estudo"
    tracking_mode: Literal["time", "checklist", "mixed"] = "time"
    description: str | None = Field(default=None, max_length=2000)
    desired_outcome: str | None = Field(default=None, max_length=300)
    start_date: date | None = None
    end_date: date | None = None
    timezone: str | None = Field(default=None, max_length=64)
    recovery_policy: Literal["accumulate", "accumulate_suggest", "none"] = "accumulate_suggest"
    goal: GoalRuleIn | None = None
    preferred_times: list[str] = Field(default_factory=list)
    availability: dict = Field(default_factory=dict)
    color: str | None = Field(default=None, max_length=16)
    icon: str | None = Field(default=None, max_length=32)
    weekly_questions_goal: int | None = Field(default=None, ge=1, le=10000)
    weekly_pages_goal: int | None = Field(default=None, ge=1, le=10000)


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: Category | None = None
    description: str | None = Field(default=None, max_length=2000)
    desired_outcome: str | None = Field(default=None, max_length=300)
    end_date: date | None = None
    clear_end_date: bool = False
    recovery_policy: Literal["accumulate", "accumulate_suggest", "none"] | None = None
    preferred_times: list[str] | None = None
    availability: dict | None = None
    color: str | None = None
    icon: str | None = None
    weekly_questions_goal: int | None = Field(default=None, ge=0, le=10000)
    weekly_pages_goal: int | None = Field(default=None, ge=0, le=10000)
    tracking_mode: Literal["time", "checklist", "mixed"] | None = None
    sort_order: int | None = None


class StatusChange(BaseModel):
    status: Literal["active", "paused", "archived"]


class PauseIn(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = Field(default=None, max_length=200)
    silence_reminders: bool = True


class TimezoneChange(BaseModel):
    timezone: str = Field(max_length=64)
    effective_from: date | None = None


class GoalRuleOut(ORMModel):
    id: UUID
    effective_from: date
    minutes_by_weekday: dict
    daily_limit_minutes: int
    note: str | None
    version: int


class PauseOut(ORMModel):
    id: UUID
    start_date: date
    end_date: date
    reason: str | None
    silence_reminders: bool


class TimezoneOut(ORMModel):
    effective_from: date
    timezone: str


class ActivityOut(ORMModel):
    id: UUID
    title: str
    description: str | None
    category: str
    desired_outcome: str | None
    color: str | None
    icon: str | None
    tracking_mode: str
    status: str
    start_date: date
    end_date: date | None
    timezone: str
    recovery_policy: str
    preferred_times: list
    availability: dict
    sort_order: int
    weekly_questions_goal: int | None = None
    weekly_pages_goal: int | None = None
    created_at: datetime
    current_rule: GoalRuleOut | None = None


class ActivityDetailOut(ActivityOut):
    goal_rules: list[GoalRuleOut]
    pauses: list[PauseOut]
    timezone_history: list[TimezoneOut]


class DayBalanceOut(BaseModel):
    local_date: date
    target: int
    logged: int
    carry_in: int
    missing_today: int
    pending_prior: int
    remaining_total: int
    carry_out: int
    recovered: int
    extra: int
    forgiven: int
    is_rest: bool
    is_paused: bool
    in_range: bool
    goal_met: bool
    deficit: int
    recovered_from: list[tuple[date, int]] = Field(default_factory=list)


class TodaySummaryOut(BaseModel):
    local_date: date
    target: int
    logged: int
    missing_today: int
    pending_prior: int
    remaining_total: int
    suggested_recovery: int
    extra: int
    is_rest: bool
    is_paused: bool
    in_range: bool
    goal_met: bool
    daily_limit: int
    pending_after_plan: int
    next_step_seconds: int


class BalanceOut(BaseModel):
    activity_id: UUID
    today: TodaySummaryOut | None
    next_step: str
    streak_current: int
    streak_best: int
    has_recovery_plan: bool
    auto_suggestion: dict[str, int]
    days: list[DayBalanceOut]


class ForgiveIn(BaseModel):
    seconds: int = Field(ge=60, le=10_000_000)
    reason: str | None = Field(default=None, max_length=300)


class ForgivePreviewOut(BaseModel):
    pending_before: int
    forgiven: int
    pending_after: int
    applies_on: date
