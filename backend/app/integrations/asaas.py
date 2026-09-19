"""Adaptador do Asaas (checkout hospedado + assinatura recorrente), na interface `BillingProvider`.

Mesmo desenho do ai-runner: o checkout do Asaas (`POST /v3/checkouts`, `chargeTypes=RECURRENT`,
cartão) coleta CPF e cartão na página do próprio Asaas, então o Estudatta nunca vê documento nem
dado de pagamento. O `externalReference` do checkout passa para a assinatura e as cobranças.

Regra do Estudatta mantida: o estado local sai de uma CONSULTA ao Asaas, nunca do conteúdo do
webhook. `get_preapproval` lê a assinatura (`GET /subscriptions/{id}`) e as cobranças dela
(`GET /subscriptions/{id}/payments`) e normaliza para `pending | authorized | cancelled`:

- assinatura removida, `INACTIVE` ou `EXPIRED`             → `cancelled`;
- `ACTIVE` sem nenhuma cobrança paga                        → `pending` (checkout não concluído);
- `ACTIVE` com cobrança paga                                → `authorized`; o fim do período é o
  vencimento da cobrança em aberto mais antiga ou, sem nenhuma, o `nextDueDate`.

Webhook: o Asaas envia o token cadastrado no cabeçalho `asaas-access-token`
(comparação em tempo constante em `verify_webhook_token`).
"""

from __future__ import annotations

import base64
import hmac
from datetime import UTC, date, datetime, time
from functools import lru_cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings
from app.core.errors import ServiceUnavailable
from app.core.logging import get_logger
from app.integrations.mercadopago import (
    BILLING_DISABLED_MESSAGE,
    BillingProvider,
    ProviderError,
    ProviderSubscription,
    parse_provider_datetime,
)

log = get_logger("billing.asaas")

ASAAS_PROVIDER_NAME = "asaas"
PRODUCTION_BASE = "https://api.asaas.com/v3"
SANDBOX_BASE = "https://api-sandbox.asaas.com/v3"
BR = ZoneInfo("America/Sao_Paulo")

PAID_STATUSES = {"CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"}
OPEN_STATUSES = {"PENDING", "OVERDUE", "AWAITING_RISK_ANALYSIS"}
CLOSED_SUB_STATUSES = {"INACTIVE", "EXPIRED"}

# Eventos que o webhook assina no Asaas (todos só disparam uma consulta)
WEBHOOK_EVENTS = sorted(
    {
        "PAYMENT_CONFIRMED",
        "PAYMENT_RECEIVED",
        "PAYMENT_OVERDUE",
        "PAYMENT_REFUNDED",
        "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
        "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
        "SUBSCRIPTION_CREATED",
        "SUBSCRIPTION_UPDATED",
        "SUBSCRIPTION_INACTIVATED",
        "SUBSCRIPTION_DELETED",
    }
)


def asaas_base_url(api_key: str, environment: str) -> str:
    if environment == "auto":
        # chaves de sandbox trazem "hmlg" no prefixo ($aact_hmlg_...)
        environment = "sandbox" if "hmlg" in (api_key or "")[:20] else "production"
    return SANDBOX_BASE if environment == "sandbox" else PRODUCTION_BASE


def verify_webhook_token(received: str | None, expected: str | None) -> bool:
    if not expected or not received:
        return False
    return hmac.compare_digest(expected.encode("utf-8"), received.encode("utf-8"))


def _due_to_datetime(value: Any) -> datetime | None:
    """Vencimento (data, horário de Brasília) → fim daquele dia em UTC."""
    if not value:
        return None
    try:
        d = date.fromisoformat(str(value)[:10])
    except ValueError:
        return parse_provider_datetime(value)
    return datetime.combine(d, time(23, 59, 59), tzinfo=BR).astimezone(UTC)


@lru_cache
def _item_image(path: str | None) -> str:
    """O checkout do Asaas exige uma imagem por item: usamos o ícone do Estudatta."""
    p = Path(path) if path else Path(__file__).parent / "assets" / "checkout_item.png"
    return base64.b64encode(p.read_bytes()).decode()


class AsaasClient(BillingProvider):
    """Cliente HTTP síncrono (httpx). `transport` permite testes com `httpx.MockTransport`."""

    name = ASAAS_PROVIDER_NAME

    def __init__(
        self,
        api_key: str,
        *,
        environment: str = "auto",
        checkout_minutes: int = 60,
        item_image_path: str | None = None,
        timeout: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise ServiceUnavailable(BILLING_DISABLED_MESSAGE, code="billing_disabled")
        self._key = api_key
        self.base_url = asaas_base_url(api_key, environment)
        self._minutes = checkout_minutes
        self._image_path = item_image_path
        self._timeout = timeout
        self._transport = transport

    # --- HTTP --------------------------------------------------------------------
    def _request(
        self, method: str, path: str, *, json: Any = None, params: dict | None = None
    ) -> Any:
        try:
            with httpx.Client(timeout=self._timeout, transport=self._transport) as client:
                res = client.request(
                    method,
                    f"{self.base_url}{path}",
                    json=json,
                    params=params,
                    headers={
                        "access_token": self._key,
                        "Content-Type": "application/json",
                        "User-Agent": f"{settings.APP_NAME}-backend",
                    },
                )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Falha de rede ao chamar o Asaas: {type(exc).__name__}") from exc
        if res.status_code >= 400:
            try:
                errors = [
                    str(e.get("description") or e.get("code")) for e in res.json().get("errors", [])
                ][:5]
            except Exception:  # noqa: BLE001
                errors = [res.text[:300]]
            raise ProviderError(
                f"Asaas respondeu {res.status_code}: {'; '.join(errors) or 'sem detalhes'}",
                status_code=res.status_code,
            )
        return res.json() if res.content else {}

    # --- Checkout ---------------------------------------------------------------------
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
        yearly = frequency_type == "months" and frequency == 12
        sep = "&" if "?" in back_url else "?"
        payload = {
            "billingTypes": ["CREDIT_CARD"],  # recorrência no checkout do Asaas é só no cartão
            "chargeTypes": ["RECURRENT"],
            "minutesToExpire": self._minutes,
            "externalReference": external_reference,
            "callback": {
                "successUrl": f"{back_url}{sep}status=sucesso",
                "cancelUrl": f"{back_url}{sep}status=cancelado",
                "expiredUrl": f"{back_url}{sep}status=expirado",
            },
            "items": [
                {
                    "name": reason.split(" — ")[-1][:30],
                    "description": reason[:150],
                    "quantity": 1,
                    "value": round(amount, 2),
                    "externalReference": external_reference,
                    "imageBase64": _item_image(self._image_path),
                }
            ],
            "subscription": {
                "cycle": "YEARLY" if yearly else "MONTHLY",
                "nextDueDate": datetime.now(BR).date().isoformat(),
            },
        }
        data = self._request("POST", "/checkouts", json=payload)
        link = data.get("link") or ""
        checkout_id = str(data.get("id") or "")
        if not link or not checkout_id:
            raise ProviderError("O Asaas não devolveu o link do checkout.")
        # a assinatura só existe no Asaas depois do pagamento: id vazio até lá
        return ProviderSubscription(
            id="",
            status="pending",
            external_reference=external_reference,
            init_point=link,
            raw={"checkout_id": checkout_id},
        )

    # --- Consulta ----------------------------------------------------------------------
    def get_preapproval(self, preapproval_id: str) -> ProviderSubscription:
        sub = self._request("GET", f"/subscriptions/{preapproval_id}")
        return self._normalize(sub)

    def search_preapproval_by_external_reference(
        self, external_reference: str
    ) -> ProviderSubscription | None:
        data = self._request(
            "GET", "/subscriptions", params={"externalReference": external_reference, "limit": 10}
        )
        items = [
            s for s in (data.get("data") or []) if s.get("externalReference") == external_reference
        ]
        if not items:
            return None
        active = [s for s in items if not s.get("deleted") and s.get("status") == "ACTIVE"]
        return self._normalize((active or items)[0])

    def cancel_preapproval(self, preapproval_id: str) -> ProviderSubscription:
        # remover só impede cobranças futuras; o período já pago continua valendo aqui
        self._request("DELETE", f"/subscriptions/{preapproval_id}")
        return ProviderSubscription(id=preapproval_id, status="cancelled", raw={"deleted": True})

    def _normalize(self, sub: dict) -> ProviderSubscription:
        sub_id = str(sub.get("id") or "")
        status = str(sub.get("status") or "").upper()
        base = {
            "id": sub_id,
            "external_reference": sub.get("externalReference"),
            "payer_id": str(sub.get("customer")) if sub.get("customer") else None,
            "date_created": _due_to_datetime(sub.get("dateCreated")),
            "raw": {
                k: sub.get(k) for k in ("id", "status", "cycle", "value", "nextDueDate", "deleted")
            },
        }
        if sub.get("deleted") or status in CLOSED_SUB_STATUSES:
            return ProviderSubscription(status="cancelled", **base)
        payments = (
            self._request("GET", f"/subscriptions/{sub_id}/payments", params={"limit": 100}).get(
                "data"
            )
            or []
        )
        paid = [p for p in payments if str(p.get("status") or "").upper() in PAID_STATUSES]
        if not paid:
            return ProviderSubscription(status="pending", **base)
        open_dues = sorted(
            d
            for d in (
                _due_to_datetime(p.get("dueDate"))
                for p in payments
                if str(p.get("status") or "").upper() in OPEN_STATUSES
            )
            if d
        )
        period_end = open_dues[0] if open_dues else _due_to_datetime(sub.get("nextDueDate"))
        return ProviderSubscription(status="authorized", next_payment_date=period_end, **base)

    # --- Webhooks (cadastro via CLI) ------------------------------------------------------
    def list_webhooks(self) -> list[dict]:
        return list(self._request("GET", "/webhooks").get("data") or [])

    def create_webhook(self, *, url: str, email: str, token: str) -> dict:
        return self._request(
            "POST",
            "/webhooks",
            json={
                "name": f"{settings.APP_NAME} assinaturas",
                "url": url,
                "email": email,
                "enabled": True,
                "interrupted": False,
                "apiVersion": 3,
                "authToken": token,
                "sendType": "SEQUENTIALLY",
                "events": WEBHOOK_EVENTS,
            },
        )

    def delete_webhook(self, webhook_id: str) -> None:
        self._request("DELETE", f"/webhooks/{webhook_id}")


def build_asaas_client() -> AsaasClient:
    return AsaasClient(
        settings.ASAAS_API_KEY or "",
        environment=settings.ASAAS_ENVIRONMENT,
        checkout_minutes=settings.ASAAS_CHECKOUT_MINUTES,
        item_image_path=settings.ASAAS_ITEM_IMAGE_PATH,
    )
