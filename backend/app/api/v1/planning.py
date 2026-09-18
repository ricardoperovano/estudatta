from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.planning import TaskSeries
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.planning import (
    AutoPlanIn,
    AutoPlanOut,
    CalendarDayOut,
    CalendarOut,
    OccurrenceIn,
    RescheduleIn,
    SeriesCreate,
    SeriesOut,
    SeriesUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    WeekPrintOut,
)
from app.services import activities as activity_service
from app.services import planning as svc

router = APIRouter(tags=["planning"])


def _task_out(t) -> TaskOut:
    return TaskOut(**svc.task_view(t))


# --- Tarefas ---------------------------------------------------------------


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    start: date,
    end: date,
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskOut]:
    """Tarefas do intervalo (datas locais) com ocorrências virtuais de séries (`id` nulo)."""
    if activity_id is not None:
        activity_service.get_activity(db, user, activity_id)
    return [TaskOut(**v) for v in svc.list_tasks(db, user, start, end, activity_id=activity_id)]


@router.post("/tasks", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TaskOut:
    act = activity_service.get_activity(db, user, payload.activity_id)
    t = svc.create_task(
        db,
        user,
        act,
        title=payload.title,
        kind=payload.kind,
        local_date=payload.local_date,
        start_time=payload.start_time,
        estimated_seconds=payload.estimated_seconds,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        material_id=payload.material_id,
        page_from=payload.page_from,
        page_to=payload.page_to,
        priority=payload.priority,
        due_date=payload.due_date,
        notes=payload.notes,
        pinned=payload.pinned,
    )
    db.commit()
    return _task_out(t)


# Séries antes de /tasks/{task_id} para não capturar "series" como id.


@router.post("/tasks/series", response_model=SeriesOut, status_code=201)
def create_series(
    payload: SeriesCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SeriesOut:
    act = activity_service.get_activity(db, user, payload.activity_id)
    s = svc.create_series(
        db,
        user,
        act,
        title=payload.title,
        weekdays=payload.weekdays,
        start_date=payload.start_date,
        end_date=payload.end_date,
        start_time=payload.start_time,
        estimated_seconds=payload.estimated_seconds,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        kind=payload.kind,
    )
    audit(db, actor_id=user.id, action="series.create", target_type="series", target_id=str(s.id))
    db.commit()
    return SeriesOut(**svc.series_view(s))


@router.get("/tasks/series", response_model=list[SeriesOut])
def list_series(
    activity_id: UUID | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SeriesOut]:
    q = select(TaskSeries).where(TaskSeries.user_id == user.id)
    if activity_id is not None:
        activity_service.get_activity(db, user, activity_id)
        q = q.where(TaskSeries.activity_id == activity_id)
    if not include_inactive:
        q = q.where(TaskSeries.active.is_(True))
    rows = db.execute(q.order_by(TaskSeries.created_at)).scalars()
    return [SeriesOut(**svc.series_view(s)) for s in rows]


@router.patch("/tasks/series/{series_id}", response_model=SeriesOut)
def update_series(
    series_id: UUID,
    payload: SeriesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SeriesOut:
    s = svc.get_series(db, user, series_id)
    svc.update_series(db, user, s, payload.model_dump(exclude_unset=True))
    db.commit()
    return SeriesOut(**svc.series_view(s))


@router.delete("/tasks/series/{series_id}", response_model=OkResponse)
def delete_series(
    series_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    s = svc.get_series(db, user, series_id)
    svc.deactivate_series(db, s)
    audit(
        db, actor_id=user.id, action="series.deactivate", target_type="series", target_id=str(s.id)
    )
    db.commit()
    return OkResponse(message="Série desativada. As ocorrências já editadas continuam no plano.")


@router.post(
    "/tasks/series/{series_id}/occurrences/{local_date}", response_model=TaskOut, status_code=201
)
def materialize_occurrence(
    series_id: UUID,
    local_date: date,
    payload: OccurrenceIn | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskOut:
    """Persiste a ocorrência (series_id, data) e aplica as alterações enviadas. Idempotente."""
    s = svc.get_series(db, user, series_id)
    p = payload or OccurrenceIn()
    t = svc.materialize_occurrence(db, user, s, local_date, p.model_dump(exclude_unset=True))
    db.commit()
    return _task_out(t)


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(
    task_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TaskOut:
    return _task_out(svc.get_task(db, user, task_id))


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskOut:
    t = svc.get_task(db, user, task_id)
    fields = payload.model_dump(exclude_unset=True)
    expected = fields.pop("expected_version", None)
    svc.update_task(db, user, t, fields, expected_version=expected)
    db.commit()
    return _task_out(t)


@router.delete("/tasks/{task_id}", response_model=OkResponse)
def delete_task(
    task_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    t = svc.get_task(db, user, task_id)
    svc.delete_task(db, t)
    db.commit()
    return OkResponse(message="Tarefa excluída.")


@router.post("/tasks/{task_id}/complete", response_model=TaskOut)
def complete_task(
    task_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TaskOut:
    """Marca como concluída. Conclusão não lança minutos: tempo só entra por sessão."""
    t = svc.get_task(db, user, task_id)
    svc.set_status(t, "done")
    db.commit()
    return _task_out(t)


@router.post("/tasks/{task_id}/uncomplete", response_model=TaskOut)
def uncomplete_task(
    task_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TaskOut:
    t = svc.get_task(db, user, task_id)
    svc.set_status(t, "planned")
    db.commit()
    return _task_out(t)


@router.post("/tasks/{task_id}/skip", response_model=TaskOut)
def skip_task(
    task_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TaskOut:
    t = svc.get_task(db, user, task_id)
    svc.set_status(t, "skipped")
    db.commit()
    return _task_out(t)


@router.post("/tasks/{task_id}/reschedule", response_model=TaskOut)
def reschedule_task(
    task_id: UUID,
    payload: RescheduleIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskOut:
    """Mantém a mesma tarefa (mesmo id); guarda `original_date` na primeira reprogramação."""
    t = svc.get_task(db, user, task_id)
    svc.reschedule_task(
        db,
        t,
        local_date=payload.local_date,
        start_time=payload.start_time,
        clear_start_time=payload.clear_start_time,
        expected_version=payload.expected_version,
    )
    db.commit()
    return _task_out(t)


# --- Calendário e impressão ------------------------------------------------


@router.get("/calendar", response_model=CalendarOut)
def calendar(
    start: date,
    end: date,
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarOut:
    days = svc.calendar(db, user, start, end, activity_id=activity_id)
    return CalendarOut(start=start, end=end, days=[CalendarDayOut(**d) for d in days])


@router.get("/planning/week-print", response_model=WeekPrintOut)
def week_print(
    start: date = Query(description="Primeiro dia da semana (data local)"),
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WeekPrintOut:
    """Dados de 7 dias para a versão imprimível (o frontend renderiza para impressão/PDF)."""
    return WeekPrintOut(**svc.week_print(db, user, start, activity_id=activity_id))


# --- Auto-plano ------------------------------------------------------------


@router.post("/activities/{activity_id}/auto-plan/preview", response_model=AutoPlanOut)
def auto_plan_preview(
    activity_id: UUID,
    payload: AutoPlanIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AutoPlanOut:
    act = activity_service.get_activity(db, user, activity_id)
    return AutoPlanOut(
        **svc.auto_plan(
            db, user, act, start=payload.start, end=payload.end, task_ids=payload.task_ids
        )
    )


@router.post("/activities/{activity_id}/auto-plan", response_model=AutoPlanOut)
def auto_plan_apply(
    activity_id: UUID,
    payload: AutoPlanIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AutoPlanOut:
    act = activity_service.get_activity(db, user, activity_id)
    res = svc.auto_plan(
        db,
        user,
        act,
        start=payload.start,
        end=payload.end,
        task_ids=payload.task_ids,
        apply=True,
    )
    audit(
        db,
        actor_id=user.id,
        action="planning.auto_plan",
        target_type="activity",
        target_id=str(act.id),
        metadata={"moved": len(res["moves"]), "unplaced": len(res["unplaced"])},
    )
    db.commit()
    return AutoPlanOut(**res)
