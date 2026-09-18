"""Assinaturas: catálogo, checkout (preapproval), webhooks idempotentes, sincronização com o
provedor, reconciliação periódica e rebaixamento de plano sem apagar nada.

Regra central: o estado local NUNCA é decidido pelo conteúdo de um evento nem pelo retorno da
URL de sucesso. Toda transição parte de uma consulta ao estado atual no provedor
(`GET /preapproval/{id}`) e é aplicada de forma idempotente por `apply_provider_state`.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import audit
from app.core.config import settings
from app.core.errors import Conflict, NotFound, ServiceUnavailable, ValidationFailed
from app.core.logging import get_logger
from app.core.timeutil import utcnow
from app.integrations.mercadopago import (
    BILLING_DISABLED_MESSAGE,
    PROVIDER_NAME,
    BillingProvider,
    ProviderError,
    ProviderSubscription,
    get_provider,
    normalize_status,
    parse_provider_datetime,
    parse_signature_header,
    verify_webhook_signature,
)
from app.models.activity import Activity
from app.models.billing import BillingEvent, Plan, PlanPrice, PromoGrant, Subscription
from app.models.user import User
from app.services.outbox import notify_inapp
from app.services.plans import get_entitlements

log = get_logger("billing")

INTERVALS: dict[str, tuple[int, str]] = {"month": (1, "months"), "year": (12, "months")}
INTERVAL_LABEL = {"month": "mensal", "year": "anual"}
# estado no provedor → estado local
STATUS_MAP = {
    "authorized": "active",
    "paused": "paused",
    "cancelled": "cancelled",
    "pending": "pending",
}
OPEN_STATUSES = ("pending", "active", "past_due", "paused", "cancelled")
PENDING_CHECK_AFTER = timedelta(hours=1)
PENDING_EXPIRES_AFTER = timedelta(days=7)
PAST_DUE_GRACE = timedelta(days=3)
CHECKOUT_REUSE_WINDOW = timedelta(hours=1)
DOWNGRADE_LOOKBACK = timedelta(days=2)


def billing_mode() -> str:
    return settings.BILLING_MODE if settings.billing_enabled else "disabled"


# --- Catálogo -------------------------------------------------------------------


def list_public_plans(db: Session) -> list[Plan]:
    return list(
        db.execute(
            select(Plan)
            .where(Plan.active.is_(True))
            .options(selectinload(Plan.prices))
            .order_by(Plan.sort_order, Plan.code)
        ).scalars()
    )


def active_prices(plan: Plan) -> list[PlanPrice]:
    order = {"month": 0, "year": 1}
    return sorted(
        (p for p in plan.prices if p.active), key=lambda p: (order.get(p.interval, 9), p.interval)
    )


# --- Consulta de assinaturas --------------------------------------------------------


def list_subscriptions(db: Session, user_id: uuid.UUID) -> list[Subscription]:
    return list(
        db.execute(
            select(Subscription)
            .where(Subscription.user_id == user_id)
            .order_by(Subscription.created_at.desc())
        ).scalars()
    )


def current_subscription(
    db: Session, user_id: uuid.UUID, *, now: datetime | None = None
) -> Subscription | None:
    """Assinatura "atual" por prioridade: ativa/atrasada → cancelada com acesso → pendente → pausada."""
    now = now or utcnow()
    subs = list_subscriptions(db, user_id)
    for status in ("active", "past_due"):
        for s in subs:
            if s.status == status:
                return s
    for s in subs:
        if s.status == "cancelled" and s.current_period_end and s.current_period_end > now:
            return s
    for s in subs:
        if s.status == "pending":
            return s
    for s in subs:
        if s.status == "paused":
            return s
    return None


def describe_subscription(db: Session, sub: Subscription) -> dict[str, Any]:
    plan = db.get(Plan, sub.plan_id)
    meta = sub.metadata_ or {}
    return {
        "id": sub.id,
        "plan_code": plan.code if plan else "",
        "plan_name": plan.name if plan else "",
        "interval": meta.get("interval"),
        "amount_cents": meta.get("amount_cents"),
        "currency": meta.get("currency"),
        "status": sub.status,
        "provider": sub.provider,
        "current_period_start": sub.current_period_start,
        "current_period_end": sub.current_period_end,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "cancelled_at": sub.cancelled_at,
        "ended_at": sub.ended_at,
        "last_synced_at": sub.last_synced_at,
        "checkout_url": sub.checkout_url if sub.status == "pending" else None,
        "created_at": sub.created_at,
    }


# --- Checkout ---------------------------------------------------------------------


def start_checkout(
    db: Session, user: User, *, plan_code: str, interval: str, provider: BillingProvider
) -> Subscription:
    """Cria a assinatura local `pending` e a preapproval no provedor. NÃO concede acesso:
    só o webhook/reconciliação confirmando `authorized` ativa o plano."""
    if not settings.billing_enabled:
        raise ServiceUnavailable(BILLING_DISABLED_MESSAGE, code="billing_disabled")
    if interval not in INTERVALS:
        raise ValidationFailed("Intervalo de cobrança inválido.", code="invalid_interval")
    plan = db.execute(select(Plan).where(Plan.code == plan_code)).scalar_one_or_none()
    if plan is None or not plan.active:
        raise NotFound("Plano não encontrado.", code="plan_not_found")
    if plan.code == "free":
        raise ValidationFailed(
            "O plano gratuito não precisa de assinatura.", code="plan_not_purchasable"
        )
    price = db.execute(
        select(PlanPrice).where(
            PlanPrice.plan_id == plan.id,
            PlanPrice.interval == interval,
            PlanPrice.active.is_(True),
        )
    ).scalar_one_or_none()
    if price is None or price.amount_cents is None:
        raise Conflict("Este plano ainda não tem preço definido.", code="price_not_set")
    if price.amount_cents <= 0:
        raise Conflict("Preço inválido para cobrança.", code="price_not_set")

    now = utcnow()
    existing = current_subscription(db, user.id, now=now)
    if existing is not None and existing.status in ("active", "past_due"):
        raise Conflict("Você já tem uma assinatura ativa.", code="already_subscribed")
    if (
        existing is not None
        and existing.status == "pending"
        and existing.price_id == price.id
        and existing.checkout_url
        and existing.created_at
        and existing.created_at > now - CHECKOUT_REUSE_WINDOW
    ):
        return existing  # reaproveita o checkout recém-criado (idempotência entre cliques)

    ref = uuid.uuid4().hex[:20]
    sub = Subscription(
        user_id=user.id,
        plan_id=plan.id,
        price_id=price.id,
        provider=provider.name,
        status="pending",
        external_reference=ref,
        metadata_={
            "interval": interval,
            "amount_cents": price.amount_cents,
            "currency": price.currency,
            "billing_mode": settings.BILLING_MODE,
        },
        created_at=now,
        updated_at=now,
    )
    db.add(sub)
    db.flush()
    frequency, frequency_type = INTERVALS[interval]
    try:
        remote = provider.create_preapproval(
            reason=f"{settings.APP_NAME} — plano {plan.name} ({INTERVAL_LABEL[interval]})",
            external_reference=ref,
            payer_email=user.email,
            amount=price.amount_cents / 100,
            currency=price.currency,
            frequency=frequency,
            frequency_type=frequency_type,
            back_url=f"{settings.APP_URL.rstrip('/')}/app/planos?retorno=checkout",
        )
    except ProviderError as exc:
        log.warning("billing.checkout_failed", user_id=str(user.id), error=exc.message)
        raise ServiceUnavailable(
            "Não foi possível iniciar o pagamento agora. Tente novamente em instantes.",
            code="provider_unavailable",
        ) from exc
    if not remote.init_point:
        raise ServiceUnavailable(
            "O provedor não devolveu o link de pagamento. Tente novamente em instantes.",
            code="provider_unavailable",
        )
    sub.provider_ref = remote.id
    sub.checkout_url = remote.init_point
    sub.provider_payer_ref = remote.payer_id
    sub.last_synced_at = now
    db.flush()
    return sub


# --- Transições -----------------------------------------------------------------------


def compute_period_end(remote: ProviderSubscription, now: datetime) -> datetime | None:
    """Fim do período pago: `next_payment_date` quando existir; senão projeta a partir de
    `auto_recurring` (frequency/frequency_type/start_date/end_date)."""
    if remote.next_payment_date is not None:
        return remote.next_payment_date
    ar = remote.auto_recurring or {}
    try:
        freq = int(ar.get("frequency") or 0)
    except (TypeError, ValueError):
        freq = 0
    ftype = str(ar.get("frequency_type") or "")
    if freq <= 0 or ftype not in ("months", "days"):
        return None
    start = parse_provider_datetime(ar.get("start_date")) or remote.date_created or now
    step = relativedelta(months=freq) if ftype == "months" else relativedelta(days=freq)
    end = start
    for _ in range(1000):
        end = end + step
        if end > now:
            break
    hard_end = parse_provider_datetime(ar.get("end_date"))
    if hard_end is not None and hard_end < end:
        return hard_end
    return end


def _interval_delta(sub: Subscription) -> relativedelta:
    freq, ftype = INTERVALS.get((sub.metadata_ or {}).get("interval") or "month", (1, "months"))
    return relativedelta(months=freq) if ftype == "months" else relativedelta(days=freq)


def apply_provider_state(
    db: Session, sub: Subscription, remote: ProviderSubscription, *, now: datetime | None = None
) -> str:
    """Aplica o estado REAL do provedor à assinatura local (idempotente, tolerante a eventos
    fora de ordem). Retorna o status local resultante."""
    now = now or utcnow()
    remote_status = normalize_status(remote.status)
    new_status = STATUS_MAP.get(remote_status)
    previous = sub.status
    if remote.id and not sub.provider_ref:
        sub.provider_ref = remote.id
    if remote.payer_id:
        sub.provider_payer_ref = remote.payer_id
    if remote.init_point and not sub.checkout_url:
        sub.checkout_url = remote.init_point
    if new_status is None:
        log.warning(
            "billing.unknown_provider_status",
            subscription_id=str(sub.id),
            status=remote_status,
        )
        sub.last_synced_at = now
        db.flush()
        return sub.status

    period_end = compute_period_end(remote, now)
    meta = dict(sub.metadata_ or {})
    cancel_pending = bool(meta.get("cancel_pending"))

    if new_status == "active":
        if sub.current_period_end and period_end and period_end > sub.current_period_end:
            sub.current_period_start = sub.current_period_end  # renovação
        if sub.current_period_start is None or previous != "active":
            sub.current_period_start = sub.current_period_start or now
        if period_end is not None:
            sub.current_period_end = period_end
        elif sub.current_period_end is None or sub.current_period_end <= now:
            sub.current_period_end = now + _interval_delta(sub)
        sub.status = "active"
        sub.ended_at = None
        if not cancel_pending:
            sub.cancel_at_period_end = False
            sub.cancelled_at = None
    elif new_status == "paused":
        sub.status = "paused"
        if period_end is not None:
            sub.current_period_end = period_end
    elif new_status == "cancelled":
        sub.status = "cancelled"
        sub.cancel_at_period_end = True
        sub.cancelled_at = sub.cancelled_at or now
        if previous == "pending" or (previous == "expired" and sub.current_period_end is None):
            sub.current_period_end = now  # nunca teve acesso pago
            sub.ended_at = now
        elif sub.current_period_end is None:
            sub.current_period_end = now
        if period_end is not None and period_end > sub.current_period_end:
            sub.current_period_end = period_end
        meta.pop("cancel_pending", None)
        meta.pop("cancel_requested_at", None)
    elif new_status == "pending":
        if previous in ("active", "past_due", "paused"):
            log.warning(
                "billing.provider_pending_after_active",
                subscription_id=str(sub.id),
                previous=previous,
            )
        sub.status = "pending"

    sub.metadata_ = meta
    sub.last_synced_at = now
    db.flush()
    if previous != sub.status:
        _on_transition(db, sub, previous, now)
    return sub.status


def expire_if_ended(db: Session, sub: Subscription, *, now: datetime | None = None) -> bool:
    now = now or utcnow()
    if (
        sub.status in ("cancelled", "past_due")
        and sub.current_period_end is not None
        and sub.current_period_end <= now
    ):
        _expire(db, sub, now, reason="period_ended")
        return True
    return False


def _expire(db: Session, sub: Subscription, now: datetime, *, reason: str) -> None:
    previous = sub.status
    sub.status = "expired"
    sub.ended_at = now
    if sub.current_period_end is not None and sub.current_period_end > now:
        sub.current_period_end = now
    sub.metadata_ = {**(sub.metadata_ or {}), "expired_reason": reason}
    sub.last_synced_at = sub.last_synced_at or now
    db.flush()
    _on_transition(db, sub, previous, now)


def _on_transition(db: Session, sub: Subscription, previous: str, now: datetime) -> None:
    audit(
        db,
        actor_id=None,
        action="billing.status",
        target_type="subscription",
        target_id=str(sub.id),
        metadata={"from": previous, "to": sub.status, "provider_ref": sub.provider_ref},
    )
    user = db.get(User, sub.user_id)
    if user is None:
        return
    plan = db.get(Plan, sub.plan_id)
    plan_name = plan.name if plan else "Completo"
    if sub.status == "active" and previous != "active":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_active",
            title=f"Plano {plan_name} ativado",
            body="Sua assinatura foi confirmada. Todos os recursos do plano já estão liberados.",
            url="/app/planos",
        )
    elif sub.status == "cancelled" and previous not in ("cancelled", "expired"):
        until = sub.current_period_end
        extra = (
            f" Você mantém o acesso ao plano {plan_name} até {until:%d/%m/%Y}."
            if until and until > now
            else ""
        )
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_cancelled",
            title="Renovação cancelada",
            body=f"A renovação automática foi cancelada.{extra} Nada será apagado.",
            url="/app/planos",
        )
    elif sub.status == "paused" and previous != "paused":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_paused",
            title="Assinatura pausada",
            body="A cobrança está pausada no provedor de pagamento. O plano gratuito continua disponível e seus dados estão guardados.",
            url="/app/planos",
        )
    elif sub.status == "past_due" and previous != "past_due":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_past_due",
            title="Pagamento pendente",
            body="Não recebemos a confirmação da última cobrança. Verifique a forma de pagamento para manter o plano.",
            url="/app/planos",
        )
    elif sub.status == "expired" and previous not in ("pending", "expired"):
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_expired",
            title="Assinatura encerrada",
            body="Seu período de acesso terminou. Seus objetivos e registros continuam guardados no plano gratuito.",
            url="/app/planos",
        )
    apply_entitlement_changes(db, user, now=now)


# --- Sincronização e cancelamento ---------------------------------------------------------


def sync_subscription(
    db: Session, sub: Subscription, provider: BillingProvider, *, now: datetime | None = None
) -> Subscription:
    """Consulta o provedor e aplica o estado real. Erros do provedor sobem como ProviderError."""
    now = now or utcnow()
    remote: ProviderSubscription | None = None
    if sub.provider_ref:
        remote = provider.get_preapproval(sub.provider_ref)
    elif sub.external_reference:
        remote = provider.search_preapproval_by_external_reference(sub.external_reference)
    if remote is None:
        sub.last_synced_at = now
        db.flush()
        return sub
    apply_provider_state(db, sub, remote, now=now)
    expire_if_ended(db, sub, now=now)
    return sub


def cancel_subscription(
    db: Session, user: User, provider: BillingProvider | None, *, now: datetime | None = None
) -> tuple[Subscription, str]:
    """Cancela a renovação sem obstáculos. Acesso continua até `current_period_end`.
    Se o provedor estiver indisponível, registra a intenção (`cancel_pending`) e a
    reconciliação conclui depois."""
    now = now or utcnow()
    sub = current_subscription(db, user.id, now=now)
    if sub is None:
        raise NotFound("Você não tem uma assinatura para cancelar.", code="no_subscription")
    if sub.status == "cancelled":
        raise Conflict("A renovação já está cancelada.", code="already_cancelled")

    remote: ProviderSubscription | None = None
    provider_ok = True
    if sub.provider_ref:
        if provider is None:
            provider_ok = False
        else:
            try:
                remote = provider.cancel_preapproval(sub.provider_ref)
            except ProviderError as exc:
                provider_ok = False
                log.warning(
                    "billing.cancel_provider_failed",
                    subscription_id=str(sub.id),
                    error=exc.message,
                )
    if not provider_ok:
        sub.cancel_at_period_end = True
        sub.metadata_ = {
            **(sub.metadata_ or {}),
            "cancel_pending": True,
            "cancel_requested_at": now.isoformat(),
        }
        sub.updated_at = now
        db.flush()
        return (
            sub,
            "Cancelamento registrado. Vamos confirmar com o provedor de pagamento em breve; "
            "você não será cobrado novamente.",
        )

    previous = sub.status
    if remote is not None and normalize_status(remote.status) == "cancelled":
        apply_provider_state(db, sub, remote, now=now)
    if sub.status != "cancelled":
        sub.status = "cancelled"
        sub.cancel_at_period_end = True
        sub.cancelled_at = now
        if previous == "pending" or sub.current_period_end is None:
            sub.current_period_end = sub.current_period_end or now
            if previous == "pending":
                sub.current_period_end = now
                sub.ended_at = now
        meta = dict(sub.metadata_ or {})
        meta.pop("cancel_pending", None)
        meta.pop("cancel_requested_at", None)
        sub.metadata_ = meta
        sub.last_synced_at = now
        db.flush()
        _on_transition(db, sub, previous, now)
    until = sub.current_period_end
    if until and until > now:
        return sub, f"Renovação cancelada. Você mantém o acesso até {until:%d/%m/%Y}."
    return sub, "Assinatura cancelada."


# --- Webhook -------------------------------------------------------------------------


@dataclass
class WebhookOutcome:
    event: BillingEvent | None
    status: str  # invalid_signature | duplicate | processed | ignored | failed


def _first(*values: Any) -> str | None:
    for v in values:
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return None


def _event_type(topic: str, action: str | None) -> str:
    return (f"{topic}.{action}" if action else topic)[:80]


def _is_not_found(exc: ProviderError) -> bool:
    """404 do provedor: o recurso não existe (ou não é desta conta). Não é falha transitória,
    então o evento é ignorado em vez de ficar em `failed` esperando reenvio."""
    return exc.status_code == 404


def locate_subscription(
    db: Session, provider: BillingProvider, *, topic: str, data_id: str | None
) -> Subscription | None:
    """Descobre a assinatura local a partir do recurso notificado. Pode consultar o provedor."""
    if not data_id:
        return None
    topic_l = topic.lower()
    if topic_l in ("subscription_preapproval", "preapproval"):
        preapproval_id = data_id
    elif topic_l in ("subscription_authorized_payment", "authorized_payment"):
        try:
            info = provider.get_authorized_payment(data_id)
        except ProviderError as exc:
            if not _is_not_found(exc):
                raise
            info = None
        preapproval_id = _first((info or {}).get("preapproval_id"))
    else:
        return None  # payment, merchant_order, etc.: não tratados aqui
    if not preapproval_id:
        return None
    sub = (
        db.execute(
            select(Subscription)
            .where(
                Subscription.provider == PROVIDER_NAME, Subscription.provider_ref == preapproval_id
            )
            .order_by(Subscription.created_at.desc())
        )
        .scalars()
        .first()
    )
    if sub is not None:
        return sub
    try:
        remote = provider.get_preapproval(preapproval_id)
    except ProviderError as exc:
        if _is_not_found(exc):
            return None  # não existe no provedor: nada a sincronizar
        raise
    if remote.external_reference:
        sub = (
            db.execute(
                select(Subscription)
                .where(
                    Subscription.provider == PROVIDER_NAME,
                    Subscription.external_reference == remote.external_reference,
                )
                .order_by(Subscription.created_at.desc())
            )
            .scalars()
            .first()
        )
        if sub is not None:
            sub.provider_ref = preapproval_id
            return sub
    return None


def handle_webhook(
    db: Session,
    *,
    provider: BillingProvider,
    x_signature: str | None,
    x_request_id: str | None,
    query: dict[str, str],
    body: Any,
    secret: str | None,
    now: datetime | None = None,
) -> WebhookOutcome:
    """Grava o evento (idempotente por provider+event_id), valida a assinatura e processa
    consultando o estado atual no provedor. Não faz commit."""
    now = now or utcnow()
    body = body if isinstance(body, dict) else {}
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    data_id = _first(query.get("data.id"), data.get("id"), query.get("id"))
    topic = _first(query.get("type"), query.get("topic"), body.get("type"), body.get("topic")) or (
        "unknown"
    )
    action = _first(body.get("action"), query.get("action"))
    sig = parse_signature_header(x_signature)
    event_id = (_first(body.get("id"), x_request_id) or f"{topic}:{data_id}:{sig.get('ts', '')}")[
        :160
    ]
    payload = {"query": dict(query), "body": body}
    valid = verify_webhook_signature(
        x_signature=x_signature, x_request_id=x_request_id, data_id=data_id, secret=secret
    )
    existing = db.execute(
        select(BillingEvent).where(
            BillingEvent.provider == PROVIDER_NAME, BillingEvent.event_id == event_id
        )
    ).scalar_one_or_none()

    if not valid:
        if existing is None:
            existing = BillingEvent(
                provider=PROVIDER_NAME,
                event_id=event_id,
                event_type=_event_type(topic, action),
                resource_id=data_id[:120] if data_id else None,
                payload=payload,
                signature_valid=False,
                status="ignored",
                error="invalid_signature",
                received_at=now,
                processed_at=now,
            )
            db.add(existing)
            db.flush()
        log.warning("billing.webhook_invalid_signature", event_id=event_id, topic=topic)
        return WebhookOutcome(existing, "invalid_signature")

    if existing is not None and existing.signature_valid and existing.status != "failed":
        return WebhookOutcome(existing, "duplicate")  # já processado: responde 200 sem reprocessar

    event = existing or BillingEvent(
        provider=PROVIDER_NAME,
        event_id=event_id,
        event_type=_event_type(topic, action),
        resource_id=data_id[:120] if data_id else None,
        payload=payload,
        received_at=now,
    )
    event.signature_valid = True
    event.status = "received"
    event.error = None
    event.payload = payload
    db.add(event)
    db.flush()

    try:
        sub = locate_subscription(db, provider, topic=topic, data_id=data_id)
        if sub is None:
            event.status = "ignored"
            event.error = "subscription_not_found"
            event.processed_at = now
            db.flush()
            return WebhookOutcome(event, "ignored")
        sync_subscription(db, sub, provider, now=now)
        event.subscription_id = sub.id
        event.status = "processed"
        event.processed_at = now
        db.flush()
        return WebhookOutcome(event, "processed")
    except ProviderError as exc:
        event.status = "failed"
        event.error = exc.message[:500]
        event.processed_at = now
        db.flush()
        log.warning("billing.webhook_provider_failed", event_id=event_id, error=exc.message)
        return WebhookOutcome(event, "failed")


# --- Reconciliação ---------------------------------------------------------------------


def reconcile_subscriptions(
    db: Session, *, provider: BillingProvider | None = None, now: datetime | None = None
) -> dict:
    """Corrige assinaturas consultando o provedor. Idempotente; não faz commit.

    - `pending` há mais de 1h: consulta o provedor (webhook pode ter se perdido);
      há mais de 7 dias: `expired`, sem consultar o provedor.
    - `active`/`past_due`/`paused`/`cancelled`: consulta o provedor e aplica o estado real
      (pausa, cancelamento ou renovação cujo webhook se perdeu); `cancelled`/`past_due` com
      período vencido → `expired`.
    - `active` cujo período venceu há mais de 3 dias sem renovação confirmada → `past_due`.
    - pedidos de cancelamento não confirmados (`cancel_pending`) são reenviados.
    - usuários com acesso promocional encerrado recentemente passam pelo rebaixamento.
    """
    now = now or utcnow()
    summary = {
        "checked": 0,
        "synced": 0,
        "expired": 0,
        "past_due": 0,
        "cancel_retried": 0,
        "errors": 0,
        "downgraded_users": 0,
        "provider_available": True,
    }
    if provider is None:
        try:
            provider = get_provider()
        except ServiceUnavailable:
            provider = None
            summary["provider_available"] = False

    subs = list(
        db.execute(
            select(Subscription)
            .where(Subscription.status.in_(OPEN_STATUSES))
            .order_by(Subscription.created_at)
        ).scalars()
    )
    for sub in subs:
        summary["checked"] += 1
        created = sub.created_at or now
        try:
            if sub.status == "pending":
                if now - created >= PENDING_EXPIRES_AFTER:
                    _expire(db, sub, now, reason="pending_timeout")
                    summary["expired"] += 1
                elif now - created >= PENDING_CHECK_AFTER and provider is not None:
                    sync_subscription(db, sub, provider, now=now)
                    summary["synced"] += 1
                continue

            if expire_if_ended(db, sub, now=now):
                summary["expired"] += 1
                continue

            meta = sub.metadata_ or {}
            cancel_pending = bool(meta.get("cancel_pending"))
            if cancel_pending and provider is not None and sub.provider_ref:
                try:
                    provider.cancel_preapproval(sub.provider_ref)
                    summary["cancel_retried"] += 1
                except ProviderError as exc:
                    summary["errors"] += 1
                    log.warning(
                        "billing.reconcile_cancel_failed",
                        subscription_id=str(sub.id),
                        error=exc.message,
                    )
            # Toda assinatura aberta é conferida no provedor: o estado local nunca depende de
            # um webhook ter chegado (pausa, cancelamento ou renovação podem ter se perdido).
            if provider is not None and sub.provider_ref:
                sync_subscription(db, sub, provider, now=now)
                summary["synced"] += 1
            if (
                sub.status == "active"
                and sub.current_period_end is not None
                and sub.current_period_end <= now - PAST_DUE_GRACE
            ):
                previous = sub.status
                sub.status = "past_due"
                db.flush()
                _on_transition(db, sub, previous, now)
                summary["past_due"] += 1
            if expire_if_ended(db, sub, now=now):
                summary["expired"] += 1
        except ProviderError as exc:
            summary["errors"] += 1
            log.warning("billing.reconcile_failed", subscription_id=str(sub.id), error=exc.message)

    # Acesso promocional encerrado/revogado recentemente: garante o rebaixamento sem apagar nada
    since = now - DOWNGRADE_LOOKBACK
    grants = db.execute(
        select(PromoGrant).where(
            (PromoGrant.ends_at.between(since, now)) | (PromoGrant.revoked_at.between(since, now))
        )
    ).scalars()
    for uid in {g.user_id for g in grants}:
        user = db.get(User, uid)
        if user is not None and apply_entitlement_changes(db, user, now=now):
            summary["downgraded_users"] += 1
    db.flush()
    return summary


# --- Rebaixamento sem perda ---------------------------------------------------------------


def apply_entitlement_changes(
    db: Session, user: User, *, now: datetime | None = None
) -> list[Activity]:
    """Após qualquer transição de direitos: se o usuário tem mais objetivos ativos do que o
    plano permite, mantém o atualizado mais recentemente (`updated_at`, desempate por
    `created_at`) ativo e pausa os demais. Nunca apaga. Retorna os objetivos pausados
    (vazio quando nada mudou)."""
    now = now or utcnow()
    ent = get_entitlements(db, user.id)
    limit = ent.limit("max_active_activities")
    if limit is None:
        return []
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        return []
    # `updated_at`/`created_at` podem empatar (em SQLite o `server_default` tem resolução de
    # segundo); o desempate precisa ser determinístico e portátil: `sort_order` (posição na
    # lista, definida na criação como "último da fila" e editável pelo usuário) e, por fim, o id.
    active = list(
        db.execute(
            select(Activity)
            .where(Activity.user_id == user.id, Activity.status == "active")
            .order_by(
                Activity.updated_at.desc(),
                Activity.created_at.desc(),
                Activity.sort_order.desc(),
                Activity.id.desc(),
            )
        ).scalars()
    )
    if len(active) <= limit:
        return []
    keep, pause = active[:limit], active[limit:]
    for act in pause:
        act.status = "paused"
        act.updated_at = now
        audit(
            db,
            actor_id=None,
            action="plan.downgrade_pause",
            target_type="activity",
            target_id=str(act.id),
            metadata={
                "user_id": str(user.id),
                "plan_code": ent.plan_code,
                "limit": limit,
                "kept": [str(a.id) for a in keep],
            },
        )
    kept_titles = ", ".join(f"“{a.title}”" for a in keep) or "nenhum"
    paused_titles = ", ".join(f"“{a.title}”" for a in pause)
    plural = "objetivo ativo" if limit == 1 else "objetivos ativos"
    notify_inapp(
        db,
        user_id=user.id,
        kind="plan_downgrade",
        title="Seu plano mudou",
        body=(
            f"Seu plano atual permite {limit} {plural}. Mantivemos {kept_titles} ativo e "
            f"pausamos {paused_titles}. Nada foi apagado: você pode reativar quando quiser "
            "ou ampliar o plano."
        ),
        url="/app/objetivos",
        data={"paused": [str(a.id) for a in pause], "kept": [str(a.id) for a in keep]},
    )
    db.flush()
    return pause
