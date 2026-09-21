"""Cadastro, login, sessões opacas, confirmação de e-mail e recuperação de senha."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ApiError, Conflict, Unauthorized, ValidationFailed
from app.core.i18n import _, normalize_locale, use_locale
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    needs_rehash,
    verify_password,
)
from app.core.timeutil import utcnow, valid_timezone
from app.integrations.email import send_password_reset_email, send_verification_email
from app.models.user import (
    AuthSession,
    NotificationPreferences,
    OneTimeToken,
    User,
    UserPreferences,
)
from app.services.outbox import notify_inapp

PASSWORD_MIN = 8


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_password(password: str) -> None:
    if len(password) < PASSWORD_MIN:
        raise ValidationFailed("A senha precisa ter pelo menos 8 caracteres.", code="weak_password")
    if len(password) > 256:
        raise ValidationFailed("Senha longa demais.", code="weak_password")


def create_user(
    db: Session,
    *,
    email: str,
    password: str | None,
    name: str = "",
    timezone: str = "America/Sao_Paulo",
    google_sub: str | None = None,
    email_verified: bool = False,
    locale: str = "pt-BR",
) -> User:
    email = normalize_email(email)
    if db.execute(select(User).where(User.email == email)).scalar_one_or_none() is not None:
        raise Conflict("Já existe uma conta com este e-mail.", code="email_taken")
    if password is not None:
        validate_password(password)
    if not valid_timezone(timezone):
        timezone = "America/Sao_Paulo"
    user = User(
        email=email,
        password_hash=hash_password(password) if password else None,
        name=name.strip()[:120],
        timezone=timezone,
        locale=normalize_locale(locale) or "pt-BR",
        google_sub=google_sub,
        email_verified_at=utcnow() if email_verified else None,
    )
    db.add(user)
    db.flush()
    db.add(UserPreferences(user_id=user.id))
    db.add(
        NotificationPreferences(
            user_id=user.id, max_per_day=settings.NOTIFICATIONS_MAX_PROACTIVE_PER_DAY
        )
    )
    with use_locale(user.locale):
        notify_inapp(
            db,
            user_id=user.id,
            kind="welcome",
            title=_("Bem-vindo ao Estudatta"),
            body=_(
                "Defina um objetivo, escolha os dias e a meta diária. O plano mostra o que fazer hoje e como retomar se atrasar."
            ),
            url="/app",
        )
    db.flush()
    return user


def authenticate(db: Session, *, email: str, password: str) -> User:
    email = normalize_email(email)
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        raise Unauthorized("E-mail ou senha incorretos.", code="invalid_credentials")
    if not user.is_active or user.deleted_at is not None:
        raise Unauthorized("Conta desativada.", code="inactive")
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.last_login_at = utcnow()
    return user


def start_session(
    db: Session, user: User, *, user_agent: str | None, ip: str | None
) -> tuple[AuthSession, str]:
    raw = generate_token(32)
    now = utcnow()
    sess = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw),
        csrf_token=generate_token(24),
        created_at=now,
        expires_at=now + timedelta(days=settings.SESSION_TTL_DAYS),
        last_seen_at=now,
        user_agent=(user_agent or "")[:300] or None,
        ip=(ip or "")[:64] or None,
        device_label=_device_label(user_agent),
    )
    db.add(sess)
    db.flush()
    return sess, raw


def _device_label(ua: str | None) -> str | None:
    if not ua:
        return None
    ua_l = ua.lower()
    if "iphone" in ua_l or "ipad" in ua_l:
        return "iPhone/iPad"
    if "android" in ua_l:
        return "Android"
    if "windows" in ua_l:
        return "Windows"
    if "mac os" in ua_l or "macintosh" in ua_l:
        return "Mac"
    if "linux" in ua_l:
        return "Linux"
    return "Navegador"


def revoke_session(db: Session, sess: AuthSession) -> None:
    sess.revoked_at = utcnow()


def revoke_all_sessions(db: Session, user_id: uuid.UUID, except_id: uuid.UUID | None = None) -> int:
    n = 0
    for s in db.execute(
        select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    ).scalars():
        if except_id and s.id == except_id:
            continue
        s.revoked_at = utcnow()
        n += 1
    return n


def _issue_token(
    db: Session, user: User, purpose: str, ttl: timedelta, payload: dict | None = None
) -> str:
    # invalida tokens anteriores do mesmo propósito
    for t in db.execute(
        select(OneTimeToken).where(
            OneTimeToken.user_id == user.id,
            OneTimeToken.purpose == purpose,
            OneTimeToken.used_at.is_(None),
        )
    ).scalars():
        t.used_at = utcnow()
    raw = generate_token(32)
    db.add(
        OneTimeToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(raw),
            payload=payload,
            created_at=utcnow(),
            expires_at=utcnow() + ttl,
        )
    )
    db.flush()
    return raw


def consume_token(db: Session, raw: str, purpose: str) -> OneTimeToken:
    tok = db.execute(
        select(OneTimeToken).where(
            OneTimeToken.token_hash == hash_token(raw), OneTimeToken.purpose == purpose
        )
    ).scalar_one_or_none()
    if tok is None or tok.used_at is not None or tok.expires_at <= utcnow():
        raise ApiError("Link inválido ou expirado.", code="invalid_token", status_code=400)
    tok.used_at = utcnow()
    return tok


def send_verification(db: Session, user: User) -> None:
    raw = _issue_token(db, user, "verify_email", timedelta(hours=24))
    link = f"{settings.APP_URL}/confirmar-email?token={raw}"
    send_verification_email(user.email, link)


def verify_email(db: Session, raw: str) -> User:
    tok = consume_token(db, raw, "verify_email")
    user = db.get(User, tok.user_id)
    if user is None:
        raise ApiError("Link inválido.", code="invalid_token", status_code=400)
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
    return user


def request_password_reset(db: Session, email: str) -> None:
    user = db.execute(select(User).where(User.email == normalize_email(email))).scalar_one_or_none()
    if user is None or not user.is_active:
        return  # resposta idêntica para não revelar contas
    raw = _issue_token(db, user, "reset_password", timedelta(hours=1))
    link = f"{settings.APP_URL}/redefinir-senha?token={raw}"
    send_password_reset_email(user.email, link)


def reset_password(db: Session, raw: str, new_password: str) -> User:
    validate_password(new_password)
    tok = consume_token(db, raw, "reset_password")
    user = db.get(User, tok.user_id)
    if user is None:
        raise ApiError("Link inválido.", code="invalid_token", status_code=400)
    user.password_hash = hash_password(new_password)
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()  # provou posse do e-mail
    revoke_all_sessions(db, user.id)
    return user


def change_password(
    db: Session, user: User, *, current: str, new: str, keep_session: uuid.UUID | None
) -> None:
    if not verify_password(current, user.password_hash):
        raise Unauthorized("Senha atual incorreta.", code="invalid_credentials")
    validate_password(new)
    user.password_hash = hash_password(new)
    revoke_all_sessions(db, user.id, except_id=keep_session)
