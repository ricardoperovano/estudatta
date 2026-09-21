"""Importação de conteúdo programático (texto, CSV, PDF) com proposta editável e confirmação."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.v1.materials import _parse_optional_uuid, read_upload
from app.core.audit import audit
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import ValidationFailed
from app.core.i18n import _
from app.core.logging import get_logger
from app.jobs.celery_app import run_now_if_eager
from app.models.content import ImportJob
from app.models.user import User
from app.schemas.imports import (
    ImportConfirm,
    ImportConfirmOut,
    ImportCreateJson,
    ImportOut,
    ImportPatch,
)
from app.services import activities as activity_service
from app.services import imports as svc

log = get_logger("imports")
router = APIRouter(prefix="/imports", tags=["imports"])

TEMPLATE_PATH = Path(__file__).resolve().parents[2] / "templates" / "import-modelo-conteudo.csv"
TRUE_VALUES = {"1", "true", "yes", "on", "sim"}


@router.get("/template.csv", include_in_schema=True)
def template_csv() -> Response:
    """Modelo de CSV (público: é um arquivo estático, sem dados do usuário)."""
    content = TEMPLATE_PATH.read_bytes()
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="modelo-conteudo.csv"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=3600",
        },
    )


def _enqueue(db: Session, job: ImportJob) -> None:
    """PDF é sempre assíncrono. Se a fila estiver indisponível, o job fica `failed` com motivo honesto."""
    from app.jobs.tasks_imports import process_import

    try:
        run_now_if_eager(process_import, str(job.id))
    except Exception as exc:  # noqa: BLE001 - broker indisponível etc.
        log.warning("imports.enqueue_failed", import_id=str(job.id), error=type(exc).__name__)
        svc.mark_failed(
            db,
            job.id,
            "queue_unavailable",
            "Não foi possível iniciar o processamento agora. Tente novamente em alguns minutos.",
        )
        db.commit()


def _create_from_json(db: Session, user: User, payload: ImportCreateJson) -> ImportJob:
    act = activity_service.get_activity(db, user, payload.activity_id)
    job = svc.create_from_content(db, user, act, source=payload.source, content=payload.content)
    audit(
        db,
        actor_id=user.id,
        action="import.create",
        target_type="import",
        target_id=str(job.id),
        metadata={"source": job.source, "size_bytes": job.size_bytes},
    )
    db.commit()
    db.refresh(job)
    return job


def _create_from_file(
    db: Session,
    user: User,
    *,
    activity_id: UUID,
    file_name: str,
    data: bytes,
    source: str | None,
    create_material: bool,
) -> ImportJob:
    act = activity_service.get_activity(db, user, activity_id)
    job = svc.create_from_file(
        db,
        user,
        act,
        file_name=file_name,
        data=data,
        source=source,
        create_material=create_material,
    )
    audit(
        db,
        actor_id=user.id,
        action="import.create",
        target_type="import",
        target_id=str(job.id),
        metadata={"source": job.source, "size_bytes": job.size_bytes, "file_name": job.file_name},
    )
    db.commit()
    if job.status == "queued":
        _enqueue(db, job)
    db.refresh(job)
    return job


@router.post("", response_model=ImportOut, status_code=201)
async def create_import(
    request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ImportOut:
    """Aceita JSON `{activity_id, source: text|csv, content}` **ou** multipart
    (`file` PDF/CSV, `activity_id`, `source?`, `create_material?`).

    Texto e CSV são processados no próprio request (rápidos e determinísticos) e já voltam
    em `needs_review`; PDF volta `queued` e é processado pelo worker."""
    ctype = (request.headers.get("content-type") or "").lower()
    if ctype.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "filename"):
            raise ValidationFailed(_("Envie o arquivo no campo 'file'."), code="missing_file")
        activity_id = _parse_optional_uuid(form.get("activity_id"), "activity_id")
        if activity_id is None:
            raise ValidationFailed("Informe o objetivo (activity_id).", code="missing_activity")
        source = (form.get("source") or None) or None
        if source not in (None, "pdf", "csv", "text"):
            raise ValidationFailed("Origem inválida.", code="bad_source")
        create_material = str(form.get("create_material") or "").strip().lower() in TRUE_VALUES
        data = await run_in_threadpool(read_upload, upload)
        job = await run_in_threadpool(
            _create_from_file,
            db,
            user,
            activity_id=activity_id,
            file_name=upload.filename or "documento",
            data=data,
            source=source,
            create_material=create_material,
        )
        return ImportOut.model_validate(job)
    try:
        body = await request.json()
    except ValueError as exc:
        raise ValidationFailed("Corpo inválido: envie JSON ou multipart.", code="bad_body") from exc
    try:
        payload = ImportCreateJson.model_validate(body)
    except ValidationError as exc:
        raise ValidationFailed("Dados inválidos.", details=exc.errors()) from exc
    job = await run_in_threadpool(_create_from_json, db, user, payload)
    return ImportOut.model_validate(job)


@router.get("", response_model=list[ImportOut])
def list_imports(
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ImportOut]:
    return [ImportOut.model_validate(j) for j in svc.list_imports(db, user, activity_id)]


@router.get("/{import_id}", response_model=ImportOut)
def get_import(
    import_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ImportOut:
    return ImportOut.model_validate(svc.get_import(db, user, import_id))


@router.patch("/{import_id}", response_model=ImportOut)
def update_import(
    import_id: UUID,
    payload: ImportPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportOut:
    job = svc.get_import(db, user, import_id)
    svc.update_proposal(db, job, payload.proposal)
    db.commit()
    db.refresh(job)
    return ImportOut.model_validate(job)


@router.post("/{import_id}/confirm", response_model=ImportConfirmOut)
def confirm_import(
    import_id: UUID,
    payload: ImportConfirm | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportConfirmOut:
    job = svc.get_import(db, user, import_id)
    proposal = payload.proposal if payload else None
    job, created = svc.confirm(db, user, job, proposal)
    audit(
        db,
        actor_id=user.id,
        action="import.confirm",
        target_type="import",
        target_id=str(job.id),
        metadata=created,
    )
    db.commit()
    db.refresh(job)
    return ImportConfirmOut(import_job=ImportOut.model_validate(job), **created)


@router.post("/{import_id}/cancel", response_model=ImportOut)
def cancel_import(
    import_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ImportOut:
    job = svc.get_import(db, user, import_id)
    svc.cancel(db, job)
    audit(db, actor_id=user.id, action="import.cancel", target_type="import", target_id=str(job.id))
    db.commit()
    db.refresh(job)
    return ImportOut.model_validate(job)
