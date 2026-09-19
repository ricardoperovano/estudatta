from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.content import (
    ContentProgressOut,
    SubjectCreate,
    SubjectOut,
    SubjectReorder,
    SubjectUpdate,
    TopicCreate,
    TopicOut,
    TopicReorder,
    TopicUpdate,
)
from app.services import activities as activity_service
from app.services import content as svc

router = APIRouter(tags=["content"])


# --- Matérias --------------------------------------------------------------


@router.get("/activities/{activity_id}/subjects", response_model=list[SubjectOut])
def list_subjects(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SubjectOut]:
    act = activity_service.get_activity(db, user, activity_id)
    return [SubjectOut(**s) for s in svc.subjects_tree(db, user, act)]


@router.post("/activities/{activity_id}/subjects", response_model=SubjectOut, status_code=201)
def create_subject(
    activity_id: UUID,
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubjectOut:
    act = activity_service.get_activity(db, user, activity_id)
    s = svc.create_subject(
        db,
        user,
        act,
        title=payload.title,
        description=payload.description,
        color=payload.color,
        weight=payload.weight,
        difficulty=payload.difficulty,
    )
    audit(db, actor_id=user.id, action="subject.create", target_type="subject", target_id=str(s.id))
    db.commit()
    return SubjectOut(**svc.subject_view(db, user, s))


@router.get("/activities/{activity_id}/content-progress", response_model=ContentProgressOut)
def content_progress(
    activity_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ContentProgressOut:
    act = activity_service.get_activity(db, user, activity_id)
    return ContentProgressOut(**svc.content_progress(db, user, act))


@router.post("/subjects/reorder", response_model=list[SubjectOut])
def reorder_subjects(
    payload: SubjectReorder, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SubjectOut]:
    act = activity_service.get_activity(db, user, payload.activity_id)
    svc.reorder_subjects(db, user, act, payload.ordered_ids)
    db.commit()
    return [SubjectOut(**s) for s in svc.subjects_tree(db, user, act)]


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: UUID,
    payload: SubjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubjectOut:
    s = svc.get_subject(db, user, subject_id)
    svc.update_subject(db, s, payload.model_dump(exclude_unset=True))
    db.commit()
    return SubjectOut(**svc.subject_view(db, user, s))


@router.delete("/subjects/{subject_id}", response_model=OkResponse)
def delete_subject(
    subject_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    s = svc.get_subject(db, user, subject_id)
    audit(
        db,
        actor_id=user.id,
        action="subject.delete",
        target_type="subject",
        target_id=str(s.id),
        metadata={"title": s.title},
    )
    svc.delete_subject(db, user, s)
    db.commit()
    return OkResponse(message="Matéria e seus tópicos excluídos. O tempo registrado permanece.")


# --- Tópicos ---------------------------------------------------------------


@router.post("/subjects/{subject_id}/topics", response_model=TopicOut, status_code=201)
def create_topic(
    subject_id: UUID,
    payload: TopicCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TopicOut:
    s = svc.get_subject(db, user, subject_id)
    t = svc.create_topic(
        db,
        user,
        s,
        title=payload.title,
        description=payload.description,
        parent_id=payload.parent_id,
        estimated_minutes=payload.estimated_minutes,
    )
    db.commit()
    return TopicOut(**svc.topic_view(t))


@router.post("/topics/reorder", response_model=list[TopicOut])
def reorder_topics(
    payload: TopicReorder, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[TopicOut]:
    s = svc.get_subject(db, user, payload.subject_id)
    rows = svc.reorder_topics(db, user, s, payload.parent_id, payload.ordered_ids)
    db.commit()
    return [TopicOut(**svc.topic_view(t)) for t in rows]


@router.patch("/topics/{topic_id}", response_model=TopicOut)
def update_topic(
    topic_id: UUID,
    payload: TopicUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TopicOut:
    t = svc.get_topic(db, user, topic_id)
    fields = payload.model_dump(exclude_unset=True)
    svc.update_topic(db, t, fields)
    if fields.get("status") == "done":
        audit(db, actor_id=user.id, action="topic.done", target_type="topic", target_id=str(t.id))
    db.commit()
    return TopicOut(**svc.topic_view(t))


@router.delete("/topics/{topic_id}", response_model=OkResponse)
def delete_topic(
    topic_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    t = svc.get_topic(db, user, topic_id)
    audit(
        db,
        actor_id=user.id,
        action="topic.delete",
        target_type="topic",
        target_id=str(t.id),
        metadata={"title": t.title},
    )
    svc.delete_topic(db, user, t)
    db.commit()
    return OkResponse(message="Tópico excluído.")
