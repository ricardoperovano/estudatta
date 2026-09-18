"""Materiais: PDF enviado, link HTTPS ou referência física; vínculo com tópicos."""

from __future__ import annotations

import re
import uuid
from urllib.parse import urlparse

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.errors import NotFound, PlanLimit, ValidationFailed
from app.core.timeutil import utcnow
from app.integrations.storage import get_storage
from app.models.content import Material, MaterialTopic, Topic
from app.models.user import User
from app.services.plans import get_entitlements

PDF_MAGIC = b"%PDF-"
ALLOWED_UPLOAD_TYPES = {"application/pdf"}
# Caminho local (Windows `C:\...`/`C:/...`, UNC `\\servidor`, POSIX `/home/...`, `~/...`,
# `file:`): não é acessível de outros aparelhos e o servidor nunca tenta abri-lo.
LOCAL_PATH_RE = re.compile(r"^([a-zA-Z]:[\\/]|\\\\|/|~[\\/]|file:)", re.IGNORECASE)


def get_material(db: Session, user: User, material_id: uuid.UUID) -> Material:
    m = db.get(Material, material_id)
    if m is None or m.user_id != user.id:
        raise NotFound("Material não encontrado.")
    return m


def list_materials(db: Session, user: User, activity_id: uuid.UUID | None = None) -> list[Material]:
    q = (
        select(Material)
        .options(selectinload(Material.topic_links).selectinload(MaterialTopic.topic))
        .where(Material.user_id == user.id, Material.archived_at.is_(None))
    )
    if activity_id:
        q = q.where(Material.activity_id == activity_id)
    return list(db.execute(q.order_by(Material.created_at.desc())).scalars())


def update_material(
    db: Session,
    m: Material,
    *,
    title: str | None = None,
    description: str | None = None,
    page_from: int | None = None,
    page_to: int | None = None,
    last_position: str | None = None,
    activity_id: uuid.UUID | None = None,
    clear_activity: bool = False,
) -> Material:
    if title is not None:
        m.title = title.strip()[:200]
    if description is not None:
        m.description = description
    if page_from is not None:
        m.page_from = page_from
    if page_to is not None:
        m.page_to = page_to
    if m.page_from is not None and m.page_to is not None and m.page_to < m.page_from:
        raise ValidationFailed("Página final antes da inicial.", code="bad_pages")
    if last_position is not None:
        m.last_position = last_position.strip()[:120] or None
    if activity_id is not None:
        m.activity_id = activity_id
    if clear_activity:
        m.activity_id = None
    db.flush()
    return m


def validate_link(url: str) -> str:
    url = url.strip()
    if LOCAL_PATH_RE.match(url):
        raise ValidationFailed(
            "Isso é um caminho do seu computador, não um link acessível de outros aparelhos. Envie o arquivo ou informe um link https://.",
            code="local_path",
        )
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValidationFailed("Informe um link começando com https://.", code="bad_url")
    if len(url) > 2000:
        raise ValidationFailed("Link longo demais.", code="bad_url")
    return url


def _check_quota(db: Session, user: User, extra_bytes: int) -> None:
    ent = get_entitlements(db, user.id)
    max_items = ent.limit("max_materials")
    if max_items is not None:
        n = db.execute(
            select(func.count())
            .select_from(Material)
            .where(Material.user_id == user.id, Material.archived_at.is_(None))
        ).scalar_one()
        if n >= int(max_items):
            raise PlanLimit(f"Seu plano permite até {max_items} materiais.", code="materials_limit")
    quota_mb = ent.limit("materials_storage_mb")
    if quota_mb is not None and extra_bytes > 0:
        used = db.execute(
            select(func.coalesce(func.sum(Material.size_bytes), 0)).where(
                Material.user_id == user.id
            )
        ).scalar_one()
        if int(used) + extra_bytes > int(quota_mb) * 1024 * 1024:
            raise PlanLimit(
                f"Cota de armazenamento ({quota_mb} MB) atingida.", code="storage_quota"
            )


def create_link(
    db: Session, user: User, *, activity_id, title: str, url: str, description: str | None = None
) -> Material:
    _check_quota(db, user, 0)
    m = Material(
        user_id=user.id,
        activity_id=activity_id,
        kind="link",
        title=title.strip()[:200],
        url=validate_link(url),
        description=description,
    )
    db.add(m)
    db.flush()
    return m


def create_physical(
    db: Session,
    user: User,
    *,
    activity_id,
    title: str,
    description: str | None,
    page_from: int | None,
    page_to: int | None,
    pages_total: int | None,
) -> Material:
    _check_quota(db, user, 0)
    m = Material(
        user_id=user.id,
        activity_id=activity_id,
        kind="physical",
        title=title.strip()[:200],
        description=description,
        page_from=page_from,
        page_to=page_to,
        pages_total=pages_total,
    )
    db.add(m)
    db.flush()
    return m


def sniff_pdf(data: bytes) -> bool:
    return data[:5] == PDF_MAGIC


def create_pdf(
    db: Session,
    user: User,
    *,
    activity_id,
    title: str | None,
    file_name: str,
    data: bytes,
    declared_type: str | None,
) -> Material:
    size = len(data)
    if size == 0:
        raise ValidationFailed("Arquivo vazio.", code="empty_file")
    if size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationFailed(
            f"O arquivo tem {size / 1024 / 1024:.0f} MB; o limite é {settings.MAX_UPLOAD_MB} MB. Nada do seu plano foi alterado.",
            code="file_too_large",
        )
    if not sniff_pdf(data):
        raise ValidationFailed(
            "O arquivo não é um PDF válido. Envie um PDF ou adicione só o link.", code="not_pdf"
        )
    _check_quota(db, user, size)
    pages = None
    try:
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data))
        pages = len(reader.pages)
    except Exception:  # noqa: BLE001
        pages = None
    if pages is not None and pages > settings.MAX_PDF_PAGES:
        raise ValidationFailed(
            f"O PDF tem {pages} páginas; o limite é {settings.MAX_PDF_PAGES}.",
            code="too_many_pages",
        )
    key = f"users/{user.id}/materials/{uuid.uuid4()}.pdf"
    get_storage().put(key, data, "application/pdf")
    m = Material(
        user_id=user.id,
        activity_id=activity_id,
        kind="pdf",
        title=(title or file_name or "PDF").strip()[:200],
        file_key=key,
        file_name=file_name[:255],
        mime_type="application/pdf",
        size_bytes=size,
        pages_total=pages,
        page_from=1 if pages else None,
        page_to=pages,
    )
    db.add(m)
    db.flush()
    return m


def signed_download_url(m: Material) -> str | None:
    if not m.file_key:
        return None
    return get_storage().signed_url(
        m.file_key,
        filename=m.file_name or "material.pdf",
        content_type=m.mime_type or "application/octet-stream",
        ttl=settings.SIGNED_URL_TTL_SECONDS,
    )


def delete_material(db: Session, m: Material) -> None:
    if m.file_key:
        try:
            get_storage().delete(m.file_key)
        except Exception:  # noqa: BLE001
            pass
    db.delete(m)
    db.flush()


def delete_all_user_files(db: Session, user: User) -> None:
    for m in db.execute(
        select(Material).where(Material.user_id == user.id, Material.file_key.is_not(None))
    ).scalars():
        try:
            get_storage().delete(m.file_key)
        except Exception:  # noqa: BLE001
            pass


def link_topic(
    db: Session,
    user: User,
    m: Material,
    topic_id: uuid.UUID,
    *,
    page_from: int | None,
    page_to: int | None,
    note: str | None,
    last_position: str | None,
) -> MaterialTopic:
    topic = db.get(Topic, topic_id)
    if topic is None or topic.user_id != user.id:
        raise ValidationFailed("Tópico inválido.", code="bad_topic")
    if page_from is not None and page_to is not None and page_to < page_from:
        raise ValidationFailed("Página final antes da inicial.", code="bad_pages")
    link = db.execute(
        select(MaterialTopic).where(
            MaterialTopic.material_id == m.id, MaterialTopic.topic_id == topic_id
        )
    ).scalar_one_or_none()
    if link is None:
        link = MaterialTopic(material_id=m.id, topic_id=topic_id, created_at=utcnow())
        db.add(link)
    link.page_from = page_from
    link.page_to = page_to
    link.note = note
    link.last_position = last_position
    db.flush()
    return link


def unlink_topic(db: Session, m: Material, topic_id: uuid.UUID) -> None:
    link = db.execute(
        select(MaterialTopic).where(
            MaterialTopic.material_id == m.id, MaterialTopic.topic_id == topic_id
        )
    ).scalar_one_or_none()
    if link is not None:
        db.delete(link)
        db.flush()
