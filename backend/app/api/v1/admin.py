"""Painel administrativo. Todas as rotas exigem `role=admin`; toda mutação é auditada.
Não existe (nem existirá) "entrar como usuário"."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import client_ip, get_admin_user
from app.core.errors import NotFound
from app.models.notification import NotificationOutbox
from app.models.user import User
from app.schemas.admin import (
    AdminUserDetailOut,
    AdminUserOut,
    AuditOut,
    BillingEventOut,
    DeliveryOut,
    ImportJobAdminOut,
    OutboxOut,
    OverviewOut,
    PlanAdminOut,
    PlanCreateIn,
    PlanPricesIn,
    PlanUpdateIn,
    PromoGrantOut,
    PromoIn,
    QueuesOut,
    ReconcileOut,
    RoleIn,
    SettingIn,
    SettingOut,
)
from app.schemas.auth import EntitlementsOut
from app.schemas.billing import SubscriptionOut
from app.schemas.common import OkResponse, Page
from app.services import admin as svc
from app.services import billing as billing_service
from app.services.plans import get_entitlements

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])


def _audit(db: Session, request: Request, actor: User, action: str, **kw) -> None:
    audit(
        db,
        actor_id=actor.id,
        action=action,
        ip=client_ip(request),
        request_id=getattr(request.state, "request_id", None),
        **kw,
    )


# --- Visão geral ---------------------------------------------------------------------


@router.get("/overview", response_model=OverviewOut)
def overview(db: Session = Depends(get_db)) -> OverviewOut:
    return OverviewOut(**svc.overview(db))


# --- Usuários ------------------------------------------------------------------------------


def _user_out(db: Session, user: User) -> AdminUserOut:
    o = AdminUserOut.model_validate(user)
    summary = svc.user_summary(db, user)
    o.plan_code = summary["plan_code"]
    o.plan_source = summary["plan_source"]
    o.subscription_status = summary["subscription_status"]
    return o


@router.get("/users", response_model=Page[AdminUserOut])
def list_users(
    q: str | None = Query(default=None, max_length=120),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> Page[AdminUserOut]:
    rows, total = svc.search_users(db, q=q, limit=limit, offset=offset)
    return Page(items=[_user_out(db, u) for u in rows], total=total, limit=limit, offset=offset)


@router.get("/users/{user_id}", response_model=AdminUserDetailOut)
def user_detail(user_id: UUID, db: Session = Depends(get_db)) -> AdminUserDetailOut:
    user = svc.get_user(db, user_id)
    ent = get_entitlements(db, user.id)
    return AdminUserDetailOut(
        user=_user_out(db, user),
        entitlements=EntitlementsOut(**ent.__dict__),
        subscriptions=[
            SubscriptionOut(**billing_service.describe_subscription(db, s))
            for s in billing_service.list_subscriptions(db, user.id)
        ],
        promo_grants=[
            PromoGrantOut(**svc.promo_out(db, g)) for g in svc.list_promo_grants(db, user.id)
        ],
        usage=svc.user_usage(db, user),
    )


@router.post("/users/{user_id}/role", response_model=AdminUserOut)
def set_role(
    user_id: UUID,
    payload: RoleIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> AdminUserOut:
    user = svc.get_user(db, user_id)
    before = user.role
    svc.set_role(db, admin, user, payload.role)
    _audit(
        db,
        request,
        admin,
        "admin.user.role",
        target_type="user",
        target_id=str(user.id),
        metadata={"from": before, "to": payload.role},
    )
    db.commit()
    return _user_out(db, user)


@router.post("/users/{user_id}/deactivate", response_model=AdminUserOut)
def deactivate(
    user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> AdminUserOut:
    user = svc.get_user(db, user_id)
    svc.deactivate_user(db, admin, user)
    _audit(db, request, admin, "admin.user.deactivate", target_type="user", target_id=str(user.id))
    db.commit()
    return _user_out(db, user)


@router.post("/users/{user_id}/reactivate", response_model=AdminUserOut)
def reactivate(
    user_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> AdminUserOut:
    user = svc.get_user(db, user_id)
    svc.reactivate_user(db, user)
    _audit(db, request, admin, "admin.user.reactivate", target_type="user", target_id=str(user.id))
    db.commit()
    return _user_out(db, user)


# --- Acesso promocional -----------------------------------------------------------------------


@router.post("/users/{user_id}/promo", response_model=PromoGrantOut, status_code=201)
def grant_promo(
    user_id: UUID,
    payload: PromoIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> PromoGrantOut:
    """Concede acesso promocional explícito (não finge pagamento; fonte = `promo`)."""
    user = svc.get_user(db, user_id)
    grant = svc.grant_promo(
        db, admin, user, plan_code=payload.plan_code, days=payload.days, reason=payload.reason
    )
    _audit(
        db,
        request,
        admin,
        "admin.promo.grant",
        target_type="promo_grant",
        target_id=str(grant.id),
        metadata={
            "user_id": str(user.id),
            "plan_code": payload.plan_code,
            "days": payload.days,
            "reason": payload.reason,
        },
    )
    db.commit()
    return PromoGrantOut(**svc.promo_out(db, grant))


@router.delete("/promo/{grant_id}", response_model=PromoGrantOut)
def revoke_promo(
    grant_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> PromoGrantOut:
    grant = svc.get_promo(db, grant_id)
    svc.revoke_promo(db, grant)
    _audit(
        db,
        request,
        admin,
        "admin.promo.revoke",
        target_type="promo_grant",
        target_id=str(grant.id),
        metadata={"user_id": str(grant.user_id)},
    )
    db.commit()
    return PromoGrantOut(**svc.promo_out(db, grant))


# --- Catálogo ---------------------------------------------------------------------------------


@router.get("/plans", response_model=list[PlanAdminOut])
def list_plans(db: Session = Depends(get_db)) -> list[PlanAdminOut]:
    return [PlanAdminOut.model_validate(p) for p in svc.list_plans(db)]


@router.post("/plans", response_model=PlanAdminOut, status_code=201)
def create_plan(
    payload: PlanCreateIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> PlanAdminOut:
    plan = svc.create_plan(db, payload.model_dump())
    _audit(
        db,
        request,
        admin,
        "admin.plan.create",
        target_type="plan",
        target_id=str(plan.id),
        metadata={"code": plan.code},
    )
    db.commit()
    db.refresh(plan)
    return PlanAdminOut.model_validate(plan)


@router.patch("/plans/{plan_id}", response_model=PlanAdminOut)
def update_plan(
    plan_id: UUID,
    payload: PlanUpdateIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> PlanAdminOut:
    plan = svc.get_plan(db, plan_id)
    data = payload.model_dump(exclude_unset=True)
    svc.update_plan(db, plan, data)
    _audit(
        db,
        request,
        admin,
        "admin.plan.update",
        target_type="plan",
        target_id=str(plan.id),
        metadata={"fields": sorted(data.keys())},
    )
    db.commit()
    db.refresh(plan)
    return PlanAdminOut.model_validate(plan)


@router.put("/plans/{plan_id}/prices", response_model=PlanAdminOut)
def set_prices(
    plan_id: UUID,
    payload: PlanPricesIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> PlanAdminOut:
    plan = svc.get_plan(db, plan_id)
    svc.upsert_prices(db, plan, [p.model_dump() for p in payload.prices])
    _audit(
        db,
        request,
        admin,
        "admin.plan.prices",
        target_type="plan",
        target_id=str(plan.id),
        metadata={"prices": [p.model_dump() for p in payload.prices]},
    )
    db.commit()
    db.refresh(plan)
    return PlanAdminOut.model_validate(plan)


@router.post("/plans/{plan_id}/prices", response_model=PlanAdminOut, include_in_schema=False)
def set_prices_post(
    plan_id: UUID,
    payload: PlanPricesIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> PlanAdminOut:
    return set_prices(plan_id, payload, request, db, admin)


# --- Configurações ------------------------------------------------------------------------------


def _setting_out(db: Session, key: str) -> SettingOut:
    if key not in svc.SETTING_KEYS:
        raise NotFound("Configuração não encontrada.", code="setting_not_found")
    row = db.get(svc.AppSetting, key)
    return SettingOut(
        key=key,
        value=svc.get_setting(db, key),
        is_default=row is None,
        updated_at=row.updated_at if row else None,
        updated_by=row.updated_by if row else None,
    )


@router.get("/settings/{key}", response_model=SettingOut)
def get_setting(key: str, db: Session = Depends(get_db)) -> SettingOut:
    return _setting_out(db, key)


@router.put("/settings/{key}", response_model=SettingOut)
def put_setting(
    key: str,
    payload: SettingIn,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> SettingOut:
    if key not in svc.SETTING_KEYS:
        raise NotFound("Configuração não encontrada.", code="setting_not_found")
    svc.set_setting(db, key, payload.value, updated_by=admin.id)
    _audit(
        db,
        request,
        admin,
        "admin.setting.update",
        target_type="app_setting",
        target_id=key,
        metadata={"keys": sorted(payload.value.keys())},
    )
    db.commit()
    return _setting_out(db, key)


# --- Filas ---------------------------------------------------------------------------------


@router.get("/queues", response_model=QueuesOut)
def queues(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> QueuesOut:
    fo, fo_total = svc.failed_outbox(db, limit=limit, offset=offset)
    fi, fi_total = svc.failed_imports(db, limit=limit, offset=offset)
    return QueuesOut(
        outbox_by_status=svc.outbox_by_status(db),
        failed_outbox=Page(
            items=[OutboxOut.model_validate(r) for r in fo],
            total=fo_total,
            limit=limit,
            offset=offset,
        ),
        failed_deliveries=[
            DeliveryOut.model_validate(d) for d in svc.failed_deliveries(db, limit=limit)
        ],
        failed_imports=Page(
            items=[ImportJobAdminOut.model_validate(r) for r in fi],
            total=fi_total,
            limit=limit,
            offset=offset,
        ),
    )


@router.post("/outbox/{outbox_id}/retry", response_model=OutboxOut)
def retry_outbox(
    outbox_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
) -> OutboxOut:
    row = db.get(NotificationOutbox, outbox_id)
    if row is None:
        raise NotFound("Notificação não encontrada.")
    svc.retry_outbox(db, row)
    _audit(db, request, admin, "admin.outbox.retry", target_type="outbox", target_id=str(row.id))
    db.commit()
    return OutboxOut.model_validate(row)


# --- Cobrança -------------------------------------------------------------------------------


@router.get("/billing/events", response_model=Page[BillingEventOut])
def billing_events(
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None, max_length=16),
    db: Session = Depends(get_db),
) -> Page[BillingEventOut]:
    rows, total = svc.list_billing_events(db, limit=limit, offset=offset, status=status)
    return Page(
        items=[BillingEventOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/billing/reconcile", response_model=ReconcileOut)
def reconcile(
    request: Request, db: Session = Depends(get_db), admin: User = Depends(get_admin_user)
) -> ReconcileOut:
    """Executa a reconciliação na hora (função interna, sem depender de fila)."""
    summary = billing_service.reconcile_subscriptions(db)
    _audit(db, request, admin, "admin.billing.reconcile", metadata=summary)
    db.commit()
    return ReconcileOut(summary=summary)


# --- Auditoria ----------------------------------------------------------------------------


@router.get("/audit", response_model=Page[AuditOut])
def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    action: str | None = Query(default=None, max_length=64),
    actor_id: UUID | None = None,
    db: Session = Depends(get_db),
) -> Page[AuditOut]:
    rows, total = svc.list_audit(db, limit=limit, offset=offset, action=action, actor_id=actor_id)
    return Page(
        items=[
            AuditOut(
                id=r.id,
                actor_id=r.actor_id,
                action=r.action,
                target_type=r.target_type,
                target_id=r.target_id,
                metadata=r.metadata_,
                ip=r.ip,
                request_id=r.request_id,
                created_at=r.created_at,
            )
            for r in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/ping", response_model=OkResponse, include_in_schema=False)
def ping() -> OkResponse:
    return OkResponse(message="admin")
