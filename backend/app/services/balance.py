"""Ponte entre persistência e motor de saldo: carrega regras, sessões e ajustes e computa."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.timeutil import today_in, utcnow
from app.domain.balance import (
    AdjustmentSpec,
    DayBalance,
    PauseSpec,
    RuleSpec,
    TodaySummary,
    compute_balances,
    day_span,
    streak,
    summarize_today,
)
from app.domain.planner import DayCapacity, distribute_pending
from app.models.activity import (
    Activity,
    ActivityPause,
    BalanceAdjustment,
    DailyLedger,
    GoalRule,
    RecoveryAllocation,
    RecoveryPlan,
)
from app.models.planning import PlannedTask
from app.models.session import SessionDayAllocation, StudySession


def rule_specs(db: Session, activity_id: uuid.UUID) -> list[RuleSpec]:
    rows = db.execute(
        select(GoalRule)
        .where(GoalRule.activity_id == activity_id)
        .order_by(GoalRule.effective_from)
    ).scalars()
    return [
        RuleSpec(r.effective_from, dict(r.minutes_by_weekday), r.daily_limit_minutes, r.version)
        for r in rows
    ]


def pause_specs(db: Session, activity_id: uuid.UUID) -> list[PauseSpec]:
    rows = db.execute(
        select(ActivityPause).where(ActivityPause.activity_id == activity_id)
    ).scalars()
    return [PauseSpec(p.start_date, p.end_date) for p in rows]


def adjustment_specs(db: Session, activity_id: uuid.UUID) -> list[AdjustmentSpec]:
    rows = db.execute(
        select(BalanceAdjustment).where(BalanceAdjustment.activity_id == activity_id)
    ).scalars()
    return [AdjustmentSpec(a.applies_on, a.seconds) for a in rows]


def logged_by_date(
    db: Session, activity_id: uuid.UUID, start: date | None = None, end: date | None = None
) -> dict[date, int]:
    q = (
        select(SessionDayAllocation.local_date, func.sum(SessionDayAllocation.seconds))
        .join(StudySession, StudySession.id == SessionDayAllocation.session_id)
        .where(
            SessionDayAllocation.activity_id == activity_id,
            StudySession.status == "finished",
            StudySession.counts_toward_goal.is_(True),
            StudySession.needs_review.is_(False),
        )
        .group_by(SessionDayAllocation.local_date)
    )
    if start:
        q = q.where(SessionDayAllocation.local_date >= start)
    if end:
        q = q.where(SessionDayAllocation.local_date <= end)
    return {d: int(s or 0) for d, s in db.execute(q).all()}


def first_relevant_date(db: Session, act: Activity) -> date:
    first_alloc = db.execute(
        select(func.min(SessionDayAllocation.local_date)).where(
            SessionDayAllocation.activity_id == act.id
        )
    ).scalar_one()
    if first_alloc and first_alloc < act.start_date:
        return first_alloc
    return act.start_date


def compute_activity_balances(
    db: Session, act: Activity, *, upto: date | None = None, open_day: date | None = None
) -> list[DayBalance]:
    today = today_in(act.timezone)
    upto = upto or today
    open_day = open_day if open_day is not None else today
    start = first_relevant_date(db, act)
    if upto < start:
        return []
    days = day_span(start, upto)
    return compute_balances(
        days,
        rules=rule_specs(db, act.id),
        pauses=pause_specs(db, act.id),
        logged_by_date=logged_by_date(db, act.id),
        adjustments=adjustment_specs(db, act.id),
        policy=act.recovery_policy,  # type: ignore[arg-type]
        start_date=act.start_date,
        end_date=act.end_date,
        open_day=open_day,
    )


def project_targets(db: Session, act: Activity, start: date, end: date) -> list[DayBalance]:
    """Metas futuras (sem registros) para calendário e distribuição."""
    from app.domain.balance import target_for

    rules = rule_specs(db, act.id)
    pauses = pause_specs(db, act.id)
    out = []
    for d in day_span(start, end):
        t = target_for(d, rules, pauses, act.start_date, act.end_date)
        out.append(
            DayBalance(
                local_date=d,
                target=t.seconds,
                logged=0,
                carry_in=0,
                missing_today=t.seconds,
                pending_prior=0,
                remaining_total=t.seconds,
                carry_out=0,
                recovered=0,
                extra=0,
                forgiven=0,
                is_rest=t.is_rest,
                is_paused=t.is_paused,
                in_range=t.in_range,
                goal_met=False,
                rule_version=t.version,
                daily_limit=t.daily_limit_seconds,
            )
        )
    return out


def committed_seconds_by_date(
    db: Session, act: Activity, start: date, end: date
) -> dict[date, int]:
    q = (
        select(PlannedTask.local_date, func.sum(PlannedTask.estimated_seconds))
        .where(
            PlannedTask.activity_id == act.id,
            PlannedTask.local_date >= start,
            PlannedTask.local_date <= end,
            PlannedTask.status == "planned",
            PlannedTask.kind == "study",
        )
        .group_by(PlannedTask.local_date)
    )
    return {d: int(s or 0) for d, s in db.execute(q).all()}


def day_capacities(
    db: Session, act: Activity, start: date, end: date, *, today_logged: int = 0
) -> list[DayCapacity]:
    """Capacidade extra por dia = limite confortável − max(meta, tarefas planejadas, registrado).

    As tarefas de conteúdo ocupam a disponibilidade da meta (não criam obrigação extra); só o
    que ultrapassa a meta reduz a capacidade de recuperação. O tempo já registrado hoje também
    conta uma única vez.
    """
    targets = project_targets(db, act, start, end)
    committed = committed_seconds_by_date(db, act, start, end)
    caps = []
    for t in targets:
        planned = committed.get(t.local_date, 0)
        occupied = planned
        if t.local_date == start:
            occupied = max(planned, today_logged)
        extra_committed = max(0, occupied - t.target)
        caps.append(
            DayCapacity(
                t.local_date,
                t.target,
                t.daily_limit,
                extra_committed,
                t.target > 0 and not t.is_paused,
            )
        )
    return caps


def active_plan(db: Session, act: Activity) -> RecoveryPlan | None:
    return (
        db.execute(
            select(RecoveryPlan)
            .where(RecoveryPlan.activity_id == act.id, RecoveryPlan.status == "applied")
            .order_by(RecoveryPlan.created_at.desc())
        )
        .scalars()
        .first()
    )


def suggested_recovery_for(db: Session, act: Activity, d: date) -> tuple[int | None, bool]:
    """(segundos sugeridos para o dia, há plano aplicado?)"""
    plan = active_plan(db, act)
    if plan is None:
        return None, False
    alloc = db.execute(
        select(RecoveryAllocation).where(
            RecoveryAllocation.plan_id == plan.id, RecoveryAllocation.local_date == d
        )
    ).scalar_one_or_none()
    return (alloc.seconds if alloc else 0), True


@dataclass
class ActivityBalanceView:
    activity: Activity
    days: list[DayBalance]
    today: TodaySummary | None
    streak_current: int
    streak_best: int
    plan: RecoveryPlan | None
    auto_suggestion: dict[date, int]


def activity_balance(db: Session, act: Activity) -> ActivityBalanceView:
    today = today_in(act.timezone)
    days = compute_activity_balances(db, act)
    today_day = next((d for d in days if d.local_date == today), None)
    plan = active_plan(db, act)
    suggested: int | None = None
    auto: dict[date, int] = {}
    if today_day is not None:
        s, has_plan = suggested_recovery_for(db, act, today)
        if has_plan:
            suggested = s
        elif act.recovery_policy == "accumulate_suggest" and today_day.pending_prior > 0:
            # sugestão automática (não aplicada): distribuir em até 3 dias ativos a partir de hoje
            caps = day_capacities(
                db, act, today, today + timedelta(days=14), today_logged=today_day.logged
            )
            dist = distribute_pending(today_day.pending_prior, caps, horizon_days=3)
            auto = dist.allocations
            suggested = auto.get(today, 0)
        summary = summarize_today(today_day, suggested)
    else:
        summary = None
    cur, best = streak(days, today)
    return ActivityBalanceView(
        activity=act,
        days=days,
        today=summary,
        streak_current=cur,
        streak_best=best,
        plan=plan,
        auto_suggestion=auto,
    )


def upsert_ledger(
    db: Session, act: Activity, days: list[DayBalance], *, only_closed_before: date
) -> int:
    """Materializa o fechamento diário de forma idempotente (chave objetivo/data)."""
    n = 0
    existing = {
        r.local_date: r
        for r in db.execute(
            select(DailyLedger).where(
                DailyLedger.activity_id == act.id, DailyLedger.local_date < only_closed_before
            )
        ).scalars()
    }
    for d in days:
        if d.local_date >= only_closed_before:
            continue
        row = existing.get(d.local_date)
        values = dict(
            target_seconds=d.target,
            logged_seconds=d.logged,
            carry_in_seconds=d.carry_in,
            carry_out_seconds=d.carry_out,
            recovered_seconds=d.recovered,
            extra_seconds=d.extra,
            forgiven_seconds=d.forgiven,
            is_rest_day=d.is_rest,
            is_paused=d.is_paused,
            goal_met=d.goal_met,
            rule_version=d.rule_version,
        )
        if row is None:
            db.add(
                DailyLedger(
                    activity_id=act.id, local_date=d.local_date, closed_at=utcnow(), **values
                )
            )
            n += 1
        else:
            changed = any(getattr(row, k) != v for k, v in values.items())
            if changed:
                for k, v in values.items():
                    setattr(row, k, v)
                row.closed_at = utcnow()
                n += 1
    return n


def rebuild_ledger(db: Session, act: Activity) -> int:
    today = today_in(act.timezone)
    days = compute_activity_balances(db, act, upto=today, open_day=today)
    return upsert_ledger(db, act, days, only_closed_before=today)
