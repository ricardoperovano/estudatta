"""IA opcional: status/cotas e três ações que devolvem **prévias** (nada é aplicado aqui)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, rate_limit
from app.models.user import User
from app.schemas.ai import (
    AiStatusOut,
    SuggestPlanIn,
    SuggestPlanOut,
    SuggestStructureIn,
    SuggestStructureOut,
    WeeklySummaryIn,
    WeeklySummaryOut,
)
from app.services import activities as activity_service
from app.services import ai as svc

router = APIRouter(prefix="/ai", tags=["ai"])

_ai_rate = rate_limit("ai", 10, 60)  # 10 chamadas/min por usuário, além da cota diária


@router.get("/status", response_model=AiStatusOut)
def ai_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AiStatusOut:
    return AiStatusOut(**svc.status(db, user))


@router.post(
    "/suggest-structure", response_model=SuggestStructureOut, dependencies=[Depends(_ai_rate)]
)
def suggest_structure(
    payload: SuggestStructureIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SuggestStructureOut:
    return svc.suggest_structure(db, user, text=payload.text, import_id=payload.import_id)


@router.post("/suggest-plan", response_model=SuggestPlanOut, dependencies=[Depends(_ai_rate)])
def suggest_plan(
    payload: SuggestPlanIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SuggestPlanOut:
    act = activity_service.get_activity(db, user, payload.activity_id)
    return svc.suggest_plan(
        db,
        user,
        act,
        start=payload.start,
        end=payload.end,
        horizon_days=payload.horizon_days,
        objective=payload.objective,
        topic_ids=payload.topic_ids,
    )


@router.post("/weekly-summary", response_model=WeeklySummaryOut, dependencies=[Depends(_ai_rate)])
def weekly_summary(
    payload: WeeklySummaryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeeklySummaryOut:
    act = activity_service.get_activity(db, user, payload.activity_id)
    return svc.weekly_summary(db, user, act, week_start=payload.week_start)
