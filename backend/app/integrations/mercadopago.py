"""Adaptador do Mercado Pago (assinaturas / `preapproval`) e interface de provedor de cobrança.

Modo sem credencial é honesto: `get_provider()` levanta `ServiceUnavailable` com o código
`billing_disabled`. Testes injetam um provedor falso com `set_provider_override()` ou com
`app.dependency_overrides[get_provider]`.

Endpoints usados (referência oficial "Assinaturas"):
- `POST /preapproval`                 cria a assinatura; com `status=pending` e sem `card_token_id`
                                      o pagador conclui pelo `init_point` devolvido.
- `GET /preapproval/{id}`             estado atual (`pending|authorized|paused|cancelled`).
- `PUT /preapproval/{id}`             `{"status": "cancelled"}` cancela a cobrança recorrente.
- `GET /preapproval/search`           busca por `external_reference`.
- `GET /authorized_payments/{id}`     cobrança recorrente → `preapproval_id` (eventos
                                      `subscription_authorized_payment`).

Validação de webhook (documentação "Webhooks › Validar origem da notificação"):
cabeçalho `x-signature: ts=<ms>,v1=<hex>`, cabeçalho `x-request-id`, `data.id` da query string;
manifesto `id:{data.id};request-id:{x-request-id};ts:{ts};` (partes ausentes são omitidas;
`data.id` alfanumérico em minúsculas) e HMAC-SHA256 hexadecimal com a "assinatura secreta"
gerada no painel de Webhooks. Ver docs/billing.md.
"""

from __future__ import annotations

import hashlib
import hmac
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
from dateutil import parser as dateparser

from app.core.config import settings
from app.core.errors import ServiceUnavailable
from app.core.logging import get_logger

log = get_logger("billing.mercadopago")

BILLING_DISABLED_MESSAGE = (
    "Cobrança ainda não está configurada; o plano gratuito continua disponível."
)
PROVIDER_NAME = "mercadopago"


class ProviderError(Exception):
    """Falha de comunicação ou resposta inesperada do provedor (nunca expõe credenciais)."""

    def __init__(
        self, message: str, *, status_code: int | None = None, payload: Any = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload


def normalize_status(value: str | None) -> str:
    """Normaliza o status do provedor (`canceled` e `cancelled` aparecem na documentação)."""
    v = (value or "").strip().lower()
    if v == "canceled":
        return "cancelled"
    return v


def parse_provider_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = dateparser.isoparse(str(value))
        except (ValueError, TypeError):
            try:
                dt = dateparser.parse(str(value))
            except (ValueError, TypeError, OverflowError):
                return None
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


@dataclass
class ProviderSubscription:
    """Visão normalizada de uma assinatura no provedor."""

    id: str
    status: str  # pending | authorized | paused | cancelled
    external_reference: str | None = None
    init_point: str | None = None
    next_payment_date: datetime | None = None
    payer_id: str | None = None
    payer_email: str | None = None
    auto_recurring: dict = field(default_factory=dict)
    date_created: datetime | None = None
    last_modified: datetime | None = None
    reason: str | None = None
    raw: dict = field(default_factory=dict)


def subscription_from_payload(data: dict) -> ProviderSubscription:
    payer_id = data.get("payer_id")
    return ProviderSubscription(
        id=str(data.get("id") or ""),
        status=normalize_status(data.get("status")),
        external_reference=data.get("external_reference"),
        init_point=data.get("init_point"),
        next_payment_date=parse_provider_datetime(data.get("next_payment_date")),
        payer_id=str(payer_id) if payer_id is not None else None,
        payer_email=data.get("payer_email"),
        auto_recurring=dict(data.get("auto_recurring") or {}),
        date_created=parse_provider_datetime(data.get("date_created")),
        last_modified=parse_provider_datetime(data.get("last_modified")),
        reason=data.get("reason"),
        raw=data,
    )


class BillingProvider(ABC):
    """Interface mínima para um provedor de assinaturas recorrentes."""

    name: str = PROVIDER_NAME

    @abstractmethod
    def create_preapproval(
        self,
        *,
        reason: str,
        external_reference: str,
        payer_email: str,
        amount: float,
        currency: str,
        frequency: int,
        frequency_type: str,
        back_url: str,
    ) -> ProviderSubscription: ...

    @abstractmethod
    def get_preapproval(self, preapproval_id: str) -> ProviderSubscription: ...

    @abstractmethod
    def cancel_preapproval(self, preapproval_id: str) -> ProviderSubscription: ...

    @abstractmethod
    def search_preapproval_by_external_reference(
        self, external_reference: str
    ) -> ProviderSubscription | None: ...

    def get_authorized_payment(self, payment_id: str) -> dict | None:
        """Cobrança recorrente (`subscription_authorized_payment`). Opcional: `None` = não suportado."""
        return None


class MercadoPagoClient(BillingProvider):
    """Cliente HTTP síncrono (httpx) para a API de assinaturas do Mercado Pago."""

    def __init__(
        self,
        access_token: str,
        base_url: str = "https://api.mercadopago.com",
        timeout: float = 10.0,
    ) -> None:
        if not access_token:
            raise ServiceUnavailable(BILLING_DISABLED_MESSAGE, code="billing_disabled")
        self._token = access_token
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    # --- HTTP ------------------------------------------------------------------
    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        params: dict | None = None,
        idempotency_key: str | None = None,
    ) -> dict:
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if idempotency_key:
            headers["X-Idempotency-Key"] = idempotency_key
        url = f"{self._base_url}{path}"
        try:
            with httpx.Client(timeout=self._timeout) as client:
                resp = client.request(method, url, json=json, params=params, headers=headers)
        except httpx.HTTPError as exc:
            log.warning("mercadopago.http_error", method=method, path=path, error=str(exc))
            raise ProviderError("Não foi possível falar com o provedor de pagamento.") from exc
        if resp.status_code >= 400:
            try:
                payload = resp.json()
            except ValueError:
                payload = {"raw": resp.text[:500]}
            log.warning("mercadopago.api_error", method=method, path=path, status=resp.status_code)
            raise ProviderError(
                f"O provedor de pagamento respondeu com erro ({resp.status_code}).",
                status_code=resp.status_code,
                payload=payload,
            )
        if not resp.content:
            return {}
        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderError("Resposta inválida do provedor de pagamento.") from exc
        return data if isinstance(data, dict) else {"results": data}

    # --- API -------------------------------------------------------------------
    def create_preapproval(
        self,
        *,
        reason: str,
        external_reference: str,
        payer_email: str,
        amount: float,
        currency: str,
        frequency: int,
        frequency_type: str,
        back_url: str,
    ) -> ProviderSubscription:
        body = {
            "reason": reason,
            "external_reference": external_reference,
            "payer_email": payer_email,
            "auto_recurring": {
                "frequency": frequency,
                "frequency_type": frequency_type,
                "transaction_amount": round(float(amount), 2),
                "currency_id": currency,
            },
            "back_url": back_url,
            "status": "pending",
        }
        data = self._request(
            "POST", "/preapproval", json=body, idempotency_key=f"preapproval-{external_reference}"
        )
        sub = subscription_from_payload(data)
        if not sub.id:
            raise ProviderError("O provedor não devolveu o identificador da assinatura.")
        return sub

    def get_preapproval(self, preapproval_id: str) -> ProviderSubscription:
        data = self._request("GET", f"/preapproval/{preapproval_id}")
        return subscription_from_payload(data)

    def cancel_preapproval(self, preapproval_id: str) -> ProviderSubscription:
        data = self._request("PUT", f"/preapproval/{preapproval_id}", json={"status": "cancelled"})
        if not data.get("id"):
            data = {**data, "id": preapproval_id}
        return subscription_from_payload(data)

    def search_preapproval_by_external_reference(
        self, external_reference: str
    ) -> ProviderSubscription | None:
        data = self._request(
            "GET",
            "/preapproval/search",
            params={"external_reference": external_reference, "limit": 10},
        )
        results = data.get("results") or []
        matches = [
            subscription_from_payload(r)
            for r in results
            if isinstance(r, dict) and r.get("external_reference") == external_reference
        ]
        if not matches:
            return None
        # prefere a autorizada; senão a mais recente
        for m in matches:
            if m.status == "authorized":
                return m
        matches.sort(
            key=lambda m: m.last_modified or m.date_created or datetime.min.replace(tzinfo=UTC)
        )
        return matches[-1]

    def get_authorized_payment(self, payment_id: str) -> dict | None:
        data = self._request("GET", f"/authorized_payments/{payment_id}")
        return data or None


# --- Assinatura de webhooks -----------------------------------------------------


def parse_signature_header(value: str | None) -> dict[str, str]:
    parts: dict[str, str] = {}
    for chunk in (value or "").split(","):
        if "=" not in chunk:
            continue
        k, v = chunk.split("=", 1)
        parts[k.strip()] = v.strip()
    return parts


def build_webhook_manifest(*, data_id: str | None, x_request_id: str | None, ts: str) -> str:
    """`id:{data.id};request-id:{x-request-id};ts:{ts};` — partes ausentes são omitidas."""
    manifest = ""
    if data_id:
        manifest += f"id:{str(data_id).lower()};"
    if x_request_id:
        manifest += f"request-id:{x_request_id};"
    manifest += f"ts:{ts};"
    return manifest


def sign_webhook_manifest(secret: str, manifest: str) -> str:
    return hmac.new(secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_webhook_signature(
    *, x_signature: str | None, x_request_id: str | None, data_id: str | None, secret: str | None
) -> bool:
    if not x_signature or not secret:
        return False
    parts = parse_signature_header(x_signature)
    ts, v1 = parts.get("ts"), parts.get("v1")
    if not ts or not v1:
        return False
    expected = sign_webhook_manifest(
        secret, build_webhook_manifest(data_id=data_id, x_request_id=x_request_id, ts=ts)
    )
    return hmac.compare_digest(expected.encode("utf-8"), v1.lower().encode("utf-8"))


# --- Injeção do provedor ----------------------------------------------------------

_provider_override: BillingProvider | None = None


def set_provider_override(provider: BillingProvider | None) -> None:
    """Usado por testes para injetar um provedor falso (None restaura o comportamento normal)."""
    global _provider_override
    _provider_override = provider


def build_provider() -> BillingProvider:
    if not settings.billing_enabled:
        raise ServiceUnavailable(BILLING_DISABLED_MESSAGE, code="billing_disabled")
    if settings.BILLING_PROVIDER == "asaas":
        from app.integrations.asaas import build_asaas_client

        return build_asaas_client()
    if settings.BILLING_PROVIDER != "mercadopago":
        raise ServiceUnavailable(BILLING_DISABLED_MESSAGE, code="billing_disabled")
    return MercadoPagoClient(
        access_token=settings.MERCADOPAGO_ACCESS_TOKEN or "",
        base_url=settings.MERCADOPAGO_API_BASE,
        timeout=10.0,
    )


def get_provider() -> BillingProvider:
    """Dependência FastAPI / fábrica para jobs. Sem credenciais → 503 honesto."""
    if _provider_override is not None:
        return _provider_override
    return build_provider()
