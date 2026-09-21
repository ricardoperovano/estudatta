"""Dependências FastAPI: sessão de banco, usuário autenticado, CSRF, admin, rate limit."""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.errors import Forbidden, RateLimited, Unauthorized
from app.core.i18n import set_locale
from app.core.ratelimit import limiter
from app.core.security import constant_time_equals, hash_token
from app.core.timeutil import utcnow
from app.models.user import AuthSession, User

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _load_session(db: Session, token: str | None) -> tuple[AuthSession, User] | None:
    if not token:
        return None
    sess = db.execute(
        select(AuthSession).where(AuthSession.token_hash == hash_token(token))
    ).scalar_one_or_none()
    if sess is None or sess.revoked_at is not None or sess.expires_at <= utcnow():
        return None
    user = db.get(User, sess.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        return None
    return sess, user


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    loaded = _load_session(db, token)
    if loaded is None:
        request.state.auth_session = None
        return None
    sess, user = loaded
    request.state.auth_session = sess
    set_locale(user.locale)
    # toca last_seen no máximo uma vez por hora
    if sess.last_seen_at < utcnow() - timedelta(hours=1):
        sess.last_seen_at = utcnow()
        db.commit()
    return user


def _check_csrf(request: Request, sess: AuthSession) -> None:
    if request.method in SAFE_METHODS:
        return
    origin = request.headers.get("origin") or ""
    if origin:
        if origin.rstrip("/") not in settings.all_trusted_origins():
            raise Forbidden("Origem não permitida.", code="csrf_origin")
    header = request.headers.get("x-csrf-token") or ""
    if not header or not constant_time_equals(header, sess.csrf_token):
        raise Forbidden("Token CSRF ausente ou inválido.", code="csrf_token")


def get_current_user(request: Request, user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise Unauthorized("Faça login para continuar.")
    sess: AuthSession = request.state.auth_session
    _check_csrf(request, sess)
    return user


def get_verified_user(user: User = Depends(get_current_user)) -> User:
    if settings.REQUIRE_EMAIL_VERIFICATION and user.email_verified_at is None:
        raise Forbidden("Confirme seu e-mail para continuar.", code="email_unverified")
    return user


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise Forbidden("Acesso restrito.", code="admin_only")
    return user


def get_device_id(request: Request) -> str | None:
    return request.headers.get("x-device-id")


def client_ip(request: Request) -> str | None:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def rate_limit(scope: str, limit: int, window_seconds: int):
    """Dependência de rate limit por IP (ou usuário) para endpoints sensíveis."""

    def _dep(request: Request, user: User | None = Depends(get_optional_user)) -> None:
        if not settings.RATE_LIMIT_ENABLED:
            return
        key = str(user.id) if user else (client_ip(request) or "anon")
        if not limiter.allow(f"{scope}:{key}", limit, window_seconds):
            raise RateLimited("Muitas tentativas. Aguarde um pouco e tente novamente.")

    return _dep


def parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise Unauthorized("Identificador inválido.") from exc
