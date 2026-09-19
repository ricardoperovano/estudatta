from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, get_device_id
from app.core.timeutil import utcnow
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.sessions import (
    SessionFinish,
    SessionManual,
    SessionOut,
    SessionRevisionOut,
    SessionStart,
    SessionTransition,
    SessionUpdate,
)
from app.services import activities as activity_service
from app.services import sessions as svc

router = APIRouter(prefix="/sessions", tags=["sessions"])


def to_out(sess) -> SessionOut:
    o = SessionOut.model_validate(sess)
    o.elapsed_seconds = (
        svc.elapsed_seconds(sess)
        if sess.status in ("active", "paused")
        else int(sess.duration_seconds or 0)
    )
    o.server_time = utcnow()
    return o


@router.get("/active", response_model=SessionOut | None)
def active(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SessionOut | None:
    s = svc.active_session(db, user)
    return to_out(s) if s else None


@router.post("/start", response_model=SessionOut, status_code=201)
def start(
    payload: SessionStart,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    device_id: str | None = Depends(get_device_id),
) -> SessionOut:
    act = activity_service.get_activity(db, user, payload.activity_id)
    sess, _ = svc.start_session(
        db,
        user,
        act,
        kind=payload.kind,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        material_id=payload.material_id,
        planned_task_id=payload.planned_task_id,
        note=payload.note,
        pomodoro_config=payload.pomodoro_config,
        client_uuid=payload.client_uuid,
        device_id=device_id,
        started_at=payload.started_at,
        study_type=payload.study_type,
    )
    db.commit()
    db.refresh(sess)
    return to_out(sess)


@router.post("/manual", response_model=SessionOut, status_code=201)
def manual(
    payload: SessionManual,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    device_id: str | None = Depends(get_device_id),
) -> SessionOut:
    act = activity_service.get_activity(db, user, payload.activity_id)
    sess, _ = svc.manual_session(
        db,
        user,
        act,
        duration_seconds=payload.duration_seconds,
        local_date=payload.local_date,
        start_time=payload.start_time,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        material_id=payload.material_id,
        planned_task_id=payload.planned_task_id,
        note=payload.note,
        page_from=payload.page_from,
        page_to=payload.page_to,
        study_type=payload.study_type,
        questions_total=payload.questions_total,
        questions_correct=payload.questions_correct,
        client_uuid=payload.client_uuid,
        device_id=device_id,
    )
    db.commit()
    db.refresh(sess)
    return to_out(sess)


@router.get("", response_model=list[SessionOut])
def list_sessions(
    activity_id: UUID | None = None,
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SessionOut]:
    return [
        to_out(s)
        for s in svc.list_sessions(
            db, user, activity_id=activity_id, start=start, end=end, limit=limit, offset=offset
        )
    ]


@router.get("/{session_id}", response_model=SessionOut)
def get_one(
    session_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SessionOut:
    return to_out(svc.get_session(db, user, session_id))


@router.get("/{session_id}/revisions", response_model=list[SessionRevisionOut])
def revisions(
    session_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SessionRevisionOut]:
    s = svc.get_session(db, user, session_id)
    return [SessionRevisionOut.model_validate(r) for r in s.revisions]


@router.post("/{session_id}/pause", response_model=SessionOut)
def pause(
    session_id: UUID,
    payload: SessionTransition | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionOut:
    s = svc.get_session(db, user, session_id)
    p = payload or SessionTransition()
    svc.pause_session(db, s, at=p.at, expected_version=p.expected_version)
    db.commit()
    return to_out(svc.get_session(db, user, session_id))


@router.post("/{session_id}/resume", response_model=SessionOut)
def resume(
    session_id: UUID,
    payload: SessionTransition | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionOut:
    s = svc.get_session(db, user, session_id)
    p = payload or SessionTransition()
    svc.resume_session(db, s, at=p.at, expected_version=p.expected_version)
    db.commit()
    return to_out(svc.get_session(db, user, session_id))


@router.post("/{session_id}/finish", response_model=SessionOut)
def finish(
    session_id: UUID,
    payload: SessionFinish | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionOut:
    s = svc.get_session(db, user, session_id)
    p = payload or SessionFinish()
    svc.finish_session(
        db,
        user,
        s,
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
    db.commit()
    return to_out(svc.get_session(db, user, session_id))


@router.post("/{session_id}/discard", response_model=SessionOut)
def discard(
    session_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SessionOut:
    s = svc.get_session(db, user, session_id)
    svc.discard_session(db, user, s)
    db.commit()
    return to_out(svc.get_session(db, user, session_id))


@router.patch("/{session_id}", response_model=SessionOut)
def update(
    session_id: UUID,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SessionOut:
    s = svc.get_session(db, user, session_id)
    svc.update_session(
        db,
        user,
        s,
        duration_seconds=payload.duration_seconds,
        local_date=payload.local_date,
        start_time=payload.start_time,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        material_id=payload.material_id,
        note=payload.note,
        page_from=payload.page_from,
        page_to=payload.page_to,
        study_type=payload.study_type,
        questions_total=payload.questions_total,
        questions_correct=payload.questions_correct,
        clear_questions=payload.clear_questions,
        reason=payload.reason,
        expected_version=payload.expected_version,
        resolve_review=payload.resolve_review,
    )
    db.commit()
    return to_out(svc.get_session(db, user, session_id))


@router.delete("/{session_id}", response_model=OkResponse)
def delete(
    session_id: UUID,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    s = svc.get_session(db, user, session_id)
    svc.delete_session(db, user, s, reason=reason)
    db.commit()
    return OkResponse(message="Sessão excluída. O saldo foi recalculado.")
