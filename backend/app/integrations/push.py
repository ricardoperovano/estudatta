"""Web Push (VAPID) via pywebpush. Modo "sem credencial" honesto: sem chaves, nada é enviado."""

from __future__ import annotations

import json
from dataclasses import dataclass

import pywebpush

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("push")

PUSH_TTL_SECONDS = 6 * 3600
PUSH_TIMEOUT_SECONDS = 10.0
GONE_STATUS = {404, 410}


@dataclass(frozen=True)
class PushResult:
    ok: bool
    gone: bool = False
    error: str | None = None
    # `ambiguous`: a requisição pode ter chegado ao provedor (ex.: timeout na resposta);
    # não se deve reenviar automaticamente.
    ambiguous: bool = False
    status_code: int | None = None


def build_payload(
    *,
    title: str,
    body: str,
    url: str | None,
    tag: str,
    data: dict | None = None,
) -> dict:
    """Formato consumido pelo service worker: {title, body, url, tag, data}."""
    return {"title": title, "body": body, "url": url or "/app", "tag": tag, "data": data or {}}


def send_push(subscription, payload: dict, *, ttl: int = PUSH_TTL_SECONDS) -> PushResult:
    """Envia um push para uma assinatura (`PushSubscription` ou objeto com endpoint/p256dh/auth).

    Nunca levanta exceção: devolve `PushResult`. Com VAPID ausente, `ok=False, error='push_disabled'`.
    """
    if not settings.push_enabled:
        return PushResult(ok=False, error="push_disabled")
    info = {
        "endpoint": subscription.endpoint,
        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
    }
    try:
        pywebpush.webpush(
            subscription_info=info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=ttl,
            timeout=PUSH_TIMEOUT_SECONDS,
        )
        return PushResult(ok=True)
    except pywebpush.WebPushException as exc:
        code = exc.status_code
        if code in GONE_STATUS:
            return PushResult(ok=False, gone=True, error=f"gone:{code}", status_code=code)
        log.warning("push.failed", status=code, error=str(exc.message)[:200])
        return PushResult(ok=False, error=f"http_{code or 'error'}", status_code=code)
    except Exception as exc:  # noqa: BLE001 - rede/timeout: não derruba o job
        name = type(exc).__name__
        ambiguous = "Timeout" in name or "ReadTimeout" in name
        log.warning("push.exception", error=f"{name}: {exc}"[:200])
        return PushResult(ok=False, error=name, ambiguous=ambiguous)
