"""Planos de recuperação: prévia, aplicação, cancelamento e ajuste explícito de pendência."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.core.timeutil import today_in, utcnow
from app.domain.planner import Distribution, distribute_pending, recover_all_today
from app.models.activity import Activity, BalanceAdjustment, RecoveryAllocation, RecoveryPlan
from app.models.planning import PlannedTask
from app.models.user import User
from app.services import balance as balance_service


@dataclass
class DayRow:
    local_date: date
    target: int
    before_extra: int
    after_extra: int
    capacity_extra: int
    is_active: bool


@dataclass
class Preview:
    strategy: str
    pending_seconds: int
    allocations: dict[date, int]
    allocated: int
    unallocated: int
    exceeds_capacity_on: list[date]
    rows: list[DayRow]
    pending_after: int
    alternatives: list[str] = field(default_factory=list)


def _pending_today(db: Session, act: Activity) -> tuple[int, int, date]:
    today = today_in(act.timezone)
    days = balance_service.compute_activity_balances(db, act, upto=today, open_day=today)
    today_day = next((d for d in days if d.local_date == today), None)
    if today_day is None:
        return 0, 0, today
    return today_day.pending_prior, today_day.logged, today


def _current_allocations(db: Session, act: Activity, start: date, end: date) -> dict[date, int]:
    plan = balance_service.active_plan(db, act)
    if plan is None:
        return {}
    return {a.local_date: a.seconds for a in plan.allocations if start <= a.local_date <= end}


def preview(
    db: Session,
    act: Activity,
    *,
    strategy: str,
    horizon_days: int | None = None,
    until: date | None = None,
    custom: dict[date, int] | None = None,
    include_rest_days: bool = False,
) -> Preview:
    pending, logged_today, today = _pending_today(db, act)
    window_end = until or (today + timedelta(days=max(14, (horizon_days or 3) * 3)))
    caps = balance_service.day_capacities(db, act, today, window_end, today_logged=logged_today)
    if strategy == "today":
        dist = recover_all_today(pending, caps[0]) if caps else Distribution(unallocated=pending)
    elif strategy == "distribute":
        dist = distribute_pending(
            pending, caps, horizon_days=horizon_days or 3, include_rest_days=include_rest_days
        )
    elif strategy == "until_date":
        if until is None:
            raise ValidationFailed("Informe a data limite.", code="missing_until")
        dist = distribute_pending(pending, caps, until=until, include_rest_days=include_rest_days)
    elif strategy == "custom":
        dist = Distribution()
        total = 0
        for c in caps:
            v = int((custom or {}).get(c.local_date, 0))
            if v < 0:
                raise ValidationFailed("Valores negativos não são permitidos.")
            if v > 0:
                take = min(v, max(0, pending - total))
                if take > 0:
                    dist.allocations[c.local_date] = take
                    total += take
                    if take > c.extra_capacity:
                        dist.exceeds_capacity_on.append(c.local_date)
        dist.unallocated = max(0, pending - total)
    elif strategy == "keep":
        dist = Distribution(unallocated=pending)
    else:
        raise ValidationFailed("Estratégia inválida.")

    before = _current_allocations(db, act, today, window_end)
    rows = []
    for c in caps:
        if c.local_date > (until or window_end):
            break
        rows.append(
            DayRow(
                local_date=c.local_date,
                target=c.target_seconds,
                before_extra=before.get(c.local_date, 0),
                after_extra=dist.allocations.get(c.local_date, 0),
                capacity_extra=c.extra_capacity,
                is_active=c.is_active,
            )
        )
    alternatives = []
    if dist.unallocated > 0:
        alternatives = [
            "ampliar_prazo",
            "aumentar_disponibilidade",
            "revisar_plano",
            "perdoar_parte",
        ]
    return Preview(
        strategy=strategy,
        pending_seconds=pending,
        allocations=dist.allocations,
        allocated=dist.allocated,
        unallocated=dist.unallocated,
        exceeds_capacity_on=dist.exceeds_capacity_on,
        rows=rows,
        pending_after=dist.unallocated,
        alternatives=alternatives,
    )


def apply(
    db: Session,
    user: User,
    act: Activity,
    pv: Preview,
    *,
    horizon_days: int | None,
    until: date | None,
) -> RecoveryPlan:
    """Aplica o plano: substitui o plano anterior e rotula tarefas planejadas com '+X de recuperação'."""
    today = today_in(act.timezone)
    old = balance_service.active_plan(db, act)
    if old is not None:
        old.status = "cancelled"
        old.cancelled_at = utcnow()
        _clear_task_labels(db, act, old)
    plan = RecoveryPlan(
        activity_id=act.id,
        user_id=user.id,
        strategy=pv.strategy,
        status="applied",
        pending_seconds_at_creation=pv.pending_seconds,
        allocated_seconds=pv.allocated,
        unallocated_seconds=pv.unallocated,
        horizon_days=horizon_days,
        until_date=until,
        created_on=today,
    )
    db.add(plan)
    db.flush()
    for d, secs in sorted(pv.allocations.items()):
        db.add(RecoveryAllocation(plan_id=plan.id, local_date=d, seconds=secs))
    db.flush()
    # rotula a primeira tarefa planejada do dia (se houver) com o tempo de recuperação
    for d, secs in pv.allocations.items():
        task = (
            db.execute(
                select(PlannedTask)
                .where(
                    PlannedTask.activity_id == act.id,
                    PlannedTask.local_date == d,
                    PlannedTask.status == "planned",
                    PlannedTask.kind == "study",
                )
                .order_by(PlannedTask.sort_order, PlannedTask.start_time)
            )
            .scalars()
            .first()
        )
        if task is not None:
            task.recovery_seconds = secs
    db.flush()
    return plan


def _clear_task_labels(db: Session, act: Activity, plan: RecoveryPlan) -> None:
    dates = [a.local_date for a in plan.allocations]
    if not dates:
        return
    for t in db.execute(
        select(PlannedTask).where(
            PlannedTask.activity_id == act.id,
            PlannedTask.local_date.in_(dates),
            PlannedTask.recovery_seconds > 0,
        )
    ).scalars():
        t.recovery_seconds = 0


def cancel(db: Session, act: Activity) -> RecoveryPlan | None:
    plan = balance_service.active_plan(db, act)
    if plan is None:
        return None
    plan.status = "cancelled"
    plan.cancelled_at = utcnow()
    _clear_task_labels(db, act, plan)
    db.flush()
    return plan


def forgive_preview(db: Session, act: Activity, seconds: int) -> dict:
    pending, _, today = _pending_today(db, act)
    seconds = max(0, min(int(seconds), pending))
    return {
        "pending_before": pending,
        "forgiven": seconds,
        "pending_after": pending - seconds,
        "applies_on": today,
    }


def forgive(
    db: Session, user: User, act: Activity, *, seconds: int, reason: str | None
) -> BalanceAdjustment:
    pv = forgive_preview(db, act, seconds)
    if pv["forgiven"] <= 0:
        raise ValidationFailed("Não há pendência a perdoar.", code="nothing_to_forgive")
    # aplica ao fechamento de ontem: reduz a pendência que entra hoje sem tocar no dia em aberto
    applies_on = pv["applies_on"] - timedelta(days=1)
    adj = BalanceAdjustment(
        activity_id=act.id,
        user_id=user.id,
        applies_on=applies_on,
        kind="forgive",
        seconds=pv["forgiven"],
        reason=reason,
        created_by=user.id,
        created_at=utcnow(),
    )
    db.add(adj)
    db.flush()
    return adj


def list_plans(db: Session, act: Activity) -> list[RecoveryPlan]:
    return list(
        db.execute(
            select(RecoveryPlan)
            .where(RecoveryPlan.activity_id == act.id)
            .order_by(RecoveryPlan.created_at.desc())
        ).scalars()
    )


def get_plan(db: Session, act: Activity, plan_id: uuid.UUID) -> RecoveryPlan | None:
    p = db.get(RecoveryPlan, plan_id)
    if p is None or p.activity_id != act.id:
        return None
    return p
