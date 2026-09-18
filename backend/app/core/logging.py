"""Logs estruturados (structlog) com request id; nunca registra segredos."""

from __future__ import annotations

import logging
import sys

import structlog

from app.core.config import settings

REDACTED_KEYS = {
    "password",
    "token",
    "cookie",
    "authorization",
    "secret",
    "signed_url",
    "access_token",
}


def _redact(_, __, event_dict):  # type: ignore[no-untyped-def]
    for key in list(event_dict.keys()):
        if key.lower() in REDACTED_KEYS:
            event_dict[key] = "[redacted]"
    return event_dict


def configure_logging() -> None:
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(level=level, stream=sys.stdout, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _redact,
            structlog.processors.JSONRenderer()
            if settings.is_production
            else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "estudatta"):  # type: ignore[no-untyped-def]
    return structlog.get_logger(name)
