from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class SyncOperation(UUIDPk, Base):
    """Operação de sincronização offline, idempotente por (user_id, op_id)."""

    __tablename__ = "sync_operations"
    __table_args__ = (UniqueConstraint("user_id", "op_id", name="uq_sync_user_op"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    op_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False)
    result: Mapped[dict | None] = mapped_column(JSONType)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # applied | rejected | conflict | duplicate
    client_created_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class AiUsage(UUIDPk, Base):
    __tablename__ = "ai_usage"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # suggest_structure | suggest_plan | weekly_summary
    status: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # ok | failed | rejected | quota
    model: Mapped[str | None] = mapped_column(String(80))
    input_chars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_in: Mapped[int | None] = mapped_column(Integer)
    tokens_out: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class AuditLog(UUIDPk, Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(48))
    target_id: Mapped[str | None] = mapped_column(String(64))
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSONType)
    ip: Mapped[str | None] = mapped_column(String(64))
    request_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class AppSetting(Timestamps, Base):
    """Configuração editável em runtime: feature flags, identidade comercial, limites."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONType, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class WaitlistEntry(UUIDPk, Base):
    """Lista de interesse do site público (CTA 'Quero acesso')."""

    __tablename__ = "waitlist_entries"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    source: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class ContactMessage(UUIDPk, Base):
    __tablename__ = "contact_messages"

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    name: Mapped[str | None] = mapped_column(String(120))
    subject: Mapped[str | None] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(4000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


Index("ix_audit_logs_created", AuditLog.created_at)
Index("ix_ai_usage_user_created", AiUsage.user_id, AiUsage.created_at)
