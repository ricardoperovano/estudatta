"""Tarefas Celery de notificações. A lógica vive em app/services/notifications.py;
aqui só abrimos a sessão de banco e chamamos o serviço (idempotente, com locks por linha)."""

from __future__ import annotations

import os
import socket

from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.jobs.celery_app import celery_app
from app.services import notifications as svc

log = get_logger("jobs.notifications")


def _worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"[:64]


@celery_app.task(name="app.jobs.tasks_notifications.schedule_reminders")
def schedule_reminders() -> dict:
    """A cada 5 min: enfileira as ocorrências das próximas 24 h (chave única por ocorrência)."""
    with SessionLocal() as db:
        stats = svc.schedule_reminders(db)
    log.info("schedule_reminders.done", **stats)
    return stats


@celery_app.task(name="app.jobs.tasks_notifications.dispatch_outbox")
def dispatch_outbox() -> dict:
    """A cada 1 min: envia o que venceu, reconferindo a relevância antes de cada envio."""
    with SessionLocal() as db:
        stats = svc.dispatch_outbox(db, worker_id=_worker_id())
    log.info("dispatch_outbox.done", **stats)
    return stats


@celery_app.task(name="app.jobs.tasks_notifications.weekly_summaries")
def weekly_summaries() -> dict:
    """De hora em hora: na segunda-feira local de cada usuário, enfileira o resumo da semana."""
    with SessionLocal() as db:
        stats = svc.weekly_summaries(db)
    log.info("weekly_summaries.done", **stats)
    return stats


@celery_app.task(name="app.jobs.tasks_notifications.schedule_reengagement")
def schedule_reengagement() -> dict:
    """De hora em hora: convida quem não criou objetivo e chama de volta quem parou de estudar."""
    with SessionLocal() as db:
        stats = svc.schedule_reengagement(db)
    log.info("schedule_reengagement.done", **stats)
    return stats
