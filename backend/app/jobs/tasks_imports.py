"""Tarefas Celery de importação (fila `imports`). A lógica vive em `app.services.imports`."""

from __future__ import annotations

import uuid

from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.jobs.celery_app import celery_app
from app.services import imports as svc

log = get_logger("jobs.imports")


@celery_app.task(
    name="app.jobs.tasks_imports.process_import", bind=True, max_retries=1, default_retry_delay=15
)
def process_import(self, import_id: str) -> dict:
    """Processa um `ImportJob`. Erros de conteúdo (PDF sem texto, limites) viram `failed`
    dentro de `svc.process`; erros de infraestrutura tentam uma vez mais e depois marcam
    `failed` com `internal`. Reexecutar um job já revisado/confirmado não faz nada."""
    iid = uuid.UUID(import_id)
    with SessionLocal() as db:
        try:
            job = svc.process(db, iid)
            db.commit()
            return {"import_id": import_id, "status": job.status, "error_code": job.error_code}
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            log.warning(
                "import.process_failed",
                import_id=import_id,
                error=type(exc).__name__,
                retries=self.request.retries,
            )
            if self.request.retries < self.max_retries:
                raise self.retry(exc=exc) from exc
            try:
                svc.mark_failed(
                    db,
                    iid,
                    "internal",
                    "Falha interna ao processar o arquivo. Tente novamente mais tarde.",
                )
                db.commit()
            except Exception:  # noqa: BLE001
                db.rollback()
            return {"import_id": import_id, "status": "failed", "error_code": "internal"}
