from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="user")  # user | admin
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Sao_Paulo")
    locale: Mapped[str] = mapped_column(String(16), nullable=False, default="pt-BR")
    email_verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    onboarding_completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    preferences: Mapped[UserPreferences | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    notification_preferences: Mapped[NotificationPreferences | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


class AuthSession(UUIDPk, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(64))
    device_label: Mapped[str | None] = mapped_column(String(120))


class OneTimeToken(UUIDPk, Base):
    __tablename__ = "one_time_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    purpose: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # verify_email | reset_password | email_change
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONType)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class UserPreferences(Timestamps, Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    theme: Mapped[str] = mapped_column(
        String(8), nullable=False, default="system"
    )  # system | dark | light
    tone: Mapped[str] = mapped_column(
        String(16), nullable=False, default="acolhedor"
    )  # acolhedor | direto | firme
    week_starts_on: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    default_session_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    pomodoro_focus_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    pomodoro_break_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    analytics_consent: Mapped[bool | None] = mapped_column(Boolean)
    reduced_motion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revisions_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    revision_intervals: Mapped[list] = mapped_column(
        JSONType, nullable=False, default=lambda: [1, 7, 30], server_default="[1, 7, 30]"
    )
    mascot_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    # tours guiados já vistos (chaves das páginas); vale em todos os aparelhos
    tours_seen: Mapped[list] = mapped_column(
        JSONType, nullable=False, default=list, server_default="[]"
    )
    extra: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)

    user: Mapped[User] = relationship(back_populates="preferences")


class NotificationPreferences(Timestamps, Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    paused_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    channel_push: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    channel_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    channel_inapp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    reminder_time: Mapped[str] = mapped_column(
        String(5), nullable=False, default="19:30"
    )  # HH:MM local
    reminder_days: Mapped[list] = mapped_column(
        JSONType, nullable=False, default=lambda: [0, 1, 2, 3, 4]
    )
    follow_up_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    end_of_window_alert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    goal_completed_alert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    resume_after_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    weekly_summary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    weekly_summary_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quiet_start: Mapped[str] = mapped_column(String(5), nullable=False, default="22:00")
    quiet_end: Mapped[str] = mapped_column(String(5), nullable=False, default="07:00")
    quiet_weekends: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    max_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    show_activity_name: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    snoozed_until: Mapped[datetime | None] = mapped_column(UTCDateTime)

    user: Mapped[User] = relationship(back_populates="notification_preferences")


class PushSubscription(UUIDPk, Timestamps, Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_endpoint"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    device_id: Mapped[str | None] = mapped_column(String(64))
    expired_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_success_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


Index("ix_auth_sessions_user_active", AuthSession.user_id, AuthSession.revoked_at)
