"""Conteúdo: matérias e tópicos em árvore.

Regra do produto: concluir um tópico NÃO lança minutos e iniciar uma sessão NÃO conclui
tópico. O progresso de conteúdo (tópicos concluídos/total) é uma métrica distinta do tempo;
o tempo por matéria/tópico exposto aqui vem só de sessões aceitas no saldo.
"""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, ValidationFailed
from app.core.timeutil import utcnow
from app.models.activity import Activity
from app.models.content import Material, MaterialTopic, Subject, Topic
from app.models.session import SessionDayAllocation, StudySession
from app.models.user import User

MAX_DEPTH = 3
TOPIC_STATUSES = ("not_started", "in_progress", "done")


# --- Leitura ---------------------------------------------------------------


def get_subject(db: Session, user: User, subject_id: uuid.UUID) -> Subject:
    s = db.get(Subject, subject_id)
    if s is None or s.user_id != user.id or s.archived_at is not None:
        raise NotFound("Matéria não encontrada.")
    return s


def get_topic(db: Session, user: User, topic_id: uuid.UUID) -> Topic:
    t = db.get(Topic, topic_id)
    if t is None or t.user_id != user.id:
        raise NotFound("Tópico não encontrado.")
    return t


def list_subjects(db: Session, user: User, act: Activity) -> list[Subject]:
    return list(
        db.execute(
            select(Subject)
            .where(
                Subject.user_id == user.id,
                Subject.activity_id == act.id,
                Subject.archived_at.is_(None),
            )
            .order_by(Subject.sort_order, Subject.created_at)
        ).scalars()
    )


def list_topics(db: Session, user: User, subject_ids: list[uuid.UUID]) -> list[Topic]:
    if not subject_ids:
        return []
    return list(
        db.execute(
            select(Topic)
            .where(Topic.user_id == user.id, Topic.subject_id.in_(subject_ids))
            .order_by(Topic.sort_order, Topic.created_at)
        ).scalars()
    )


# --- Matérias --------------------------------------------------------------


def create_subject(
    db: Session,
    user: User,
    act: Activity,
    *,
    title: str,
    description: str | None = None,
    color: str | None = None,
) -> Subject:
    n = db.execute(
        select(func.count())
        .select_from(Subject)
        .where(Subject.activity_id == act.id, Subject.archived_at.is_(None))
    ).scalar_one()
    s = Subject(
        user_id=user.id,
        activity_id=act.id,
        title=title.strip()[:160],
        description=description,
        color=color,
        sort_order=int(n),
    )
    db.add(s)
    db.flush()
    return s


def update_subject(db: Session, subject: Subject, fields: dict) -> Subject:
    for k in ("title", "description", "color"):
        if k in fields:
            v = fields[k]
            setattr(subject, k, v.strip()[:160] if (k == "title" and v) else v)
    db.flush()
    return subject


def _delete_topics(db: Session, topics: list[Topic]) -> None:
    """Apaga tópicos dos mais profundos para os mais rasos (evita apagar duas vezes via FK)."""
    by_id = {t.id: t for t in topics}
    depth: dict[uuid.UUID, int] = {}

    def d(t: Topic) -> int:
        if t.id in depth:
            return depth[t.id]
        seen: set[uuid.UUID] = set()
        n = 1
        cur = t
        while cur.parent_id is not None and cur.parent_id in by_id and cur.parent_id not in seen:
            seen.add(cur.id)
            cur = by_id[cur.parent_id]
            n += 1
        depth[t.id] = n
        return n

    for t in sorted(topics, key=lambda x: -d(x)):
        db.delete(t)
    db.flush()


def delete_subject(db: Session, user: User, subject: Subject) -> None:
    _delete_topics(db, list_topics(db, user, [subject.id]))
    db.delete(subject)
    db.flush()


def reorder_subjects(
    db: Session, user: User, act: Activity, ordered_ids: list[uuid.UUID]
) -> list[Subject]:
    subjects = list_subjects(db, user, act)
    by_id = {s.id: s for s in subjects}
    if len(set(ordered_ids)) != len(ordered_ids):
        raise ValidationFailed("Há identificadores repetidos.", code="duplicate_ids")
    unknown = [str(i) for i in ordered_ids if i not in by_id]
    if unknown:
        raise ValidationFailed(
            "Alguma matéria não pertence a este objetivo.",
            code="bad_subject",
            details={"ids": unknown},
        )
    pos = 0
    for sid in ordered_ids:
        by_id[sid].sort_order = pos
        pos += 1
    for s in subjects:
        if s.id not in set(ordered_ids):
            s.sort_order = pos
            pos += 1
    db.flush()
    return list_subjects(db, user, act)


# --- Tópicos ---------------------------------------------------------------


def _depth_of(db: Session, topic: Topic) -> int:
    """1 = raiz, 2 = filho, 3 = neto."""
    n = 1
    seen = {topic.id}
    cur = topic
    while cur.parent_id is not None:
        parent = db.get(Topic, cur.parent_id)
        if parent is None or parent.id in seen:
            break
        seen.add(parent.id)
        cur = parent
        n += 1
    return n


def _height_of(db: Session, topic: Topic) -> int:
    """Altura da subárvore a partir do tópico (1 = sem filhos)."""
    children = list(db.execute(select(Topic).where(Topic.parent_id == topic.id)).scalars())
    if not children:
        return 1
    return 1 + max(_height_of(db, c) for c in children)


def _descendant_ids(db: Session, topic: Topic) -> set[uuid.UUID]:
    out: set[uuid.UUID] = set()
    frontier = [topic.id]
    while frontier:
        rows = list(db.execute(select(Topic.id).where(Topic.parent_id.in_(frontier))).scalars())
        rows = [r for r in rows if r not in out]
        out.update(rows)
        frontier = rows
    return out


def _resolve_parent(
    db: Session, subject: Subject, parent_id: uuid.UUID | None, *, moving: Topic | None = None
) -> Topic | None:
    if parent_id is None:
        return None
    parent = db.get(Topic, parent_id)
    if parent is None or parent.subject_id != subject.id or parent.user_id != subject.user_id:
        raise ValidationFailed("O tópico pai precisa ser da mesma matéria.", code="bad_parent")
    if moving is not None:
        if parent.id == moving.id or parent.id in _descendant_ids(db, moving):
            raise ValidationFailed(
                "Um tópico não pode ficar dentro de si mesmo.", code="topic_cycle"
            )
    height = _height_of(db, moving) if moving is not None else 1
    if _depth_of(db, parent) + height > MAX_DEPTH:
        raise ValidationFailed(f"Os tópicos têm no máximo {MAX_DEPTH} níveis.", code="max_depth")
    return parent


def _next_sort_order(db: Session, subject_id: uuid.UUID, parent_id: uuid.UUID | None) -> int:
    q = select(func.count()).select_from(Topic).where(Topic.subject_id == subject_id)
    q = (
        q.where(Topic.parent_id.is_(None))
        if parent_id is None
        else q.where(Topic.parent_id == parent_id)
    )
    return int(db.execute(q).scalar_one())


def create_topic(
    db: Session,
    user: User,
    subject: Subject,
    *,
    title: str,
    description: str | None = None,
    parent_id: uuid.UUID | None = None,
    estimated_minutes: int | None = None,
) -> Topic:
    parent = _resolve_parent(db, subject, parent_id)
    t = Topic(
        user_id=user.id,
        subject_id=subject.id,
        parent_id=parent.id if parent else None,
        title=title.strip()[:200],
        description=description,
        estimated_minutes=estimated_minutes,
        status="not_started",
        sort_order=_next_sort_order(db, subject.id, parent.id if parent else None),
    )
    db.add(t)
    db.flush()
    return t


def set_topic_status(topic: Topic, status: str) -> None:
    if status not in TOPIC_STATUSES:
        raise ValidationFailed("Status de tópico inválido.", code="bad_status")
    if status == "done":
        if topic.status != "done" or topic.completed_at is None:
            topic.completed_at = utcnow()
    else:
        topic.completed_at = None
    topic.status = status


def update_topic(db: Session, topic: Topic, fields: dict) -> Topic:
    if "title" in fields and fields["title"]:
        topic.title = fields["title"].strip()[:200]
    if "description" in fields:
        topic.description = fields["description"]
    if "estimated_minutes" in fields:
        topic.estimated_minutes = fields["estimated_minutes"]
    if "status" in fields and fields["status"] is not None:
        set_topic_status(topic, fields["status"])
    if fields.get("clear_parent"):
        topic.parent_id = None
        topic.sort_order = _next_sort_order(db, topic.subject_id, None)
    elif fields.get("parent_id") is not None and fields["parent_id"] != topic.parent_id:
        subject = db.get(Subject, topic.subject_id)
        parent = _resolve_parent(db, subject, fields["parent_id"], moving=topic)
        topic.parent_id = parent.id if parent else None
        topic.sort_order = _next_sort_order(db, topic.subject_id, topic.parent_id)
    db.flush()
    return topic


def delete_topic(db: Session, user: User, topic: Topic) -> None:
    ids = _descendant_ids(db, topic)
    rows = [topic]
    if ids:
        rows += list(db.execute(select(Topic).where(Topic.id.in_(ids))).scalars())
    _delete_topics(db, rows)


def reorder_topics(
    db: Session,
    user: User,
    subject: Subject,
    parent_id: uuid.UUID | None,
    ordered_ids: list[uuid.UUID],
) -> list[Topic]:
    if len(set(ordered_ids)) != len(ordered_ids):
        raise ValidationFailed("Há identificadores repetidos.", code="duplicate_ids")
    topics = {t.id: t for t in list_topics(db, user, [subject.id])}
    unknown = [str(i) for i in ordered_ids if i not in topics]
    if unknown:
        raise ValidationFailed(
            "Algum tópico não pertence a esta matéria.", code="bad_topic", details={"ids": unknown}
        )
    parent = _resolve_parent(db, subject, parent_id) if parent_id is not None else None
    for tid in ordered_ids:
        t = topics[tid]
        if t.parent_id != parent_id:
            # mover para outro pai: mesmas validações de ciclo e profundidade
            if parent_id is not None:
                _resolve_parent(db, subject, parent_id, moving=t)
            t.parent_id = parent.id if parent else None
    pos = 0
    for tid in ordered_ids:
        topics[tid].sort_order = pos
        pos += 1
    for t in topics.values():
        if t.parent_id == parent_id and t.id not in set(ordered_ids):
            t.sort_order = pos
            pos += 1
    db.flush()
    return [t for t in list_topics(db, user, [subject.id]) if t.parent_id == parent_id]


# --- Árvore e progresso ----------------------------------------------------


def _logged_by_column(db: Session, act: Activity, column) -> dict[uuid.UUID, int]:
    q = (
        select(column, func.sum(SessionDayAllocation.seconds))
        .join(StudySession, StudySession.id == SessionDayAllocation.session_id)
        .where(
            SessionDayAllocation.activity_id == act.id,
            StudySession.status == "finished",
            StudySession.counts_toward_goal.is_(True),
            StudySession.needs_review.is_(False),
            column.is_not(None),
        )
        .group_by(column)
    )
    return {k: int(v or 0) for k, v in db.execute(q).all()}


def _materials_by_topic(db: Session, topic_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[dict]]:
    out: dict[uuid.UUID, list[dict]] = defaultdict(list)
    if not topic_ids:
        return out
    q = (
        select(MaterialTopic, Material)
        .join(Material, Material.id == MaterialTopic.material_id)
        .where(MaterialTopic.topic_id.in_(topic_ids), Material.archived_at.is_(None))
        .order_by(MaterialTopic.created_at)
    )
    for link, m in db.execute(q).all():
        out[link.topic_id].append(
            {
                "id": m.id,
                "kind": m.kind,
                "title": m.title,
                "page_from": link.page_from,
                "page_to": link.page_to,
            }
        )
    return out


def topic_view(t: Topic, *, logged: int = 0, materials: list[dict] | None = None) -> dict:
    return {
        "id": t.id,
        "subject_id": t.subject_id,
        "parent_id": t.parent_id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "sort_order": t.sort_order,
        "estimated_minutes": t.estimated_minutes,
        "completed_at": t.completed_at,
        "logged_seconds": logged,
        "materials": materials or [],
        "topics": [],
    }


def subjects_tree(db: Session, user: User, act: Activity) -> list[dict]:
    subjects = list_subjects(db, user, act)
    topics = list_topics(db, user, [s.id for s in subjects])
    logged_subject = _logged_by_column(db, act, StudySession.subject_id)
    logged_topic = _logged_by_column(db, act, StudySession.topic_id)
    materials = _materials_by_topic(db, [t.id for t in topics])

    views: dict[uuid.UUID, dict] = {
        t.id: topic_view(t, logged=logged_topic.get(t.id, 0), materials=materials.get(t.id))
        for t in topics
    }
    roots: dict[uuid.UUID, list[dict]] = defaultdict(list)
    for t in topics:
        if t.parent_id is not None and t.parent_id in views:
            views[t.parent_id]["topics"].append(views[t.id])
        else:
            roots[t.subject_id].append(views[t.id])

    out = []
    for s in subjects:
        mine = [t for t in topics if t.subject_id == s.id]
        out.append(
            {
                "id": s.id,
                "activity_id": s.activity_id,
                "title": s.title,
                "description": s.description,
                "color": s.color,
                "sort_order": s.sort_order,
                "created_at": s.created_at,
                "topics_total": len(mine),
                "topics_done": sum(1 for t in mine if t.status == "done"),
                "logged_seconds": logged_subject.get(s.id, 0),
                "topics": roots.get(s.id, []),
            }
        )
    return out


def subject_view(db: Session, user: User, subject: Subject) -> dict:
    act = db.get(Activity, subject.activity_id)
    return next(s for s in subjects_tree(db, user, act) if s["id"] == subject.id)


def content_progress(db: Session, user: User, act: Activity) -> dict:
    subjects = list_subjects(db, user, act)
    topics = list_topics(db, user, [s.id for s in subjects])
    total = len(topics)
    done = sum(1 for t in topics if t.status == "done")
    in_progress = sum(1 for t in topics if t.status == "in_progress")
    return {
        "subjects_total": len(subjects),
        "topics_total": total,
        "topics_done": done,
        "topics_in_progress": in_progress,
        "percent_done": round(100.0 * done / total, 1) if total else 0.0,
    }
