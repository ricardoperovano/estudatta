"""Assinatura do usuário e webhook do provedor de pagamento."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import client_ip, get_current_user, rate_limit
from app.core.errors import NotFound, ServiceUnavailable, Unauthorized
from app.integrations.mercadopago import BillingProvider, ProviderError, get_provider
from app.models.user import User
from app.schemas.auth import EntitlementsOut
from app.schemas.billing import (
    CheckoutIn,
    CheckoutOut,
    CouponCheckIn,
    CouponInfoOut,
    SubscriptionOut,
    SubscriptionStateOut,
    WebhookAck,
)
from app.services import billing as billing_service
from app.services.plans import get_entitlements

router = APIRouter(prefix="/billing", tags=["billing"])


def optional_provider() -> BillingProvider | None:
    """Provedor quando configurado; None quando a cobrança está desligada (cancelar nunca bloqueia)."""
    try:
        return get_provider()
    except ServiceUnavailable:
        return None


def _state(db: Session, user: User, message: str | None = None) -> SubscriptionStateOut:
    ent = get_entitlements(db, user.id)
    current = billing_service.current_subscription(db, user.id)
    history = [
        SubscriptionOut(**billing_service.describe_subscription(db, s))
        for s in billing_service.list_subscriptions(db, user.id)
    ]
    next_charge = None
    if current is not None and current.status in ("active", "past_due"):
        next_charge = current.current_period_end
    return SubscriptionStateOut(
        billing_mode=billing_service.billing_mode(),
        subscription=SubscriptionOut(**billing_service.describe_subscription(db, current))
        if current
        else None,
        entitlements=EntitlementsOut(**ent.__dict__),
        cancel_at_period_end=bool(current and current.cancel_at_period_end),
        next_charge_at=next_charge,
        history=history,
        message=message,
    )


@router.get("/subscription", response_model=SubscriptionStateOut)
def get_subscription(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SubscriptionStateOut:
    return _state(db, user)


@router.post(
    "/checkout",
    response_model=CheckoutOut,
    status_code=201,
    dependencies=[Depends(rate_limit("checkout", 10, 3600))],
)
def checkout(
    payload: CheckoutIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    provider: BillingProvider = Depends(get_provider),
) -> CheckoutOut:
    """Cria a assinatura pendente e devolve o link de pagamento. Voltar da URL de sucesso
    NÃO libera o plano: só a confirmação do provedor (webhook/reconciliação) ativa."""
    sub = billing_service.start_checkout(
        db,
        user,
        plan_code=payload.plan_code,
        interval=payload.interval,
        provider=provider,
        coupon_code=payload.coupon_code,
    )
    audit(
        db,
        actor_id=user.id,
        action="billing.checkout",
        target_type="subscription",
        target_id=str(sub.id),
        metadata={
            "plan_code": payload.plan_code,
            "interval": payload.interval,
            "coupon_code": payload.coupon_code,
        },
        ip=client_ip(request),
    )
    db.commit()
    return CheckoutOut(
        checkout_url=sub.checkout_url or "", subscription_id=sub.id, status=sub.status
    )


@router.post("/cancel", response_model=SubscriptionStateOut)
def cancel(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    provider: BillingProvider | None = Depends(optional_provider),
) -> SubscriptionStateOut:
    sub, message = billing_service.cancel_subscription(db, user, provider)
    audit(
        db,
        actor_id=user.id,
        action="billing.cancel",
        target_type="subscription",
        target_id=str(sub.id),
        metadata={
            "status": sub.status,
            "cancel_pending": bool(sub.metadata_.get("cancel_pending")),
        },
        ip=client_ip(request),
    )
    db.commit()
    return _state(db, user, message=message)


@router.post(
    "/sync",
    response_model=SubscriptionStateOut,
    dependencies=[Depends(rate_limit("billing_sync", 10, 600))],
)
def sync(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    provider: BillingProvider = Depends(get_provider),
) -> SubscriptionStateOut:
    sub = billing_service.current_subscription(db, user.id)
    if sub is None:
        raise NotFound("Você não tem uma assinatura para sincronizar.", code="no_subscription")
    try:
        billing_service.sync_subscription(db, sub, provider)
    except ProviderError as exc:
        raise ServiceUnavailable(exc.message, code="provider_unavailable") from exc
    db.commit()
    return _state(db, user, message="Assinatura atualizada com o provedor de pagamento.")


@router.post("/webhooks/mercadopago", response_model=WebhookAck)
def mercadopago_webhook(
    request: Request,
    payload: Any = Body(default=None),
    db: Session = Depends(get_db),
) -> WebhookAck:
    """Sem auth/CSRF. Valida `x-signature`, grava o evento (idempotente) e sincroniza a
    assinatura consultando o provedor — nunca confia no conteúdo do evento."""
    if not settings.billing_enabled or not settings.MERCADOPAGO_WEBHOOK_SECRET:
        raise ServiceUnavailable(
            "Webhook de cobrança não configurado neste ambiente.", code="billing_disabled"
        )
    provider = get_provider()
    outcome = billing_service.handle_webhook(
        db,
        provider=provider,
        x_signature=request.headers.get("x-signature"),
        x_request_id=request.headers.get("x-request-id"),
        query=dict(request.query_params),
        body=payload,
        secret=settings.MERCADOPAGO_WEBHOOK_SECRET,
    )
    db.commit()
    if outcome.status == "invalid_signature":
        raise Unauthorized("Assinatura do webhook inválida.", code="invalid_signature")
    if outcome.status == "failed":
        # 503 faz o provedor reenviar (a cada 15 min); o evento fica `failed` e será reprocessado
        raise ServiceUnavailable(
            "Não foi possível consultar o provedor de pagamento; tente novamente.",
            code="provider_unavailable",
        )
    return WebhookAck(status=outcome.status)


@router.post("/webhooks/asaas", response_model=WebhookAck)
def asaas_webhook(
    request: Request,
    payload: Any = Body(default=None),
    db: Session = Depends(get_db),
) -> WebhookAck:
    """Sem auth/CSRF. Valida o `asaas-access-token`, grava o evento (idempotente) e sincroniza a
    assinatura consultando o Asaas. Eventos sem assinatura nossa respondem 200 (`ignored`)."""
    if (
        not settings.billing_enabled
        or settings.BILLING_PROVIDER != "asaas"
        or not settings.ASAAS_WEBHOOK_TOKEN
    ):
        raise ServiceUnavailable(
            "Webhook de cobrança não configurado neste ambiente.", code="billing_disabled"
        )
    provider = get_provider()
    outcome = billing_service.handle_asaas_webhook(
        db,
        provider=provider,
        token=request.headers.get("asaas-access-token"),
        body=payload,
        expected_token=settings.ASAAS_WEBHOOK_TOKEN,
    )
    db.commit()
    if outcome.status == "invalid_signature":
        raise Unauthorized("Token do webhook inválido.", code="invalid_signature")
    if outcome.status == "failed":
        # 503 faz o Asaas reenviar; o evento fica `failed` e é reprocessado
        raise ServiceUnavailable(
            "Não foi possível consultar o provedor de pagamento; tente novamente.",
            code="provider_unavailable",
        )
    return WebhookAck(status=outcome.status)


@router.post(
    "/coupons/check",
    response_model=CouponInfoOut,
    dependencies=[Depends(rate_limit("coupon_check", 20, 600))],
)
def coupon_check(
    payload: CouponCheckIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> CouponInfoOut:
    """Valida um cupom para este usuário sem consumir (a tela de planos mostra o efeito)."""
    from app.services import growth

    _, info = growth.check_coupon(db, user, payload.code, plan_code=payload.plan_code)
    return CouponInfoOut(**info)


@router.post(
    "/coupons/redeem",
    response_model=SubscriptionStateOut,
    dependencies=[Depends(rate_limit("coupon_redeem", 10, 3600))],
)
def coupon_redeem(
    payload: CouponCheckIn,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubscriptionStateOut:
    """Cupom de dias grátis: libera o plano na hora, sem pagamento (acesso promocional)."""
    from app.services import growth

    coupon, _ = growth.check_coupon(db, user, payload.code)
    if coupon.kind != "trial":
        raise NotFound("Este cupom é de desconto: use-o ao assinar.", code="coupon_kind")
    current = billing_service.current_subscription(db, user.id)
    if current is not None and current.status in ("active", "past_due"):
        raise NotFound("Você já tem uma assinatura ativa.", code="already_subscribed")
    grant = growth.redeem_trial(db, user, coupon)
    audit(
        db,
        actor_id=user.id,
        action="billing.coupon_redeem",
        target_type="promo_grant",
        target_id=str(grant.id),
        metadata={"coupon": coupon.code, "days": coupon.value},
        ip=client_ip(request),
    )
    db.commit()
    return _state(db, user, message=f"Pronto: {coupon.value} dias do plano liberados.")
