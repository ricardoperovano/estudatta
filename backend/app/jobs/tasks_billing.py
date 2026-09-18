"""Tarefas Celery de cobrança: reconciliação periódica com o provedor (a cada 6h no beat)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.integrations.mercadopago import BillingProvider
from app.jobs.celery_app import celery_app
from app.services import billing as billing_service

log = get_logger("jobs.billing")


def run_reconciliation(
    db: Session, *, provider: BillingProvider | None = None, now: datetime | None = None
) -> dict:
    """Executa a reconciliação e faz commit. Chamável diretamente (admin/testes) sem Redis."""
    try:
        summary = billing_service.reconcile_subscriptions(db, provider=provider, now=now)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return summary


@celery_app.task(name="app.jobs.tasks_billing.reconcile_subscriptions")
def reconcile_subscriptions() -> dict:
    """Idempotente: reexecutar não duplica transições nem notificações."""
    with SessionLocal() as db:
        summary = run_reconciliation(db)
    log.info("billing.reconcile", **summary)
    return summary
