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
from zoneinfo import ZoneInfo

from dateutil.relativedelta import relativedelta
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.audit import audit
from app.core.config import settings
from app.core.errors import Conflict, NotFound, ServiceUnavailable, ValidationFailed
from app.core.i18n import _, current_locale, set_locale
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


def subscription_description(plan_name: str, interval: str | None) -> str:
    """Texto que aparece no checkout e nas faturas: "Estudatta — plano Essencial (mensal)"."""
    label = INTERVAL_LABEL.get(interval or "", "")
    return f"{settings.APP_NAME} — plano {plan_name}" + (f" ({label})" if label else "")


def describe_asaas_subscription(provider: Any, sub: Subscription) -> bool:
    """Descreve no Asaas a assinatura criada pelo checkout (as faturas herdam a descrição).

    Melhor esforço: a descrição é cosmética, então falhar aqui só registra no log e nunca
    impede o processamento da cobrança.
    """
    describe = getattr(provider, "describe_subscription", None)
    if not describe or not sub.provider_ref or sub.plan is None:
        return False
    try:
        describe(
            sub.provider_ref,
            description=subscription_description(
                sub.plan.name, (sub.metadata_ or {}).get("interval")
            ),
            external_reference=sub.external_reference,
        )
        return True
    except ProviderError as exc:
        log.warning("billing.asaas_describe_failed", subscription_id=str(sub.id), error=exc.message)
        return False


# estado no provedor → estado local
STATUS_MAP = {
    "authorized": "active",
    "paused": "paused",
    "cancelled": "cancelled",
    "pending": "pending",
}
OPEN_STATUSES = ("pending", "trialing", "active", "past_due", "paused", "cancelled")
# estados em que a pessoa tem (ou teve) o plano de verdade: quem passou por um deles já usou o
# teste grátis com cartão
HAD_PLAN_STATUSES = ("trialing", "active", "past_due", "paused")
PENDING_CHECK_AFTER = timedelta(hours=1)
PENDING_EXPIRES_AFTER = timedelta(days=7)
PAST_DUE_GRACE = timedelta(days=3)
CHECKOUT_REUSE_WINDOW = timedelta(hours=1)
DOWNGRADE_LOOKBACK = timedelta(days=2)
# Teste grátis com cartão (`trialing`): cartão validado no checkout, primeira cobrança no fim do
# teste. O Asaas tenta cobrar no dia do vencimento e no seguinte; passado isso sem pagamento, o
# teste termina e a conta volta ao gratuito.
TRIAL_CHARGE_GRACE = timedelta(days=1, hours=6)
TRIAL_GIVE_UP_AFTER = timedelta(days=4)  # não deu para cancelar no provedor: encerra assim mesmo
TRIAL_REMIND_BEFORE = timedelta(days=2)
BR = ZoneInfo("America/Sao_Paulo")  # as datas de cobrança do Asaas são do horário de Brasília


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


# --- Teste grátis com cartão ------------------------------------------------------------


def card_trial_available() -> bool:
    return (
        settings.billing_enabled
        and settings.CARD_TRIAL_DAYS > 0
        and settings.BILLING_PROVIDER == "asaas"
    )


def in_card_trial(sub: Subscription) -> bool:
    """Assinatura nascida do teste com cartão e ainda sem nenhuma cobrança confirmada."""
    meta = sub.metadata_ or {}
    return bool(meta.get("trial")) and not meta.get("trial_converted_at")


def card_trial_offer(db: Session, user_id: uuid.UUID | None = None) -> dict[str, Any] | None:
    """A oferta do teste com cartão (dias, plano e o valor cobrado depois), ou None quando ela
    não vale: cobrança desligada, plano sem preço mensal ou conta que já teve o plano.

    Um teste por conta: quem já concluiu um checkout (assinou, testou, cancelou) não testa de
    novo. Checkout abandonado não conta.
    """
    if not card_trial_available():
        return None
    plan = db.execute(
        select(Plan).where(Plan.code == settings.CARD_TRIAL_PLAN_CODE, Plan.active.is_(True))
    ).scalar_one_or_none()
    if plan is None or plan.code == "free":
        return None
    price = db.execute(
        select(PlanPrice).where(
            PlanPrice.plan_id == plan.id,
            PlanPrice.interval == "month",
            PlanPrice.active.is_(True),
        )
    ).scalar_one_or_none()
    if price is None or not price.amount_cents or price.amount_cents <= 0:
        return None
    if user_id is not None:
        used = db.execute(
            select(Subscription.id)
            .where(
                Subscription.user_id == user_id,
                or_(
                    Subscription.provider_ref.is_not(None),
                    Subscription.status.in_(HAD_PLAN_STATUSES),
                ),
            )
            .limit(1)
        ).first()
        if used is not None:
            return None
    return {
        "days": settings.CARD_TRIAL_DAYS,
        "plan_code": plan.code,
        "plan_name": _(plan.name),
        "amount_cents": price.amount_cents,
        "currency": price.currency,
    }


def _charge_day(when: datetime | None):
    """Dia (de Brasília) em que o Asaas cobra: o fim do período guardado é o fim desse dia."""
    return when.astimezone(BR).date() if when is not None else None


def _fmt_money(cents: Any, currency: str | None = "BRL") -> str:
    try:
        value = f"{int(cents) / 100:.2f}"
    except (TypeError, ValueError):
        return ""
    if current_locale() != "en":
        value = value.replace(".", ",")
    return f"R$ {value}" if (currency or "BRL") == "BRL" else f"{value} {currency}"


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
    """Assinatura "atual" por prioridade: ativa/em teste/atrasada → cancelada com acesso →
    pendente → pausada."""
    now = now or utcnow()
    subs = list_subscriptions(db, user_id)
    for status in ("active", "trialing", "past_due"):
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
        # teste com cartão ainda sem cobrança confirmada (em teste, ou cancelado/encerrado nele)
        "trial": in_card_trial(sub),
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
    db: Session,
    user: User,
    *,
    plan_code: str,
    interval: str,
    provider: BillingProvider,
    coupon_code: str | None = None,
    trial: bool = False,
    return_to: str = "plans",
) -> Subscription:
    """Cria a assinatura local `pending` e a preapproval no provedor. NÃO concede acesso:
    só o webhook/reconciliação confirmando `authorized` ativa o plano.

    `trial=True` é o teste grátis com cartão: o checkout valida o cartão e marca a primeira
    cobrança para daqui a `CARD_TRIAL_DAYS` dias. O plano é liberado quando o provedor confirma
    que a assinatura existe (`trialing`), e a cobrança só acontece se a pessoa não cancelar."""
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
    if existing is not None and existing.status in ("active", "trialing", "past_due"):
        raise Conflict("Você já tem uma assinatura ativa.", code="already_subscribed")
    first_charge = None
    if trial:
        if not card_trial_available() or not getattr(provider, "supports_card_trial", False):
            raise Conflict("O teste grátis não está disponível agora.", code="trial_unavailable")
        if plan.code != settings.CARD_TRIAL_PLAN_CODE or interval != "month":
            raise ValidationFailed(
                "O teste grátis vale só para a assinatura mensal do plano indicado.",
                code="trial_plan",
            )
        if coupon_code:
            raise ValidationFailed(
                "O teste grátis não pode ser combinado com cupom.", code="trial_coupon"
            )
        if card_trial_offer(db, user.id) is None:
            raise Conflict(
                "Você já usou o teste grátis. Para continuar com o plano, é só assinar.",
                code="trial_used",
            )
        first_charge = now.astimezone(BR).date() + timedelta(days=settings.CARD_TRIAL_DAYS)
    coupon = None
    amount_cents = price.amount_cents
    if coupon_code:
        from app.services import growth

        coupon, _unused = growth.check_coupon(db, user, coupon_code, plan_code=plan.code)
        if coupon.kind != "percent":
            raise ValidationFailed(
                "Este cupom dá dias grátis: use-o em Planos, sem pagamento.", code="coupon_kind"
            )
        amount_cents = growth.discounted_cents(price.amount_cents, coupon)
        if amount_cents < 100:
            raise ValidationFailed(
                "O desconto deixa o valor abaixo do mínimo cobrável.", code="coupon_too_big"
            )
    if (
        existing is not None
        and existing.status == "pending"
        and existing.price_id == price.id
        and bool((existing.metadata_ or {}).get("trial")) == trial
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
            "amount_cents": amount_cents,
            "list_amount_cents": price.amount_cents,
            "coupon_code": coupon.code if coupon else None,
            "currency": price.currency,
            "billing_mode": settings.BILLING_MODE,
            **(
                {
                    "trial": True,
                    "trial_days": settings.CARD_TRIAL_DAYS,
                    "trial_charge_date": first_charge.isoformat(),
                }
                if first_charge
                else {}
            ),
        },
        created_at=now,
        updated_at=now,
    )
    db.add(sub)
    db.flush()
    frequency, frequency_type = INTERVALS[interval]
    back_path = (
        "/onboarding?retorno=checkout"
        if return_to == "signup"
        else ("/app/planos?retorno=checkout")
    )
    if first_charge:
        back_path += "&teste=1"
    try:
        remote = provider.create_preapproval(
            reason=subscription_description(plan.name, interval),
            external_reference=ref,
            payer_email=user.email,
            amount=amount_cents / 100,
            currency=price.currency,
            frequency=frequency,
            frequency_type=frequency_type,
            back_url=f"{settings.APP_URL.rstrip('/')}{back_path}",
            **({"first_charge_date": first_charge} if first_charge else {}),
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
    sub.provider_ref = remote.id or None  # Asaas: a assinatura só existe depois do pagamento
    sub.checkout_url = remote.init_point
    if remote.raw.get("checkout_id"):
        sub.metadata_ = {**(sub.metadata_ or {}), "checkout_id": remote.raw["checkout_id"]}
    sub.provider_payer_ref = remote.payer_id
    sub.last_synced_at = now
    db.flush()
    if coupon is not None:
        from app.services import growth

        growth.redeem_discount(db, user, coupon, sub)
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
    for _i in range(1000):
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
        if meta.get("trial") and not meta.get("trial_converted_at"):
            meta["trial_converted_at"] = now.isoformat()  # primeira cobrança confirmada
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
    elif new_status == "pending" and in_card_trial(sub) and remote.id:
        # Teste com cartão: a assinatura existe no provedor (cartão validado no checkout) e a
        # primeira cobrança ainda não foi paga. Só entra em teste quem vem do checkout; um teste
        # já cancelado ou encerrado aqui não volta por causa de uma consulta atrasada.
        if previous in ("pending", "trialing"):
            sub.status = "trialing"
            sub.current_period_start = sub.current_period_start or now
            if period_end is not None:
                sub.current_period_end = period_end
            elif sub.current_period_end is None:
                sub.current_period_end = now + timedelta(
                    days=int(meta.get("trial_days") or settings.CARD_TRIAL_DAYS)
                )
            sub.ended_at = None
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


def expire_if_ended(
    db: Session,
    sub: Subscription,
    *,
    now: datetime | None = None,
    provider: BillingProvider | None = None,
) -> bool:
    now = now or utcnow()
    if (
        sub.status == "trialing"
        and sub.current_period_end is not None
        and sub.current_period_end + TRIAL_CHARGE_GRACE <= now
    ):
        # O teste acabou e a primeira cobrança não foi paga (cartão recusado nas tentativas do
        # provedor). Remove a assinatura lá para não haver cobrança depois de a conta já ter
        # voltado ao gratuito; se o provedor não responder, tenta de novo na próxima rodada.
        if provider is not None and sub.provider_ref and sub.provider == provider.name:
            try:
                provider.cancel_preapproval(sub.provider_ref)
            except ProviderError as exc:
                log.warning(
                    "billing.trial_cancel_failed", subscription_id=str(sub.id), error=exc.message
                )
                if sub.current_period_end + TRIAL_GIVE_UP_AFTER > now:
                    return False
        _expire(db, sub, now, reason="trial_unpaid")
        return True
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


def _fmt_date(d) -> str:
    """Data curta no idioma da conta (dd/mm/aaaa ou mm/dd/yyyy)."""
    return f"{d:%m/%d/%Y}" if current_locale() == "en" else f"{d:%d/%m/%Y}"


def _trial_terms(sub: Subscription, plan_name: str, *, started: bool) -> tuple[str, list[str]]:
    """Título e parágrafos que dizem, sem rodeios, quando e quanto será cobrado ao fim do teste.
    `started=True` é o aviso do começo; `False`, o lembrete antes da cobrança."""
    meta = sub.metadata_ or {}
    day = _charge_day(sub.current_period_end)
    data = _fmt_date(day) if day else ""
    valor = _fmt_money(meta.get("amount_cents"), meta.get("currency"))
    cobranca = _(
        "Em {data}, se você não cancelar, cobraremos {valor} no cartão informado. Depois disso o mesmo valor é cobrado todo mês, no cartão, até você cancelar.",
        data=data,
        valor=valor,
    )
    cancelar = _(
        "Para cancelar, abra Planos no app e toque em Cancelar teste. Cancelando antes de {data}, nada é cobrado e o plano continua liberado até essa data.",
        data=data,
    )
    if started:
        return _("Seu teste do {plano} começou", plano=plan_name), [
            _(
                "O plano {plano} está liberado até {data}, sem pagar nada.",
                plano=plan_name,
                data=data,
            ),
            cobranca,
            cancelar,
        ]
    return _("Seu teste do {plano} termina em {data}", plano=plan_name, data=data), [
        cobranca,
        cancelar,
    ]


def _billing_email(user: User, title: str, paragraphs: list[str]) -> None:
    """Aviso de cobrança por e-mail. Melhor esforço: falhar no envio não desfaz a transição."""
    from app.integrations.email import send_billing_notice_email

    try:
        send_billing_notice_email(
            user.email,
            title=title,
            paragraphs=paragraphs,
            url=f"{settings.APP_URL.rstrip('/')}/app/planos",
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("billing.email_failed", user_id=str(user.id), error=type(exc).__name__)


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
    if user is not None:
        set_locale(user.locale)
    if user is None:
        return
    plan = db.get(Plan, sub.plan_id)
    plan_name = _(plan.name) if plan else _("Completo")
    trial = in_card_trial(sub)  # teste com cartão que nunca chegou a ser cobrado
    if sub.status == "trialing" and previous != "trialing":
        title, paragraphs = _trial_terms(sub, plan_name, started=True)
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_trial_started",
            title=title,
            body=" ".join(paragraphs),
            url="/app/planos",
        )
        _billing_email(user, title, paragraphs)
    elif sub.status == "active" and previous == "trialing":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_active",
            title=_("Assinatura do plano {plan} confirmada", plan=plan_name),
            body=_(
                "O teste terminou e a primeira mensalidade foi cobrada no seu cartão. A cobrança se repete todo mês, até você cancelar em Planos."
            ),
            url="/app/planos",
        )
    elif sub.status == "active" and previous != "active":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_active",
            title=_("Plano {plan} ativado", plan=plan_name),
            body=_("Sua assinatura foi confirmada. Todos os recursos do plano já estão liberados."),
            url="/app/planos",
        )
    elif sub.status == "cancelled" and trial and previous not in ("cancelled", "expired"):
        until = sub.current_period_end
        extra = (
            _(
                " Você continua com o plano {plan} até {until}.",
                plan=plan_name,
                until=_fmt_date(_charge_day(until)),
            )
            if until and until > now
            else ""
        )
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_cancelled",
            title=_("Teste cancelado"),
            body=_(
                "Nada será cobrado no seu cartão.{extra} Depois disso a conta volta ao plano gratuito, sem perder nada.",
                extra=extra,
            ),
            url="/app/planos",
        )
    elif sub.status == "cancelled" and previous not in ("cancelled", "expired"):
        until = sub.current_period_end
        extra = (
            _(
                " Você mantém o acesso ao plano {plan} até {until}.",
                plan=plan_name,
                until=_fmt_date(until),
            )
            if until and until > now
            else ""
        )
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_cancelled",
            title=_("Renovação cancelada"),
            body=_("A renovação automática foi cancelada.{extra} Nada será apagado.", extra=extra),
            url="/app/planos",
        )
    elif sub.status == "paused" and previous != "paused":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_paused",
            title=_("Assinatura pausada"),
            body=_(
                "A cobrança está pausada no provedor de pagamento. O plano gratuito continua disponível e seus dados estão guardados."
            ),
            url="/app/planos",
        )
    elif sub.status == "past_due" and previous != "past_due":
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_past_due",
            title=_("Pagamento pendente"),
            body=_(
                "Não recebemos a confirmação da última cobrança. Verifique a forma de pagamento para manter o plano."
            ),
            url="/app/planos",
        )
    elif sub.status == "expired" and trial and previous not in ("pending", "expired"):
        unpaid = (sub.metadata_ or {}).get("expired_reason") == "trial_unpaid"
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_expired",
            title=_("Seu teste do {plano} terminou", plano=plan_name),
            body=_(
                "Não conseguimos cobrar o cartão informado, então nada foi cobrado e a conta voltou ao plano gratuito. Tudo o que você registrou continua aqui. Para continuar com o plano, é só assinar em Planos."
            )
            if unpaid
            else _(
                "Nada foi cobrado e a conta voltou ao plano gratuito. Tudo o que você registrou continua aqui. Para ter o plano de volta, é só assinar em Planos."
            ),
            url="/app/planos",
        )
    elif sub.status == "expired" and previous not in ("pending", "expired"):
        notify_inapp(
            db,
            user_id=user.id,
            kind="billing_expired",
            title=_("Assinatura encerrada"),
            body=_(
                "Seu período de acesso terminou. Seus objetivos e registros continuam guardados no plano gratuito."
            ),
            url="/app/planos",
        )
    apply_entitlement_changes(db, user, now=now)


# --- Sincronização e cancelamento ---------------------------------------------------------


def sync_subscription(
    db: Session, sub: Subscription, provider: BillingProvider, *, now: datetime | None = None
) -> Subscription:
    """Consulta o provedor e aplica o estado real. Erros do provedor sobem como ProviderError."""
    now = now or utcnow()
    if sub.provider != provider.name:
        return sub  # assinatura de outro provedor (troca de provedor): não consulta o errado
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
    expire_if_ended(db, sub, now=now, provider=provider)
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
            _(
                "Cancelamento registrado. Vamos confirmar com o provedor de pagamento em breve; você não será cobrado."
            )
            if in_card_trial(sub)
            else _(
                "Cancelamento registrado. Vamos confirmar com o provedor de pagamento em breve; você não será cobrado novamente."
            ),
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
    if in_card_trial(sub):
        if until and until > now:
            return sub, _(
                "Teste cancelado: nada será cobrado no seu cartão. O plano continua liberado até {until}.",
                until=_fmt_date(_charge_day(until)),
            )
        return sub, _("Teste cancelado: nada será cobrado no seu cartão.")
    if until and until > now:
        return sub, _(
            "Renovação cancelada. Você mantém o acesso até {until}.", until=_fmt_date(until)
        )
    return sub, _("Assinatura cancelada.")


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


# --- Webhook do Asaas ---------------------------------------------------------------------


def _asaas_locate(db: Session, *, sub_id: str | None, ref: str | None, checkout_id: str | None):
    from app.integrations.asaas import ASAAS_PROVIDER_NAME

    base = select(Subscription).where(Subscription.provider == ASAAS_PROVIDER_NAME)
    if sub_id:
        found = (
            db.execute(
                base.where(Subscription.provider_ref == sub_id).order_by(
                    Subscription.created_at.desc()
                )
            )
            .scalars()
            .first()
        )
        if found is not None:
            return found
    if ref:
        found = (
            db.execute(
                base.where(Subscription.external_reference == ref).order_by(
                    Subscription.created_at.desc()
                )
            )
            .scalars()
            .first()
        )
        if found is not None:
            return found
    if checkout_id:
        for cand in db.execute(base.where(Subscription.status == "pending")).scalars():
            if (cand.metadata_ or {}).get("checkout_id") == checkout_id:
                return cand
    return None


def handle_asaas_webhook(
    db: Session,
    *,
    provider: BillingProvider,
    token: str | None,
    body: Any,
    expected_token: str | None,
    now: datetime | None = None,
) -> WebhookOutcome:
    """Webhook do Asaas: valida o token (`asaas-access-token`), grava o evento (idempotente por
    id) e sincroniza a assinatura CONSULTANDO o Asaas — o conteúdo do evento só serve para achar
    qual assinatura conferir. Não faz commit."""
    from app.integrations.asaas import ASAAS_PROVIDER_NAME, verify_webhook_token

    now = now or utcnow()
    body = body if isinstance(body, dict) else {}
    name = _first(body.get("event")) or "unknown"
    payment = body.get("payment") if isinstance(body.get("payment"), dict) else {}
    subscription = body.get("subscription") if isinstance(body.get("subscription"), dict) else {}
    sub_id = _first(payment.get("subscription"), subscription.get("id"))
    ref = _first(payment.get("externalReference"), subscription.get("externalReference"))
    checkout_id = _first(payment.get("checkoutSession"))
    resource = _first(payment.get("id"), subscription.get("id"))
    event_id = (_first(body.get("id")) or f"{name}:{resource}")[:160]
    # guarda só o necessário (sem dados de cartão nem do pagador)
    slim = {
        "id": body.get("id"),
        "event": name,
        "dateCreated": body.get("dateCreated"),
        "payment": {
            k: payment.get(k)
            for k in (
                "id",
                "subscription",
                "checkoutSession",
                "status",
                "value",
                "dueDate",
                "externalReference",
            )
            if k in payment
        },
        "subscription": {
            k: subscription.get(k)
            for k in ("id", "status", "externalReference")
            if k in subscription
        },
    }
    valid = verify_webhook_token(token, expected_token)
    existing = db.execute(
        select(BillingEvent).where(
            BillingEvent.provider == ASAAS_PROVIDER_NAME, BillingEvent.event_id == event_id
        )
    ).scalar_one_or_none()
    if not valid:
        if existing is None:
            existing = BillingEvent(
                provider=ASAAS_PROVIDER_NAME,
                event_id=event_id,
                event_type=name[:80],
                resource_id=resource[:120] if resource else None,
                payload=slim,
                signature_valid=False,
                status="ignored",
                error="invalid_token",
                received_at=now,
                processed_at=now,
            )
            db.add(existing)
            db.flush()
        log.warning("billing.asaas_webhook_invalid_token", event_id=event_id, has_token=bool(token))
        return WebhookOutcome(existing, "invalid_signature")
    if existing is not None and existing.signature_valid and existing.status != "failed":
        return WebhookOutcome(existing, "duplicate")

    event = existing or BillingEvent(
        provider=ASAAS_PROVIDER_NAME,
        event_id=event_id,
        event_type=name[:80],
        resource_id=resource[:120] if resource else None,
        payload=slim,
        received_at=now,
    )
    event.signature_valid = True
    event.status = "received"
    event.error = None
    db.add(event)
    db.flush()
    try:
        sub = _asaas_locate(db, sub_id=sub_id, ref=ref, checkout_id=checkout_id)
        if sub is None or not (sub_id or sub.provider_ref or sub.external_reference):
            event.status = "ignored"
            event.error = "subscription_not_found"
            event.processed_at = now
            db.flush()
            return WebhookOutcome(event, "ignored")
        if sub_id and not sub.provider_ref:
            sub.provider_ref = sub_id
            describe_asaas_subscription(provider, sub)
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
        log.warning("billing.asaas_webhook_provider_failed", event_id=event_id, error=exc.message)
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

            # em teste: só encerra depois de conferir no provedor se a cobrança foi paga
            if sub.status != "trialing" and expire_if_ended(db, sub, now=now):
                summary["expired"] += 1
                continue

            meta = sub.metadata_ or {}
            cancel_pending = bool(meta.get("cancel_pending"))
            if (
                cancel_pending
                and provider is not None
                and sub.provider_ref
                and sub.provider == provider.name
            ):
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
            if sub.status == "expired":
                summary["expired"] += 1  # encerrada durante a conferência com o provedor
            elif expire_if_ended(db, sub, now=now, provider=provider):
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
    summary["trial_notices"] = notify_trials(db, now=now)
    summary["card_trial_reminders"] = remind_card_trials(db, now=now)
    db.flush()
    return summary


def remind_card_trials(db: Session, *, now: datetime | None = None) -> int:
    """Lembra uma vez, dois dias antes, que o teste com cartão vai virar cobrança (no app e por
    e-mail). Quem já cancelou não é lembrado. A marca fica na própria assinatura."""
    now = now or utcnow()
    sent = 0
    subs = db.execute(
        select(Subscription).where(
            Subscription.status == "trialing",
            Subscription.current_period_end.is_not(None),
            Subscription.current_period_end > now,
            Subscription.current_period_end <= now + TRIAL_REMIND_BEFORE,
        )
    ).scalars()
    for sub in subs:
        meta = dict(sub.metadata_ or {})
        if meta.get("trial_reminded_at") or meta.get("cancel_pending") or sub.cancel_at_period_end:
            continue
        user = db.get(User, sub.user_id)
        if user is None:
            continue
        plan = db.get(Plan, sub.plan_id)
        with_locale = current_locale()
        set_locale(user.locale)
        try:
            title, paragraphs = _trial_terms(sub, _(plan.name) if plan else "", started=False)
            notify_inapp(
                db,
                user_id=user.id,
                kind="billing_trial_ending",
                title=title,
                body=" ".join(paragraphs),
                url="/app/planos",
            )
            _billing_email(user, title, paragraphs)
        finally:
            set_locale(with_locale)
        meta["trial_reminded_at"] = now.isoformat()
        sub.metadata_ = meta
        sent += 1
    db.flush()
    return sent


TRIAL_WARN_BEFORE = timedelta(days=3)


def notify_trials(db: Session, *, now: datetime | None = None) -> int:
    """Avisa uma vez que o teste grátis está acabando (3 dias antes) e uma vez que acabou.

    Quem já assinou não recebe aviso. A existência da notificação é a marca de "já avisado",
    então reexecutar não duplica.
    """
    from app.models.notification import Notification

    now = now or utcnow()
    sent = 0
    grants = db.execute(
        select(PromoGrant).where(
            PromoGrant.reason == "trial",
            PromoGrant.revoked_at.is_(None),
            PromoGrant.ends_at.is_not(None),
            PromoGrant.ends_at > now - DOWNGRADE_LOOKBACK,
            PromoGrant.ends_at <= now + TRIAL_WARN_BEFORE,
        )
    ).scalars()
    for grant in grants:
        user = db.get(User, grant.user_id)
        if user is None or get_entitlements(db, user.id).source == "subscription":
            continue
        kind = "trial_ended" if grant.ends_at <= now else "trial_ending"
        already = db.execute(
            select(Notification.id).where(
                Notification.user_id == user.id, Notification.kind == kind
            )
        ).first()
        if already:
            continue
        plan = db.get(Plan, grant.plan_id)
        nome = _(plan.name) if plan else ""
        with_locale = current_locale()
        set_locale(user.locale)
        try:
            if kind == "trial_ending":
                dias = max(
                    1, (grant.ends_at - now).days + (1 if (grant.ends_at - now).seconds else 0)
                )
                title = _("Seu teste do {plano} termina em {n} dia(s)", plano=nome, n=dias)
                body = _(
                    "Depois disso a conta volta ao plano gratuito, sem perder nada do que você registrou. Para continuar com tudo, assine quando quiser."
                )
            else:
                title = _("Seu teste do {plano} terminou", plano=nome)
                body = _(
                    "Sua conta voltou ao plano gratuito e tudo o que você registrou continua aqui. Para ter de volta os recursos do teste, é só assinar."
                )
            notify_inapp(db, user_id=user.id, kind=kind, title=title, body=body, url="/app/planos")
            db.flush()  # a notificação é a marca de "já avisado": precisa estar visível à próxima consulta
        finally:
            set_locale(with_locale)
        sent += 1
    return sent


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
    set_locale(user.locale)
    kept_titles = ", ".join(f"“{a.title}”" for a in keep) or _("nenhum")
    paused_titles = ", ".join(f"“{a.title}”" for a in pause)
    plural = _("objetivo ativo") if limit == 1 else _("objetivos ativos")
    notify_inapp(
        db,
        user_id=user.id,
        kind="plan_downgrade",
        title=_("Seu plano mudou"),
        body=_(
            "Seu plano atual permite {limit} {plural}. Mantivemos {kept} ativo e pausamos {paused}. Nada foi apagado: você pode reativar quando quiser ou ampliar o plano.",
            limit=limit,
            plural=plural,
            kept=kept_titles,
            paused=paused_titles,
        ),
        url="/app/objetivos",
        data={"paused": [str(a.id) for a in pause], "kept": [str(a.id) for a in keep]},
    )
    db.flush()
    return pause
