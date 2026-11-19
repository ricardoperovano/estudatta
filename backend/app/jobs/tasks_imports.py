"""Tarefas Celery de importação (fila `imports`). A lógica vive em `app.services.imports`."""

from __future__ import annotations

import uuid

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.jobs.celery_app import celery_app
from app.services import imports as svc
from app.services.ocr import OcrBusy

log = get_logger("jobs.imports")

# O OCR lê um arquivo por vez: quem chega com outro em andamento volta para a fila e tenta de
# novo, sem segurar um processo do worker esperando (os lembretes usam os mesmos processos).
OCR_RETRY_SECONDS = 20
OCR_MAX_RETRIES = 45  # 15 minutos de espera no total
# com OCR ligado a tarefa pode levar a extração normal mais a leitura das imagens
_OCR_EXTRA = settings.OCR_TIMEOUT_SECONDS if settings.OCR_ENABLED else 0


@celery_app.task(
    name="app.jobs.tasks_imports.process_import",
    bind=True,
    max_retries=1,
    default_retry_delay=15,
    soft_time_limit=settings.PDF_EXTRACTION_TIMEOUT_SECONDS + _OCR_EXTRA + 30,
    time_limit=settings.PDF_EXTRACTION_TIMEOUT_SECONDS + _OCR_EXTRA + 60,
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
        except OcrBusy as exc:
            db.rollback()
            if self.request.retries >= OCR_MAX_RETRIES:
                svc.mark_failed(
                    db,
                    iid,
                    "ocr_busy",
                    "A leitura de arquivos digitalizados está ocupada há muito tempo. Tente de novo mais tarde.",
                )
                db.commit()
                return {"import_id": import_id, "status": "failed", "error_code": "ocr_busy"}
            svc.requeue(db, iid)
            db.commit()
            raise self.retry(
                exc=exc, countdown=OCR_RETRY_SECONDS, max_retries=OCR_MAX_RETRIES
            ) from exc
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
