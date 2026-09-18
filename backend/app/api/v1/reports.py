from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.api.v1.sessions import to_out as session_out
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.timeutil import today_in
from app.models.user import User
from app.schemas.reports import ContentReportOut, Period, ReportSessionOut, SummaryOut
from app.services import activities as activity_service
from app.services import reports as svc

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=SummaryOut)
def summary(
    period: Period = "week",
    on: date | None = Query(default=None, alias="date"),
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SummaryOut:
    """Resumo do dia/semana/mês que contém `date` (padrão: hoje no fuso do usuário)."""
    on = on or today_in(user.timezone)
    return SummaryOut(**svc.summary(db, user, period=period, on=on, activity_id=activity_id))


@router.get("/sessions", response_model=list[ReportSessionOut])
def sessions(
    start: date | None = None,
    end: date | None = None,
    activity_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ReportSessionOut]:
    """Histórico editável (mesmos campos de /sessions) com títulos de objetivo/matéria/tópico."""
    rows, titles = svc.list_sessions(
        db, user, start=start, end=end, activity_id=activity_id, limit=limit, offset=offset
    )
    out = []
    for s in rows:
        base = session_out(s)
        out.append(
            ReportSessionOut(
                **base.model_dump(),
                activity_title=titles["activity"].get(s.activity_id),
                subject_title=titles["subject"].get(s.subject_id) if s.subject_id else None,
                topic_title=titles["topic"].get(s.topic_id) if s.topic_id else None,
                material_title=titles["material"].get(s.material_id) if s.material_id else None,
            )
        )
    return out


@router.get("/export.csv")
def export_csv(
    start: date,
    end: date,
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """CSV do período (separador `;`, BOM UTF-8): uma linha por sessão e dia local."""
    content = svc.export_csv(db, user, start=start, end=end, activity_id=activity_id)
    name = f"estudatta-{start.isoformat()}-{end.isoformat()}.csv"
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={name}"},
    )


@router.get("/content", response_model=ContentReportOut)
def content(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ContentReportOut:
    """Progresso de tópicos e tarefas por matéria (métrica separada do tempo)."""
    act = activity_service.get_activity(db, user, activity_id)
    return ContentReportOut(**svc.content_report(db, user, act))
