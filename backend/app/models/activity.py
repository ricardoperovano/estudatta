from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class Activity(UUIDPk, Timestamps, Base):
    """Objetivo/atividade acompanhada (idiomas, concurso, leitura, violão, rotina...)."""

    __tablename__ = "activities"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="outro_estudo")
    # idioma | concurso | faculdade | certificacao | curso | outro_estudo | leitura | pratica | rotina | personalizado
    # ("ingles" é aceito de clientes antigos e vira idioma + "en")
    language: Mapped[str | None] = mapped_column(
        String(8)
    )  # só em "idioma"; ver app.core.languages
    desired_outcome: Mapped[str | None] = mapped_column(String(300))
    color: Mapped[str | None] = mapped_column(String(16))
    icon: Mapped[str | None] = mapped_column(String(32))
    tracking_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="time"
    )  # time | checklist | mixed
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active"
    )  # active | paused | archived
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="America/Sao_Paulo")
    recovery_policy: Mapped[str] = mapped_column(
        String(24), nullable=False, default="accumulate_suggest"
    )
    # accumulate | accumulate_suggest | none
    preferred_times: Mapped[list] = mapped_column(
        JSONType, nullable=False, default=list
    )  # ["19:30"]
    availability: Mapped[dict] = mapped_column(
        JSONType, nullable=False, default=dict
    )  # {"0": [["19:00","21:00"]]}
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    weekly_questions_goal: Mapped[int | None] = mapped_column(Integer)
    weekly_pages_goal: Mapped[int | None] = mapped_column(Integer)
    archived_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    @property
    def language_name(self) -> str | None:
        from app.core.languages import language_name

        return language_name(self.language)

    goal_rules: Mapped[list[GoalRule]] = relationship(
        back_populates="activity", cascade="all, delete-orphan", order_by="GoalRule.effective_from"
    )
    pauses: Mapped[list[ActivityPause]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )
    timezone_history: Mapped[list[ActivityTimezone]] = relationship(
        back_populates="activity", cascade="all, delete-orphan"
    )


class GoalRule(UUIDPk, Timestamps, Base):
    """Regra de meta versionada: vale a partir de effective_from (inclusive)."""

    __tablename__ = "goal_rules"
    __table_args__ = (
        UniqueConstraint("activity_id", "effective_from", name="uq_goal_rule_activity_from"),
    )

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    # minutos por dia da semana; chave "0"=segunda … "6"=domingo; 0 = descanso
    minutes_by_weekday: Mapped[dict] = mapped_column(JSONType, nullable=False)
    daily_limit_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    note: Mapped[str | None] = mapped_column(String(200))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    activity: Mapped[Activity] = relationship(back_populates="goal_rules")


class ActivityPause(UUIDPk, Timestamps, Base):
    """Pausa/férias: nenhuma meta nova entre start_date e end_date (inclusive)."""

    __tablename__ = "activity_pauses"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(200))
    silence_reminders: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    activity: Mapped[Activity] = relationship(back_populates="pauses")


class ActivityTimezone(UUIDPk, Base):
    """Histórico de fuso: vigente a partir de effective_from. O histórico anterior não é movido."""

    __tablename__ = "activity_timezones"
    __table_args__ = (
        UniqueConstraint("activity_id", "effective_from", name="uq_activity_tz_from"),
    )

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)

    activity: Mapped[Activity] = relationship(back_populates="timezone_history")


class BalanceAdjustment(UUIDPk, Base):
    """Ajuste explícito de pendência (perdão parcial/total). Nunca cria sessão fictícia."""

    __tablename__ = "balance_adjustments"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    applies_on: Mapped[date] = mapped_column(
        Date, nullable=False
    )  # aplicado ao fechamento desse dia local
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="forgive")  # forgive
    seconds: Mapped[int] = mapped_column(Integer, nullable=False)  # positivo = reduz pendência
    reason: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class DailyLedger(UUIDPk, Base):
    """Materialização idempotente do fechamento diário (objetivo/data)."""

    __tablename__ = "daily_ledger"
    __table_args__ = (
        UniqueConstraint("activity_id", "local_date", name="uq_daily_ledger_activity_date"),
    )

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    logged_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    carry_in_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    carry_out_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    recovered_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    forgiven_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_rest_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    goal_met: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    closed_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    rule_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class RecoveryPlan(UUIDPk, Timestamps, Base):
    __tablename__ = "recovery_plans"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    strategy: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # today | distribute | until_date | custom
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="applied"
    )  # applied | cancelled | completed
    pending_seconds_at_creation: Mapped[int] = mapped_column(Integer, nullable=False)
    allocated_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    unallocated_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    horizon_days: Mapped[int | None] = mapped_column(Integer)
    until_date: Mapped[date | None] = mapped_column(Date)
    created_on: Mapped[date] = mapped_column(Date, nullable=False)  # data local de criação
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)

    allocations: Mapped[list[RecoveryAllocation]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="RecoveryAllocation.local_date",
    )


class RecoveryAllocation(UUIDPk, Base):
    __tablename__ = "recovery_allocations"
    __table_args__ = (
        UniqueConstraint("plan_id", "local_date", name="uq_recovery_alloc_plan_date"),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("recovery_plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    seconds: Mapped[int] = mapped_column(Integer, nullable=False)

    plan: Mapped[RecoveryPlan] = relationship(back_populates="allocations")


Index("ix_activities_user_status", Activity.user_id, Activity.status)
