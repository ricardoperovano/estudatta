"""Fechamento diário idempotente e limpeza."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.core.timeutil import utcnow
from app.jobs.celery_app import celery_app
from app.models.activity import Activity
from app.models.notification import NotificationOutbox
from app.models.user import AuthSession, OneTimeToken
from app.services import balance as balance_service

log = get_logger("jobs.maintenance")


@celery_app.task(name="app.jobs.tasks_maintenance.close_days")
def close_days() -> dict:
    """Materializa o ledger de todos os objetivos ativos. Reexecutar não duplica obrigação:
    a computação é determinística e o upsert é por (objetivo, data)."""
    n_act = n_rows = 0
    with SessionLocal() as db:
        for act in db.execute(select(Activity).where(Activity.status.in_(["active", "paused"]))).scalars():
            try:
                n_rows += balance_service.rebuild_ledger(db, act)
                n_act += 1
                db.commit()
            except Exception as exc:  # noqa: BLE001
                db.rollback()
                log.warning("close_days.failed", activity_id=str(act.id), error=str(exc))
    return {"activities": n_act, "rows": n_rows}


@celery_app.task(name="app.jobs.tasks_maintenance.cleanup")
def cleanup() -> dict:
    now = utcnow()
    removed = {"auth_sessions": 0, "tokens": 0, "outbox": 0}
    with SessionLocal() as db:
        for s in db.execute(select(AuthSession).where(AuthSession.expires_at < now - timedelta(days=7))).scalars():
            db.delete(s)
            removed["auth_sessions"] += 1
        for t in db.execute(select(OneTimeToken).where(OneTimeToken.expires_at < now - timedelta(days=7))).scalars():
            db.delete(t)
            removed["tokens"] += 1
        for o in db.execute(select(NotificationOutbox).where(NotificationOutbox.created_at < now - timedelta(days=90))).scalars():
            db.delete(o)
            removed["outbox"] += 1
        db.commit()
    return removed
