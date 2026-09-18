from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, UTCDateTime, UUIDPk


class Notification(UUIDPk, Base):
    """Central de notificações no aplicativo."""

    __tablename__ = "notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(String(300))
    data: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class NotificationOutbox(UUIDPk, Base):
    """Outbox transacional: gravado na mesma transação que o evento de negócio; enviado por job."""

    __tablename__ = "notification_outbox"
    __table_args__ = (UniqueConstraint("dedupe_key", name="uq_notification_dedupe"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    # planned_start | follow_up | end_of_window | goal_completed | resume | weekly_summary | system
    dedupe_key: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    channels: Mapped[list] = mapped_column(
        JSONType, nullable=False, default=list
    )  # ["push","inapp","email"]
    proactive: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1
    )  # conta no limite diário
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # pending | processing | sent | partial | cancelled | failed | expired | skipped
    next_run_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    locked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    locked_by: Mapped[str | None] = mapped_column(String(64))
    last_error: Mapped[str | None] = mapped_column(String(500))
    skip_reason: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    deliveries: Mapped[list[NotificationDelivery]] = relationship(
        back_populates="outbox", cascade="all, delete-orphan"
    )


class NotificationDelivery(UUIDPk, Base):
    """Registro por canal/tentativa (estado, erro, resultado ambíguo)."""

    __tablename__ = "notification_deliveries"

    outbox_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notification_outbox.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    target: Mapped[str | None] = mapped_column(String(300))  # endpoint hash / e-mail
    status: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # sent | failed | ambiguous | skipped
    error: Mapped[str | None] = mapped_column(String(500))
    attempted_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)

    outbox: Mapped[NotificationOutbox] = relationship(back_populates="deliveries")


Index("ix_outbox_status_next", NotificationOutbox.status, NotificationOutbox.next_run_at)
Index("ix_notifications_user_read", Notification.user_id, Notification.read_at)
