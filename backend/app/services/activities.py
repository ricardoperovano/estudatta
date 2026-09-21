"""Objetivos/atividades, regras de meta versionadas, pausas e fuso."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, PlanLimit, ValidationFailed
from app.core.i18n import _
from app.core.timeutil import today_in, utcnow, valid_timezone
from app.models.activity import Activity, ActivityPause, ActivityTimezone, GoalRule
from app.models.user import User
from app.services.plans import get_entitlements

WEEKDAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"]


def normalize_minutes_by_weekday(
    raw: dict | None, default_minutes: int = 60, active_days: list[int] | None = None
) -> dict[str, int]:
    out: dict[str, int] = {}
    if raw:
        for k in WEEKDAY_KEYS:
            v = raw.get(k, raw.get(int(k), 0)) if isinstance(raw, dict) else 0
            try:
                v = int(v)
            except (TypeError, ValueError):
                v = 0
            out[k] = max(0, min(v, 24 * 60))
    else:
        days = set(active_days if active_days is not None else [0, 1, 2, 3, 4])
        for k in WEEKDAY_KEYS:
            out[k] = default_minutes if int(k) in days else 0
    if sum(out.values()) == 0:
        raise ValidationFailed(
            "Escolha pelo menos um dia com meta acima de zero.", code="no_active_days"
        )
    return out


def get_activity(db: Session, user: User, activity_id: uuid.UUID) -> Activity:
    act = db.get(Activity, activity_id)
    if act is None or act.user_id != user.id:
        raise NotFound("Objetivo não encontrado.")
    return act


def list_activities(db: Session, user: User, include_archived: bool = False) -> list[Activity]:
    q = select(Activity).where(Activity.user_id == user.id)
    if not include_archived:
        q = q.where(Activity.status != "archived")
    return list(db.execute(q.order_by(Activity.sort_order, Activity.created_at)).scalars())


def count_active(db: Session, user_id: uuid.UUID) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(Activity)
            .where(Activity.user_id == user_id, Activity.status == "active")
        ).scalar_one()
    )


def assert_can_activate(db: Session, user: User, *, excluding: uuid.UUID | None = None) -> None:
    ent = get_entitlements(db, user.id)
    limit = ent.limit("max_active_activities")
    if limit is None:
        return
    active = count_active(db, user.id)
    if excluding is not None:
        act = db.get(Activity, excluding)
        if act is not None and act.status == "active":
            active -= 1
    if active >= int(limit):
        raise PlanLimit(
            _(
                "Seu plano permite {n} objetivo ativo. Pause outro objetivo ou amplie o plano.",
                n=limit,
            ),
            code="activity_limit",
            details={"limit": limit, "active": active},
        )


def normalize_category(category: str, language: str | None) -> tuple[str, str | None]:
    """ "ingles" (legado) vira idioma + inglês; idioma sem idioma escolhido é inglês;
    as demais categorias não guardam idioma."""
    from app.core.languages import DEFAULT_LANGUAGE, LANGUAGES

    if category == "ingles":
        return "idioma", language or DEFAULT_LANGUAGE
    if category == "idioma":
        lang = language or DEFAULT_LANGUAGE
        if lang not in LANGUAGES:
            raise ValidationFailed("Idioma não reconhecido.", code="invalid_language")
        return "idioma", lang
    return category, None


def create_activity(
    db: Session,
    user: User,
    *,
    title: str,
    category: str,
    language: str | None = None,
    tracking_mode: str = "time",
    description: str | None = None,
    desired_outcome: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    timezone: str | None = None,
    recovery_policy: str = "accumulate_suggest",
    minutes_by_weekday: dict | None = None,
    active_days: list[int] | None = None,
    daily_minutes: int = 60,
    daily_limit_minutes: int = 120,
    preferred_times: list[str] | None = None,
    availability: dict | None = None,
    color: str | None = None,
    icon: str | None = None,
) -> Activity:
    category, language = normalize_category(category, language)
    tz = timezone or user.timezone
    if not valid_timezone(tz):
        raise ValidationFailed("Fuso horário inválido.", code="invalid_timezone")
    if recovery_policy not in ("accumulate", "accumulate_suggest", "none"):
        raise ValidationFailed("Política de recuperação inválida.")
    if tracking_mode not in ("time", "checklist", "mixed"):
        raise ValidationFailed("Modo de acompanhamento inválido.")
    if end_date and start_date and end_date < start_date:
        raise ValidationFailed(
            "O prazo final precisa ser depois da data de início.", code="end_before_start"
        )
    assert_can_activate(db, user)
    start = start_date or today_in(tz)
    act = Activity(
        user_id=user.id,
        title=title.strip()[:120],
        description=description,
        category=category,
        language=language,
        desired_outcome=desired_outcome,
        tracking_mode=tracking_mode,
        start_date=start,
        end_date=end_date,
        timezone=tz,
        recovery_policy=recovery_policy,
        preferred_times=preferred_times or [],
        availability=availability or {},
        color=color,
        icon=icon,
        sort_order=count_active(db, user.id),
    )
    db.add(act)
    db.flush()
    db.add(
        ActivityTimezone(activity_id=act.id, effective_from=start, timezone=tz, created_at=utcnow())
    )
    if tracking_mode in ("time", "mixed"):
        minutes = normalize_minutes_by_weekday(minutes_by_weekday, daily_minutes, active_days)
        limit = max(daily_limit_minutes, max(minutes.values()))
        db.add(
            GoalRule(
                activity_id=act.id,
                effective_from=start,
                minutes_by_weekday=minutes,
                daily_limit_minutes=limit,
                version=1,
            )
        )
    db.flush()
    return act


def add_goal_rule(
    db: Session,
    act: Activity,
    *,
    effective_from: date | None,
    minutes_by_weekday: dict,
    daily_limit_minutes: int | None,
    note: str | None = None,
) -> GoalRule:
    """Nova versão de meta com vigência explícita (padrão: próximo dia local). Não reescreve o passado."""
    today = today_in(act.timezone)
    eff = effective_from or (today + timedelta(days=1))
    if eff < act.start_date:
        eff = act.start_date
    minutes = normalize_minutes_by_weekday(minutes_by_weekday)
    current = (
        db.execute(
            select(GoalRule)
            .where(GoalRule.activity_id == act.id)
            .order_by(GoalRule.effective_from.desc())
        )
        .scalars()
        .first()
    )
    version = (current.version + 1) if current else 1
    limit = (
        daily_limit_minutes
        if daily_limit_minutes is not None
        else (current.daily_limit_minutes if current else 120)
    )
    limit = max(limit, max(minutes.values()))
    existing = db.execute(
        select(GoalRule).where(GoalRule.activity_id == act.id, GoalRule.effective_from == eff)
    ).scalar_one_or_none()
    if existing is not None:
        existing.minutes_by_weekday = minutes
        existing.daily_limit_minutes = limit
        existing.note = note
        existing.version = version
        db.flush()
        return existing
    rule = GoalRule(
        activity_id=act.id,
        effective_from=eff,
        minutes_by_weekday=minutes,
        daily_limit_minutes=limit,
        note=note,
        version=version,
    )
    db.add(rule)
    db.flush()
    return rule


def add_pause(
    db: Session,
    act: Activity,
    *,
    start_date: date,
    end_date: date,
    reason: str | None,
    silence_reminders: bool = True,
) -> ActivityPause:
    if end_date < start_date:
        raise ValidationFailed("A pausa precisa terminar depois de começar.")
    if (end_date - start_date).days > 366:
        raise ValidationFailed("Pausa longa demais; use pausar o objetivo.")
    p = ActivityPause(
        activity_id=act.id,
        start_date=start_date,
        end_date=end_date,
        reason=reason,
        silence_reminders=silence_reminders,
    )
    db.add(p)
    db.flush()
    return p


def change_timezone(
    db: Session, act: Activity, *, timezone: str, effective_from: date | None
) -> ActivityTimezone:
    if not valid_timezone(timezone):
        raise ValidationFailed("Fuso horário inválido.", code="invalid_timezone")
    today = today_in(act.timezone)
    eff = effective_from or (today + timedelta(days=1))
    if eff < today:
        raise ValidationFailed(
            "A mudança de fuso vale só para datas futuras; o histórico não é movido.",
            code="tz_future_only",
        )
    row = db.execute(
        select(ActivityTimezone).where(
            ActivityTimezone.activity_id == act.id, ActivityTimezone.effective_from == eff
        )
    ).scalar_one_or_none()
    if row is None:
        row = ActivityTimezone(
            activity_id=act.id, effective_from=eff, timezone=timezone, created_at=utcnow()
        )
        db.add(row)
    else:
        row.timezone = timezone
    if eff <= today:
        act.timezone = timezone
    db.flush()
    return row


def set_status(db: Session, user: User, act: Activity, status: str) -> Activity:
    if status not in ("active", "paused", "archived"):
        raise ValidationFailed("Status inválido.")
    if status == "active" and act.status != "active":
        assert_can_activate(db, user, excluding=act.id)
    act.status = status
    act.archived_at = utcnow() if status == "archived" else None
    db.flush()
    return act
