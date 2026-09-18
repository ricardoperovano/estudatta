"""Seed de demonstração (idempotente): reproduz o cenário dos mockups.

Usuário `demo@estudatta.com.br` com objetivo "Inglês" (60 min seg–sex, iniciado há 10 dias),
hoje com 40 min registrados às 07:00 ("Listening · unidade 4", tarefa concluída) e a tarefa
"Vocabulário · lista 12" planejada para as 19:30 (20 min); ontem sem registro, semana anterior
completa; matérias Gramática/Listening/Vocabulário com tópicos, um material (link) e tarefas
planejadas nos próximos dias ativos.

Usa apenas os services existentes (nunca SQL direto). Reexecutar não duplica: sessões usam
`client_uuid` determinístico e os demais itens são localizados por título/data.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import date, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.timeutil import local_datetime_to_utc, today_in, utcnow
from app.models.activity import Activity
from app.models.content import Material, Subject, Topic
from app.models.planning import PlannedTask
from app.models.user import User
from app.services import activities as activity_service
from app.services import auth as auth_service
from app.services import materials as materials_service
from app.services import sessions as session_service

DEMO_EMAIL = "demo@estudatta.com.br"
# E-mails usados por versões anteriores do seed. `.local` é um domínio reservado e o
# validador de e-mail do login o recusa; um usuário antigo é renomeado, nunca duplicado.
LEGACY_DEMO_EMAILS = ("demo@estudatta.local",)
DEMO_NAMESPACE = uuid.UUID("5a3f0c3e-9b1d-4f1a-8e2c-3d6b7a1f2c90")
ACTIVE_DAYS = [0, 1, 2, 3, 4]
DAILY_MINUTES = 60
DAYS_SINCE_START = 10
TODAY_MINUTES = 40
TODAY_DONE_TITLE = "Listening · unidade 4"
TODAY_DONE_TIME = time(7, 0)
TODAY_PLANNED_TITLE = "Vocabulário · lista 12"
TODAY_PLANNED_TIME = time(19, 30)
TODAY_PLANNED_MINUTES = 20

DEMO_CONTENT: list[tuple[str, list[tuple[str, list[str]]]]] = [
    (
        "Gramática",
        [
            ("Present simple", ["Afirmativa e negativa", "Perguntas"]),
            ("Past simple", ["Verbos regulares", "Verbos irregulares"]),
            ("Present perfect", []),
        ],
    ),
    (
        "Listening",
        [
            ("Podcasts curtos", []),
            ("Diálogos do dia a dia", []),
        ],
    ),
    (
        "Vocabulário",
        [
            ("Viagem", ["Aeroporto", "Hotel"]),
            ("Comida e restaurante", []),
        ],
    ),
]

DEMO_MATERIAL = {
    "title": "Guia de gramática (site)",
    "url": "https://www.englishgrammar.org/",
    "description": "Referência rápida de tempos verbais usada nas sessões de gramática.",
}


def _session_uuid(user_id: uuid.UUID, d: date) -> uuid.UUID:
    return uuid.uuid5(DEMO_NAMESPACE, f"demo-session:{user_id}:{d.isoformat()}")


def _find_demo_user(db: Session) -> User | None:
    user = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one_or_none()
    if user is not None:
        return user
    for old in LEGACY_DEMO_EMAILS:
        user = db.execute(select(User).where(User.email == old)).scalar_one_or_none()
        if user is not None:
            user.email = DEMO_EMAIL
            db.flush()
            return user
    return None


def _get_or_create_user(db: Session, password: str | None) -> tuple[User, str | None, bool]:
    user = _find_demo_user(db)
    if user is not None:
        if password:
            user.password_hash = hash_password(password)
        return user, None, False
    generated = password or secrets.token_urlsafe(12)
    user = auth_service.create_user(
        db, email=DEMO_EMAIL, password=generated, name="Demo", email_verified=True
    )
    user.onboarding_completed_at = utcnow()
    db.flush()
    return user, (generated if password is None else None), True


def _get_or_create_activity(db: Session, user: User, start: date) -> tuple[Activity, bool]:
    act = db.execute(
        select(Activity).where(Activity.user_id == user.id, Activity.title == "Inglês")
    ).scalar_one_or_none()
    if act is not None:
        return act, False
    act = activity_service.create_activity(
        db,
        user,
        title="Inglês",
        category="ingles",
        desired_outcome="Conversar com segurança em uma viagem",
        start_date=start,
        active_days=ACTIVE_DAYS,
        daily_minutes=DAILY_MINUTES,
        daily_limit_minutes=120,
        preferred_times=["19:30"],
        availability={str(d): [["19:00", "21:00"]] for d in ACTIVE_DAYS},
        color="#9184d9",
        icon="language",
    )
    return act, True


def _get_or_create_content(db: Session, user: User, act: Activity) -> tuple[list[Topic], int, int]:
    """Retorna (tópicos de nível 1 em ordem, matérias criadas, tópicos criados)."""
    n_subjects = n_topics = 0
    ordered: list[Topic] = []
    for si, (subject_title, topics) in enumerate(DEMO_CONTENT):
        subject = db.execute(
            select(Subject).where(Subject.activity_id == act.id, Subject.title == subject_title)
        ).scalar_one_or_none()
        if subject is None:
            subject = Subject(
                user_id=user.id, activity_id=act.id, title=subject_title, sort_order=si
            )
            db.add(subject)
            db.flush()
            n_subjects += 1
        for ti, (topic_title, children) in enumerate(topics):
            topic = db.execute(
                select(Topic).where(
                    Topic.subject_id == subject.id,
                    Topic.parent_id.is_(None),
                    Topic.title == topic_title,
                )
            ).scalar_one_or_none()
            if topic is None:
                topic = Topic(
                    user_id=user.id,
                    subject_id=subject.id,
                    title=topic_title,
                    sort_order=ti,
                    estimated_minutes=60,
                )
                db.add(topic)
                db.flush()
                n_topics += 1
            ordered.append(topic)
            for ci, child_title in enumerate(children):
                child = db.execute(
                    select(Topic).where(Topic.parent_id == topic.id, Topic.title == child_title)
                ).scalar_one_or_none()
                if child is None:
                    db.add(
                        Topic(
                            user_id=user.id,
                            subject_id=subject.id,
                            parent_id=topic.id,
                            title=child_title,
                            sort_order=ci,
                            estimated_minutes=30,
                        )
                    )
                    n_topics += 1
    db.flush()
    return ordered, n_subjects, n_topics


def _get_or_create_material(db: Session, user: User, act: Activity) -> tuple[Material, bool]:
    m = db.execute(
        select(Material).where(
            Material.user_id == user.id,
            Material.kind == "link",
            Material.url == DEMO_MATERIAL["url"],
        )
    ).scalar_one_or_none()
    if m is not None:
        return m, False
    m = materials_service.create_link(
        db,
        user,
        activity_id=act.id,
        title=DEMO_MATERIAL["title"],
        url=DEMO_MATERIAL["url"],
        description=DEMO_MATERIAL["description"],
    )
    m.last_position = "Unidade 4"
    db.flush()
    return m, True


def _find_subject(db: Session, act: Activity, title: str) -> Subject | None:
    return db.execute(
        select(Subject).where(Subject.activity_id == act.id, Subject.title == title)
    ).scalar_one_or_none()


def _get_or_create_task(
    db: Session, user: User, act: Activity, *, title: str, local_date: date, **fields
) -> tuple[PlannedTask, bool]:
    task = db.execute(
        select(PlannedTask).where(
            PlannedTask.activity_id == act.id,
            PlannedTask.local_date == local_date,
            PlannedTask.title == title,
        )
    ).scalar_one_or_none()
    if task is not None:
        return task, False
    task = PlannedTask(
        user_id=user.id, activity_id=act.id, title=title, kind="study", local_date=local_date
    )
    for key, value in fields.items():
        setattr(task, key, value)
    db.add(task)
    db.flush()
    return task, True


def _seed_today_tasks(
    db: Session, user: User, act: Activity, material: Material, today: date
) -> tuple[PlannedTask, int]:
    """Tela Hoje do mockup: tarefa das 07:00 concluída e a das 19:30 ainda planejada."""
    listening = _find_subject(db, act, "Listening")
    vocabulary = _find_subject(db, act, "Vocabulário")
    done, c1 = _get_or_create_task(
        db,
        user,
        act,
        title=TODAY_DONE_TITLE,
        local_date=today,
        subject_id=listening.id if listening else None,
        material_id=material.id,
        start_time=TODAY_DONE_TIME,
        estimated_seconds=TODAY_MINUTES * 60,
        sort_order=0,
    )
    if done.status != "done":
        done.status = "done"
        done.completed_at = done.completed_at or utcnow()
    _, c2 = _get_or_create_task(
        db,
        user,
        act,
        title=TODAY_PLANNED_TITLE,
        local_date=today,
        subject_id=vocabulary.id if vocabulary else None,
        start_time=TODAY_PLANNED_TIME,
        estimated_seconds=TODAY_PLANNED_MINUTES * 60,
        sort_order=1,
    )
    db.flush()
    return done, int(c1) + int(c2)


def _seed_sessions(
    db: Session,
    user: User,
    act: Activity,
    topics: list[Topic],
    start: date,
    today: date,
    today_task: PlannedTask,
) -> int:
    created = 0
    d = start
    i = 0
    yesterday = today - timedelta(days=1)
    # antes das 07:40 locais a sessão das 07:00 terminaria no futuro: vale só a duração
    ends_at = local_datetime_to_utc(today, TODAY_DONE_TIME, act.timezone) + timedelta(
        minutes=TODAY_MINUTES
    )
    today_start = TODAY_DONE_TIME if ends_at <= utcnow() else None
    while d <= today:
        # hoje sempre tem 40 min (o cenário vale em qualquer dia da semana); ontem fica
        # sem registro; os demais dias ativos têm a meta completa
        if d == today:
            _, was_created = session_service.manual_session(
                db,
                user,
                act,
                duration_seconds=TODAY_MINUTES * 60,
                local_date=d,
                start_time=today_start,
                subject_id=today_task.subject_id,
                material_id=today_task.material_id,
                planned_task_id=today_task.id,
                note=TODAY_DONE_TITLE,
                client_uuid=_session_uuid(user.id, d),
            )
            created += 1 if was_created else 0
        elif d.weekday() in ACTIVE_DAYS and d != yesterday:
            topic = topics[i % len(topics)] if topics else None
            _, was_created = session_service.manual_session(
                db,
                user,
                act,
                duration_seconds=DAILY_MINUTES * 60,
                local_date=d,
                subject_id=topic.subject_id if topic else None,
                topic_id=topic.id if topic else None,
                note="Sessão de demonstração",
                client_uuid=_session_uuid(user.id, d),
            )
            created += 1 if was_created else 0
            i += 1
        d += timedelta(days=1)
    return created


def _seed_tasks(db: Session, user: User, act: Activity, topics: list[Topic], today: date) -> int:
    """Próximos 4 dias ativos (depois de hoje) com um bloco de 60 min às 19:30."""
    created = 0
    d = today + timedelta(days=1)
    placed = 0
    i = 2
    while placed < 4:
        if d.weekday() in ACTIVE_DAYS:
            topic = topics[i % len(topics)] if topics else None
            _, was_created = _get_or_create_task(
                db,
                user,
                act,
                title=topic.title if topic else "Sessão de estudo",
                local_date=d,
                subject_id=topic.subject_id if topic else None,
                topic_id=topic.id if topic else None,
                start_time=TODAY_PLANNED_TIME,
                estimated_seconds=DAILY_MINUTES * 60,
                sort_order=placed,
            )
            created += 1 if was_created else 0
            placed += 1
            i += 1
        d += timedelta(days=1)
    db.flush()
    return created


def seed_demo(db: Session, *, password: str | None = None) -> dict:
    """Cria/atualiza o cenário de demonstração. Idempotente. Quem chama faz o commit."""
    user, generated_password, user_created = _get_or_create_user(db, password)
    today = today_in(user.timezone)
    start = today - timedelta(days=DAYS_SINCE_START)
    act, act_created = _get_or_create_activity(db, user, start)
    topics, n_subjects, n_topics = _get_or_create_content(db, user, act)
    if topics:
        topics[0].status = "done"
        topics[0].completed_at = topics[0].completed_at or utcnow()
        topics[1].status = "in_progress"
    material, material_created = _get_or_create_material(db, user, act)
    today_task, n_today_tasks = _seed_today_tasks(db, user, act, material, today)
    n_sessions = _seed_sessions(db, user, act, topics, start, today, today_task)
    n_tasks = n_today_tasks + _seed_tasks(db, user, act, topics, today)
    db.flush()
    return {
        "email": DEMO_EMAIL,
        "user_id": str(user.id),
        "user_created": user_created,
        "password": generated_password,
        "activity_id": str(act.id),
        "activity_created": act_created,
        "subjects_created": n_subjects,
        "topics_created": n_topics,
        "material_id": str(material.id),
        "material_created": material_created,
        "sessions_created": n_sessions,
        "tasks_created": n_tasks,
        "today": today.isoformat(),
        "start_date": start.isoformat(),
    }
