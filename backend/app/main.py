"""Aplicação FastAPI: middlewares, handlers de erro e roteadores v1."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import (
    ApiError,
    api_error_handler,
    http_error_handler,
    validation_error_handler,
)
from app.core.i18n import from_accept_language, set_locale
from app.core.logging import configure_logging, get_logger

log = get_logger("api")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        request.state.request_id = rid
        # idioma das mensagens: Accept-Language; a conta sobrescreve ao autenticar (deps)
        set_locale(from_accept_language(request.headers.get("accept-language")))
        structlog.contextvars.bind_contextvars(
            request_id=rid, path=request.url.path, method=request.method
        )
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers["X-Request-ID"] = rid
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    log.info("api.start", env=settings.APP_ENV)
    yield
    log.info("api.stop")


def create_app() -> FastAPI:
    app = FastAPI(
        title="Estudatta API",
        version="1.0.0",
        description="API do Estudatta: objetivos, metas versionadas, sessões, saldo, planejamento, materiais, notificações e assinatura.",
        docs_url="/api/docs" if not settings.is_production else None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
        lifespan=lifespan,
    )
    app.add_middleware(RequestContextMiddleware)
    if settings.CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "X-CSRF-Token", "X-Device-Id", "X-Request-Id"],
        )
    app.add_exception_handler(ApiError, api_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.include_router(api_router)
    return app


app = create_app()
