from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.activities import to_out
from app.api.v1.sessions import to_out as session_out
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.activities import ActivityOut, PauseOut, TodaySummaryOut
from app.schemas.sessions import SessionOut
from app.services.dashboard import today_view

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class AgendaItem(BaseModel):
    id: UUID
    activity_id: UUID
    title: str
    kind: str
    start_time: str | None
    estimated_seconds: int | None
    recovery_seconds: int
    status: str
    subject_id: UUID | None
    topic_id: UUID | None
    material_id: UUID | None
    page_from: int | None
    page_to: int | None
    completed_at: datetime | None


class TodayCard(BaseModel):
    activity: ActivityOut
    local_date: date
    summary: TodaySummaryOut | None
    next_step: str
    has_recovery_plan: bool
    auto_suggestion: dict[str, int]
    streak_current: int
    streak_best: int
    week_logged: int
    week_target: int
    week_days_with_log: int
    pause: PauseOut | None
    checklist: dict | None


class TodayOut(BaseModel):
    date: date
    cards: list[TodayCard]
    agenda: list[AgendaItem]
    active_session: SessionOut | None
    server_time: datetime


@router.get("/today", response_model=TodayOut)
def today(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TodayOut:
    from app.core.timeutil import utcnow

    v = today_view(db, user)
    cards = []
    for c in v["cards"]:
        s = c["summary"]
        cards.append(
            TodayCard(
                activity=to_out(c["activity"]),
                local_date=c["local_date"],
                summary=TodaySummaryOut(**{**s.__dict__, "next_step_seconds": s.next_step_seconds})
                if s
                else None,
                next_step=c["next_step"],
                has_recovery_plan=c["has_recovery_plan"],
                auto_suggestion=c["auto_suggestion"],
                streak_current=c["streak_current"],
                streak_best=c["streak_best"],
                week_logged=c["week_logged"],
                week_target=c["week_target"],
                week_days_with_log=c["week_days_with_log"],
                pause=PauseOut.model_validate(c["pause"]) if c["pause"] else None,
                checklist=c["checklist"],
            )
        )
    agenda = [
        AgendaItem(
            id=t.id,
            activity_id=t.activity_id,
            title=t.title,
            kind=t.kind,
            start_time=t.start_time.strftime("%H:%M") if t.start_time else None,
            estimated_seconds=t.estimated_seconds,
            recovery_seconds=t.recovery_seconds,
            status=t.status,
            subject_id=t.subject_id,
            topic_id=t.topic_id,
            material_id=t.material_id,
            page_from=t.page_from,
            page_to=t.page_to,
            completed_at=t.completed_at,
        )
        for t in v["agenda"]
    ]
    return TodayOut(
        date=v["date"],
        cards=cards,
        agenda=agenda,
        active_session=session_out(v["active_session"]) if v["active_session"] else None,
        server_time=utcnow(),
    )
