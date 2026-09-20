from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    name: str = Field(default="", max_length=120)
    timezone: str = Field(default="America/Sao_Paulo", max_length=64)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=8, max_length=256)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=256)


class UserOut(ORMModel):
    id: UUID
    email: str
    name: str
    role: str
    timezone: str
    locale: str
    email_verified_at: datetime | None
    onboarding_completed_at: datetime | None
    created_at: datetime
    avatar_version: int | None = None  # None = sem foto; muda a cada troca (cache-busting)


class EntitlementsOut(BaseModel):
    plan_code: str
    plan_name: str
    limits: dict
    source: str
    subscription_status: str | None = None
    current_period_end: str | None = None
    cancel_at_period_end: bool = False


class AuthStateOut(BaseModel):
    user: UserOut
    csrf_token: str
    entitlements: EntitlementsOut


class AuthSessionOut(ORMModel):
    id: UUID
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str | None
    device_label: str | None
    current: bool = False


class PublicConfigOut(BaseModel):
    app_name: str
    app_url: str
    google_oauth_enabled: bool
    push_enabled: bool
    vapid_public_key: str | None
    billing_mode: str
    ai_enabled: bool
    analytics_provider: str
    analytics_site_id: str | None
    demo_mode: bool
    max_upload_mb: int
