from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.auth import EntitlementsOut
from app.schemas.billing import SubscriptionOut
from app.schemas.common import ORMModel, Page


class OverviewOut(BaseModel):
    generated_at: datetime
    users: dict
    subscriptions: dict[str, int]
    activities: dict
    sessions_7d: int
    outbox: dict[str, int]
    imports_failed_7d: int
    ai_usage_7d: dict
    billing_events_7d: dict[str, int]
    promo_grants_active: int


class AdminUserOut(ORMModel):
    id: UUID
    email: str
    name: str
    role: str
    is_active: bool
    timezone: str
    email_verified_at: datetime | None
    onboarding_completed_at: datetime | None
    last_login_at: datetime | None
    created_at: datetime
    plan_code: str | None = None
    plan_source: str | None = None
    subscription_status: str | None = None


class PromoGrantOut(BaseModel):
    id: UUID
    user_id: UUID
    plan_code: str
    granted_by: UUID | None
    reason: str
    starts_at: datetime
    ends_at: datetime
    revoked_at: datetime | None
    created_at: datetime
    active: bool


class AdminUserDetailOut(BaseModel):
    user: AdminUserOut
    entitlements: EntitlementsOut
    subscriptions: list[SubscriptionOut]
    promo_grants: list[PromoGrantOut]
    usage: dict


class RoleIn(BaseModel):
    role: Literal["user", "admin"]


class PlanPriceAdminOut(ORMModel):
    id: UUID
    interval: str
    amount_cents: int | None
    currency: str
    provider_ref: str | None
    active: bool


class PlanAdminOut(ORMModel):
    id: UUID
    code: str
    name: str
    description: str | None
    features: list
    limits: dict
    recommended: bool
    active: bool
    sort_order: int
    prices: list[PlanPriceAdminOut]
    created_at: datetime
    updated_at: datetime | None


class PlanCreateIn(BaseModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_-]{1,31}$")
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    features: list[str] = Field(default_factory=list, max_length=30)
    limits: dict = Field(default_factory=dict)
    recommended: bool = False
    active: bool = True
    sort_order: int = Field(default=0, ge=0, le=1000)


class PlanUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    features: list[str] | None = Field(default=None, max_length=30)
    limits: dict | None = None
    recommended: bool | None = None
    active: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=1000)


class PlanPriceIn(BaseModel):
    interval: Literal["month", "year"]
    amount_cents: int | None = Field(default=None, ge=0, le=100_000_000)
    currency: str = Field(default="BRL", min_length=3, max_length=3)
    active: bool = True


class PlanPricesIn(BaseModel):
    prices: list[PlanPriceIn] = Field(min_length=1, max_length=4)


class SettingOut(BaseModel):
    key: str
    value: dict
    is_default: bool
    updated_at: datetime | None
    updated_by: UUID | None


class SettingIn(BaseModel):
    value: dict


class OutboxOut(ORMModel):
    id: UUID
    user_id: UUID
    activity_id: UUID | None
    kind: str
    status: str
    channels: list
    attempts: int
    max_attempts: int
    next_run_at: datetime
    last_error: str | None
    skip_reason: str | None
    created_at: datetime
    sent_at: datetime | None


class DeliveryOut(ORMModel):
    id: UUID
    outbox_id: UUID
    channel: str
    status: str
    error: str | None
    attempted_at: datetime


class ImportJobAdminOut(ORMModel):
    id: UUID
    user_id: UUID
    activity_id: UUID
    source: str
    status: str
    error_code: str | None
    error_message: str | None
    created_at: datetime
    finished_at: datetime | None


class QueuesOut(BaseModel):
    outbox_by_status: dict[str, int]
    failed_outbox: Page[OutboxOut]
    failed_deliveries: list[DeliveryOut]
    failed_imports: Page[ImportJobAdminOut]


class BillingEventOut(ORMModel):
    id: UUID
    provider: str
    event_id: str
    event_type: str
    resource_id: str | None
    signature_valid: bool
    status: str
    error: str | None
    subscription_id: UUID | None
    received_at: datetime
    processed_at: datetime | None
    payload: dict


class ReconcileOut(BaseModel):
    ok: bool = True
    summary: dict


class PromoIn(BaseModel):
    plan_code: str = Field(min_length=1, max_length=32)
    days: int = Field(ge=1, le=3650)
    reason: str = Field(min_length=3, max_length=300)


class AuditOut(BaseModel):
    id: UUID
    actor_id: UUID | None
    action: str
    target_type: str | None
    target_id: str | None
    metadata: dict | None
    ip: str | None
    request_id: str | None
    created_at: datetime
