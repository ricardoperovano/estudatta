from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import NotFound, ValidationFailed
from app.core.i18n import _
from app.models.activity import GoalRule
from app.models.user import User
from app.schemas.activities import (
    ActivityCreate,
    ActivityDetailOut,
    ActivityOut,
    ActivityUpdate,
    BalanceOut,
    CurrentMaterialOut,
    DayBalanceOut,
    ForgiveIn,
    ForgivePreviewOut,
    GoalRuleIn,
    GoalRuleOut,
    PauseIn,
    PauseOut,
    StatusChange,
    TimezoneChange,
    TimezoneOut,
    TodaySummaryOut,
)
from app.schemas.common import OkResponse
from app.services import activities as svc
from app.services import balance as balance_service
from app.services import recovery as recovery_service
from app.services.dashboard import next_step_sentence

router = APIRouter(prefix="/activities", tags=["activities"])


def _current_rule(act) -> GoalRule | None:
    from app.core.timeutil import today_in
    from app.domain.balance import RuleSpec, rule_for

    today = today_in(act.timezone)
    specs = [
        RuleSpec(r.effective_from, r.minutes_by_weekday, r.daily_limit_minutes, r.version)
        for r in act.goal_rules
    ]
    chosen = rule_for(today, specs)
    if chosen is None and specs:
        chosen = min(specs, key=lambda s: s.effective_from)
    if chosen is None:
        return None
    return next(r for r in act.goal_rules if r.effective_from == chosen.effective_from)


def _current_material(act) -> CurrentMaterialOut | None:
    m = getattr(act, "current_material_ref", None)
    if m is None or m.archived_at is not None:
        return None
    pct = None
    if m.pages_total and m.current_page is not None:
        pct = max(0, min(100, round(100 * m.current_page / m.pages_total)))
    return CurrentMaterialOut(
        id=m.id,
        title=m.title,
        kind=m.kind,
        current_page=m.current_page,
        pages_total=m.pages_total,
        last_position=m.last_position,
        percent=pct,
    )


def to_out(act) -> ActivityOut:
    o = ActivityOut.model_validate(act)
    r = _current_rule(act)
    o.current_rule = GoalRuleOut.model_validate(r) if r else None
    o.current_material = _current_material(act)
    return o


def to_detail(act) -> ActivityDetailOut:
    o = ActivityDetailOut.model_validate(act)
    r = _current_rule(act)
    o.current_rule = GoalRuleOut.model_validate(r) if r else None
    o.current_material = _current_material(act)
    o.timezone_history = [
        TimezoneOut.model_validate(t)
        for t in sorted(act.timezone_history, key=lambda t: t.effective_from)
    ]
    return o


@router.get("", response_model=list[ActivityOut])
def list_activities(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ActivityOut]:
    return [to_out(a) for a in svc.list_activities(db, user, include_archived)]


@router.post("", response_model=ActivityDetailOut, status_code=201)
def create_activity(
    payload: ActivityCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ActivityDetailOut:
    g = payload.goal or GoalRuleIn()
    act = svc.create_activity(
        db,
        user,
        title=payload.title,
        category=payload.category,
        language=payload.language,
        tracking_mode=payload.tracking_mode,
        description=payload.description,
        desired_outcome=payload.desired_outcome,
        start_date=payload.start_date,
        end_date=payload.end_date,
        timezone=payload.timezone,
        recovery_policy=payload.recovery_policy,
        minutes_by_weekday=g.minutes_by_weekday,
        active_days=g.active_days,
        daily_minutes=g.daily_minutes,
        daily_limit_minutes=g.daily_limit_minutes,
        preferred_times=payload.preferred_times,
        availability=payload.availability,
        color=payload.color,
        icon=payload.icon,
    )
    act.weekly_questions_goal = payload.weekly_questions_goal
    act.weekly_pages_goal = payload.weekly_pages_goal
    audit(
        db,
        actor_id=user.id,
        action="activity.create",
        target_type="activity",
        target_id=str(act.id),
    )
    db.commit()
    db.refresh(act)
    return to_detail(act)


@router.get("/{activity_id}", response_model=ActivityDetailOut)
def get_activity(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ActivityDetailOut:
    return to_detail(svc.get_activity(db, user, activity_id))


@router.patch("/{activity_id}", response_model=ActivityDetailOut)
def update_activity(
    activity_id: UUID,
    payload: ActivityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityDetailOut:
    act = svc.get_activity(db, user, activity_id)
    data = payload.model_dump(exclude_unset=True)
    clear_end = data.pop("clear_end_date", False)
    if data.pop("clear_current_material", False):
        act.current_material_id = None
    if "current_material_id" in data:
        mid = data.pop("current_material_id")
        if mid is not None:
            from app.models.content import Material

            m = db.get(Material, mid)
            if m is None or m.user_id != user.id:
                raise NotFound("Material não encontrado.", code="material_not_found")
            if m.activity_id not in (None, act.id):
                raise ValidationFailed(
                    "Este material pertence a outro objetivo.", code="bad_material"
                )
            act.current_material_id = m.id
    if "category" in data or "language" in data:
        language = data.pop("language", None)
        category = data.pop("category", None) or ("idioma" if language else act.category)
        # mudar só o idioma mantém a categoria; trocar de categoria descarta o idioma antigo
        if language is None and category == act.category:
            language = act.language
        act.category, act.language = svc.normalize_category(category, language)
    for k, v in data.items():
        if k in ("weekly_questions_goal", "weekly_pages_goal"):
            setattr(act, k, v or None)  # 0 ou vazio remove a meta semanal
        elif v is not None:
            setattr(act, k, v)
    if clear_end:
        act.end_date = None
    db.commit()
    db.refresh(act)
    return to_detail(act)


@router.post("/{activity_id}/status", response_model=ActivityDetailOut)
def change_status(
    activity_id: UUID,
    payload: StatusChange,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityDetailOut:
    act = svc.get_activity(db, user, activity_id)
    svc.set_status(db, user, act, payload.status)
    audit(
        db,
        actor_id=user.id,
        action=f"activity.{payload.status}",
        target_type="activity",
        target_id=str(act.id),
    )
    db.commit()
    db.refresh(act)
    return to_detail(act)


@router.delete("/{activity_id}", response_model=OkResponse)
def delete_activity(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    act = svc.get_activity(db, user, activity_id)
    audit(
        db,
        actor_id=user.id,
        action="activity.delete",
        target_type="activity",
        target_id=str(act.id),
        metadata={"title": act.title},
    )
    db.delete(act)
    db.commit()
    return OkResponse(message=_("Objetivo excluído."))


@router.post("/{activity_id}/goal-rules", response_model=GoalRuleOut, status_code=201)
def add_goal_rule(
    activity_id: UUID,
    payload: GoalRuleIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GoalRuleOut:
    act = svc.get_activity(db, user, activity_id)
    minutes = payload.minutes_by_weekday or svc.normalize_minutes_by_weekday(
        None, payload.daily_minutes, payload.active_days
    )
    rule = svc.add_goal_rule(
        db,
        act,
        effective_from=payload.effective_from,
        minutes_by_weekday=minutes,
        daily_limit_minutes=payload.daily_limit_minutes,
        note=payload.note,
    )
    db.commit()
    return GoalRuleOut.model_validate(rule)


@router.get("/{activity_id}/goal-rules", response_model=list[GoalRuleOut])
def list_goal_rules(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[GoalRuleOut]:
    act = svc.get_activity(db, user, activity_id)
    return [GoalRuleOut.model_validate(r) for r in act.goal_rules]


@router.post("/{activity_id}/pauses", response_model=PauseOut, status_code=201)
def add_pause(
    activity_id: UUID,
    payload: PauseIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PauseOut:
    act = svc.get_activity(db, user, activity_id)
    p = svc.add_pause(
        db,
        act,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        silence_reminders=payload.silence_reminders,
    )
    db.commit()
    return PauseOut.model_validate(p)


@router.delete("/{activity_id}/pauses/{pause_id}", response_model=OkResponse)
def delete_pause(
    activity_id: UUID,
    pause_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    act = svc.get_activity(db, user, activity_id)
    p = next((x for x in act.pauses if x.id == pause_id), None)
    if p is None:
        raise NotFound("Pausa não encontrada.")
    db.delete(p)
    db.commit()
    return OkResponse()


@router.post("/{activity_id}/timezone", response_model=TimezoneOut)
def change_timezone(
    activity_id: UUID,
    payload: TimezoneChange,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TimezoneOut:
    act = svc.get_activity(db, user, activity_id)
    row = svc.change_timezone(
        db, act, timezone=payload.timezone, effective_from=payload.effective_from
    )
    db.commit()
    return TimezoneOut.model_validate(row)


def _balance_out(db: Session, act, days_limit: int) -> BalanceOut:
    view = balance_service.activity_balance(db, act)
    days = view.days[-days_limit:] if days_limit else view.days
    summary = view.today
    return BalanceOut(
        activity_id=act.id,
        today=TodaySummaryOut(
            **{**summary.__dict__, "next_step_seconds": summary.next_step_seconds}
        )
        if summary
        else None,
        next_step=next_step_sentence(summary, view.plan is not None) if summary else "",
        streak_current=view.streak_current,
        streak_best=view.streak_best,
        has_recovery_plan=view.plan is not None,
        auto_suggestion={d.isoformat(): v for d, v in view.auto_suggestion.items()},
        days=[DayBalanceOut(**{**d.__dict__, "deficit": d.deficit}) for d in days],
    )


@router.get("/{activity_id}/balance", response_model=BalanceOut)
def get_balance(
    activity_id: UUID,
    days: int = Query(default=60, ge=0, le=730),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BalanceOut:
    act = svc.get_activity(db, user, activity_id)
    return _balance_out(db, act, days)


@router.post("/{activity_id}/forgive/preview", response_model=ForgivePreviewOut)
def forgive_preview(
    activity_id: UUID,
    payload: ForgiveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ForgivePreviewOut:
    act = svc.get_activity(db, user, activity_id)
    return ForgivePreviewOut(**recovery_service.forgive_preview(db, act, payload.seconds))


@router.post("/{activity_id}/forgive", response_model=BalanceOut)
def forgive(
    activity_id: UUID,
    payload: ForgiveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BalanceOut:
    act = svc.get_activity(db, user, activity_id)
    adj = recovery_service.forgive(db, user, act, seconds=payload.seconds, reason=payload.reason)
    audit(
        db,
        actor_id=user.id,
        action="balance.forgive",
        target_type="activity",
        target_id=str(act.id),
        metadata={"seconds": adj.seconds, "reason": payload.reason},
    )
    db.commit()
    return _balance_out(db, act, 60)


# --- Planos de recuperação -------------------------------------------------


class RecoveryPreviewIn(BaseModel):
    strategy: str = Field(pattern="^(today|distribute|until_date|custom|keep)$")
    horizon_days: int | None = Field(default=None, ge=1, le=60)
    until: date | None = None
    custom: dict[date, int] | None = None
    include_rest_days: bool = False


class RecoveryDayRow(BaseModel):
    local_date: date
    target: int
    before_extra: int
    after_extra: int
    capacity_extra: int
    is_active: bool


class RecoveryPreviewOut(BaseModel):
    strategy: str
    pending_seconds: int
    allocations: dict[date, int]
    allocated: int
    unallocated: int
    exceeds_capacity_on: list[date]
    rows: list[RecoveryDayRow]
    pending_after: int
    alternatives: list[str]


class RecoveryAllocationOut(BaseModel):
    local_date: date
    seconds: int


class RecoveryPlanOut(BaseModel):
    id: UUID
    strategy: str
    status: str
    pending_seconds_at_creation: int
    allocated_seconds: int
    unallocated_seconds: int
    horizon_days: int | None
    until_date: date | None
    created_on: date
    allocations: list[RecoveryAllocationOut]


def _plan_out(p) -> RecoveryPlanOut:
    return RecoveryPlanOut(
        id=p.id,
        strategy=p.strategy,
        status=p.status,
        pending_seconds_at_creation=p.pending_seconds_at_creation,
        allocated_seconds=p.allocated_seconds,
        unallocated_seconds=p.unallocated_seconds,
        horizon_days=p.horizon_days,
        until_date=p.until_date,
        created_on=p.created_on,
        allocations=[
            RecoveryAllocationOut(local_date=a.local_date, seconds=a.seconds) for a in p.allocations
        ],
    )


def _preview_out(pv) -> RecoveryPreviewOut:
    return RecoveryPreviewOut(
        strategy=pv.strategy,
        pending_seconds=pv.pending_seconds,
        allocations=pv.allocations,
        allocated=pv.allocated,
        unallocated=pv.unallocated,
        exceeds_capacity_on=pv.exceeds_capacity_on,
        rows=[RecoveryDayRow(**r.__dict__) for r in pv.rows],
        pending_after=pv.pending_after,
        alternatives=pv.alternatives,
    )


@router.post("/{activity_id}/recovery-plans/preview", response_model=RecoveryPreviewOut)
def recovery_preview(
    activity_id: UUID,
    payload: RecoveryPreviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RecoveryPreviewOut:
    act = svc.get_activity(db, user, activity_id)
    pv = recovery_service.preview(
        db,
        act,
        strategy=payload.strategy,
        horizon_days=payload.horizon_days,
        until=payload.until,
        custom=payload.custom,
        include_rest_days=payload.include_rest_days,
    )
    return _preview_out(pv)


@router.post("/{activity_id}/recovery-plans", response_model=RecoveryPlanOut, status_code=201)
def recovery_apply(
    activity_id: UUID,
    payload: RecoveryPreviewIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RecoveryPlanOut:
    act = svc.get_activity(db, user, activity_id)
    pv = recovery_service.preview(
        db,
        act,
        strategy=payload.strategy,
        horizon_days=payload.horizon_days,
        until=payload.until,
        custom=payload.custom,
        include_rest_days=payload.include_rest_days,
    )
    if payload.strategy == "keep":
        recovery_service.cancel(db, act)
        db.commit()
        raise NotFound("Nenhum plano aplicado: a pendência continua visível.")
    plan = recovery_service.apply(
        db, user, act, pv, horizon_days=payload.horizon_days, until=payload.until
    )
    audit(
        db,
        actor_id=user.id,
        action="recovery.apply",
        target_type="activity",
        target_id=str(act.id),
        metadata={
            "strategy": pv.strategy,
            "allocated": pv.allocated,
            "unallocated": pv.unallocated,
        },
    )
    db.commit()
    db.refresh(plan)
    return _plan_out(plan)


@router.get("/{activity_id}/recovery-plans", response_model=list[RecoveryPlanOut])
def recovery_list(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[RecoveryPlanOut]:
    act = svc.get_activity(db, user, activity_id)
    return [_plan_out(p) for p in recovery_service.list_plans(db, act)]


@router.delete("/{activity_id}/recovery-plans/current", response_model=OkResponse)
def recovery_cancel(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    act = svc.get_activity(db, user, activity_id)
    recovery_service.cancel(db, act)
    db.commit()
    return OkResponse(message=_("Plano de recuperação cancelado. A pendência continua visível."))
