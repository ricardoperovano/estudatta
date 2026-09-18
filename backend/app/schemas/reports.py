from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.sessions import SessionOut

Period = Literal["day", "week", "month"]


class ReportActivityRow(BaseModel):
    activity_id: UUID
    title: str
    logged: int
    target: int
    percent: float | None


class ReportSubjectRow(BaseModel):
    subject_id: UUID | None
    title: str
    logged: int


class ReportDayRow(BaseModel):
    local_date: date
    target: int
    logged: int
    goal_met: bool
    is_rest: bool
    is_paused: bool
    deficit: int
    recovered: int


class SummaryOut(BaseModel):
    period: Period
    start: date
    end: date
    planned_seconds: int
    logged_seconds: int
    goal_days_planned: int
    goal_days_met: int
    days_with_log: int
    pending_open_seconds: int
    recovered_seconds: int
    extra_seconds: int
    streak_current: int
    streak_best: int
    by_activity: list[ReportActivityRow]
    by_subject: list[ReportSubjectRow]
    per_day: list[ReportDayRow]
    sessions_count: int
    avg_session_seconds: int
    reading: str


class ReportSessionOut(SessionOut):
    activity_title: str | None = None
    subject_title: str | None = None
    topic_title: str | None = None
    material_title: str | None = None


class ContentSubjectRow(BaseModel):
    subject_id: UUID | None
    title: str
    color: str | None
    topics_total: int
    topics_done: int
    topics_in_progress: int
    topics_not_started: int
    percent_done: float
    estimated_minutes_total: int
    estimated_minutes_done: int
    tasks_total: int
    tasks_done: int
    tasks_skipped: int
    tasks_planned: int


class ContentReportOut(BaseModel):
    activity_id: UUID
    subjects_total: int
    topics_total: int
    topics_done: int
    topics_in_progress: int
    percent_done: float
    tasks_total: int
    tasks_done: int
    tasks_skipped: int
    tasks_planned: int
    by_subject: list[ContentSubjectRow]
    note: str
