"""Direitos de acesso (entitlements) calculados no servidor a partir do catálogo."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.timeutil import utcnow
from app.models.billing import Plan, PromoGrant, Subscription

DEFAULT_FREE_LIMITS = {
    "max_active_activities": 1,
    "materials_storage_mb": 50,
    "max_materials": 20,
    "ai_daily_actions": 0,
    "reports": "basic",
    "recovery_distribution": True,
    "csv_export": True,
    "reminders": "basic",
}
DEFAULT_PRO_LIMITS = {
    "max_active_activities": None,
    "materials_storage_mb": 2048,
    "max_materials": None,
    "ai_daily_actions": settings.AI_DAILY_ACTIONS_PRO,
    "reports": "full",
    "recovery_distribution": True,
    "csv_export": True,
    "reminders": "full",
}


@dataclass
class Entitlements:
    plan_code: str
    plan_name: str
    limits: dict
    source: str  # free | subscription | promo | admin
    subscription_status: str | None = None
    current_period_end: str | None = None
    cancel_at_period_end: bool = False

    def limit(self, key: str):
        return self.limits.get(key)


def ensure_default_plans(db: Session) -> None:
    """Cria o catálogo inicial (proposta editável) se ainda não existir."""
    if db.execute(select(Plan).where(Plan.code == "free")).scalar_one_or_none() is None:
        db.add(
            Plan(
                code="free",
                name="Gratuito",
                description="Um objetivo ativo, controle de tempo, saldo, planejamento manual e lembretes básicos.",
                features=[
                    "1 objetivo ativo",
                    "Cronômetro e registro manual",
                    "Plano semanal e pendências",
                    "Lembretes no navegador",
                ],
                limits=DEFAULT_FREE_LIMITS,
                recommended=False,
                active=True,
                sort_order=0,
            )
        )
    if db.execute(select(Plan).where(Plan.code == "pro")).scalar_one_or_none() is None:
        db.add(
            Plan(
                code="pro",
                name="Completo",
                description="Múltiplos objetivos, planejamento e relatórios completos, materiais com cotas maiores e recursos avançados.",
                features=[
                    "Objetivos ilimitados",
                    "Recuperação distribuída e replanejamento",
                    "Relatórios mensais e exportação",
                    "Materiais com intervalo de páginas",
                    "Tema claro e escuro",
                ],
                limits=DEFAULT_PRO_LIMITS,
                recommended=True,
                active=True,
                sort_order=1,
            )
        )
    db.flush()
    from app.models.billing import PlanPrice

    pro = db.execute(select(Plan).where(Plan.code == "pro")).scalar_one()
    for interval in ("month", "year"):
        exists = db.execute(
            select(PlanPrice).where(PlanPrice.plan_id == pro.id, PlanPrice.interval == interval)
        ).scalar_one_or_none()
        if exists is None:
            db.add(
                PlanPrice(
                    plan_id=pro.id,
                    interval=interval,
                    amount_cents=None,
                    currency="BRL",
                    active=True,
                )
            )
    db.flush()


def get_entitlements(db: Session, user_id: uuid.UUID) -> Entitlements:
    now = utcnow()
    free = db.execute(select(Plan).where(Plan.code == "free")).scalar_one_or_none()
    base = Entitlements(
        plan_code="free",
        plan_name=free.name if free else "Gratuito",
        limits=(free.limits if free else DEFAULT_FREE_LIMITS),
        source="free",
    )

    sub = (
        db.execute(
            select(Subscription)
            .where(
                Subscription.user_id == user_id,
                Subscription.status.in_(["active", "past_due", "cancelled"]),
            )
            .order_by(Subscription.created_at.desc())
        )
        .scalars()
        .first()
    )
    if sub is not None and sub.status in ("active", "past_due", "cancelled"):
        period_ok = sub.current_period_end is None or sub.current_period_end > now
        if sub.status == "active" or (sub.status in ("cancelled", "past_due") and period_ok):
            plan = db.get(Plan, sub.plan_id)
            if plan and plan.active:
                return Entitlements(
                    plan_code=plan.code,
                    plan_name=plan.name,
                    limits=plan.limits,
                    source="subscription",
                    subscription_status=sub.status,
                    current_period_end=sub.current_period_end.isoformat()
                    if sub.current_period_end
                    else None,
                    cancel_at_period_end=sub.cancel_at_period_end or sub.status == "cancelled",
                )

    grant = (
        db.execute(
            select(PromoGrant).where(
                PromoGrant.user_id == user_id,
                PromoGrant.revoked_at.is_(None),
                PromoGrant.starts_at <= now,
                PromoGrant.ends_at > now,
            )
        )
        .scalars()
        .first()
    )
    if grant is not None:
        plan = db.get(Plan, grant.plan_id)
        if plan:
            return Entitlements(
                plan_code=plan.code,
                plan_name=plan.name,
                limits=plan.limits,
                source="promo",
                current_period_end=grant.ends_at.isoformat(),
            )
    return base
