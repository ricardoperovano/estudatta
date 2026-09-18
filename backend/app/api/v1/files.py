"""Entrega de arquivos do armazenamento local por URL assinada (sem cookie de sessão).

A assinatura HMAC (chave + validade) é a única credencial: só quem recebeu a URL do
`GET /materials/{id}` (o dono) consegue baixar, e por tempo limitado. Nunca servimos
como HTML: só `application/pdf` (inline) ou `application/octet-stream` (attachment).
Com S3 o `signed_url` aponta direto para o bucket e esta rota não é usada.
"""

from __future__ import annotations

import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import Forbidden, NotFound
from app.integrations.storage import get_storage, verify_local
from app.models.content import Material

router = APIRouter(prefix="/files", tags=["files"])

_UNSAFE = re.compile(r"[^A-Za-z0-9._ -]")


def safe_filename(name: str | None, default: str) -> tuple[str, str]:
    """(nome ASCII para `filename=`, nome UTF-8 percent-encoded para `filename*=`)."""
    base = (name or "").strip().replace("\\", "/").rsplit("/", 1)[-1]
    base = base.replace("\r", "").replace("\n", "").replace('"', "")[:150] or default
    ascii_name = _UNSAFE.sub("_", base).strip(" .") or default
    return ascii_name, quote(base, safe="")


@router.get("/{key:path}")
def download(
    key: str,
    exp: int = Query(..., ge=0),
    sig: str = Query(..., min_length=32, max_length=128),
    db: Session = Depends(get_db),
) -> Response:
    if not verify_local(key, exp, sig):
        raise Forbidden("Link inválido ou expirado. Abra o material de novo.", code="bad_signature")
    material = db.execute(select(Material).where(Material.file_key == key)).scalar_one_or_none()
    try:
        data = get_storage().get(key)
    except (FileNotFoundError, ValueError, OSError) as exc:
        raise NotFound("Arquivo não encontrado.") from exc
    content_type = (material.mime_type if material else None) or "application/octet-stream"
    if content_type != "application/pdf":
        content_type = "application/octet-stream"
    disposition = "inline" if content_type == "application/pdf" else "attachment"
    default = "material.pdf" if content_type == "application/pdf" else "arquivo.bin"
    ascii_name, utf8_name = safe_filename(material.file_name if material else None, default)
    headers = {
        "Content-Disposition": f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Length": str(len(data)),
    }
    return Response(content=data, media_type=content_type, headers=headers)
