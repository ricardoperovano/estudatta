from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel


class MaterialLinkIn(BaseModel):
    activity_id: UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=2100)
    description: str | None = Field(default=None, max_length=2000)


class MaterialPhysicalIn(BaseModel):
    activity_id: UUID | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    page_from: int | None = Field(default=None, ge=0, le=100000)
    page_to: int | None = Field(default=None, ge=0, le=100000)
    pages_total: int | None = Field(default=None, ge=1, le=100000)

    @model_validator(mode="after")
    def _pages(self):
        if (
            self.page_from is not None
            and self.page_to is not None
            and self.page_to < self.page_from
        ):
            raise ValueError("Página final antes da inicial.")
        return self


class MaterialUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    page_from: int | None = Field(default=None, ge=0, le=100000)
    page_to: int | None = Field(default=None, ge=0, le=100000)
    last_position: str | None = Field(default=None, max_length=120)
    current_page: int | None = Field(default=None, ge=0, le=100000)  # marcador de página
    clear_current_page: bool = False
    activity_id: UUID | None = None
    clear_activity: bool = False


class MaterialTopicLinkIn(BaseModel):
    topic_id: UUID
    page_from: int | None = Field(default=None, ge=0, le=100000)
    page_to: int | None = Field(default=None, ge=0, le=100000)
    note: str | None = Field(default=None, max_length=300)
    last_position: str | None = Field(default=None, max_length=120)


class MaterialTopicOut(ORMModel):
    topic_id: UUID
    page_from: int | None
    page_to: int | None
    note: str | None
    last_position: str | None
    topic_title: str | None = None
    subject_id: UUID | None = None


class MaterialOut(ORMModel):
    id: UUID
    activity_id: UUID | None
    kind: str
    title: str
    description: str | None
    url: str | None
    file_name: str | None
    mime_type: str | None
    size_bytes: int | None
    pages_total: int | None
    page_from: int | None
    page_to: int | None
    last_position: str | None
    current_page: int | None = None
    offline_available: bool
    created_at: datetime
    updated_at: datetime | None = None
    topics: list[MaterialTopicOut] = Field(default_factory=list)


class MaterialDetailOut(MaterialOut):
    download_url: str | None = None
    download_expires_in: int | None = None
