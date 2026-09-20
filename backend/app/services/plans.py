"""Direitos de acesso (entitlements) calculados no servidor a partir do catálogo."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.timeutil import utcnow
from app.models.billing import Plan, PromoGrant, Subscription

# ---------------------------------------------------------------------------------
# Catálogo sugerido (proposta comercial de 18/09/2026; editável no painel admin).
# Racional em docs/planos-e-precos.md. Preços em centavos de BRL.
#
# Limites aplicados no servidor:
#   max_active_activities  objetivos ativos (None = ilimitado)
#   max_materials          materiais cadastrados (None = ilimitado)
#   materials_storage_mb   espaço para PDFs (None = ilimitado)
#   ai_daily_actions       ações de IA por dia (0 = sem IA)
#   ai_monthly_actions     ações de IA por mês civil (None = só o limite diário)
#   reports                "basic" = semana · "full" = semana, mês e trimestre
#   reminders              "basic" = lembrete no horário planejado · "full" = todos + resumo por e-mail
#   auto_planning          distribuição automática de tarefas na semana
#   recovery_distribution  distribuição da pendência (núcleo do produto: sempre True)
#   csv_export             exportação (nunca depende de assinatura: sempre True)
# ---------------------------------------------------------------------------------

DEFAULT_FREE_LIMITS = {
    "max_active_activities": 1,
    "max_materials": 20,
    "materials_storage_mb": 100,
    "ai_daily_actions": 0,
    "ai_monthly_actions": 0,
    "reports": "basic",
    "reminders": "basic",
    "auto_planning": False,
    "recovery_distribution": True,
    "csv_export": True,
}
DEFAULT_ESSENCIAL_LIMITS = {
    "max_active_activities": 3,
    "max_materials": 100,
    "materials_storage_mb": 1024,
    "ai_daily_actions": 10,
    "ai_monthly_actions": 60,
    "reports": "full",
    "reminders": "full",
    "auto_planning": True,
    "recovery_distribution": True,
    "csv_export": True,
}
DEFAULT_PRO_LIMITS = {
    "max_active_activities": None,
    "max_materials": None,
    "materials_storage_mb": 5120,
    "ai_daily_actions": 30,
    "ai_monthly_actions": 200,
    "reports": "full",
    "reminders": "full",
    "auto_planning": True,
    "recovery_distribution": True,
    "csv_export": True,
}

SUGGESTED_CATALOG: list[dict] = [
    {
        "code": "free",
        "name": "Gratuito",
        "description": "Um objetivo por inteiro: meta, cronômetro, saldo e recuperação da pendência.",
        "features": [
            "1 objetivo ativo",
            "Cronômetro, registro manual, saldo e recuperação",
            "Plano semanal e lembrete no horário planejado",
            "Relatório da semana",
            "20 materiais (até 100 MB)",
        ],
        "limits": DEFAULT_FREE_LIMITS,
        "recommended": False,
        "sort_order": 0,
        "prices": {},
    },
    {
        "code": "essencial",
        "name": "Essencial",
        "description": "Para quem acompanha mais de uma frente e quer a IA ajudando a organizar.",
        "features": [
            "Até 3 objetivos ativos",
            "IA para organizar o conteúdo e o plano: 60 ações por mês",
            "Lembretes completos e resumo semanal por e-mail",
            "Relatórios da semana, do mês e do trimestre",
            "Distribuição automática das tarefas na semana",
            "100 materiais (até 1 GB)",
        ],
        "limits": DEFAULT_ESSENCIAL_LIMITS,
        "recommended": True,
        "sort_order": 1,
        "prices": {"month": 990, "year": 9480},
    },
    {
        "code": "pro",
        "name": "Completo",
        "description": "Objetivos sem limite, mais IA e mais espaço para PDFs.",
        "features": [
            "Objetivos ativos ilimitados",
            "IA para organizar o conteúdo e o plano: 200 ações por mês",
            "Tudo do Essencial",
            "Materiais ilimitados (até 5 GB)",
        ],
        "limits": DEFAULT_PRO_LIMITS,
        "recommended": False,
        "sort_order": 2,
        "prices": {"month": 1990, "year": 19080},
    },
]


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
    """Cria o catálogo sugerido se ainda não existir. Não altera planos existentes
    (o que foi editado no painel admin é preservado)."""
    apply_catalog(db, SUGGESTED_CATALOG, overwrite=False)


def apply_catalog(db: Session, catalog: list[dict], *, overwrite: bool) -> list[str]:
    """Cria (ou, com `overwrite`, atualiza) planos e preços a partir de `catalog`.
    Sem `overwrite`: só cria o que falta e acrescenta chaves de limite ausentes.
    Retorna a lista de mudanças para registro."""
    from app.models.billing import PlanPrice

    changes: list[str] = []
    for spec in catalog:
        plan = db.execute(select(Plan).where(Plan.code == spec["code"])).scalar_one_or_none()
        if plan is None:
            plan = Plan(
                code=spec["code"],
                name=spec["name"],
                description=spec["description"],
                features=list(spec["features"]),
                limits=dict(spec["limits"]),
                recommended=spec["recommended"],
                active=True,
                sort_order=spec["sort_order"],
            )
            db.add(plan)
            db.flush()
            changes.append(f"plano criado: {spec['code']}")
        elif overwrite:
            plan.name = spec["name"]
            plan.description = spec["description"]
            plan.features = list(spec["features"])
            plan.limits = dict(spec["limits"])
            plan.recommended = spec["recommended"]
            plan.sort_order = spec["sort_order"]
            plan.active = True
            changes.append(f"plano atualizado: {spec['code']}")
        else:
            missing = {k: v for k, v in spec["limits"].items() if k not in (plan.limits or {})}
            if missing:
                plan.limits = {**(plan.limits or {}), **missing}
                changes.append(f"limites acrescentados em {spec['code']}: {', '.join(missing)}")
        for interval, cents in spec["prices"].items():
            price = db.execute(
                select(PlanPrice).where(
                    PlanPrice.plan_id == plan.id, PlanPrice.interval == interval
                )
            ).scalar_one_or_none()
            if price is None:
                db.add(
                    PlanPrice(
                        plan_id=plan.id,
                        interval=interval,
                        amount_cents=cents,
                        currency="BRL",
                        active=True,
                    )
                )
                changes.append(f"preço criado: {spec['code']}/{interval} = {cents}")
            elif overwrite or price.amount_cents is None:
                if price.amount_cents != cents:
                    changes.append(
                        f"preço: {spec['code']}/{interval} {price.amount_cents} → {cents}"
                    )
                price.amount_cents = cents
                price.active = True
    db.flush()
    return changes


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
                or_(PromoGrant.ends_at.is_(None), PromoGrant.ends_at > now),
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
                current_period_end=grant.ends_at.isoformat() if grant.ends_at else None,
            )
    return base


def require_feature(db: Session, user_id: uuid.UUID, key: str, message: str, *, value=True) -> None:
    """Lança PlanLimit (402) quando o plano não inclui o recurso `key` (== `value`)."""
    from app.core.errors import PlanLimit

    ent = get_entitlements(db, user_id)
    if ent.limit(key) != value:
        raise PlanLimit(
            message, code=f"plan_{key}", details={"plan_code": ent.plan_code, "feature": key}
        )


def has_full(db: Session, user_id: uuid.UUID, key: str) -> bool:
    return get_entitlements(db, user_id).limit(key) == "full"
