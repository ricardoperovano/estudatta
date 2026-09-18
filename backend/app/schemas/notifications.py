from __future__ import annotations

import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

NotificationKind = Literal[
    "planned_start",
    "follow_up",
    "end_of_window",
    "goal_completed",
    "resume",
    "weekly_summary",
]
Tone = Literal["acolhedor", "direto", "firme"]


def _validate_hhmm(value: str | None) -> str | None:
    if value is None:
        return None
    if not HHMM.match(value):
        raise ValueError("Use o formato HH:MM (ex.: 19:30).")
    return value


class NotificationPreferencesOut(ORMModel):
    enabled: bool
    paused_until: datetime | None
    channel_push: bool
    channel_email: bool
    channel_inapp: bool
    reminder_time: str
    reminder_days: list[int]
    follow_up_minutes: int
    end_of_window_alert: bool
    goal_completed_alert: bool
    resume_after_days: int
    weekly_summary: bool
    weekly_summary_email: bool
    quiet_start: str
    quiet_end: str
    quiet_weekends: bool
    max_per_day: int
    show_activity_name: bool
    snoozed_until: datetime | None
    updated_at: datetime | None = None


class NotificationPreferencesUpdate(BaseModel):
    enabled: bool | None = None
    channel_push: bool | None = None
    channel_email: bool | None = None
    channel_inapp: bool | None = None
    reminder_time: str | None = None
    reminder_days: list[int] | None = None
    follow_up_minutes: int | None = Field(default=None, ge=15, le=720)
    end_of_window_alert: bool | None = None
    goal_completed_alert: bool | None = None
    resume_after_days: int | None = Field(default=None, ge=1, le=30)
    weekly_summary: bool | None = None
    weekly_summary_email: bool | None = None
    quiet_start: str | None = None
    quiet_end: str | None = None
    quiet_weekends: bool | None = None
    max_per_day: int | None = Field(default=None, ge=1)  # teto validado no serviço
    show_activity_name: bool | None = None

    @field_validator("reminder_time", "quiet_start", "quiet_end")
    @classmethod
    def _hhmm(cls, v: str | None) -> str | None:
        return _validate_hhmm(v)

    @field_validator("reminder_days")
    @classmethod
    def _days(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return None
        if any((not isinstance(d, int)) or d < 0 or d > 6 for d in v):
            raise ValueError("Dias devem estar entre 0 (segunda) e 6 (domingo).")
        return sorted(set(v))


class PreviewIn(BaseModel):
    tone: Tone = "acolhedor"
    kind: NotificationKind = "planned_start"


class PreviewOut(BaseModel):
    kind: str
    tone: str
    title: str
    body: str


class NotificationOut(ORMModel):
    id: UUID
    kind: str
    title: str
    body: str
    url: str | None
    data: dict | None
    created_at: datetime
    read_at: datetime | None


class NotificationListOut(BaseModel):
    items: list[NotificationOut]
    total: int
    unread_count: int
    limit: int
    offset: int


class UnreadCountOut(BaseModel):
    count: int


class SnoozeIn(BaseModel):
    minutes: int = Field(ge=5, le=24 * 60)


class PauseIn(BaseModel):
    until: datetime | None = None


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=255)
    auth: str = Field(min_length=1, max_length=255)


class PushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=4000)
    keys: PushKeys
    user_agent: str | None = Field(default=None, max_length=300)


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=4000)


class PushSubscriptionOut(ORMModel):
    id: UUID
    endpoint: str
    device_id: str | None
    user_agent: str | None
    created_at: datetime
    expired_at: datetime | None
    last_success_at: datetime | None
    failure_count: int


class VapidKeyOut(BaseModel):
    public_key: str


class PushTestOut(BaseModel):
    ok: bool = True
    outbox_id: UUID
    message: str
