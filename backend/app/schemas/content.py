from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

TopicStatus = Literal["not_started", "in_progress", "done"]


class SubjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=16)


class SubjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    color: str | None = Field(default=None, max_length=16)


class SubjectReorder(BaseModel):
    activity_id: UUID
    ordered_ids: list[UUID] = Field(min_length=1)


class TopicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    parent_id: UUID | None = None
    estimated_minutes: int | None = Field(default=None, ge=0, le=100_000)


class TopicUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    estimated_minutes: int | None = Field(default=None, ge=0, le=100_000)
    status: TopicStatus | None = None
    parent_id: UUID | None = None
    clear_parent: bool = False


class TopicReorder(BaseModel):
    subject_id: UUID
    parent_id: UUID | None = None
    ordered_ids: list[UUID] = Field(min_length=1)


class MaterialBriefOut(BaseModel):
    id: UUID
    kind: str
    title: str
    page_from: int | None = None
    page_to: int | None = None


class TopicOut(ORMModel):
    id: UUID
    subject_id: UUID
    parent_id: UUID | None
    title: str
    description: str | None
    status: str
    sort_order: int
    estimated_minutes: int | None
    completed_at: datetime | None
    logged_seconds: int = 0
    materials: list[MaterialBriefOut] = Field(default_factory=list)
    topics: list[TopicOut] = Field(default_factory=list)


class SubjectOut(ORMModel):
    id: UUID
    activity_id: UUID
    title: str
    description: str | None
    color: str | None
    sort_order: int
    created_at: datetime
    topics_total: int = 0
    topics_done: int = 0
    logged_seconds: int = 0
    topics: list[TopicOut] = Field(default_factory=list)


class ContentProgressOut(BaseModel):
    subjects_total: int
    topics_total: int
    topics_done: int
    topics_in_progress: int
    percent_done: float
