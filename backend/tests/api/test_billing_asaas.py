"""Cobrança pelo Asaas: checkout hospedado (recorrente no cartão), webhook com token, estado
sempre consultado no Asaas, renovação, atraso, cancelamento e reconciliação."""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.integrations.asaas import SANDBOX_BASE, AsaasClient, asaas_base_url
from app.integrations.mercadopago import set_provider_override
from app.models.billing import BillingEvent, Subscription
from app.services import billing as billing_service
from tests.api.test_billing import set_price

TOKEN = "t" * 40
URL = "/api/v1/billing/webhooks/asaas"


class FakeAsaas:
    """Servidor Asaas em memória (só os endpoints que o Estudatta usa)."""

    def __init__(self) -> None:
        self.checkouts: dict[str, dict] = {}
        self.subs: dict[str, dict] = {}
        self.payments: dict[str, list[dict]] = {}
        self.calls: list[tuple[str, str]] = []
        self.fail = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/v3")
        self.calls.append((request.method, path))
        assert request.headers["access_token"] == "$aact_hmlg_teste"
        if self.fail:
            return httpx.Response(500, json={"errors": [{"description": "indisponível"}]})
        if request.method == "POST" and path == "/checkouts":
            body = json.loads(request.content)
            cid = f"chk_{len(self.checkouts) + 1}"
            self.checkouts[cid] = body
            return httpx.Response(
                200,
                json={
                    "id": cid,
                    "link": f"https://sandbox.asaas.com/checkoutSession/show?id={cid}",
                },
            )
        if request.method == "GET" and path == "/subscriptions":
            ref = request.url.params.get("externalReference")
            return httpx.Response(
                200, json={"data": [s for s in self.subs.values() if s["externalReference"] == ref]}
            )
        if path.startswith("/subscriptions/"):
            parts = path.split("/")
            sid = parts[2]
            if sid not in self.subs:
                return httpx.Response(404, json={"errors": [{"description": "não encontrado"}]})
            if request.method == "DELETE":
                self.subs[sid]["deleted"] = True
                return httpx.Response(200, json={"deleted": True, "id": sid})
            if len(parts) == 4 and parts[3] == "payments":
                return httpx.Response(200, json={"data": self.payments.get(sid, [])})
            return httpx.Response(200, json=self.subs[sid])
        return httpx.Response(404, json={"errors": [{"description": f"rota {path}"}]})

    # simulação do que o Asaas faz quando a pessoa paga o checkout
    def pay_checkout(self, cid: str, *, sid="sub_1", next_due: date | None = None) -> dict:
        ref = self.checkouts[cid]["externalReference"]
        self.subs[sid] = {
            "id": sid,
            "status": "ACTIVE",
            "externalReference": ref,
            "customer": "cus_1",
            "nextDueDate": (next_due or date.today() + timedelta(days=30)).isoformat(),
            "deleted": False,
        }
        pay = {
            "id": "pay_1",
            "subscription": sid,
            "status": "CONFIRMED",
            "dueDate": date.today().isoformat(),
            "externalReference": ref,
            "checkoutSession": cid,
            "value": 19.9,
        }
        self.payments[sid] = [pay]
        return pay


@pytest.fixture
def asaas(monkeypatch):
    fake = FakeAsaas()
    monkeypatch.setattr(settings, "BILLING_MODE", "test")
    monkeypatch.setattr(settings, "BILLING_PROVIDER", "asaas")
    monkeypatch.setattr(settings, "ASAAS_API_KEY", "$aact_hmlg_teste")
    monkeypatch.setattr(settings, "ASAAS_WEBHOOK_TOKEN", TOKEN)
    client = AsaasClient("$aact_hmlg_teste", transport=httpx.MockTransport(fake.handler))
    set_provider_override(client)
    yield fake
    set_provider_override(None)


def hook(
    client,
    event: str,
    *,
    payment: dict | None = None,
    subscription: dict | None = None,
    evt="evt_1",
    token=TOKEN,
):
    body = {"id": evt, "event": event, "dateCreated": "2026-09-19 10:00:00"}
    if payment:
        body["payment"] = payment
    if subscription:
        body["subscription"] = subscription
    return client.post(URL, json=body, headers={"asaas-access-token": token} if token else {})


def checkout(client) -> str:
    set_price(1990)
    r = client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 201, r.text
    return r.json()["checkout_url"].split("id=")[1]


def test_environment_follows_key_prefix():
    assert asaas_base_url("$aact_hmlg_abc", "auto") == SANDBOX_BASE
    assert asaas_base_url("$aact_prod_abc", "auto").startswith("https://api.asaas.com")
    assert asaas_base_url("$aact_prod_abc", "sandbox") == SANDBOX_BASE


def test_checkout_is_recurrent_card_with_our_reference_and_grants_nothing(user_client, asaas):
    cid = checkout(user_client)
    body = asaas.checkouts[cid]
    assert body["chargeTypes"] == ["RECURRENT"] and body["billingTypes"] == ["CREDIT_CARD"]
    assert body["subscription"]["cycle"] == "MONTHLY" and body["items"][0]["value"] == 19.9
    assert body["items"][0]["imageBase64"] and body["callback"]["successUrl"].startswith(
        settings.APP_URL
    )
    with SessionLocal() as db:
        sub = db.execute(select(Subscription)).scalar_one()
        assert sub.provider == "asaas" and sub.provider_ref is None and sub.status == "pending"
        assert (
            sub.metadata_["checkout_id"] == cid
            and body["externalReference"] == sub.external_reference
        )
    # voltar do checkout não libera o plano
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "free"
    # anual vira ciclo YEARLY
    set_price(19080, "year")
    with SessionLocal() as db:
        db.execute(select(Subscription)).scalar_one().status = "expired"
        db.commit()
    r = user_client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "year"})
    assert r.status_code == 201 and asaas.checkouts["chk_2"]["subscription"]["cycle"] == "YEARLY"


def test_payment_webhook_activates_after_querying_asaas_and_is_idempotent(user_client, asaas):
    cid = checkout(user_client)
    pay = asaas.pay_checkout(cid)
    r = hook(user_client, "PAYMENT_CONFIRMED", payment=pay)
    assert r.status_code == 200 and r.json()["status"] == "processed", r.text
    state = user_client.get("/api/v1/billing/subscription").json()
    assert (
        state["subscription"]["status"] == "active" and state["entitlements"]["plan_code"] == "pro"
    )
    # vencimento vale até o fim do dia no horário de Brasília
    next_br = datetime.fromisoformat(state["next_charge_at"]).astimezone(
        ZoneInfo("America/Sao_Paulo")
    )
    assert next_br.date() == date.today() + timedelta(days=30)
    assert ("GET", "/subscriptions/sub_1") in asaas.calls and (
        "GET",
        "/subscriptions/sub_1/payments",
    ) in asaas.calls
    # mesmo evento de novo: não reprocessa
    assert hook(user_client, "PAYMENT_CONFIRMED", payment=pay).json()["status"] == "duplicate"
    with SessionLocal() as db:
        ev = db.execute(select(BillingEvent).where(BillingEvent.provider == "asaas")).scalar_one()
        assert "creditCard" not in json.dumps(ev.payload)


def test_invalid_or_missing_token_is_rejected(user_client, asaas):
    cid = checkout(user_client)
    pay = asaas.pay_checkout(cid)
    assert hook(user_client, "PAYMENT_CONFIRMED", payment=pay, token="errado").status_code == 401
    assert (
        hook(user_client, "PAYMENT_CONFIRMED", payment=pay, evt="evt_2", token=None).status_code
        == 401
    )
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "free"


def test_event_content_is_not_trusted(user_client, asaas):
    """Um evento "pago" sem cobrança paga no Asaas não ativa nada."""
    cid = checkout(user_client)
    ref = asaas.checkouts[cid]["externalReference"]
    asaas.subs["sub_9"] = {
        "id": "sub_9",
        "status": "ACTIVE",
        "externalReference": ref,
        "nextDueDate": date.today().isoformat(),
    }
    asaas.payments["sub_9"] = [
        {"id": "pay_9", "status": "PENDING", "dueDate": date.today().isoformat()}
    ]
    r = hook(
        user_client,
        "PAYMENT_CONFIRMED",
        payment={"id": "pay_9", "subscription": "sub_9", "externalReference": ref},
    )
    assert r.json()["status"] == "processed"
    assert (
        user_client.get("/api/v1/billing/subscription").json()["subscription"]["status"]
        == "pending"
    )


def test_overdue_renewal_moves_period_end_and_then_past_due(user_client, asaas):
    cid = checkout(user_client)
    pay = asaas.pay_checkout(cid)
    hook(user_client, "PAYMENT_CONFIRMED", payment=pay)
    overdue_day = date.today() - timedelta(days=5)
    asaas.payments["sub_1"].append(
        {
            "id": "pay_2",
            "subscription": "sub_1",
            "status": "OVERDUE",
            "dueDate": overdue_day.isoformat(),
        }
    )
    r = hook(
        user_client,
        "PAYMENT_OVERDUE",
        payment={"id": "pay_2", "subscription": "sub_1"},
        evt="evt_2",
    )
    assert r.json()["status"] == "processed"
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db)
        db.commit()
    assert summary["past_due"] + summary["expired"] >= 1
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "free"


def test_cancel_deletes_on_asaas_and_keeps_access_until_period_end(user_client, asaas):
    cid = checkout(user_client)
    hook(user_client, "PAYMENT_CONFIRMED", payment=asaas.pay_checkout(cid))
    r = user_client.post("/api/v1/billing/cancel")
    assert r.status_code == 200, r.text
    assert ("DELETE", "/subscriptions/sub_1") in asaas.calls and asaas.subs["sub_1"]["deleted"]
    body = r.json()
    assert (
        body["subscription"]["status"] == "cancelled" and body["entitlements"]["plan_code"] == "pro"
    )
    # o webhook de exclusão depois não muda nada de errado
    r = hook(
        user_client,
        "SUBSCRIPTION_DELETED",
        subscription={"id": "sub_1", "externalReference": asaas.subs["sub_1"]["externalReference"]},
        evt="evt_del",
    )
    assert r.json()["status"] == "processed"
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "pro"


def test_reconcile_finds_paid_checkout_whose_webhook_was_lost(user_client, asaas):
    cid = checkout(user_client)
    asaas.pay_checkout(cid)
    with SessionLocal() as db:
        sub = db.execute(select(Subscription)).scalar_one()
        sub.created_at = utcnow() - timedelta(hours=2)
        db.commit()
        summary = billing_service.reconcile_subscriptions(db)
        db.commit()
        assert db.execute(select(Subscription)).scalar_one().provider_ref == "sub_1"
    assert summary["synced"] == 1
    assert (
        user_client.get("/api/v1/billing/subscription").json()["subscription"]["status"] == "active"
    )


def test_unrelated_events_are_ignored_and_provider_failure_retries(user_client, asaas):
    r = hook(
        user_client,
        "PAYMENT_CONFIRMED",
        payment={"id": "pay_x", "externalReference": "nao-e-nosso"},
    )
    assert r.status_code == 200 and r.json()["status"] == "ignored"
    cid = checkout(user_client)
    pay = asaas.pay_checkout(cid)
    asaas.fail = True
    r = hook(user_client, "PAYMENT_CONFIRMED", payment=pay, evt="evt_f")
    assert r.status_code == 503
    asaas.fail = False
    r = hook(user_client, "PAYMENT_CONFIRMED", payment=pay, evt="evt_f")
    assert r.status_code == 200 and r.json()["status"] == "processed"


def test_webhook_disabled_without_token(user_client, asaas, monkeypatch):
    monkeypatch.setattr(settings, "ASAAS_WEBHOOK_TOKEN", None)
    assert hook(user_client, "PAYMENT_CONFIRMED", payment={"id": "p"}).status_code == 503
