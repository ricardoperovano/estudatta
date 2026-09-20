"""Gestão de assinaturas pelo administrador, cupons e campanhas de e-mail.

Tudo aqui é auditável e honesto: acesso promocional é marcado como `promo` (nunca finge pagamento);
cupom de desconto reduz o valor da assinatura no checkout (todos os ciclos); cupom de dias grátis
vira uma concessão promocional; campanhas vão só para quem não pediu para parar de receber.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.logging import get_logger
from app.core.timeutil import utcnow
from app.models.activity import Activity
from app.models.billing import Campaign, Coupon, CouponRedemption, Plan, PromoGrant, Subscription
from app.models.session import StudySession
from app.models.user import NotificationPreferences, User
from app.services import outbox

log = get_logger("growth")

COUPON_CODE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,31}$")
SEGMENTS = {
    "all": "Todos os usuários",
    "free": "Plano gratuito (sem assinatura nem acesso promocional)",
    "paid": "Assinantes ativos",
    "promo": "Com acesso promocional ativo",
    "cancelled": "Renovação cancelada ou assinatura encerrada",
    "no_goal": "Sem nenhum objetivo criado",
    "inactive_7": "Sem sessão há 7 dias ou mais",
    "inactive_30": "Sem sessão há 30 dias ou mais",
    "new_7": "Cadastrados nos últimos 7 dias",
}
PAID_STATUSES = ("active", "past_due")


# --- Assinaturas ----------------------------------------------------------------------------


def subscription_metrics(db: Session, *, now: datetime | None = None) -> dict:
    now = now or utcnow()
    subs = list(db.execute(select(Subscription)).scalars())
    plans = {p.id: p for p in db.execute(select(Plan)).scalars()}
    active = [s for s in subs if s.status in PAID_STATUSES]
    mrr = 0
    for s in active:
        meta = s.metadata_ or {}
        cents = int(meta.get("amount_cents") or 0)
        mrr += cents if meta.get("interval") == "month" else round(cents / 12)
    d30 = now - timedelta(days=30)
    promos = db.execute(
        select(func.count())
        .select_from(PromoGrant)
        .where(
            PromoGrant.revoked_at.is_(None),
            PromoGrant.starts_at <= now,
            or_(PromoGrant.ends_at.is_(None), PromoGrant.ends_at > now),
        )
    ).scalar_one()
    users_total = db.execute(
        select(func.count())
        .select_from(User)
        .where(User.is_active.is_(True), User.deleted_at.is_(None))
    ).scalar_one()
    by_plan: dict[str, int] = {}
    for s in active:
        code = plans[s.plan_id].code if s.plan_id in plans else "?"
        by_plan[code] = by_plan.get(code, 0) + 1
    return {
        "users_total": int(users_total),
        "active": len(active),
        "past_due": sum(1 for s in subs if s.status == "past_due"),
        "pending": sum(1 for s in subs if s.status == "pending"),
        "cancelled_access": sum(
            1
            for s in subs
            if s.status == "cancelled" and s.current_period_end and s.current_period_end > now
        ),
        "new_30d": sum(
            1 for s in active if s.current_period_start and s.current_period_start >= d30
        ),
        "churned_30d": sum(
            1
            for s in subs
            if s.status in ("cancelled", "expired") and (s.cancelled_at or s.ended_at or now) >= d30
        ),
        "promo_active": int(promos),
        "mrr_cents": mrr,
        "by_plan": by_plan,
    }


def list_subscriptions(
    db: Session,
    *,
    status: str | None,
    plan_code: str | None,
    q: str | None,
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    stmt = (
        select(Subscription, User, Plan)
        .join(User, User.id == Subscription.user_id)
        .join(Plan, Plan.id == Subscription.plan_id)
    )
    if status:
        stmt = stmt.where(Subscription.status == status)
    if plan_code:
        stmt = stmt.where(Plan.code == plan_code)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.name).like(like)))
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    rows = db.execute(
        stmt.order_by(Subscription.created_at.desc()).limit(limit).offset(offset)
    ).all()
    out = []
    for sub, user, plan in rows:
        meta = sub.metadata_ or {}
        out.append(
            {
                "id": sub.id,
                "user_id": user.id,
                "user_email": user.email,
                "user_name": user.name,
                "plan_code": plan.code,
                "plan_name": plan.name,
                "status": sub.status,
                "provider": sub.provider,
                "interval": meta.get("interval"),
                "amount_cents": meta.get("amount_cents"),
                "coupon_code": meta.get("coupon_code"),
                "current_period_start": sub.current_period_start,
                "current_period_end": sub.current_period_end,
                "cancel_at_period_end": sub.cancel_at_period_end,
                "created_at": sub.created_at,
            }
        )
    return out, int(total)


# --- Cupons ---------------------------------------------------------------------------------


def _norm_code(code: str) -> str:
    c = (code or "").strip().upper()
    if not COUPON_CODE.match(c):
        raise ValidationFailed(
            "Código: 3 a 32 caracteres, letras, números, - ou _.", code="bad_coupon_code"
        )
    return c


def create_coupon(db: Session, actor: User, data: dict[str, Any]) -> Coupon:
    code = _norm_code(data["code"])
    if db.execute(select(Coupon).where(Coupon.code == code)).scalar_one_or_none():
        raise Conflict("Já existe um cupom com esse código.", code="coupon_exists")
    kind = data["kind"]
    value = int(data["value"])
    if kind == "percent" and not 1 <= value <= 100:
        raise ValidationFailed("Desconto entre 1% e 100%.", code="bad_coupon_value")
    if kind == "trial" and not 1 <= value <= 3650:
        raise ValidationFailed("Dias grátis entre 1 e 3650.", code="bad_coupon_value")
    plan_code = data.get("plan_code") or None
    if plan_code:
        plan = db.execute(select(Plan).where(Plan.code == plan_code)).scalar_one_or_none()
        if plan is None or plan.code == "free":
            raise NotFound("Plano não encontrado.", code="plan_not_found")
    elif kind == "trial":
        raise ValidationFailed("Cupom de dias grátis precisa de um plano.", code="bad_coupon_plan")
    c = Coupon(
        code=code,
        kind=kind,
        value=value,
        plan_code=plan_code,
        max_uses=data.get("max_uses"),
        expires_at=data.get("expires_at"),
        note=(data.get("note") or None),
        created_by=actor.id,
        created_at=utcnow(),
    )
    db.add(c)
    db.flush()
    return c


def get_coupon(db: Session, coupon_id: uuid.UUID) -> Coupon:
    c = db.get(Coupon, coupon_id)
    if c is None:
        raise NotFound("Cupom não encontrado.", code="coupon_not_found")
    return c


def coupon_out(c: Coupon, *, now: datetime | None = None) -> dict:
    now = now or utcnow()
    return {
        "id": c.id,
        "code": c.code,
        "kind": c.kind,
        "value": c.value,
        "plan_code": c.plan_code,
        "max_uses": c.max_uses,
        "uses": c.uses,
        "expires_at": c.expires_at,
        "active": c.active,
        "note": c.note,
        "created_at": c.created_at,
        "valid": _coupon_valid(c, now) is None,
    }


def _coupon_valid(c: Coupon, now: datetime) -> str | None:
    if not c.active:
        return "Este cupom foi desativado."
    if c.expires_at and c.expires_at <= now:
        return "Este cupom expirou."
    if c.max_uses is not None and c.uses >= c.max_uses:
        return "Este cupom já foi usado o máximo de vezes."
    return None


def check_coupon(
    db: Session, user: User, code: str, *, plan_code: str | None = None
) -> tuple[Coupon, dict]:
    """Valida para um usuário e devolve o cupom e a descrição para a tela (sem consumir)."""
    now = utcnow()
    c = db.execute(select(Coupon).where(Coupon.code == _norm_code(code))).scalar_one_or_none()
    if c is None:
        raise NotFound("Cupom não encontrado.", code="coupon_not_found")
    problem = _coupon_valid(c, now)
    if problem:
        raise ValidationFailed(problem, code="coupon_invalid")
    if plan_code and c.plan_code and c.plan_code != plan_code:
        raise ValidationFailed(
            "Este cupom vale só para o plano " + c.plan_code + ".", code="coupon_plan"
        )
    used = db.execute(
        select(CouponRedemption).where(
            CouponRedemption.coupon_id == c.id, CouponRedemption.user_id == user.id
        )
    ).scalar_one_or_none()
    if used is not None:
        raise ValidationFailed("Você já usou este cupom.", code="coupon_used")
    desc = (
        f"{c.value}% de desconto na assinatura"
        if c.kind == "percent"
        else f"{c.value} dias grátis do plano {c.plan_code}"
    )
    return c, {
        "code": c.code,
        "kind": c.kind,
        "value": c.value,
        "plan_code": c.plan_code,
        "description": desc,
    }


def redeem_trial(db: Session, user: User, coupon: Coupon) -> PromoGrant:
    """Cupom de dias grátis: cria a concessão promocional e registra o uso."""
    from app.services.admin import grant_promo

    grant = grant_promo(
        db,
        user,
        user,
        plan_code=coupon.plan_code or "",
        days=coupon.value,
        reason=f"Cupom {coupon.code}",
    )
    grant.granted_by = None
    db.add(
        CouponRedemption(
            coupon_id=coupon.id, user_id=user.id, promo_grant_id=grant.id, created_at=utcnow()
        )
    )
    coupon.uses += 1
    db.flush()
    return grant


def redeem_discount(db: Session, user: User, coupon: Coupon, sub: Subscription) -> None:
    db.add(
        CouponRedemption(
            coupon_id=coupon.id, user_id=user.id, subscription_id=sub.id, created_at=utcnow()
        )
    )
    coupon.uses += 1
    db.flush()


def discounted_cents(amount_cents: int, coupon: Coupon | None) -> int:
    if coupon is None or coupon.kind != "percent":
        return amount_cents
    return max(0, round(amount_cents * (100 - coupon.value) / 100))


# --- Segmentos e campanhas -----------------------------------------------------------------


def segment_users(db: Session, segment: str, *, now: datetime | None = None) -> list[User]:
    if segment not in SEGMENTS:
        raise ValidationFailed("Segmento inválido.", code="bad_segment")
    now = now or utcnow()
    users = list(
        db.execute(
            select(User)
            .where(User.is_active.is_(True), User.deleted_at.is_(None))
            .order_by(User.created_at)
        ).scalars()
    )
    if segment == "all":
        return users
    ids = [u.id for u in users]
    paid = {
        r[0]
        for r in db.execute(
            select(Subscription.user_id).where(
                Subscription.status.in_(PAID_STATUSES), Subscription.user_id.in_(ids)
            )
        )
    }
    promo = {
        r[0]
        for r in db.execute(
            select(PromoGrant.user_id).where(
                PromoGrant.revoked_at.is_(None),
                PromoGrant.starts_at <= now,
                or_(PromoGrant.ends_at.is_(None), PromoGrant.ends_at > now),
                PromoGrant.user_id.in_(ids),
            )
        )
    }
    if segment == "paid":
        return [u for u in users if u.id in paid]
    if segment == "promo":
        return [u for u in users if u.id in promo]
    if segment == "free":
        return [u for u in users if u.id not in paid and u.id not in promo]
    if segment == "cancelled":
        gone = {
            r[0]
            for r in db.execute(
                select(Subscription.user_id).where(
                    Subscription.status.in_(("cancelled", "expired")), Subscription.user_id.in_(ids)
                )
            )
        }
        return [u for u in users if u.id in gone and u.id not in paid]
    if segment == "no_goal":
        with_goal = {
            r[0]
            for r in db.execute(
                select(Activity.user_id).where(Activity.user_id.in_(ids)).distinct()
            )
        }
        return [u for u in users if u.id not in with_goal]
    if segment == "new_7":
        return [u for u in users if u.created_at and u.created_at >= now - timedelta(days=7)]
    days = 7 if segment == "inactive_7" else 30
    last = dict(
        db.execute(
            select(StudySession.user_id, func.max(StudySession.local_date))
            .where(StudySession.status == "finished", StudySession.user_id.in_(ids))
            .group_by(StudySession.user_id)
        ).all()
    )
    cutoff = (now - timedelta(days=days)).date()
    return [
        u
        for u in users
        if (last.get(u.id) is None and u.created_at and u.created_at.date() <= cutoff)
        or (last.get(u.id) is not None and last[u.id] <= cutoff)
    ]


def create_campaign(db: Session, actor: User, data: dict[str, Any]) -> Campaign:
    if data["segment"] not in SEGMENTS:
        raise ValidationFailed("Segmento inválido.", code="bad_segment")
    coupon_code = data.get("coupon_code") or None
    if coupon_code:
        coupon_code = _norm_code(coupon_code)
        if (
            db.execute(select(Coupon).where(Coupon.code == coupon_code)).scalar_one_or_none()
            is None
        ):
            raise NotFound("Cupom não encontrado.", code="coupon_not_found")
    c = Campaign(
        name=data["name"].strip(),
        subject=data["subject"].strip(),
        body=data["body"].strip(),
        cta_label=(data.get("cta_label") or None),
        cta_url=(data.get("cta_url") or None),
        segment=data["segment"],
        coupon_code=coupon_code,
        created_by=actor.id,
        created_at=utcnow(),
    )
    db.add(c)
    db.flush()
    return c


def update_campaign(db: Session, c: Campaign, data: dict[str, Any]) -> Campaign:
    if c.status != "draft":
        raise Conflict("Campanha já enviada não pode ser editada.", code="campaign_sent")
    for k in ("name", "subject", "body", "cta_label", "cta_url", "segment"):
        if k in data and data[k] is not None:
            setattr(c, k, data[k].strip() if isinstance(data[k], str) else data[k])
    if "coupon_code" in data:
        c.coupon_code = _norm_code(data["coupon_code"]) if data["coupon_code"] else None
    if c.segment not in SEGMENTS:
        raise ValidationFailed("Segmento inválido.", code="bad_segment")
    db.flush()
    return c


def get_campaign(db: Session, campaign_id: uuid.UUID) -> Campaign:
    c = db.get(Campaign, campaign_id)
    if c is None:
        raise NotFound("Campanha não encontrada.", code="campaign_not_found")
    return c


def campaign_out(c: Campaign) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "subject": c.subject,
        "body": c.body,
        "cta_label": c.cta_label,
        "cta_url": c.cta_url,
        "segment": c.segment,
        "segment_label": SEGMENTS.get(c.segment, c.segment),
        "coupon_code": c.coupon_code,
        "status": c.status,
        "recipients": c.recipients,
        "sent_at": c.sent_at,
        "created_at": c.created_at,
    }


def render_campaign(c: Campaign, user: User) -> tuple[str, str, str | None]:
    """(assunto, corpo, url do botão) com {nome} e {cupom} substituídos."""
    first = (user.name or "").strip().split(" ")[0] or "você"
    rep = {"{nome}": first, "{cupom}": c.coupon_code or ""}
    subject, body = c.subject, c.body
    for k, v in rep.items():
        subject, body = subject.replace(k, v), body.replace(k, v)
    url = c.cta_url or f"{settings.APP_URL.rstrip('/')}/app"
    if c.coupon_code and not c.cta_url:
        url = f"{settings.APP_URL.rstrip('/')}/app/planos?cupom={c.coupon_code}"
    return subject, body, url


def _wants_marketing(db: Session, user: User) -> bool:
    prefs = db.get(NotificationPreferences, user.id)
    return prefs is None or prefs.reengagement_email


def send_campaign(
    db: Session, c: Campaign, *, test_to: User | None = None, now: datetime | None = None
) -> int:
    """Enfileira o e-mail para o segmento (ou só para `test_to`, sem marcar como enviada).
    Quem desligou os e-mails de retorno não recebe. Uma vez por campanha e usuário (dedupe)."""
    now = now or utcnow()
    if test_to is None and c.status != "draft":
        raise Conflict("Campanha já enviada.", code="campaign_sent")
    targets = (
        [test_to]
        if test_to
        else [u for u in segment_users(db, c.segment, now=now) if _wants_marketing(db, u)]
    )
    n = 0
    for u in targets:
        subject, body, url = render_campaign(c, u)
        row = outbox.enqueue(
            db,
            user_id=u.id,
            kind="campaign",
            dedupe_key=f"campaign:{c.id}:{u.id}:{'test' if test_to else 'send'}",
            scheduled_for=now,
            payload={
                "title": subject,
                "body": body,
                "url": url,
                "cta_label": c.cta_label or "Abrir o Estudatta",
                "campaign_id": str(c.id),
            },
            channels=["email"],
            proactive=False,
            ttl=timedelta(days=2),
        )
        n += 1 if row else 0
    if test_to is None:
        c.status = "sent"
        c.recipients = n
        c.sent_at = now
    db.flush()
    return n
