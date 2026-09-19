"""Sincronização offline: lote de operações idempotentes, cada uma em savepoint.

- Idempotência: `SyncOperation` (única por usuário/op_id). Reenviar a mesma `op_id` devolve o
  resultado gravado com `status='duplicate'`, sem reaplicar nada.
- Isolamento no lote: cada operação roda em `db.begin_nested()`; uma falha vira `rejected`/`conflict`
  e as demais seguem. Quem faz `commit` é o router.
- Conflitos preservam registros. Duas sessões cronometradas que se sobrepõem (ex.: um aparelho
  offline e outro online) **nunca** somam tempo: a segunda entra como `needs_review=True,
  review_reason='offline_conflict'`, não conta no saldo até o usuário confirmar, e a operação
  responde `conflict` com os detalhes.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta

from pydantic import BaseModel, ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ApiError, Conflict, NotFound, ValidationFailed
from app.core.logging import get_logger
from app.core.timeutil import local_datetime_to_utc, utcnow
from app.models.planning import PlannedTask
from app.models.session import SessionInterval, SessionRevision, StudySession
from app.models.system import SyncOperation
from app.models.user import User
from app.schemas.sessions import SessionOut
from app.schemas.sync import (
    FinishPayload,
    ManualPayload,
    SessionRefPayload,
    StartPayload,
    SyncOperationIn,
    TaskPayload,
)
from app.services import activities as activity_service
from app.services import sessions as session_service

log = get_logger("sync")

OFFLINE_CONFLICT = "offline_conflict"
Outcome = tuple[str, dict | None, dict | None]  # (status, result, error)


def session_result(sess: StudySession) -> dict:
    out = SessionOut.model_validate(sess)
    out.elapsed_seconds = (
        session_service.elapsed_seconds(sess)
        if sess.status in ("active", "paused")
        else int(sess.duration_seconds or 0)
    )
    return out.model_dump(mode="json")


def _parse[T: BaseModel](model: type[T], payload: dict) -> T:
    try:
        return model.model_validate(payload or {})
    except ValidationError as exc:
        raise ValidationFailed(
            "Dados da operação inválidos.",
            code="bad_payload",
            details=exc.errors(include_url=False, include_context=False, include_input=False),
        ) from exc


def _error(exc: ApiError) -> dict:
    return {"code": exc.code, "message": exc.message, "details": exc.details}


def _overlap_error(sess: StudySession, other: StudySession | None) -> dict:
    details: dict = {
        "session_id": str(sess.id),
        "needs_review": True,
        "review_reason": OFFLINE_CONFLICT,
    }
    if other is not None:
        details.update(
            overlaps_with=str(other.id),
            other_activity_id=str(other.activity_id),
            other_device_id=other.device_id,
        )
    return {
        "code": "overlap",
        "message": "Esse horário se sobrepõe a outra sessão registrada. O registro foi guardado "
        "para revisão e não conta no saldo até você confirmar a duração.",
        "details": details,
    }


def _resolve_session(db: Session, user: User, ref: SessionRefPayload) -> StudySession:
    q = (
        select(StudySession)
        .options(selectinload(StudySession.intervals))
        .where(StudySession.user_id == user.id)
    )
    if ref.session_id is not None:
        q = q.where(StudySession.id == ref.session_id)
    elif ref.client_uuid is not None:
        q = q.where(StudySession.client_uuid == ref.client_uuid)
    else:
        raise ValidationFailed("Informe session_id ou client_uuid.", code="missing_session_ref")
    sess = db.execute(q).scalar_one_or_none()
    if sess is None:
        raise NotFound(
            "Sessão não encontrada neste servidor. Reenvie como registro manual.",
            code="session_not_found",
            details={"resubmit_as": "session.manual"},
        )
    return sess


def _flag_offline_conflict(
    db: Session, user: User, sess: StudySession, other: StudySession
) -> None:
    before = {"needs_review": sess.needs_review, "review_reason": sess.review_reason}
    sess.needs_review = True
    sess.review_reason = OFFLINE_CONFLICT
    sess.version += 1
    db.flush()
    db.add(
        SessionRevision(
            session_id=sess.id,
            user_id=user.id,
            action="update",
            before=before,
            after={"needs_review": True, "review_reason": OFFLINE_CONFLICT},
            reason=f"Sobreposição com a sessão {other.id} registrada em outro aparelho",
            created_at=utcnow(),
        )
    )
    db.flush()


# --- Operações ------------------------------------------------------------------


def _op_manual(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    p = _parse(ManualPayload, op.payload)
    act = activity_service.get_activity(db, user, p.activity_id)
    common = dict(
        duration_seconds=p.duration_seconds,
        local_date=p.local_date,
        subject_id=p.subject_id,
        topic_id=p.topic_id,
        material_id=p.material_id,
        planned_task_id=p.planned_task_id,
        note=p.note,
        page_from=p.page_from,
        page_to=p.page_to,
        study_type=p.study_type,
        questions_total=p.questions_total,
        questions_correct=p.questions_correct,
        client_uuid=op.op_id,
        device_id=device_id,
    )
    other = None
    start = end = None
    if p.start_time is not None:
        start = local_datetime_to_utc(p.local_date, p.start_time, act.timezone)
        end = start + timedelta(seconds=p.duration_seconds)
        if end > utcnow() + session_service.MAX_CLOCK_SKEW:
            raise ValidationFailed("O horário informado termina no futuro.", code="future_time")
        other = session_service.find_overlap(db, user, start, end)
    if other is None:
        sess, _ = session_service.manual_session(db, user, act, start_time=p.start_time, **common)
        if sess.needs_review and sess.review_reason == OFFLINE_CONFLICT:
            return "conflict", session_result(sess), _overlap_error(sess, None)
        return "applied", session_result(sess), None
    # Sobreposição: cria como registro por duração (validações e trilha reutilizadas) e converte
    # para sessão com horário marcada para revisão — o tempo não entra no saldo até confirmar.
    sess, created = session_service.manual_session(db, user, act, start_time=None, **common)
    if created:
        sess.entry_mode = "timed"
        sess.started_at = start
        sess.ended_at = end
        sess.local_date = None
        db.add(
            SessionInterval(
                session_id=sess.id, kind="focus", started_at=start, ended_at=end, source="client"
            )
        )
        db.flush()
        db.refresh(sess)
        session_service.reallocate_days(db, sess)
        _flag_offline_conflict(db, user, sess, other)
    db.refresh(sess)
    return "conflict", session_result(sess), _overlap_error(sess, other)


def _op_start(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    p = _parse(StartPayload, op.payload)
    act = activity_service.get_activity(db, user, p.activity_id)
    client_uuid = p.client_uuid or op.op_id
    current = session_service.active_session(db, user)
    if current is not None and current.client_uuid != client_uuid:
        raise Conflict(
            "Já existe uma sessão em andamento em outro aparelho.",
            code="session_active",
            details={
                "session_id": str(current.id),
                "activity_id": str(current.activity_id),
                "status": current.status,
                "device_id": current.device_id,
                "resubmit_as": "session.manual",
            },
        )
    sess, _ = session_service.start_session(
        db,
        user,
        act,
        kind=p.kind,
        subject_id=p.subject_id,
        topic_id=p.topic_id,
        material_id=p.material_id,
        planned_task_id=p.planned_task_id,
        note=p.note,
        pomodoro_config=p.pomodoro_config,
        client_uuid=client_uuid,
        device_id=device_id,
        started_at=p.started_at,
        study_type=p.study_type,
    )
    return "applied", session_result(sess), None


def _op_pause(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    p = _parse(SessionRefPayload, op.payload)
    sess = _resolve_session(db, user, p)
    session_service.pause_session(db, sess, at=p.at, expected_version=p.expected_version)
    return "applied", session_result(sess), None


def _op_resume(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    p = _parse(SessionRefPayload, op.payload)
    sess = _resolve_session(db, user, p)
    session_service.resume_session(db, sess, at=p.at, expected_version=p.expected_version)
    return "applied", session_result(sess), None


def _op_finish(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    p = _parse(FinishPayload, op.payload)
    sess = _resolve_session(db, user, p)
    was_finished = sess.status == "finished"
    sess = session_service.finish_session(
        db,
        user,
        sess,
        at=p.at,
        note=p.note,
        page_from=p.page_from,
        page_to=p.page_to,
        study_type=p.study_type,
        questions_total=p.questions_total,
        questions_correct=p.questions_correct,
        subject_id=p.subject_id,
        topic_id=p.topic_id,
        confirmed_duration_seconds=p.confirmed_duration_seconds,
        expected_version=p.expected_version,
    )
    if (
        not was_finished
        and sess.status == "finished"
        and sess.entry_mode == "timed"
        and sess.started_at
        and sess.ended_at
    ):
        other = session_service.find_overlap(
            db, user, sess.started_at, sess.ended_at, exclude_id=sess.id
        )
        if other is not None:
            _flag_offline_conflict(db, user, sess, other)
            db.refresh(sess)
            return "conflict", session_result(sess), _overlap_error(sess, other)
    return "applied", session_result(sess), None


def _op_discard(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    p = _parse(SessionRefPayload, op.payload)
    sess = _resolve_session(db, user, p)
    if sess.status != "discarded":
        session_service.discard_session(db, user, sess)
    return "applied", session_result(sess), None


def _task_result(task: PlannedTask) -> dict:
    return {
        "task_id": str(task.id),
        "status": task.status,
        "version": task.version,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }


def _op_task(db: Session, user: User, op: SyncOperationIn, *, done: bool) -> Outcome:
    p = _parse(TaskPayload, op.payload)
    task = db.get(PlannedTask, p.task_id)
    if task is None or task.user_id != user.id:
        raise NotFound("Tarefa não encontrada.", code="task_not_found")
    if p.expected_version is not None and p.expected_version != task.version:
        raise Conflict(
            "A tarefa foi alterada em outro aparelho.",
            code="version_conflict",
            details=_task_result(task),
        )
    target = "done" if done else "planned"
    if task.status != target:
        now = utcnow()
        task.status = target
        if done:
            client_at = p.completed_at
            task.completed_at = min(client_at, now) if client_at else now
        else:
            task.completed_at = None
        task.version += 1
        db.flush()
    return "applied", _task_result(task), None


def _op_task_complete(db, user, op, device_id) -> Outcome:
    return _op_task(db, user, op, done=True)


def _op_task_uncomplete(db, user, op, device_id) -> Outcome:
    return _op_task(db, user, op, done=False)


HANDLERS: dict[str, Callable[[Session, User, SyncOperationIn, str | None], Outcome]] = {
    "session.manual": _op_manual,
    "session.start": _op_start,
    "session.pause": _op_pause,
    "session.resume": _op_resume,
    "session.finish": _op_finish,
    "session.discard": _op_discard,
    "task.complete": _op_task_complete,
    "task.uncomplete": _op_task_uncomplete,
}


# --- Lote --------------------------------------------------------------------------


def _apply_one(db: Session, user: User, op: SyncOperationIn, device_id: str | None) -> Outcome:
    handler = HANDLERS.get(op.kind)
    if handler is None:
        return "rejected", None, {"code": "unknown_kind", "message": "Operação desconhecida."}
    try:
        with db.begin_nested():
            return handler(db, user, op, device_id)
    except Conflict as exc:
        return "conflict", None, _error(exc)
    except ApiError as exc:
        return "rejected", None, _error(exc)
    except Exception as exc:  # noqa: BLE001 - uma operação não derruba o lote
        log.warning("sync.op_failed", op_id=str(op.op_id), kind=op.kind, error=str(exc))
        return (
            "rejected",
            None,
            {"code": "internal_error", "message": "Não foi possível aplicar esta operação."},
        )


def _existing(db: Session, user: User, op_id: uuid.UUID) -> SyncOperation | None:
    return db.execute(
        select(SyncOperation).where(SyncOperation.user_id == user.id, SyncOperation.op_id == op_id)
    ).scalar_one_or_none()


def _duplicate(op_id: uuid.UUID, existing: SyncOperation) -> dict:
    stored = existing.result or {}
    return {
        "op_id": op_id,
        "status": "duplicate",
        "result": stored.get("result"),
        "error": stored.get("error"),
    }


def apply_batch(
    db: Session, user: User, *, device_id: str | None, operations: list[SyncOperationIn]
) -> list[dict]:
    results: list[dict] = []
    now = utcnow()
    for op in operations:
        existing = _existing(db, user, op.op_id)
        if existing is not None:
            results.append(_duplicate(op.op_id, existing))
            continue
        status, result, error = _apply_one(db, user, op, device_id)
        record = SyncOperation(
            user_id=user.id,
            op_id=op.op_id,
            device_id=device_id,
            kind=op.kind,
            payload=op.payload,
            result={"status": status, "result": result, "error": error},
            status=status,
            client_created_at=op.client_created_at,
            received_at=now,
        )
        try:
            with db.begin_nested():
                db.add(record)
                db.flush()
        except IntegrityError:
            # o mesmo op_id chegou em paralelo por outra requisição: devolve o que foi gravado
            existing = _existing(db, user, op.op_id)
            if existing is not None:
                results.append(_duplicate(op.op_id, existing))
                continue
            raise
        results.append({"op_id": op.op_id, "status": status, "result": result, "error": error})
    return results


def last_sync_at(db: Session, user: User, device_id: str | None = None) -> datetime | None:
    q = select(func.max(SyncOperation.received_at)).where(SyncOperation.user_id == user.id)
    if device_id:
        q = q.where(SyncOperation.device_id == device_id)
    return db.execute(q).scalar_one()
