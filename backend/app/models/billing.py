from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.base import JSONType, Timestamps, UTCDateTime, UUIDPk


class Plan(UUIDPk, Timestamps, Base):
    """Catálogo configurável de planos."""

    __tablename__ = "plans"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)  # free | pro
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    features: Mapped[list] = mapped_column(
        JSONType, nullable=False, default=list
    )  # textos para marketing
    limits: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    # {"max_active_activities": 1, "materials_mb": 100, "ai_daily_actions": 0, "reports": "basic", ...}
    recommended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    prices: Mapped[list[PlanPrice]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PlanPrice(UUIDPk, Timestamps, Base):
    __tablename__ = "plan_prices"
    __table_args__ = (
        UniqueConstraint("plan_id", "interval", "currency", name="uq_plan_price_interval"),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    interval: Mapped[str] = mapped_column(String(8), nullable=False)  # month | year
    amount_cents: Mapped[int | None] = mapped_column(Integer)  # None = "Valor a definir"
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="BRL")
    provider_ref: Mapped[str | None] = mapped_column(
        String(120)
    )  # id do plano no provedor, se houver
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    plan: Mapped[Plan] = relationship(back_populates="prices")


class Subscription(UUIDPk, Timestamps, Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False
    )
    price_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("plan_prices.id", ondelete="SET NULL")
    )
    provider: Mapped[str] = mapped_column(
        String(24), nullable=False, default="mercadopago"
    )  # mercadopago | promo | admin
    provider_ref: Mapped[str | None] = mapped_column(String(120), index=True)  # preapproval id
    provider_payer_ref: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # pending | active | past_due | cancelled | expired | paused
    current_period_start: Mapped[datetime | None] = mapped_column(UTCDateTime)
    current_period_end: Mapped[datetime | None] = mapped_column(UTCDateTime)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    last_synced_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    checkout_url: Mapped[str | None] = mapped_column(Text)
    external_reference: Mapped[str | None] = mapped_column(String(64), index=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONType, nullable=False, default=dict)

    plan: Mapped[Plan] = relationship()


class BillingEvent(UUIDPk, Base):
    """Eventos do provedor (webhooks) — idempotentes por provider+event_id."""

    __tablename__ = "billing_events"
    __table_args__ = (UniqueConstraint("provider", "event_id", name="uq_billing_event"),)

    provider: Mapped[str] = mapped_column(String(24), nullable=False)
    event_id: Mapped[str] = mapped_column(String(160), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(120), index=True)
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False)
    signature_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="received"
    )  # received | processed | ignored | failed
    error: Mapped[str | None] = mapped_column(String(500))
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    received_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(UTCDateTime)


class PromoGrant(UUIDPk, Base):
    """Acesso promocional explícito concedido por admin, com duração e auditoria."""

    __tablename__ = "promo_grants"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False
    )
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reason: Mapped[str] = mapped_column(String(300), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime)  # None = vitalício
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class Coupon(UUIDPk, Base):
    """Cupom: desconto na assinatura (percentual, todos os ciclos) ou dias grátis de um plano."""

    __tablename__ = "coupons"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # percent | trial
    value: Mapped[int] = mapped_column(Integer, nullable=False)  # % (1–100) ou dias
    plan_code: Mapped[str | None] = mapped_column(String(32))  # None = qualquer plano pago
    max_uses: Mapped[int | None] = mapped_column(Integer)
    uses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    note: Mapped[str | None] = mapped_column(String(300))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class CouponRedemption(UUIDPk, Base):
    __tablename__ = "coupon_redemptions"
    __table_args__ = (UniqueConstraint("coupon_id", "user_id", name="uq_coupon_user"),)

    coupon_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subscriptions.id", ondelete="SET NULL")
    )
    promo_grant_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("promo_grants.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


class Campaign(UUIDPk, Base):
    """Campanha de e-mail do administrador para um segmento (dicas, desconto, chamada de volta)."""

    __tablename__ = "campaigns"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)  # texto simples com parágrafos
    cta_label: Mapped[str | None] = mapped_column(String(60))
    cta_url: Mapped[str | None] = mapped_column(String(400))
    segment: Mapped[str] = mapped_column(String(32), nullable=False)
    coupon_code: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")  # draft | sent
    recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, nullable=False)


Index("ix_subscriptions_user_status", Subscription.user_id, Subscription.status)
