"""Saúde do sistema: registro de erros e atritos, e o resumo que a página do admin mostra.

Três origens gravam em `error_events`:
- a API, quando uma exceção escapa (500) ou quando responde com um erro que indica barreira
  para o usuário (limite do plano, validação, serviço indisponível);
- o app no navegador, quando uma tela quebra (POST /client-errors);
- o worker, quando uma tarefa em segundo plano falha.

Registrar nunca pode piorar o problema que está sendo registrado: `record` usa sessão própria,
engole qualquer falha e corta textos longos. Nada de corpo de requisição, senha ou token.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.core.timeutil import utcnow
from app.models.notification import NotificationOutbox
from app.models.system import ContactMessage, ErrorEvent

log = get_logger("health")

RETENTION = timedelta(days=30)
# Respostas de erro que valem como atrito. 401/404 ficam de fora: sessão expirada e robôs
# sondando endereços não dizem nada sobre a experiência de quem usa.
FRICTION_STATUSES = {402, 403, 409, 413, 422, 429, 503}
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
_NUM = re.compile(r"\d+")
_SECRET = re.compile(r"(token|senha|password|secret|key|authorization)=[^&\s]+", re.I)


def normalize_path(path: str | None) -> str | None:
    """Caminho sem consulta e sem identificadores, para agrupar /objetivos/<id> numa linha só."""
    if not path:
        return None
    p = path.split("?", 1)[0].split("#", 1)[0]
    p = _UUID.sub("{id}", p)
    p = re.sub(r"/\d+(?=/|$)", "/{n}", p)
    return p[:300]


def scrub(value: str | None, limit: int) -> str | None:
    if not value:
        return None
    return _SECRET.sub(r"\1=***", value)[:limit]


def fingerprint(source: str, code: str, path: str | None, message: str) -> str:
    # números fora da assinatura: "linha 42" e "linha 57" são o mesmo problema
    head = _NUM.sub("#", _UUID.sub("{id}", (message or "").splitlines()[0] if message else ""))[
        :160
    ]
    raw = f"{source}|{code}|{path or ''}|{head}"
    return hashlib.sha1(raw.encode(), usedforsecurity=False).hexdigest()


def record(
    *,
    source: str,
    level: str,
    code: str,
    message: str,
    path: str | None = None,
    method: str | None = None,
    status: int | None = None,
    user_id: uuid.UUID | None = None,
    request_id: str | None = None,
    detail: str | None = None,
    context: dict | None = None,
) -> None:
    """Grava um evento. Nunca lança."""
    try:
        npath = normalize_path(path)
        msg = scrub((message or "").strip(), 500) or "(sem mensagem)"
        with SessionLocal() as db:
            db.add(
                ErrorEvent(
                    source=source[:8],
                    level=level[:8],
                    code=(code or "unknown")[:64],
                    message=msg,
                    path=npath,
                    method=(method or None) and method[:8],
                    status=status,
                    user_id=user_id,
                    request_id=(request_id or None) and request_id[:64],
                    fingerprint=fingerprint(source, code, npath, msg),
                    detail=scrub(detail, 6000),
                    context=context or None,
                    created_at=utcnow(),
                )
            )
            db.commit()
    except Exception as exc:  # noqa: BLE001 - registrar não pode derrubar quem chamou
        log.warning("health.record_failed", error=f"{type(exc).__name__}: {exc}")


def purge(db: Session, *, now: datetime | None = None) -> int:
    now = now or utcnow()
    rows = db.execute(select(ErrorEvent).where(ErrorEvent.created_at < now - RETENTION)).scalars()
    n = 0
    for r in rows:
        db.delete(r)
        n += 1
    return n


# ---------------------------------------------------------------- resumo para o admin
def _checks(db: Session) -> list[dict]:
    """Verificações objetivas do ambiente. `ok` False é algo a resolver; `warn` é atenção."""
    out: list[dict] = []

    def add(key: str, label: str, state: str, note: str = "") -> None:
        out.append({"key": key, "label": label, "state": state, "note": note})

    try:
        db.execute(text("SELECT 1"))
        add("database", "Banco de dados", "ok")
    except Exception as exc:  # noqa: BLE001
        add("database", "Banco de dados", "fail", type(exc).__name__)
    try:
        import redis

        redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=1, socket_timeout=1).ping()
        add("redis", "Fila (Redis)", "ok")
    except Exception as exc:  # noqa: BLE001
        add("redis", "Fila (Redis)", "fail", type(exc).__name__)

    if settings.BILLING_MODE == "disabled":
        add("billing", "Cobrança", "warn", "desligada (BILLING_MODE=disabled)")
    elif settings.billing_enabled:
        add("billing", "Cobrança", "ok", settings.BILLING_MODE)
    else:
        add("billing", "Cobrança", "fail", "ligada no .env, mas a chave do provedor chegou vazia")

    add(
        "email",
        "E-mail",
        "ok" if settings.EMAIL_BACKEND not in ("console", "memory") else "warn",
        settings.EMAIL_BACKEND,
    )
    add(
        "push",
        "Notificações push",
        "ok" if settings.push_enabled else "warn",
        "" if settings.push_enabled else "sem chaves VAPID",
    )
    add(
        "ai",
        "IA (Tatá e importação)",
        "ok" if settings.AI_ENABLED else "warn",
        "" if settings.AI_ENABLED else "desligada",
    )
    add(
        "voice",
        "Voz natural",
        "ok" if settings.voice_available else "warn",
        "" if settings.voice_available else "sem chave",
    )

    now = utcnow()
    overdue = db.execute(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(
            NotificationOutbox.status == "pending",
            NotificationOutbox.next_run_at < now - timedelta(minutes=15),
        )
    ).scalar_one()
    failed = db.execute(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(
            NotificationOutbox.status == "failed",
            NotificationOutbox.created_at >= now - timedelta(days=1),
        )
    ).scalar_one()
    if overdue:
        add(
            "outbox",
            "Envio de lembretes",
            "fail",
            f"{overdue} atrasados há mais de 15 min (worker parado?)",
        )
    elif failed:
        add("outbox", "Envio de lembretes", "warn", f"{failed} falharam nas últimas 24 h")
    else:
        add("outbox", "Envio de lembretes", "ok")
    return out


def _count(db: Session, since: datetime, **eq) -> int:
    q = select(func.count()).select_from(ErrorEvent).where(ErrorEvent.created_at >= since)
    for k, v in eq.items():
        q = q.where(getattr(ErrorEvent, k) == v)
    return int(db.execute(q).scalar_one())


def summary(db: Session, *, days: int = 7, now: datetime | None = None) -> dict:
    now = now or utcnow()
    since = now - timedelta(days=days)
    day = now - timedelta(days=1)

    totals = {
        "errors_24h": _count(db, day, level="error"),
        "errors_period": _count(db, since, level="error"),
        "friction_24h": _count(db, day, level="warning"),
        "friction_period": _count(db, since, level="warning"),
        "users_affected_period": int(
            db.execute(
                select(func.count(func.distinct(ErrorEvent.user_id))).where(
                    ErrorEvent.created_at >= since, ErrorEvent.user_id.is_not(None)
                )
            ).scalar_one()
        ),
    }

    rows = db.execute(
        select(
            ErrorEvent.fingerprint,
            func.count().label("n"),
            func.count(func.distinct(ErrorEvent.user_id)).label("users"),
            func.min(ErrorEvent.created_at).label("first_seen"),
            func.max(ErrorEvent.created_at).label("last_seen"),
        )
        .where(ErrorEvent.created_at >= since)
        .group_by(ErrorEvent.fingerprint)
        .order_by(func.max(ErrorEvent.created_at).desc())
        .limit(60)
    ).all()
    groups = []
    for fp, n, users, first_seen, last_seen in rows:
        sample = db.execute(
            select(ErrorEvent)
            .where(ErrorEvent.fingerprint == fp)
            .order_by(ErrorEvent.created_at.desc())
            .limit(1)
        ).scalar_one()
        groups.append(
            {
                "fingerprint": fp,
                "source": sample.source,
                "level": sample.level,
                "code": sample.code,
                "message": sample.message,
                "path": sample.path,
                "method": sample.method,
                "status": sample.status,
                "count": int(n),
                "users": int(users),
                "first_seen": first_seen,
                "last_seen": last_seen,
                "detail": sample.detail,
                "context": sample.context,
            }
        )
    # erros antes de atritos; dentro de cada grupo, o mais recente primeiro
    groups.sort(key=lambda g: (g["level"] != "error", -g["last_seen"].timestamp()))

    contacts = [
        {
            "id": c.id,
            "email": c.email,
            "name": c.name,
            "subject": c.subject,
            "message": c.message,
            "created_at": c.created_at,
        }
        for c in db.execute(
            select(ContactMessage).order_by(ContactMessage.created_at.desc()).limit(20)
        ).scalars()
    ]
    return {
        "generated_at": now,
        "days": days,
        "checks": _checks(db),
        "totals": totals,
        "groups": groups,
        "contact_messages": contacts,
    }
