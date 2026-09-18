"""Mixins comuns: UUID como chave, timestamps UTC, JSON portátil."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, TypeDecorator, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class UTCDateTime(TypeDecorator):
    """DateTime sempre ciente de fuso (UTC), inclusive em SQLite (testes)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


# JSON portátil: JSONB no PostgreSQL, JSON nos demais (testes em SQLite)
JSONType = JSON().with_variant(JSONB(), "postgresql")


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=new_uuid)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
