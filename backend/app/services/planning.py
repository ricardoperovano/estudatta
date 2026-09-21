"""Planejamento: tarefas, séries recorrentes, calendário, auto-plano e semana imprimível.

Séries nunca geram cópias em massa: uma ocorrência é identificada por (series_id, local_date)
e só vira linha em `planned_tasks` quando o usuário a altera ou conclui. Nas listagens, as
datas da série sem linha persistida aparecem como ocorrências virtuais (`id` nulo).

Capacidade do dia (calendário e auto-plano):
- `available_seconds = target_seconds` — a duração estimada das tarefas de estudo OCUPA a
  disponibilidade da meta; não cria obrigação extra.
- `overload_seconds = max(0, planned_study_seconds - daily_limit_seconds)`
- `over_capacity = planned_study_seconds > daily_limit_seconds`
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.i18n import _
from app.core.timeutil import today_in, utcnow
from app.domain.balance import DayBalance, day_span
from app.domain.planner import DayCapacity, TimedTaskToPlace, auto_place_tasks_timed
from app.models.activity import Activity
from app.models.content import Material, Subject, Topic
from app.models.planning import PlannedTask, TaskSeries
from app.models.user import User
from app.services import balance as balance_service
from app.services.activities import get_activity, list_activities

MAX_RANGE_DAYS = 92
TASK_KINDS = ("study", "checklist")
TASK_STATUSES = ("planned", "done", "skipped")


# --- Utilidades ------------------------------------------------------------


def check_range(start: date, end: date) -> None:
    if end < start:
        raise ValidationFailed("A data final precisa ser igual ou depois da inicial.")
    if (end - start).days > MAX_RANGE_DAYS:
        raise ValidationFailed(
            _("Período longo demais (máximo {n} dias).", n=MAX_RANGE_DAYS), code="range_too_long"
        )


def hhmm(t: time | None) -> str | None:
    return t.strftime("%H:%M") if t else None


def _seconds_of_day(t: time) -> int:
    return t.hour * 3600 + t.minute * 60 + t.second


def get_task(db: Session, user: User, task_id: uuid.UUID) -> PlannedTask:
    t = db.get(PlannedTask, task_id)
    if t is None or t.user_id != user.id:
        raise NotFound("Tarefa não encontrada.")
    return t


def get_series(db: Session, user: User, series_id: uuid.UUID) -> TaskSeries:
    s = db.get(TaskSeries, series_id)
    if s is None or s.user_id != user.id:
        raise NotFound("Série não encontrada.")
    return s


def validate_refs(
    db: Session,
    user: User,
    act: Activity,
    *,
    subject_id: uuid.UUID | None,
    topic_id: uuid.UUID | None,
    material_id: uuid.UUID | None,
) -> None:
    """Referências cruzadas precisam ser do mesmo usuário e do mesmo objetivo."""
    if subject_id is not None:
        s = db.get(Subject, subject_id)
        if s is None or s.user_id != user.id or s.activity_id != act.id:
            raise ValidationFailed("Matéria inválida para este objetivo.", code="bad_subject")
    if topic_id is not None:
        t = db.get(Topic, topic_id)
        if t is None or t.user_id != user.id:
            raise ValidationFailed("Tópico inválido.", code="bad_topic")
        if subject_id is not None and t.subject_id != subject_id:
            raise ValidationFailed("O tópico não pertence à matéria informada.", code="bad_topic")
        ts = db.get(Subject, t.subject_id)
        if ts is None or ts.activity_id != act.id:
            raise ValidationFailed("Tópico de outro objetivo.", code="bad_topic")
    if material_id is not None:
        m = db.get(Material, material_id)
        if m is None or m.user_id != user.id:
            raise ValidationFailed("Material inválido.", code="bad_material")
        if m.activity_id is not None and m.activity_id != act.id:
            raise ValidationFailed("Material de outro objetivo.", code="bad_material")


def _check_pages(page_from: int | None, page_to: int | None) -> None:
    if page_from is not None and page_to is not None and page_to < page_from:
        raise ValidationFailed("Página final antes da inicial.", code="bad_pages")


def _check_version(task: PlannedTask, expected: int | None) -> None:
    if expected is not None and expected != task.version:
        raise Conflict(
            "A tarefa foi alterada em outro aparelho.",
            code="version_conflict",
            details={"version": task.version},
        )


# --- Visões ----------------------------------------------------------------


def task_view(t: PlannedTask) -> dict:
    return {
        "id": t.id,
        "series_id": t.series_id,
        "activity_id": t.activity_id,
        "subject_id": t.subject_id,
        "topic_id": t.topic_id,
        "material_id": t.material_id,
        "title": t.title,
        "notes": t.notes,
        "kind": t.kind,
        "local_date": t.local_date,
        "original_date": t.original_date,
        "start_time": hhmm(t.start_time),
        "estimated_seconds": t.estimated_seconds,
        "page_from": t.page_from,
        "page_to": t.page_to,
        "priority": t.priority,
        "due_date": t.due_date,
        "pinned": t.pinned,
        "status": t.status,
        "completed_at": t.completed_at,
        "recovery_seconds": t.recovery_seconds,
        "sort_order": t.sort_order,
        "version": t.version,
        "virtual": False,
    }


def virtual_view(s: TaskSeries, d: date) -> dict:
    return {
        "id": None,
        "series_id": s.id,
        "activity_id": s.activity_id,
        "subject_id": s.subject_id,
        "topic_id": s.topic_id,
        "material_id": None,
        "title": s.title,
        "notes": None,
        "kind": s.kind,
        "local_date": d,
        "original_date": None,
        "start_time": hhmm(s.start_time),
        "estimated_seconds": s.estimated_seconds,
        "page_from": None,
        "page_to": None,
        "priority": 2,
        "due_date": None,
        "pinned": False,
        "status": "planned",
        "completed_at": None,
        "recovery_seconds": 0,
        "sort_order": 0,
        "version": 0,
        "virtual": True,
    }


def series_view(s: TaskSeries) -> dict:
    return {
        "id": s.id,
        "activity_id": s.activity_id,
        "title": s.title,
        "weekdays": list(s.weekdays or []),
        "start_date": s.start_date,
        "end_date": s.end_date,
        "start_time": hhmm(s.start_time),
        "estimated_seconds": s.estimated_seconds,
        "subject_id": s.subject_id,
        "topic_id": s.topic_id,
        "kind": s.kind,
        "active": s.active,
    }


def _sort_key(v: dict) -> tuple:
    return (v["local_date"], v["start_time"] or "99:99", v["sort_order"], v["title"])


# --- Tarefas ---------------------------------------------------------------


def create_task(
    db: Session,
    user: User,
    act: Activity,
    *,
    title: str,
    kind: str = "study",
    local_date: date,
    start_time: time | None = None,
    estimated_seconds: int | None = None,
    subject_id: uuid.UUID | None = None,
    topic_id: uuid.UUID | None = None,
    material_id: uuid.UUID | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    priority: int = 2,
    due_date: date | None = None,
    notes: str | None = None,
    pinned: bool = False,
) -> PlannedTask:
    if kind not in TASK_KINDS:
        raise ValidationFailed("Tipo de tarefa inválido.", code="bad_kind")
    validate_refs(db, user, act, subject_id=subject_id, topic_id=topic_id, material_id=material_id)
    _check_pages(page_from, page_to)
    n = db.execute(
        select(PlannedTask.id).where(
            PlannedTask.activity_id == act.id, PlannedTask.local_date == local_date
        )
    ).all()
    t = PlannedTask(
        user_id=user.id,
        activity_id=act.id,
        subject_id=subject_id,
        topic_id=topic_id,
        material_id=material_id,
        title=title.strip()[:200],
        notes=notes,
        kind=kind,
        local_date=local_date,
        start_time=start_time,
        estimated_seconds=estimated_seconds,
        page_from=page_from,
        page_to=page_to,
        priority=priority,
        due_date=due_date,
        pinned=pinned,
        status="planned",
        sort_order=len(n),
        version=1,
    )
    db.add(t)
    db.flush()
    return t


def _move(db: Session, task: PlannedTask, new_date: date) -> None:
    """Muda a data mantendo a mesma tarefa; guarda `original_date` na primeira mudança."""
    if new_date == task.local_date:
        return
    if task.series_id is not None:
        clash = db.execute(
            select(PlannedTask.id).where(
                PlannedTask.series_id == task.series_id,
                PlannedTask.local_date == new_date,
                PlannedTask.id != task.id,
            )
        ).first()
        if clash is not None:
            raise Conflict(
                "Já existe uma ocorrência desta série nessa data.", code="occurrence_exists"
            )
    if task.original_date is None:
        task.original_date = task.local_date
    task.local_date = new_date


def update_task(
    db: Session, user: User, task: PlannedTask, fields: dict, *, expected_version: int | None
) -> PlannedTask:
    _check_version(task, expected_version)
    act = db.get(Activity, task.activity_id)
    subject_id = fields.get("subject_id", task.subject_id)
    topic_id = fields.get("topic_id", task.topic_id)
    material_id = fields.get("material_id", task.material_id)
    if any(k in fields for k in ("subject_id", "topic_id", "material_id")):
        validate_refs(
            db, user, act, subject_id=subject_id, topic_id=topic_id, material_id=material_id
        )
    if "kind" in fields and fields["kind"] not in TASK_KINDS:
        raise ValidationFailed("Tipo de tarefa inválido.", code="bad_kind")
    _check_pages(fields.get("page_from", task.page_from), fields.get("page_to", task.page_to))
    if fields.get("local_date") is not None:
        _move(db, task, fields["local_date"])
    nullable = (
        "estimated_seconds",
        "subject_id",
        "topic_id",
        "material_id",
        "page_from",
        "page_to",
        "due_date",
        "notes",
    )
    for k in nullable:
        if k in fields:
            setattr(task, k, fields[k])
    for k in ("kind", "priority", "pinned", "sort_order"):
        if fields.get(k) is not None:
            setattr(task, k, fields[k])
    if fields.get("title"):
        task.title = fields["title"].strip()[:200]
    if fields.get("clear_start_time"):
        task.start_time = None
    elif fields.get("start_time") is not None:
        task.start_time = fields["start_time"]
    task.version += 1
    db.flush()
    return task


def delete_task(db: Session, task: PlannedTask) -> None:
    db.delete(task)
    db.flush()


def set_status(task: PlannedTask, status: str) -> PlannedTask:
    """Conclusão de tarefa (inclusive checklist) NÃO lança minutos no saldo."""
    if status not in TASK_STATUSES:
        raise ValidationFailed("Status inválido.", code="bad_status")
    task.status = status
    task.completed_at = utcnow() if status == "done" else None
    task.version += 1
    return task


def reschedule_task(
    db: Session,
    task: PlannedTask,
    *,
    local_date: date,
    start_time: time | None = None,
    clear_start_time: bool = False,
    expected_version: int | None = None,
) -> PlannedTask:
    _check_version(task, expected_version)
    _move(db, task, local_date)
    if clear_start_time:
        task.start_time = None
    elif start_time is not None:
        task.start_time = start_time
    task.version += 1
    db.flush()
    return task


# --- Séries ----------------------------------------------------------------


def _check_weekdays(weekdays: list[int]) -> list[int]:
    days = sorted({int(d) for d in weekdays})
    if not days or any(d < 0 or d > 6 for d in days):
        raise ValidationFailed("Escolha pelo menos um dia da semana (0=segunda … 6=domingo).")
    return days


def create_series(
    db: Session,
    user: User,
    act: Activity,
    *,
    title: str,
    weekdays: list[int],
    start_date: date,
    end_date: date | None = None,
    start_time: time | None = None,
    estimated_seconds: int | None = None,
    subject_id: uuid.UUID | None = None,
    topic_id: uuid.UUID | None = None,
    kind: str = "checklist",
) -> TaskSeries:
    if kind not in TASK_KINDS:
        raise ValidationFailed("Tipo de tarefa inválido.", code="bad_kind")
    if end_date is not None and end_date < start_date:
        raise ValidationFailed("A série precisa terminar depois de começar.")
    validate_refs(db, user, act, subject_id=subject_id, topic_id=topic_id, material_id=None)
    s = TaskSeries(
        user_id=user.id,
        activity_id=act.id,
        title=title.strip()[:200],
        weekdays=_check_weekdays(weekdays),
        start_date=start_date,
        end_date=end_date,
        start_time=start_time,
        estimated_seconds=estimated_seconds,
        subject_id=subject_id,
        topic_id=topic_id,
        kind=kind,
        active=True,
    )
    db.add(s)
    db.flush()
    return s


def update_series(db: Session, user: User, series: TaskSeries, fields: dict) -> TaskSeries:
    act = db.get(Activity, series.activity_id)
    if "subject_id" in fields or "topic_id" in fields:
        validate_refs(
            db,
            user,
            act,
            subject_id=fields.get("subject_id", series.subject_id),
            topic_id=fields.get("topic_id", series.topic_id),
            material_id=None,
        )
    if fields.get("title"):
        series.title = fields["title"].strip()[:200]
    if fields.get("weekdays") is not None:
        series.weekdays = _check_weekdays(fields["weekdays"])
    if fields.get("start_date") is not None:
        series.start_date = fields["start_date"]
    if fields.get("clear_end_date"):
        series.end_date = None
    elif fields.get("end_date") is not None:
        series.end_date = fields["end_date"]
    if series.end_date is not None and series.end_date < series.start_date:
        raise ValidationFailed("A série precisa terminar depois de começar.")
    if fields.get("clear_start_time"):
        series.start_time = None
    elif fields.get("start_time") is not None:
        series.start_time = fields["start_time"]
    for k in ("estimated_seconds", "subject_id", "topic_id"):
        if k in fields:
            setattr(series, k, fields[k])
    if fields.get("kind") is not None:
        if fields["kind"] not in TASK_KINDS:
            raise ValidationFailed("Tipo de tarefa inválido.", code="bad_kind")
        series.kind = fields["kind"]
    if fields.get("active") is not None:
        series.active = bool(fields["active"])
    db.flush()
    return series


def deactivate_series(db: Session, series: TaskSeries) -> TaskSeries:
    """Desativa a série; ocorrências já persistidas ficam como tarefas normais."""
    series.active = False
    db.flush()
    return series


def series_dates(s: TaskSeries, start: date, end: date) -> list[date]:
    lo = max(start, s.start_date)
    hi = min(end, s.end_date) if s.end_date else end
    days = set(int(d) for d in (s.weekdays or []))
    return [d for d in day_span(lo, hi) if d.weekday() in days]


def _series_rows(db: Session, user: User, series_ids: list[uuid.UUID], start: date, end: date):
    if not series_ids:
        return []
    return list(
        db.execute(
            select(PlannedTask).where(
                PlannedTask.user_id == user.id,
                PlannedTask.series_id.in_(series_ids),
                (
                    ((PlannedTask.local_date >= start) & (PlannedTask.local_date <= end))
                    | ((PlannedTask.original_date >= start) & (PlannedTask.original_date <= end))
                ),
            )
        ).scalars()
    )


def materialize_occurrence(
    db: Session, user: User, series: TaskSeries, d: date, overrides: dict | None = None
) -> PlannedTask:
    """Cria (ou reaproveita) a linha real da ocorrência (series_id, d) e aplica alterações."""
    overrides = overrides or {}
    if d not in series_dates(series, d, d):
        raise ValidationFailed("Essa data não faz parte da série.", code="not_in_series")
    existing = (
        db.execute(
            select(PlannedTask).where(
                PlannedTask.series_id == series.id,
                (PlannedTask.local_date == d) | (PlannedTask.original_date == d),
            )
        )
        .scalars()
        .first()
    )
    if existing is None:
        if not series.active:
            raise ValidationFailed("Esta série foi desativada.", code="series_inactive")
        existing = PlannedTask(
            user_id=user.id,
            activity_id=series.activity_id,
            subject_id=series.subject_id,
            topic_id=series.topic_id,
            series_id=series.id,
            title=series.title,
            kind=series.kind,
            local_date=d,
            start_time=series.start_time,
            estimated_seconds=series.estimated_seconds,
            priority=2,
            status="planned",
            version=1,
        )
        db.add(existing)
        db.flush()
    if overrides.get("title"):
        existing.title = overrides["title"].strip()[:200]
    if "notes" in overrides:
        existing.notes = overrides["notes"]
    if overrides.get("clear_start_time"):
        existing.start_time = None
    elif overrides.get("start_time") is not None:
        existing.start_time = overrides["start_time"]
    if "estimated_seconds" in overrides and overrides["estimated_seconds"] is not None:
        existing.estimated_seconds = overrides["estimated_seconds"]
    if overrides.get("pinned") is not None:
        existing.pinned = bool(overrides["pinned"])
    if overrides.get("priority") is not None:
        existing.priority = int(overrides["priority"])
    if overrides.get("status") is not None:
        set_status(existing, overrides["status"])
    else:
        existing.version += 1
    db.flush()
    return existing


# --- Listagem --------------------------------------------------------------


def list_tasks(
    db: Session,
    user: User,
    start: date,
    end: date,
    *,
    activity_id: uuid.UUID | None = None,
    activity_ids: list[uuid.UUID] | None = None,
) -> list[dict]:
    """Tarefas reais do intervalo + ocorrências virtuais de séries ativas (sem duplicar)."""
    check_range(start, end)
    q = select(PlannedTask).where(
        PlannedTask.user_id == user.id,
        PlannedTask.local_date >= start,
        PlannedTask.local_date <= end,
    )
    sq = select(TaskSeries).where(
        TaskSeries.user_id == user.id,
        TaskSeries.active.is_(True),
        TaskSeries.start_date <= end,
        (TaskSeries.end_date.is_(None)) | (TaskSeries.end_date >= start),
    )
    if activity_id is not None:
        q = q.where(PlannedTask.activity_id == activity_id)
        sq = sq.where(TaskSeries.activity_id == activity_id)
    elif activity_ids is not None:
        q = q.where(PlannedTask.activity_id.in_(activity_ids))
        sq = sq.where(TaskSeries.activity_id.in_(activity_ids))
    real = list(db.execute(q).scalars())
    series = list(db.execute(sq).scalars())
    covered: set[tuple[uuid.UUID, date]] = set()
    for row in _series_rows(db, user, [s.id for s in series], start, end):
        covered.add((row.series_id, row.local_date))
        if row.original_date is not None:
            covered.add((row.series_id, row.original_date))
    views = [task_view(t) for t in real]
    for s in series:
        for d in series_dates(s, start, end):
            if (s.id, d) not in covered:
                views.append(virtual_view(s, d))
    views.sort(key=_sort_key)
    return views


# --- Calendário ------------------------------------------------------------


def _activity_day_rows(
    db: Session, act: Activity, start: date, end: date
) -> tuple[dict[date, DayBalance], date]:
    """DayBalance por data: saldo real até hoje e projeção de metas para o futuro."""
    today = today_in(act.timezone)
    rows: dict[date, DayBalance] = {}
    if start <= today:
        for d in balance_service.compute_activity_balances(
            db, act, upto=min(end, today), open_day=today
        ):
            if start <= d.local_date <= end:
                rows[d.local_date] = d
    missing = [d for d in day_span(start, end) if d not in rows]
    if missing:
        for pt in balance_service.project_targets(db, act, min(missing), max(missing)):
            if pt.local_date not in rows:
                rows[pt.local_date] = pt
    return rows, today


def _planned_study_seconds(tasks: list[dict]) -> int:
    return sum(
        int(t["estimated_seconds"] or 0)
        for t in tasks
        if t["kind"] == "study" and t["status"] == "planned"
    )


def calendar(
    db: Session, user: User, start: date, end: date, *, activity_id: uuid.UUID | None = None
) -> list[dict]:
    check_range(start, end)
    if activity_id is not None:
        acts = [get_activity(db, user, activity_id)]
    else:
        acts = [a for a in list_activities(db, user) if a.status != "archived"]
    act_ids = [a.id for a in acts]
    tasks = list_tasks(db, user, start, end, activity_ids=act_ids)
    by_date: dict[date, list[dict]] = defaultdict(list)
    for t in tasks:
        by_date[t["local_date"]].append(t)

    per_act: dict[uuid.UUID, dict[date, DayBalance]] = {}
    today_by_act: dict[uuid.UUID, date] = {}
    recovery: dict[uuid.UUID, dict[date, int]] = {}
    for act in acts:
        per_act[act.id], today_by_act[act.id] = _activity_day_rows(db, act, start, end)
        plan = balance_service.active_plan(db, act)
        recovery[act.id] = (
            {a.local_date: a.seconds for a in plan.allocations} if plan is not None else {}
        )

    user_today = today_in(user.timezone)
    out = []
    for d in day_span(start, end):
        day_tasks = by_date.get(d, [])
        entries = []
        for act in acts:
            r = per_act[act.id].get(d)
            act_tasks = [t for t in day_tasks if t["activity_id"] == act.id]
            entries.append(
                {
                    "activity_id": act.id,
                    "title": act.title,
                    "target_seconds": r.target if r else 0,
                    "logged_seconds": r.logged if r else 0,
                    "recovery_seconds": recovery[act.id].get(d, 0),
                    "planned_seconds": _planned_study_seconds(act_tasks),
                    "daily_limit_seconds": r.daily_limit if r else 0,
                    "is_rest": r.is_rest if r else False,
                    "is_paused": r.is_paused if r else False,
                    "in_range": r.in_range if r else False,
                }
            )
        target = sum(e["target_seconds"] for e in entries)
        planned = _planned_study_seconds(day_tasks)
        limit = sum(e["daily_limit_seconds"] for e in entries if e["in_range"])
        in_range = [e for e in entries if e["in_range"]]
        is_paused = bool(in_range) and all(e["is_paused"] for e in in_range)
        out.append(
            {
                "local_date": d,
                "is_today": d == user_today,
                "target_seconds": target,
                "logged_seconds": sum(e["logged_seconds"] for e in entries),
                "recovery_seconds": sum(e["recovery_seconds"] for e in entries),
                "planned_seconds": planned,
                "available_seconds": target,
                "daily_limit_seconds": limit,
                "overload_seconds": max(0, planned - limit),
                "over_capacity": planned > limit,
                "is_rest": target == 0 and not is_paused,
                "is_paused": is_paused,
                "tasks": day_tasks,
                "activities": entries,
            }
        )
    return out


def week_print(
    db: Session, user: User, start: date, *, activity_id: uuid.UUID | None = None
) -> dict:
    end = start + timedelta(days=6)
    days = calendar(db, user, start, end, activity_id=activity_id)
    if activity_id is not None:
        acts = [get_activity(db, user, activity_id)]
    else:
        acts = [a for a in list_activities(db, user) if a.status != "archived"]
    prefs = user.preferences
    return {
        "start": start,
        "end": end,
        "generated_at": utcnow(),
        "week_starts_on": prefs.week_starts_on if prefs else 0,
        "activities": [
            {"id": a.id, "title": a.title, "color": a.color, "timezone": a.timezone} for a in acts
        ],
        "days": days,
        "target_seconds": sum(d["target_seconds"] for d in days),
        "planned_seconds": sum(d["planned_seconds"] for d in days),
        "recovery_seconds": sum(d["recovery_seconds"] for d in days),
    }


# --- Auto-plano ------------------------------------------------------------


def auto_plan(
    db: Session,
    user: User,
    act: Activity,
    *,
    start: date,
    end: date,
    task_ids: list[uuid.UUID] | None = None,
    apply: bool = False,
) -> dict:
    """Distribui tarefas de estudo do objetivo dentro da disponibilidade dos dias ativos.

    Determinístico (mesma entrada → mesma saída). Não move tarefas fixadas (`pinned`),
    ocorrências de série nem tarefas concluídas/puladas; elas ocupam o dia como blocos fixos.
    Tarefas com horário só entram em dias sem conflito de horário. Dias já passados não
    recebem tarefas. O que não cabe fica em `unplaced` para decisão do usuário.

    `task_ids` restringe quais tarefas podem ser movidas (e aparecem em `moves`/`unplaced`).
    A distribuição em si é sempre calculada sobre todas as tarefas móveis do período — as
    demais não viram blocos fixos —, de modo que aplicar só parte da prévia leva cada tarefa
    escolhida exatamente para a data que a prévia completa mostrou.
    """
    check_range(start, end)
    today = today_in(act.timezone)
    base = select(PlannedTask).where(
        PlannedTask.activity_id == act.id,
        PlannedTask.user_id == user.id,
        PlannedTask.status == "planned",
        PlannedTask.kind == "study",
    )
    rows = list(
        db.execute(
            base.where(PlannedTask.local_date >= start, PlannedTask.local_date <= end)
        ).scalars()
    )
    selected: set[uuid.UUID] | None = None
    if task_ids:
        chosen = list(db.execute(base.where(PlannedTask.id.in_(task_ids))).scalars())
        selected = {t.id for t in chosen}
        missing = [str(i) for i in task_ids if i not in selected]
        if missing:
            raise NotFound(
                "Alguma tarefa não foi encontrada neste objetivo.", details={"ids": missing}
            )
        known = {t.id for t in rows}
        rows.extend(t for t in chosen if t.id not in known)  # escolhidas fora do período
    rows.sort(key=lambda t: (t.local_date, t.sort_order, t.created_at, str(t.id)))
    movable = [t for t in rows if not t.pinned and t.series_id is None]
    candidates = [t for t in movable if (t.estimated_seconds or 0) > 0]
    no_estimate = [t for t in movable if not (t.estimated_seconds or 0)]
    cand_ids = {t.id for t in candidates}

    def can_move(t: PlannedTask) -> bool:
        return selected is None or t.id in selected

    # blocos fixos no período: tudo que é estudo planejado e não é candidato (inclui séries)
    fixed_seconds: dict[date, int] = defaultdict(int)
    busy: dict[date, list[tuple[int, int]]] = defaultdict(list)
    for v in list_tasks(db, user, start, end, activity_id=act.id):
        if v["kind"] != "study" or v["status"] != "planned":
            continue
        if v["id"] is not None and v["id"] in cand_ids:
            continue
        est = int(v["estimated_seconds"] or 0)
        fixed_seconds[v["local_date"]] += est
        if v["start_time"]:
            h, m = v["start_time"].split(":")
            s0 = int(h) * 3600 + int(m) * 60
            busy[v["local_date"]].append((s0, s0 + est))
    logged = balance_service.logged_by_date(db, act.id, start, end)
    caps = []
    for t in balance_service.project_targets(db, act, start, end):
        committed = fixed_seconds.get(t.local_date, 0) + logged.get(t.local_date, 0)
        caps.append(
            DayCapacity(
                t.local_date,
                t.target,
                t.daily_limit,
                committed,
                t.target > 0 and not t.is_paused and t.local_date >= today,
            )
        )
    to_place = [
        TimedTaskToPlace(
            task_id=str(t.id),
            estimated_seconds=int(t.estimated_seconds or 0),
            priority=t.priority,
            due_date=t.due_date,
            order=i,
            start_seconds=_seconds_of_day(t.start_time) if t.start_time else None,
        )
        for i, t in enumerate(candidates)
    ]
    res = auto_place_tasks_timed(to_place, caps, busy)
    by_id = {str(t.id): t for t in candidates}

    moves = []
    for t in candidates:
        new = res.placements.get(str(t.id))
        if can_move(t) and new is not None and new != t.local_date:
            moves.append(
                {"task_id": t.id, "title": t.title, "from_date": t.local_date, "to_date": new}
            )
    unplaced = [
        {
            "task_id": by_id[i].id,
            "title": by_id[i].title,
            "local_date": by_id[i].local_date,
            "reason": "nao_coube",
        }
        for i in res.unplaced
        if can_move(by_id[i])
    ] + [
        {"task_id": t.id, "title": t.title, "local_date": t.local_date, "reason": "sem_estimativa"}
        for t in no_estimate
        if can_move(t)
    ]
    # "depois" reflete o que seria aplicado: só as tarefas escolhidas trocam de data
    before: dict[date, list[PlannedTask]] = defaultdict(list)
    after: dict[date, list[PlannedTask]] = defaultdict(list)
    for t in candidates:
        before[t.local_date].append(t)
        placed = res.placements.get(str(t.id)) if can_move(t) else None
        after[placed if placed is not None else t.local_date].append(t)
    days = []
    for c in caps:
        fixed = fixed_seconds.get(c.local_date, 0)
        days.append(
            {
                "local_date": c.local_date,
                "is_active": c.is_active,
                "target_seconds": c.target_seconds,
                "fixed_seconds": fixed,
                "before_seconds": fixed
                + sum(int(t.estimated_seconds or 0) for t in before.get(c.local_date, [])),
                "after_seconds": fixed
                + sum(int(t.estimated_seconds or 0) for t in after.get(c.local_date, [])),
                "before": [t.id for t in before.get(c.local_date, [])],
                "after": [t.id for t in after.get(c.local_date, [])],
            }
        )
    if apply:
        for m in moves:
            t = by_id[str(m["task_id"])]
            _move(db, t, m["to_date"])
            t.version += 1
        db.flush()
    return {
        "start": start,
        "end": end,
        "applied": apply,
        "moves": moves,
        "unplaced": unplaced,
        "days": days,
    }
