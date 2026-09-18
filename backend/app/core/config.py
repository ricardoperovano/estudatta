"""Configuração central do backend (variáveis de ambiente).

Todas as chaves e credenciais vivem aqui e só aqui. Nenhum valor sensível
é exposto ao frontend; o endpoint público de configuração devolve apenas
flags e chaves públicas (ex.: VAPID public key, client id do Google).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Ambiente e URLs -----------------------------------------------------
    APP_ENV: Literal["development", "test", "production"] = "development"
    APP_NAME: str = "Estudatta"
    APP_URL: str = "http://localhost:5173"  # origem do frontend (site + PWA)
    API_URL: str = "http://localhost:8000"  # origem da API (igual à APP_URL atrás do Nginx)
    SECRET_KEY: str = "dev-only-change-me-please-32-chars-minimum"
    LOG_LEVEL: str = "INFO"

    # --- Banco, Redis --------------------------------------------------------
    DATABASE_URL: str = "postgresql+psycopg://estudatta:estudatta@localhost:5432/estudatta"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None

    # --- Sessões e segurança -------------------------------------------------
    SESSION_COOKIE_NAME: str = "estudatta_session"
    CSRF_COOKIE_NAME: str = "estudatta_csrf"
    SESSION_TTL_DAYS: int = 30
    COOKIE_SECURE: bool = False  # True em produção (HTTPS)
    COOKIE_DOMAIN: str | None = None
    CORS_ORIGINS: list[str] = Field(default_factory=list)
    TRUSTED_ORIGINS: list[str] = Field(default_factory=list)  # usado no check de Origin em mutações
    RATE_LIMIT_ENABLED: bool = True
    REQUIRE_EMAIL_VERIFICATION: bool = False  # se True, login exige e-mail confirmado

    # --- E-mail --------------------------------------------------------------
    EMAIL_BACKEND: Literal["smtp", "console", "memory"] = "console"
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 1025
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_TLS: bool = False
    SMTP_STARTTLS: bool = False
    EMAIL_FROM: str = "Estudatta <no-reply@estudatta.com.br>"

    # --- Google OAuth --------------------------------------------------------
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None

    # --- Web Push (VAPID) ----------------------------------------------------
    VAPID_PUBLIC_KEY: str | None = None
    VAPID_PRIVATE_KEY: str | None = None
    VAPID_SUBJECT: str = "mailto:contato@estudatta.com.br"

    # --- Armazenamento de materiais -----------------------------------------
    STORAGE_BACKEND: Literal["local", "s3"] = "local"
    STORAGE_LOCAL_PATH: str = "var/storage"
    S3_BUCKET: str | None = None
    S3_REGION: str | None = None
    S3_ENDPOINT_URL: str | None = None
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    SIGNED_URL_TTL_SECONDS: int = 600
    MAX_UPLOAD_MB: int = 25
    MAX_PDF_PAGES: int = 800
    PDF_EXTRACTION_TIMEOUT_SECONDS: int = 120
    OCR_ENABLED: bool = False

    # --- Cobrança (Mercado Pago) --------------------------------------------
    BILLING_PROVIDER: Literal["mercadopago", "none"] = "mercadopago"
    BILLING_MODE: Literal["disabled", "test", "production"] = "disabled"
    MERCADOPAGO_ACCESS_TOKEN: str | None = None
    MERCADOPAGO_PUBLIC_KEY: str | None = None
    MERCADOPAGO_WEBHOOK_SECRET: str | None = None
    MERCADOPAGO_API_BASE: str = "https://api.mercadopago.com"

    # --- IA opcional ---------------------------------------------------------
    AI_ENABLED: bool = False
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_API_KEY: str | None = None
    AI_MODEL: str = "gpt-4o-mini"
    AI_TIMEOUT_SECONDS: int = 45
    AI_MAX_INPUT_CHARS: int = 60000
    AI_MAX_OUTPUT_TOKENS: int = 2000
    AI_DAILY_ACTIONS_FREE: int = 0
    AI_DAILY_ACTIONS_PRO: int = 20
    AI_GLOBAL_DAILY_BUDGET_ACTIONS: int = 2000

    # --- Notificações --------------------------------------------------------
    NOTIFICATIONS_MAX_PROACTIVE_PER_DAY: int = 3  # padrão por usuário (editável até o teto)
    NOTIFICATIONS_SYSTEM_CEILING_PER_DAY: int = 6

    # --- Analytics / consentimento -------------------------------------------
    ANALYTICS_PROVIDER: Literal["none", "plausible", "ga4"] = "none"
    ANALYTICS_SITE_ID: str | None = None

    # --- Demonstração --------------------------------------------------------
    DEMO_MODE: bool = False

    @field_validator("CORS_ORIGINS", "TRUSTED_ORIGINS", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def broker_url(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def result_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    @property
    def google_oauth_enabled(self) -> bool:
        return bool(self.GOOGLE_CLIENT_ID and self.GOOGLE_CLIENT_SECRET)

    @property
    def push_enabled(self) -> bool:
        return bool(self.VAPID_PUBLIC_KEY and self.VAPID_PRIVATE_KEY)

    @property
    def billing_enabled(self) -> bool:
        return self.BILLING_MODE != "disabled" and bool(self.MERCADOPAGO_ACCESS_TOKEN)

    @property
    def ai_available(self) -> bool:
        return self.AI_ENABLED and bool(self.AI_API_KEY)

    def all_trusted_origins(self) -> set[str]:
        return {
            self.APP_URL.rstrip("/"),
            self.API_URL.rstrip("/"),
            *[o.rstrip("/") for o in self.TRUSTED_ORIGINS],
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
