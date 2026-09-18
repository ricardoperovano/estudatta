"""Google OAuth (Authorization Code + PKCE + state). Só funciona com credenciais configuradas."""

from __future__ import annotations

import base64
import hashlib
import secrets

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.auth import set_session_cookie
from app.core.audit import audit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import client_ip
from app.core.errors import ApiError, ServiceUnavailable
from app.models.user import User
from app.services import auth as auth_service

router = APIRouter(prefix="/auth/google", tags=["auth"])

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.SECRET_KEY, salt="google-oauth")


def _redirect_uri() -> str:
    return f"{settings.API_URL}/api/v1/auth/google/callback"


@router.get("/start")
def start(request: Request, next: str = "/app"):
    if not settings.google_oauth_enabled:
        raise ServiceUnavailable("Login com Google não está configurado.", code="google_disabled")
    if not next.startswith("/") or next.startswith("//"):
        next = "/app"
    verifier = secrets.token_urlsafe(48)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )
    state = _serializer().dumps({"n": secrets.token_urlsafe(16), "v": verifier, "next": next})
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    url = httpx.URL(GOOGLE_AUTH, params=params)
    return RedirectResponse(str(url), status_code=302)


@router.get("/callback")
def callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if not settings.google_oauth_enabled:
        raise ServiceUnavailable("Login com Google não está configurado.", code="google_disabled")
    if error or not code or not state:
        return RedirectResponse(f"{settings.APP_URL}/entrar?erro=google", status_code=302)
    try:
        data = _serializer().loads(state, max_age=600)
    except BadSignature as exc:
        raise ApiError("Estado inválido do login.", code="bad_state", status_code=400) from exc
    with httpx.Client(timeout=15) as client:
        tok = client.post(
            GOOGLE_TOKEN,
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": _redirect_uri(),
                "grant_type": "authorization_code",
                "code_verifier": data["v"],
            },
        )
        if tok.status_code != 200:
            return RedirectResponse(f"{settings.APP_URL}/entrar?erro=google", status_code=302)
        access = tok.json().get("access_token")
        info = client.get(GOOGLE_USERINFO, headers={"Authorization": f"Bearer {access}"})
    if info.status_code != 200:
        return RedirectResponse(f"{settings.APP_URL}/entrar?erro=google", status_code=302)
    profile = info.json()
    sub = profile.get("sub")
    email = (profile.get("email") or "").lower()
    verified = bool(profile.get("email_verified"))
    if not sub or not email:
        return RedirectResponse(f"{settings.APP_URL}/entrar?erro=google", status_code=302)
    user = db.execute(select(User).where(User.google_sub == sub)).scalar_one_or_none()
    if user is None:
        existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
        if existing is not None:
            # só vincula contas quando o e-mail do Google é verificado e coincide com conta já verificada
            if verified and existing.email_verified_at is not None:
                existing.google_sub = sub
                user = existing
            else:
                return RedirectResponse(f"{settings.APP_URL}/entrar?erro=vincular", status_code=302)
        else:
            user = auth_service.create_user(
                db,
                email=email,
                password=None,
                name=profile.get("name") or "",
                google_sub=sub,
                email_verified=verified,
            )
    sess, raw = auth_service.start_session(
        db, user, user_agent=request.headers.get("user-agent"), ip=client_ip(request)
    )
    audit(db, actor_id=user.id, action="auth.login_google", ip=client_ip(request))
    db.commit()
    target = data.get("next") or "/app"
    resp = RedirectResponse(f"{settings.APP_URL}{target}", status_code=302)
    set_session_cookie(resp, raw)
    return resp
