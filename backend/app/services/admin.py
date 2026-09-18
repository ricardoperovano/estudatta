"""Painel administrativo: métricas agregadas, usuários (sem conteúdo de estudo), catálogo de
planos, configurações em runtime (`AppSetting`), filas e acessos promocionais.

Nunca há "entrar como usuário": o admin só vê agregados e situação de conta/assinatura."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.timeutil import today_in, utcnow
from app.models.activity import Activity
from app.models.billing import BillingEvent, Plan, PlanPrice, PromoGrant, Subscription
from app.models.content import ImportJob, Material
from app.models.notification import NotificationDelivery, NotificationOutbox
from app.models.session import SessionDayAllocation, StudySession
from app.models.system import AiUsage, AppSetting, AuditLog
from app.models.user import AuthSession, User
from app.services import auth as auth_service
from app.services.billing import apply_entitlement_changes
from app.services.plans import get_entitlements

# --- Limites conhecidos do catálogo ---------------------------------------------------

# chave → (tipo, opções). Tipos: int_or_null (None = ilimitado), int, bool, choice
KNOWN_LIMITS: dict[str, tuple] = {
    "max_active_activities": ("int_or_null", 1),
    "materials_storage_mb": ("int_or_null", 0),
    "max_materials": ("int_or_null", 0),
    "ai_daily_actions": ("int", 0),
    "reports": ("choice", ("basic", "full")),
    "recovery_distribution": ("bool",),
    "csv_export": ("bool",),
    "reminders": ("choice", ("basic", "full")),
}


def validate_limits(limits: Any) -> dict:
    if not isinstance(limits, dict):
        raise ValidationFailed("`limits` precisa ser um objeto.", code="invalid_limits")
    out: dict[str, Any] = {}
    errors: dict[str, str] = {}
    for key, value in limits.items():
        spec = KNOWN_LIMITS.get(key)
        if spec is None:
            errors[key] = "limite desconhecido"
            continue
        kind = spec[0]
        if kind in ("int_or_null", "int"):
            if value is None:
                if kind == "int":
                    errors[key] = "precisa ser um inteiro"
                    continue
                out[key] = None
                continue
            if isinstance(value, bool) or not isinstance(value, int):
                errors[key] = "precisa ser um inteiro"
                continue
            if value < spec[1]:
                errors[key] = f"mínimo {spec[1]}"
                continue
            out[key] = value
        elif kind == "bool":
            if not isinstance(value, bool):
                errors[key] = "precisa ser verdadeiro/falso"
                continue
            out[key] = value
        elif kind == "choice":
            if value not in spec[1]:
                errors[key] = f"valores aceitos: {', '.join(spec[1])}"
                continue
            out[key] = value
    if errors:
        raise ValidationFailed(
            "Limites inválidos.", code="invalid_limits", details={"limits": errors}
        )
    return out


# --- Configurações em runtime (AppSetting) ---------------------------------------------

SETTING_KEYS = ("brand", "feature_flags", "limits")
_FLAG_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
_BRAND_KEYS = {
    "name",
    "support_email",
    "company_name",
    "cnpj",
    "social",
    "address",
    "phone",
    "legal_name",
}
_SOCIAL_KEYS = {"instagram", "youtube", "tiktok", "linkedin", "x", "facebook", "whatsapp"}


def default_setting(key: str) -> dict:
    if key == "brand":
        return {
            "name": settings.APP_NAME,
            "support_email": "contato@estudatta.com.br",
            "social": {k: None for k in sorted(_SOCIAL_KEYS)},
            "company_name": None,
            "cnpj": None,
            "pending": ["company_name", "cnpj"],  # [pendente do responsável]
        }
    if key == "feature_flags":
        return {
            "ai": settings.ai_available,
            "billing": settings.billing_enabled,
            "google_oauth": settings.google_oauth_enabled,
            "push": settings.push_enabled,
            "waitlist": True,
        }
    if key == "limits":
        return {}
    raise NotFound("Configuração não encontrada.", code="setting_not_found")


def get_setting(db: Session, key: str, default: dict | None = None) -> dict:
    """Valor efetivo de uma configuração: padrão (ambiente) sobreposto pelo que o admin salvou.
    Outros módulos podem chamar com um `default` próprio para chaves não listadas."""
    row = db.get(AppSetting, key)
    if key in SETTING_KEYS:
        base = dict(default_setting(key))
    else:
        base = dict(default or {})
    if row is None:
        return base
    merged = {**base, **(row.value or {})}
    if key == "brand":
        merged["pending"] = [k for k in ("company_name", "cnpj") if not merged.get(k)]
    return merged


def _validate_setting(key: str, value: Any) -> dict:
    if not isinstance(value, dict):
        raise ValidationFailed("O valor precisa ser um objeto.", code="invalid_setting")
    if key == "brand":
        out: dict[str, Any] = {}
        for k, v in value.items():
            if k == "pending":
                continue  # calculado
            if k not in _BRAND_KEYS:
                raise ValidationFailed(f"Campo desconhecido em brand: {k}", code="invalid_setting")
            if k == "social":
                if not isinstance(v, dict):
                    raise ValidationFailed(
                        "`social` precisa ser um objeto.", code="invalid_setting"
                    )
                social = {}
                for sk, sv in v.items():
                    if sk not in _SOCIAL_KEYS:
                        raise ValidationFailed(
                            f"Rede desconhecida em social: {sk}", code="invalid_setting"
                        )
                    if sv is not None and (not isinstance(sv, str) or len(sv) > 300):
                        raise ValidationFailed(
                            f"Valor inválido para social.{sk}", code="invalid_setting"
                        )
                    social[sk] = (sv or "").strip() or None
                out["social"] = social
                continue
            if v is not None and (not isinstance(v, str) or len(v) > 300):
                raise ValidationFailed(f"Valor inválido para brand.{k}", code="invalid_setting")
            out[k] = (v or "").strip() or None
        return out
    if key == "feature_flags":
        out = {}
        for k, v in value.items():
            if not isinstance(k, str) or not _FLAG_RE.match(k):
                raise ValidationFailed(f"Nome de flag inválido: {k}", code="invalid_setting")
            if not isinstance(v, bool):
                raise ValidationFailed(
                    f"A flag {k} precisa ser verdadeiro/falso.", code="invalid_setting"
                )
            out[k] = v
        return out
    if key == "limits":
        return validate_limits(value)
    raise NotFound("Configuração não encontrada.", code="setting_not_found")


def set_setting(db: Session, key: str, value: Any, *, updated_by: uuid.UUID | None) -> AppSetting:
    clean = _validate_setting(key, value)
    row = db.get(AppSetting, key)
    now = utcnow()
    if row is None:
        row = AppSetting(
            key=key, value=clean, updated_by=updated_by, created_at=now, updated_at=now
        )
        db.add(row)
    else:
        row.value = clean
        row.updated_by = updated_by
        row.updated_at = now
    db.flush()
    return row


# --- Visão geral ----------------------------------------------------------------------


def _count(db: Session, stmt) -> int:
    return int(db.execute(stmt).scalar_one() or 0)


def overview(db: Session, *, now: datetime | None = None) -> dict:
    now = now or utcnow()
    week = now - timedelta(days=7)
    users_total = _count(db, select(func.count()).select_from(User))
    users_new = _count(db, select(func.count()).select_from(User).where(User.created_at >= week))
    users_active = _count(
        db,
        select(func.count(distinct(AuthSession.user_id))).where(
            AuthSession.last_seen_at >= week, AuthSession.revoked_at.is_(None)
        ),
    )
    users_admin = _count(db, select(func.count()).select_from(User).where(User.role == "admin"))
    users_inactive = _count(
        db, select(func.count()).select_from(User).where(User.is_active.is_(False))
    )
    subs = {
        status: int(n)
        for status, n in db.execute(
            select(Subscription.status, func.count()).group_by(Subscription.status)
        ).all()
    }
    acts_by_status = {
        status: int(n)
        for status, n in db.execute(
            select(Activity.status, func.count()).group_by(Activity.status)
        ).all()
    }
    sessions_7d = _count(
        db,
        select(func.count())
        .select_from(StudySession)
        .where(StudySession.status == "finished", StudySession.created_at >= week),
    )
    outbox = {
        status: int(n)
        for status, n in db.execute(
            select(NotificationOutbox.status, func.count()).group_by(NotificationOutbox.status)
        ).all()
    }
    outbox.setdefault("pending", 0)
    outbox.setdefault("failed", 0)
    imports_failed = _count(
        db,
        select(func.count())
        .select_from(ImportJob)
        .where(ImportJob.status == "failed", ImportJob.updated_at >= week),
    )
    ai_rows = db.execute(
        select(
            AiUsage.status,
            func.count(),
            func.coalesce(func.sum(AiUsage.tokens_in), 0),
            func.coalesce(func.sum(AiUsage.tokens_out), 0),
        )
        .where(AiUsage.created_at >= week)
        .group_by(AiUsage.status)
    ).all()
    ai = {
        "actions": int(sum(r[1] for r in ai_rows)),
        "by_status": {r[0]: int(r[1]) for r in ai_rows},
        "tokens_in": int(sum(r[2] for r in ai_rows)),
        "tokens_out": int(sum(r[3] for r in ai_rows)),
        "users": _count(
            db,
            select(func.count(distinct(AiUsage.user_id))).where(AiUsage.created_at >= week),
        ),
    }
    events = {
        status: int(n)
        for status, n in db.execute(
            select(BillingEvent.status, func.count())
            .where(BillingEvent.received_at >= week)
            .group_by(BillingEvent.status)
        ).all()
    }
    promos = _count(
        db,
        select(func.count())
        .select_from(PromoGrant)
        .where(
            PromoGrant.revoked_at.is_(None), PromoGrant.starts_at <= now, PromoGrant.ends_at > now
        ),
    )
    return {
        "generated_at": now,
        "users": {
            "total": users_total,
            "active_7d": users_active,
            "new_7d": users_new,
            "admins": users_admin,
            "inactive": users_inactive,
        },
        "subscriptions": subs,
        "activities": {"total": sum(acts_by_status.values()), "by_status": acts_by_status},
        "sessions_7d": sessions_7d,
        "outbox": outbox,
        "imports_failed_7d": imports_failed,
        "ai_usage_7d": ai,
        "billing_events_7d": events,
        "promo_grants_active": promos,
    }


# --- Usuários -----------------------------------------------------------------------------


def search_users(db: Session, *, q: str | None, limit: int, offset: int) -> tuple[list[User], int]:
    stmt = select(User)
    if q:
        stmt = stmt.where(User.email.ilike(f"%{q.strip().lower()}%"))
    total = _count(db, select(func.count()).select_from(stmt.subquery()))
    rows = list(
        db.execute(stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)).scalars()
    )
    return rows, total


def get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFound("Usuário não encontrado.")
    return user


def user_summary(db: Session, user: User) -> dict:
    ent = get_entitlements(db, user.id)
    return {
        "plan_code": ent.plan_code,
        "plan_source": ent.source,
        "subscription_status": ent.subscription_status,
    }


def user_usage(db: Session, user: User, *, now: datetime | None = None) -> dict:
    """Uso agregado — sem conteúdo de estudo, notas ou arquivos."""
    now = now or utcnow()
    today = today_in(user.timezone)
    since_date = today - timedelta(days=30)
    since_dt = now - timedelta(days=30)
    acts = {
        status: int(n)
        for status, n in db.execute(
            select(Activity.status, func.count())
            .where(Activity.user_id == user.id)
            .group_by(Activity.status)
        ).all()
    }
    seconds_30d = int(
        db.execute(
            select(func.coalesce(func.sum(SessionDayAllocation.seconds), 0)).where(
                SessionDayAllocation.user_id == user.id,
                SessionDayAllocation.local_date >= since_date,
            )
        ).scalar_one()
        or 0
    )
    sessions_30d = _count(
        db,
        select(func.count())
        .select_from(StudySession)
        .where(
            StudySession.user_id == user.id,
            StudySession.status == "finished",
            StudySession.created_at >= since_dt,
        ),
    )
    materials = _count(
        db,
        select(func.count())
        .select_from(Material)
        .where(Material.user_id == user.id, Material.archived_at.is_(None)),
    )
    storage_bytes = int(
        db.execute(
            select(func.coalesce(func.sum(Material.size_bytes), 0)).where(
                Material.user_id == user.id
            )
        ).scalar_one()
        or 0
    )
    auth_sessions = _count(
        db,
        select(func.count())
        .select_from(AuthSession)
        .where(
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        ),
    )
    return {
        "activities_total": sum(acts.values()),
        "activities_by_status": acts,
        "minutes_30d": seconds_30d // 60,
        "sessions_30d": sessions_30d,
        "materials_total": materials,
        "storage_mb": round(storage_bytes / (1024 * 1024), 1),
        "auth_sessions_active": auth_sessions,
        "last_login_at": user.last_login_at,
    }


def set_role(db: Session, actor: User, user: User, role: str) -> User:
    if role not in ("user", "admin"):
        raise ValidationFailed("Papel inválido.", code="invalid_role")
    if user.id == actor.id and role != "admin":
        raise Conflict("Você não pode remover o próprio acesso administrativo.", code="self_role")
    user.role = role
    db.flush()
    return user


def deactivate_user(db: Session, actor: User, user: User) -> User:
    if user.id == actor.id:
        raise Conflict("Você não pode desativar a própria conta por aqui.", code="self_deactivate")
    user.is_active = False
    auth_service.revoke_all_sessions(db, user.id)
    db.flush()
    return user


def reactivate_user(db: Session, user: User) -> User:
    user.is_active = True
    db.flush()
    return user


# --- Catálogo ---------------------------------------------------------------------------------


def list_plans(db: Session) -> list[Plan]:
    return list(
        db.execute(
            select(Plan).options(selectinload(Plan.prices)).order_by(Plan.sort_order, Plan.code)
        ).scalars()
    )


def get_plan(db: Session, plan_id: uuid.UUID) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise NotFound("Plano não encontrado.", code="plan_not_found")
    return plan


def create_plan(db: Session, data: dict) -> Plan:
    code = data["code"]
    if db.execute(select(Plan).where(Plan.code == code)).scalar_one_or_none() is not None:
        raise Conflict("Já existe um plano com este código.", code="plan_code_taken")
    plan = Plan(
        code=code,
        name=data["name"].strip(),
        description=(data.get("description") or None),
        features=[str(f).strip() for f in data.get("features") or [] if str(f).strip()],
        limits=validate_limits(data.get("limits") or {}),
        recommended=bool(data.get("recommended", False)),
        active=bool(data.get("active", True)),
        sort_order=int(data.get("sort_order", 0)),
    )
    db.add(plan)
    db.flush()
    if plan.recommended:
        _unset_other_recommended(db, plan)
    return plan


def update_plan(db: Session, plan: Plan, data: dict) -> Plan:
    if "name" in data and data["name"] is not None:
        plan.name = data["name"].strip()
    if "description" in data:
        plan.description = data["description"] or None
    if data.get("features") is not None:
        plan.features = [str(f).strip() for f in data["features"] if str(f).strip()]
    if data.get("limits") is not None:
        plan.limits = validate_limits(data["limits"])
    if data.get("recommended") is not None:
        plan.recommended = bool(data["recommended"])
    if data.get("active") is not None:
        if plan.code == "free" and not data["active"]:
            raise ValidationFailed(
                "O plano gratuito não pode ser desativado.", code="free_plan_required"
            )
        plan.active = bool(data["active"])
    if data.get("sort_order") is not None:
        plan.sort_order = int(data["sort_order"])
    plan.updated_at = utcnow()
    db.flush()
    if plan.recommended:
        _unset_other_recommended(db, plan)
    return plan


def _unset_other_recommended(db: Session, plan: Plan) -> None:
    for other in db.execute(
        select(Plan).where(Plan.id != plan.id, Plan.recommended.is_(True))
    ).scalars():
        other.recommended = False
    db.flush()


def upsert_prices(db: Session, plan: Plan, prices: list[dict]) -> Plan:
    if plan.code == "free":
        raise ValidationFailed("O plano gratuito não tem preço.", code="free_plan_no_price")
    seen: set[tuple[str, str]] = set()
    for p in prices:
        key = (p["interval"], p.get("currency", "BRL").upper())
        if key in seen:
            raise ValidationFailed("Intervalo repetido na lista de preços.", code="duplicate_price")
        seen.add(key)
        row = db.execute(
            select(PlanPrice).where(
                PlanPrice.plan_id == plan.id,
                PlanPrice.interval == key[0],
                PlanPrice.currency == key[1],
            )
        ).scalar_one_or_none()
        if row is None:
            row = PlanPrice(plan_id=plan.id, interval=key[0], currency=key[1])
            db.add(row)
        row.amount_cents = p.get("amount_cents")
        row.active = bool(p.get("active", True))
        row.updated_at = utcnow()
    db.flush()
    db.refresh(plan)
    return plan


# --- Filas ------------------------------------------------------------------------------------


def outbox_by_status(db: Session) -> dict[str, int]:
    rows = {
        status: int(n)
        for status, n in db.execute(
            select(NotificationOutbox.status, func.count()).group_by(NotificationOutbox.status)
        ).all()
    }
    for k in ("pending", "processing", "sent", "partial", "failed", "cancelled", "expired"):
        rows.setdefault(k, 0)
    return rows


def failed_outbox(db: Session, *, limit: int, offset: int) -> tuple[list[NotificationOutbox], int]:
    stmt = select(NotificationOutbox).where(NotificationOutbox.status.in_(["failed", "partial"]))
    total = _count(db, select(func.count()).select_from(stmt.subquery()))
    rows = list(
        db.execute(
            stmt.order_by(NotificationOutbox.created_at.desc()).limit(limit).offset(offset)
        ).scalars()
    )
    return rows, total


def failed_deliveries(db: Session, *, limit: int) -> list[NotificationDelivery]:
    return list(
        db.execute(
            select(NotificationDelivery)
            .where(NotificationDelivery.status.in_(["failed", "ambiguous"]))
            .order_by(NotificationDelivery.attempted_at.desc())
            .limit(limit)
        ).scalars()
    )


def failed_imports(db: Session, *, limit: int, offset: int) -> tuple[list[ImportJob], int]:
    stmt = select(ImportJob).where(ImportJob.status == "failed")
    total = _count(db, select(func.count()).select_from(stmt.subquery()))
    rows = list(
        db.execute(stmt.order_by(ImportJob.updated_at.desc()).limit(limit).offset(offset)).scalars()
    )
    return rows, total


def retry_outbox(db: Session, row: NotificationOutbox) -> NotificationOutbox:
    if row.status in ("sent",):
        raise Conflict("Esta notificação já foi enviada.", code="already_sent")
    now = utcnow()
    row.status = "pending"
    row.next_run_at = now
    row.locked_at = None
    row.locked_by = None
    row.skip_reason = None
    if row.attempts >= row.max_attempts:
        row.max_attempts = row.attempts + 1
    if row.expires_at is None or row.expires_at <= now:
        row.expires_at = now + timedelta(hours=6)
    db.flush()
    return row


# --- Cobrança ---------------------------------------------------------------------------------


def list_billing_events(
    db: Session, *, limit: int, offset: int, status: str | None
) -> tuple[list[BillingEvent], int]:
    stmt = select(BillingEvent)
    if status:
        stmt = stmt.where(BillingEvent.status == status)
    total = _count(db, select(func.count()).select_from(stmt.subquery()))
    rows = list(
        db.execute(
            stmt.order_by(BillingEvent.received_at.desc()).limit(limit).offset(offset)
        ).scalars()
    )
    return rows, total


def list_promo_grants(db: Session, user_id: uuid.UUID) -> list[PromoGrant]:
    return list(
        db.execute(
            select(PromoGrant)
            .where(PromoGrant.user_id == user_id)
            .order_by(PromoGrant.created_at.desc())
        ).scalars()
    )


def grant_promo(
    db: Session, actor: User, user: User, *, plan_code: str, days: int, reason: str
) -> PromoGrant:
    plan = db.execute(select(Plan).where(Plan.code == plan_code)).scalar_one_or_none()
    if plan is None or not plan.active:
        raise NotFound("Plano não encontrado.", code="plan_not_found")
    if plan.code == "free":
        raise ValidationFailed(
            "O plano gratuito não precisa de acesso promocional.", code="plan_not_grantable"
        )
    now = utcnow()
    grant = PromoGrant(
        user_id=user.id,
        plan_id=plan.id,
        granted_by=actor.id,
        reason=reason.strip()[:300],
        starts_at=now,
        ends_at=now + timedelta(days=days),
        created_at=now,
    )
    db.add(grant)
    db.flush()
    return grant


def get_promo(db: Session, grant_id: uuid.UUID) -> PromoGrant:
    grant = db.get(PromoGrant, grant_id)
    if grant is None:
        raise NotFound("Acesso promocional não encontrado.", code="promo_not_found")
    return grant


def revoke_promo(db: Session, grant: PromoGrant) -> PromoGrant:
    if grant.revoked_at is not None:
        raise Conflict("Este acesso promocional já foi revogado.", code="already_revoked")
    grant.revoked_at = utcnow()
    db.flush()
    user = db.get(User, grant.user_id)
    if user is not None:
        apply_entitlement_changes(db, user)
    return grant


def promo_out(db: Session, grant: PromoGrant, *, now: datetime | None = None) -> dict:
    now = now or utcnow()
    plan = db.get(Plan, grant.plan_id)
    return {
        "id": grant.id,
        "user_id": grant.user_id,
        "plan_code": plan.code if plan else "",
        "granted_by": grant.granted_by,
        "reason": grant.reason,
        "starts_at": grant.starts_at,
        "ends_at": grant.ends_at,
        "revoked_at": grant.revoked_at,
        "created_at": grant.created_at,
        "active": grant.revoked_at is None and grant.starts_at <= now < grant.ends_at,
    }


# --- Auditoria ----------------------------------------------------------------------------------


def list_audit(
    db: Session, *, limit: int, offset: int, action: str | None, actor_id: uuid.UUID | None
) -> tuple[list[AuditLog], int]:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    total = _count(db, select(func.count()).select_from(stmt.subquery()))
    rows = list(
        db.execute(stmt.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)).scalars()
    )
    return rows, total
