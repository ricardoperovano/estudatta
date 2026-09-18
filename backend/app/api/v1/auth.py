from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import client_ip, get_current_user, get_optional_user, rate_limit
from app.core.errors import ApiError, NotFound, Unauthorized
from app.models.user import AuthSession, User
from app.schemas.auth import (
    AuthSessionOut,
    ChangePasswordRequest,
    EntitlementsOut,
    ForgotPasswordRequest,
    LoginRequest,
    PublicConfigOut,
    RegisterRequest,
    ResetPasswordRequest,
    AuthStateOut,
    UserOut,
    VerifyEmailRequest,
)
from app.schemas.common import OkResponse
from app.services import auth as auth_service
from app.services.plans import get_entitlements

router = APIRouter(prefix="/auth", tags=["auth"])


def set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        settings.SESSION_COOKIE_NAME,
        raw_token,
        max_age=settings.SESSION_TTL_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        domain=settings.COOKIE_DOMAIN,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(settings.SESSION_COOKIE_NAME, domain=settings.COOKIE_DOMAIN, path="/")


def session_payload(db: Session, user: User, sess: AuthSession) -> AuthStateOut:
    ent = get_entitlements(db, user.id)
    return AuthStateOut(
        user=UserOut.model_validate(user),
        csrf_token=sess.csrf_token,
        entitlements=EntitlementsOut(**ent.__dict__),
    )


@router.get("/config", response_model=PublicConfigOut)
def public_config() -> PublicConfigOut:
    return PublicConfigOut(
        app_name=settings.APP_NAME,
        app_url=settings.APP_URL,
        google_oauth_enabled=settings.google_oauth_enabled,
        push_enabled=settings.push_enabled,
        vapid_public_key=settings.VAPID_PUBLIC_KEY if settings.push_enabled else None,
        billing_mode=settings.BILLING_MODE if settings.billing_enabled else "disabled",
        ai_enabled=settings.ai_available,
        analytics_provider=settings.ANALYTICS_PROVIDER,
        analytics_site_id=settings.ANALYTICS_SITE_ID,
        demo_mode=settings.DEMO_MODE,
        max_upload_mb=settings.MAX_UPLOAD_MB,
    )


@router.post(
    "/register",
    response_model=AuthStateOut,
    status_code=201,
    dependencies=[Depends(rate_limit("register", 10, 3600))],
)
def register(
    payload: RegisterRequest, request: Request, response: Response, db: Session = Depends(get_db)
) -> AuthStateOut:
    user = auth_service.create_user(
        db,
        email=payload.email,
        password=payload.password,
        name=payload.name,
        timezone=payload.timezone,
    )
    sess, raw = auth_service.start_session(
        db, user, user_agent=request.headers.get("user-agent"), ip=client_ip(request)
    )
    auth_service.send_verification(db, user)
    audit(
        db,
        actor_id=user.id,
        action="auth.register",
        target_type="user",
        target_id=str(user.id),
        ip=client_ip(request),
    )
    db.commit()
    set_session_cookie(response, raw)
    return session_payload(db, user, sess)


@router.post(
    "/login", response_model=AuthStateOut, dependencies=[Depends(rate_limit("login", 20, 900))]
)
def login(
    payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)
) -> AuthStateOut:
    user = auth_service.authenticate(db, email=payload.email, password=payload.password)
    if settings.REQUIRE_EMAIL_VERIFICATION and user.email_verified_at is None:
        raise ApiError(
            "Confirme seu e-mail antes de entrar.", code="email_unverified", status_code=403
        )
    sess, raw = auth_service.start_session(
        db, user, user_agent=request.headers.get("user-agent"), ip=client_ip(request)
    )
    audit(db, actor_id=user.id, action="auth.login", ip=client_ip(request))
    db.commit()
    set_session_cookie(response, raw)
    return session_payload(db, user, sess)


@router.post("/logout", response_model=OkResponse)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> OkResponse:
    sess = getattr(request.state, "auth_session", None)
    if sess is not None:
        auth_service.revoke_session(db, sess)
        db.commit()
    clear_session_cookie(response)
    return OkResponse(message="Sessão encerrada.")


@router.get("/session", response_model=AuthStateOut)
def current_session(
    request: Request, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)
) -> AuthStateOut:
    if user is None:
        raise Unauthorized("Não autenticado.")
    return session_payload(db, user, request.state.auth_session)


@router.post(
    "/verify-email",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("verify", 20, 3600))],
)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> OkResponse:
    auth_service.verify_email(db, payload.token)
    db.commit()
    return OkResponse(message="E-mail confirmado.")


@router.post(
    "/resend-verification",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("resend", 5, 3600))],
)
def resend_verification(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    if user.email_verified_at is None:
        auth_service.send_verification(db, user)
        db.commit()
    return OkResponse(message="Se necessário, enviamos um novo e-mail de confirmação.")


@router.post(
    "/forgot-password",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("forgot", 5, 3600))],
)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> OkResponse:
    auth_service.request_password_reset(db, payload.email)
    db.commit()
    return OkResponse(message="Se o e-mail existir, enviaremos um link para redefinir a senha.")


@router.post(
    "/reset-password",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("reset", 10, 3600))],
)
def reset_password(
    payload: ResetPasswordRequest, response: Response, db: Session = Depends(get_db)
) -> OkResponse:
    auth_service.reset_password(db, payload.token, payload.password)
    db.commit()
    clear_session_cookie(response)
    return OkResponse(message="Senha redefinida. Entre com a nova senha.")


@router.post("/change-password", response_model=OkResponse)
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    keep = request.state.auth_session.id
    auth_service.change_password(
        db, user, current=payload.current_password, new=payload.new_password, keep_session=keep
    )
    audit(db, actor_id=user.id, action="auth.change_password")
    db.commit()
    return OkResponse(message="Senha alterada. Outras sessões foram encerradas.")


@router.get("/sessions", response_model=list[AuthSessionOut])
def list_sessions(
    request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[AuthSessionOut]:
    cur = request.state.auth_session.id
    rows = db.execute(
        select(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.last_seen_at.desc())
    ).scalars()
    out = []
    for r in rows:
        o = AuthSessionOut.model_validate(r)
        o.current = r.id == cur
        out.append(o)
    return out


@router.delete("/sessions/{session_id}", response_model=OkResponse)
def revoke(
    session_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    from app.core.deps import parse_uuid

    row = db.get(AuthSession, parse_uuid(session_id))
    if row is None or row.user_id != user.id:
        raise NotFound("Sessão não encontrada.")
    auth_service.revoke_session(db, row)
    db.commit()
    return OkResponse(message="Sessão encerrada.")


@router.post("/sessions/revoke-others", response_model=OkResponse)
def revoke_others(
    request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> OkResponse:
    n = auth_service.revoke_all_sessions(db, user.id, except_id=request.state.auth_session.id)
    db.commit()
    return OkResponse(message=f"{n} sessão(ões) encerrada(s).")
