from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.auth import EntitlementsOut
from app.schemas.common import ORMModel


class PlanPriceOut(ORMModel):
    interval: str
    amount_cents: int | None  # None = "Valor a definir"
    currency: str


class PublicPlanOut(BaseModel):
    code: str
    name: str
    description: str | None
    features: list
    limits: dict
    recommended: bool
    prices: list[PlanPriceOut]


class PublicPlansOut(BaseModel):
    billing_mode: str  # disabled | test | production
    plans: list[PublicPlanOut]


class WaitlistIn(BaseModel):
    email: EmailStr
    source: str | None = Field(default=None, max_length=64)


class ContactIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    email: EmailStr
    subject: str | None = Field(default=None, max_length=160)
    message: str = Field(min_length=1, max_length=4000)


class SubscriptionOut(BaseModel):
    id: UUID
    plan_code: str
    plan_name: str
    interval: str | None
    amount_cents: int | None
    currency: str | None
    status: str
    provider: str
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    cancelled_at: datetime | None
    ended_at: datetime | None
    last_synced_at: datetime | None
    checkout_url: str | None
    created_at: datetime | None


class SubscriptionStateOut(BaseModel):
    billing_mode: str
    subscription: SubscriptionOut | None
    entitlements: EntitlementsOut
    cancel_at_period_end: bool
    next_charge_at: datetime | None
    history: list[SubscriptionOut]
    message: str | None = None


class CheckoutIn(BaseModel):
    plan_code: str = Field(min_length=1, max_length=32)
    interval: Literal["month", "year"]
    coupon_code: str | None = Field(default=None, max_length=32)


class CouponCheckIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    plan_code: str | None = Field(default=None, max_length=32)


class CouponInfoOut(BaseModel):
    code: str
    kind: str
    value: int
    plan_code: str | None
    description: str


class CheckoutOut(BaseModel):
    checkout_url: str
    subscription_id: UUID
    status: str


class WebhookAck(BaseModel):
    ok: bool = True
    status: str  # processed | duplicate | ignored
