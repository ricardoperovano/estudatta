"""Painel do administrador: assinaturas (métricas e gestão), cupons e campanhas de e-mail."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import client_ip, get_admin_user
from app.core.errors import NotFound
from app.integrations.mercadopago import get_provider
from app.models.user import User
from app.schemas.common import OkResponse, Page
from app.services import admin as admin_service
from app.services import billing as billing_service
from app.services import growth
from app.services.plans import get_entitlements

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])


def _audit(db: Session, request: Request, actor: User, action: str, **kw) -> None:
    audit(db, actor_id=actor.id, action=action, ip=client_ip(request), **kw)


# --- Assinaturas ------------------------------------------------------------------------------
class SubscriptionMetricsOut(BaseModel):
    users_total: int
    active: int
    past_due: int
    pending: int
    cancelled_access: int
    new_30d: int
    churned_30d: int
    promo_active: int
    mrr_cents: int
    by_plan: dict[str, int]


class AdminSubscriptionOut(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str
    user_name: str
    plan_code: str
    plan_name: str
    status: str
    provider: str
    interval: str | None
    amount_cents: int | None
    coupon_code: str | None
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    created_at: datetime | None


@router.get("/subscriptions/metrics", response_model=SubscriptionMetricsOut)
def subscription_metrics(db: Session = Depends(get_db)) -> SubscriptionMetricsOut:
    return SubscriptionMetricsOut(**growth.subscription_metrics(db))


@router.get("/subscriptions", response_model=Page[AdminSubscriptionOut])
def list_subscriptions(
    status: str | None = Query(default=None, max_length=16),
    plan_code: str | None = Query(default=None, max_length=32),
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Page[AdminSubscriptionOut]:
    rows, total = growth.list_subscriptions(
        db, status=status, plan_code=plan_code, q=q, limit=limit, offset=offset
    )
    return Page(
        items=[AdminSubscriptionOut(**r) for r in rows], total=total, limit=limit, offset=offset
    )


@router.post("/users/{user_id}/subscription/cancel", response_model=OkResponse)
def cancel_user_subscription(
    user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> OkResponse:
    """Cancela a renovação da assinatura ativa da pessoa (acesso segue até o fim do período)."""
    user = admin_service.get_user(db, user_id)
    try:
        provider = get_provider()
    except Exception:  # noqa: BLE001 - sem provedor: registra a intenção
        provider = None
    sub, message = billing_service.cancel_subscription(db, user, provider)
    _audit(
        db,
        request,
        admin,
        "admin.subscription.cancel",
        target_type="subscription",
        target_id=str(sub.id),
        metadata={"user_id": str(user.id)},
    )
    db.commit()
    return OkResponse(message=message)


@router.get("/users/{user_id}/entitlements")
def user_entitlements(user_id: UUID, db: Session = Depends(get_db)) -> dict:
    admin_service.get_user(db, user_id)
    return get_entitlements(db, user_id).__dict__


# --- Cupons -----------------------------------------------------------------------------------
class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=32)
    kind: Literal["percent", "trial"]
    value: int = Field(ge=1, le=3650)
    plan_code: str | None = Field(default=None, max_length=32)
    max_uses: int | None = Field(default=None, ge=1, le=1_000_000)
    expires_at: datetime | None = None
    note: str | None = Field(default=None, max_length=300)


class CouponOut(BaseModel):
    id: UUID
    code: str
    kind: str
    value: int
    plan_code: str | None
    max_uses: int | None
    uses: int
    expires_at: datetime | None
    active: bool
    note: str | None
    created_at: datetime
    valid: bool


@router.get("/coupons", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db)) -> list[CouponOut]:
    from sqlalchemy import select

    from app.models.billing import Coupon

    rows = db.execute(select(Coupon).order_by(Coupon.created_at.desc())).scalars()
    return [CouponOut(**growth.coupon_out(c)) for c in rows]


@router.post("/coupons", response_model=CouponOut, status_code=201)
def create_coupon(
    payload: CouponIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> CouponOut:
    c = growth.create_coupon(db, admin, payload.model_dump())
    _audit(
        db,
        request,
        admin,
        "admin.coupon.create",
        target_type="coupon",
        target_id=str(c.id),
        metadata={"code": c.code, "kind": c.kind, "value": c.value},
    )
    db.commit()
    return CouponOut(**growth.coupon_out(c))


@router.post("/coupons/{coupon_id}/toggle", response_model=CouponOut)
def toggle_coupon(
    coupon_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> CouponOut:
    c = growth.get_coupon(db, coupon_id)
    c.active = not c.active
    _audit(
        db,
        request,
        admin,
        "admin.coupon.toggle",
        target_type="coupon",
        target_id=str(c.id),
        metadata={"active": c.active},
    )
    db.commit()
    return CouponOut(**growth.coupon_out(c))


# --- Campanhas --------------------------------------------------------------------------------
class CampaignIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    subject: str = Field(min_length=2, max_length=160)
    body: str = Field(min_length=10, max_length=8000)
    cta_label: str | None = Field(default=None, max_length=60)
    cta_url: str | None = Field(default=None, max_length=400)
    segment: str = Field(min_length=2, max_length=32)
    coupon_code: str | None = Field(default=None, max_length=32)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    subject: str | None = Field(default=None, min_length=2, max_length=160)
    body: str | None = Field(default=None, min_length=10, max_length=8000)
    cta_label: str | None = Field(default=None, max_length=60)
    cta_url: str | None = Field(default=None, max_length=400)
    segment: str | None = Field(default=None, max_length=32)
    coupon_code: str | None = Field(default=None, max_length=32)


class CampaignOut(BaseModel):
    id: UUID
    name: str
    subject: str
    body: str
    cta_label: str | None
    cta_url: str | None
    segment: str
    segment_label: str
    coupon_code: str | None
    status: str
    recipients: int
    sent_at: datetime | None
    created_at: datetime


class SegmentOut(BaseModel):
    key: str
    label: str
    count: int


class SendOut(BaseModel):
    queued: int
    status: str


@router.get("/campaigns/segments", response_model=list[SegmentOut])
def segments(db: Session = Depends(get_db)) -> list[SegmentOut]:
    return [
        SegmentOut(key=k, label=v, count=len(growth.segment_users(db, k)))
        for k, v in growth.SEGMENTS.items()
    ]


@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(db: Session = Depends(get_db)) -> list[CampaignOut]:
    from sqlalchemy import select

    from app.models.billing import Campaign

    rows = db.execute(select(Campaign).order_by(Campaign.created_at.desc())).scalars()
    return [CampaignOut(**growth.campaign_out(c)) for c in rows]


@router.post("/campaigns", response_model=CampaignOut, status_code=201)
def create_campaign(
    payload: CampaignIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> CampaignOut:
    c = growth.create_campaign(db, admin, payload.model_dump())
    _audit(db, request, admin, "admin.campaign.create", target_type="campaign", target_id=str(c.id))
    db.commit()
    return CampaignOut(**growth.campaign_out(c))


@router.patch("/campaigns/{campaign_id}", response_model=CampaignOut)
def update_campaign(
    campaign_id: UUID, payload: CampaignUpdate, db: Session = Depends(get_db)
) -> CampaignOut:
    c = growth.get_campaign(db, campaign_id)
    growth.update_campaign(db, c, payload.model_dump(exclude_unset=True))
    db.commit()
    return CampaignOut(**growth.campaign_out(c))


@router.post("/campaigns/{campaign_id}/test", response_model=SendOut)
def test_campaign(
    campaign_id: UUID, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)
) -> SendOut:
    """Envia só para o e-mail do administrador, sem marcar a campanha como enviada."""
    c = growth.get_campaign(db, campaign_id)
    n = growth.send_campaign(db, c, test_to=admin)
    db.commit()
    return SendOut(queued=n, status=c.status)


@router.post("/campaigns/{campaign_id}/send", response_model=SendOut)
def send_campaign(
    campaign_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> SendOut:
    c = growth.get_campaign(db, campaign_id)
    n = growth.send_campaign(db, c)
    _audit(
        db,
        request,
        admin,
        "admin.campaign.send",
        target_type="campaign",
        target_id=str(c.id),
        metadata={"segment": c.segment, "recipients": n},
    )
    db.commit()
    return SendOut(queued=n, status=c.status)


@router.delete("/campaigns/{campaign_id}", response_model=OkResponse)
def delete_campaign(campaign_id: UUID, db: Session = Depends(get_db)) -> OkResponse:
    c = growth.get_campaign(db, campaign_id)
    if c.status != "draft":
        raise NotFound("Só rascunhos podem ser apagados.", code="campaign_sent")
    db.delete(c)
    db.commit()
    return OkResponse(message="Rascunho apagado.")
