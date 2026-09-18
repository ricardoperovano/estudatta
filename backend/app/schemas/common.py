from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int | None = None
    limit: int
    offset: int


class OkResponse(BaseModel):
    ok: bool = True
    message: str | None = None


class DateRange(BaseModel):
    start: date
    end: date


class Timestamped(ORMModel):
    created_at: datetime
    updated_at: datetime | None = None


class IdResponse(BaseModel):
    id: str = Field(description="UUID")
