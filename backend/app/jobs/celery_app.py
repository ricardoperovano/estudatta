"""Celery: filas, beat e configuração. Tarefas ficam em app/jobs/tasks_*.py."""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery("estudatta", broker=settings.broker_url, backend=settings.result_backend)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=settings.PDF_EXTRACTION_TIMEOUT_SECONDS + 30,
    task_time_limit=settings.PDF_EXTRACTION_TIMEOUT_SECONDS + 60,
    task_default_queue="default",
    task_routes={
        "app.jobs.tasks_imports.*": {"queue": "imports"},
        "app.jobs.tasks_notifications.*": {"queue": "notifications"},
        "app.jobs.tasks_billing.*": {"queue": "default"},
        "app.jobs.tasks_maintenance.*": {"queue": "default"},
    },
    beat_schedule={
        # Jobs curtos e idempotentes: selecionam trabalho vencido por next_run_at/datas e usam locks
        "schedule-reminders": {"task": "app.jobs.tasks_notifications.schedule_reminders", "schedule": 300.0},
        "dispatch-outbox": {"task": "app.jobs.tasks_notifications.dispatch_outbox", "schedule": 60.0},
        "close-days": {"task": "app.jobs.tasks_maintenance.close_days", "schedule": 1800.0},
        "weekly-summaries": {"task": "app.jobs.tasks_notifications.weekly_summaries", "schedule": crontab(minute=0)},
        "billing-reconcile": {"task": "app.jobs.tasks_billing.reconcile_subscriptions", "schedule": crontab(minute=15, hour="*/6")},
        "cleanup": {"task": "app.jobs.tasks_maintenance.cleanup", "schedule": crontab(minute=30, hour=3)},
    },
    include=[
        "app.jobs.tasks_imports",
        "app.jobs.tasks_notifications",
        "app.jobs.tasks_billing",
        "app.jobs.tasks_maintenance",
    ],
)


def run_now_if_eager(task, *args, **kwargs):
    """Em testes (CELERY_TASK_ALWAYS_EAGER) executa imediatamente; senão enfileira."""
    if celery_app.conf.task_always_eager:
        return task.apply(args=args, kwargs=kwargs)
    return task.delay(*args, **kwargs)
