"""Materiais: PDF enviado (armazenamento privado), link HTTPS e referência física; vínculo com tópicos."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.errors import ValidationFailed
from app.models.content import Material
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.materials import (
    MaterialDetailOut,
    MaterialLinkIn,
    MaterialOut,
    MaterialPhysicalIn,
    MaterialTopicLinkIn,
    MaterialTopicOut,
    MaterialUpdate,
)
from app.services import activities as activity_service
from app.services import materials as svc

router = APIRouter(prefix="/materials", tags=["materials"])


def read_upload(upload: UploadFile) -> bytes:
    """Lê o arquivo enviado respeitando MAX_UPLOAD_MB antes de carregar tudo em memória."""
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    f = upload.file
    try:
        f.seek(0, 2)
        size = f.tell()
        f.seek(0)
    except (OSError, AttributeError):
        size = None
    if size is not None and size > limit:
        raise ValidationFailed(
            f"O arquivo tem {size / 1024 / 1024:.0f} MB; o limite é {settings.MAX_UPLOAD_MB} MB. Nada do seu plano foi alterado.",
            code="file_too_large",
        )
    data = f.read(limit + 1)
    if len(data) > limit:
        raise ValidationFailed(
            f"O arquivo passa de {settings.MAX_UPLOAD_MB} MB. Nada do seu plano foi alterado.",
            code="file_too_large",
        )
    return data


def _parse_optional_uuid(value: str | None, field: str) -> UUID | None:
    if value is None or value == "":
        return None
    try:
        return UUID(str(value))
    except ValueError as exc:
        raise ValidationFailed(f"Campo {field} inválido.", code="bad_uuid") from exc


def _links_out(m: Material) -> list[MaterialTopicOut]:
    out = []
    for link in m.topic_links:
        topic = link.topic
        out.append(
            MaterialTopicOut(
                topic_id=link.topic_id,
                page_from=link.page_from,
                page_to=link.page_to,
                note=link.note,
                last_position=link.last_position,
                topic_title=topic.title if topic else None,
                subject_id=topic.subject_id if topic else None,
            )
        )
    return out


def to_out(m: Material) -> MaterialOut:
    o = MaterialOut.model_validate(m)
    o.topics = _links_out(m)
    return o


def to_detail(m: Material) -> MaterialDetailOut:
    o = MaterialDetailOut.model_validate(m)
    o.topics = _links_out(m)
    o.download_url = svc.signed_download_url(m)
    o.download_expires_in = settings.SIGNED_URL_TTL_SECONDS if o.download_url else None
    return o


def _check_activity(db: Session, user: User, activity_id: UUID | None) -> None:
    if activity_id is not None:
        activity_service.get_activity(db, user, activity_id)


@router.get("", response_model=list[MaterialOut])
def list_materials(
    activity_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[MaterialOut]:
    return [to_out(m) for m in svc.list_materials(db, user, activity_id)]


@router.post("/link", response_model=MaterialDetailOut, status_code=201)
def create_link(
    payload: MaterialLinkIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> MaterialDetailOut:
    _check_activity(db, user, payload.activity_id)
    m = svc.create_link(
        db,
        user,
        activity_id=payload.activity_id,
        title=payload.title,
        url=payload.url,
        description=payload.description,
    )
    audit(db, actor_id=user.id, action="material.create", target_type="material", target_id=str(m.id), metadata={"kind": "link"})
    db.commit()
    db.refresh(m)
    return to_detail(m)


@router.post("/physical", response_model=MaterialDetailOut, status_code=201)
def create_physical(
    payload: MaterialPhysicalIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetailOut:
    _check_activity(db, user, payload.activity_id)
    m = svc.create_physical(
        db,
        user,
        activity_id=payload.activity_id,
        title=payload.title,
        description=payload.description,
        page_from=payload.page_from,
        page_to=payload.page_to,
        pages_total=payload.pages_total,
    )
    audit(db, actor_id=user.id, action="material.create", target_type="material", target_id=str(m.id), metadata={"kind": "physical"})
    db.commit()
    db.refresh(m)
    return to_detail(m)


@router.post("/upload", response_model=MaterialDetailOut, status_code=201)
def upload(
    file: UploadFile = File(...),
    activity_id: str | None = Form(None),
    title: str | None = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetailOut:
    act_id = _parse_optional_uuid(activity_id, "activity_id")
    _check_activity(db, user, act_id)
    data = read_upload(file)
    m = svc.create_pdf(
        db,
        user,
        activity_id=act_id,
        title=(title or "").strip() or None,
        file_name=file.filename or "material.pdf",
        data=data,
        declared_type=file.content_type,
    )
    audit(
        db,
        actor_id=user.id,
        action="material.create",
        target_type="material",
        target_id=str(m.id),
        metadata={"kind": "pdf", "size_bytes": m.size_bytes, "pages_total": m.pages_total},
    )
    db.commit()
    db.refresh(m)
    return to_detail(m)


@router.get("/{material_id}", response_model=MaterialDetailOut)
def get_material(
    material_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> MaterialDetailOut:
    return to_detail(svc.get_material(db, user, material_id))


@router.patch("/{material_id}", response_model=MaterialDetailOut)
def update_material(
    material_id: UUID,
    payload: MaterialUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetailOut:
    m = svc.get_material(db, user, material_id)
    _check_activity(db, user, payload.activity_id)
    svc.update_material(
        db,
        m,
        title=payload.title,
        description=payload.description,
        page_from=payload.page_from,
        page_to=payload.page_to,
        last_position=payload.last_position,
        activity_id=payload.activity_id,
        clear_activity=payload.clear_activity,
    )
    db.commit()
    db.refresh(m)
    return to_detail(m)


@router.delete("/{material_id}", response_model=OkResponse)
def delete_material(
    material_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    m = svc.get_material(db, user, material_id)
    audit(
        db,
        actor_id=user.id,
        action="material.delete",
        target_type="material",
        target_id=str(m.id),
        metadata={"kind": m.kind, "title": m.title},
    )
    svc.delete_material(db, m)
    db.commit()
    return OkResponse(message="Material removido.")


@router.post("/{material_id}/topics", response_model=MaterialDetailOut, status_code=201)
def link_topic(
    material_id: UUID,
    payload: MaterialTopicLinkIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetailOut:
    m = svc.get_material(db, user, material_id)
    svc.link_topic(
        db,
        user,
        m,
        payload.topic_id,
        page_from=payload.page_from,
        page_to=payload.page_to,
        note=payload.note,
        last_position=payload.last_position,
    )
    db.commit()
    db.refresh(m)
    return to_detail(m)


@router.delete("/{material_id}/topics/{topic_id}", response_model=MaterialDetailOut)
def unlink_topic(
    material_id: UUID,
    topic_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MaterialDetailOut:
    m = svc.get_material(db, user, material_id)
    svc.unlink_topic(db, m, topic_id)
    db.commit()
    db.refresh(m)
    return to_detail(m)
