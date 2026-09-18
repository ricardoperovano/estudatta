"""Cobrança: checkout não concede acesso, webhook assinado/idempotente/fora de ordem,
cancelamento mantém acesso até o fim do período, reconciliação e rebaixamento sem perda."""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.integrations.mercadopago import (
    BillingProvider,
    ProviderError,
    build_webhook_manifest,
    set_provider_override,
    sign_webhook_manifest,
    subscription_from_payload,
    verify_webhook_signature,
)
from app.models.activity import Activity
from app.models.billing import BillingEvent, Plan, PlanPrice, Subscription
from app.models.notification import Notification
from app.models.system import AuditLog
from app.models.user import User
from app.services import billing as billing_service
from tests.conftest import make_activity, signup

WEBHOOK_SECRET = "segredo-de-teste-webhook"
WEBHOOK_URL = "/api/v1/billing/webhooks/mercadopago"


class FakeProvider(BillingProvider):
    """Provedor em memória: simula o estado real das assinaturas no Mercado Pago."""

    name = "mercadopago"

    def __init__(self) -> None:
        self.store: dict[str, dict] = {}
        self.calls: list[tuple[str, str]] = []
        self.fail: set[str] = set()
        self.payments: dict[str, str] = {}
        self._n = 0

    def _maybe_fail(self, op: str) -> None:
        if op in self.fail:
            raise ProviderError(f"falha simulada em {op}")

    def create_preapproval(
        self,
        *,
        reason,
        external_reference,
        payer_email,
        amount,
        currency,
        frequency,
        frequency_type,
        back_url,
    ):
        self.calls.append(("create", external_reference))
        self._maybe_fail("create")
        self._n += 1
        pid = f"2c93808{self._n:04d}fake"
        self.store[pid] = {
            "id": pid,
            "status": "pending",
            "external_reference": external_reference,
            "init_point": f"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id={pid}",
            "payer_email": payer_email,
            "reason": reason,
            "back_url": back_url,
            "auto_recurring": {
                "frequency": frequency,
                "frequency_type": frequency_type,
                "transaction_amount": amount,
                "currency_id": currency,
            },
            "next_payment_date": None,
            "date_created": utcnow().isoformat(),
        }
        return subscription_from_payload(self.store[pid])

    def get_preapproval(self, preapproval_id):
        self.calls.append(("get", preapproval_id))
        self._maybe_fail("get")
        data = self.store.get(preapproval_id)
        if data is None:
            raise ProviderError("não encontrado", status_code=404)
        return subscription_from_payload(data)

    def cancel_preapproval(self, preapproval_id):
        self.calls.append(("cancel", preapproval_id))
        self._maybe_fail("cancel")
        data = self.store[preapproval_id]
        data["status"] = "cancelled"
        return subscription_from_payload(data)

    def search_preapproval_by_external_reference(self, external_reference):
        self.calls.append(("search", external_reference))
        self._maybe_fail("search")
        for d in self.store.values():
            if d["external_reference"] == external_reference:
                return subscription_from_payload(d)
        return None

    def get_authorized_payment(self, payment_id):
        pid = self.payments.get(payment_id)
        return {"id": payment_id, "preapproval_id": pid} if pid else None

    def set_status(self, preapproval_id, status, *, next_payment_date=None):
        d = self.store[preapproval_id]
        d["status"] = status
        d["payer_id"] = 123456
        if next_payment_date is not None:
            d["next_payment_date"] = next_payment_date.isoformat()

    def count(self, op: str) -> int:
        return sum(1 for c in self.calls if c[0] == op)


@pytest.fixture
def fake():
    provider = FakeProvider()
    set_provider_override(provider)
    yield provider
    set_provider_override(None)


@pytest.fixture
def billing_on(monkeypatch, fake):
    monkeypatch.setattr(settings, "BILLING_MODE", "test")
    monkeypatch.setattr(settings, "MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    monkeypatch.setattr(settings, "MERCADOPAGO_WEBHOOK_SECRET", WEBHOOK_SECRET)
    return fake


def set_price(amount_cents: int | None, interval: str = "month") -> None:
    with SessionLocal() as db:
        pro = db.execute(select(Plan).where(Plan.code == "pro")).scalar_one()
        price = db.execute(
            select(PlanPrice).where(PlanPrice.plan_id == pro.id, PlanPrice.interval == interval)
        ).scalar_one()
        price.amount_cents = amount_cents
        db.commit()


def webhook_headers(data_id: str, *, request_id="req-1", ts="1700000000", valid=True) -> dict:
    manifest = build_webhook_manifest(data_id=data_id, x_request_id=request_id, ts=ts)
    v1 = sign_webhook_manifest(WEBHOOK_SECRET, manifest) if valid else "0" * 64
    return {"x-signature": f"ts={ts},v1={v1}", "x-request-id": request_id}


def post_webhook(
    client,
    data_id: str,
    event_id: str,
    *,
    valid=True,
    topic="subscription_preapproval",
    action="updated",
    extra_data: dict | None = None,
):
    body = {
        "id": event_id,
        "live_mode": False,
        "type": topic,
        "date_created": "2026-09-15T12:00:00Z",
        "user_id": 1,
        "api_version": "v1",
        "action": action,
        "data": {"id": data_id, **(extra_data or {})},
    }
    return client.post(
        f"{WEBHOOK_URL}?data.id={data_id}&type={topic}",
        json=body,
        headers=webhook_headers(data_id, valid=valid, request_id=f"req-{event_id}"),
    )


def start_pro(client, fake: FakeProvider, amount=2990) -> tuple[dict, str]:
    set_price(amount)
    r = client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 201, r.text
    data = r.json()
    pid = data["checkout_url"].split("preapproval_id=")[1]
    assert pid in fake.store
    return data, pid


def activate_pro(client, fake: FakeProvider) -> tuple[dict, str]:
    data, pid = start_pro(client, fake)
    fake.set_status(pid, "authorized", next_payment_date=utcnow() + timedelta(days=30))
    r = post_webhook(client, pid, "evt-authorized")
    assert r.status_code == 200 and r.json()["status"] == "processed", r.text
    return data, pid


# --- Assinatura de webhook (unidade) ----------------------------------------------------------


def test_signature_manifest_follows_official_template():
    assert (
        build_webhook_manifest(data_id="ABC123", x_request_id="rid", ts="1704908010")
        == "id:abc123;request-id:rid;ts:1704908010;"
    )
    assert build_webhook_manifest(data_id=None, x_request_id=None, ts="1") == "ts:1;"
    v1 = sign_webhook_manifest("s3cr3t", "id:abc123;request-id:rid;ts:1704908010;")
    assert verify_webhook_signature(
        x_signature=f"ts=1704908010,v1={v1}", x_request_id="rid", data_id="ABC123", secret="s3cr3t"
    )
    assert not verify_webhook_signature(
        x_signature=f"ts=1704908010,v1={v1}", x_request_id="rid", data_id="abc124", secret="s3cr3t"
    )
    assert not verify_webhook_signature(
        x_signature="v1=abc", x_request_id="rid", data_id="abc123", secret="s3cr3t"
    )
    assert not verify_webhook_signature(
        x_signature=f"ts=1704908010,v1={v1}", x_request_id="rid", data_id="ABC123", secret=None
    )


# --- Checkout ---------------------------------------------------------------------------------


def test_checkout_disabled_returns_honest_503(user_client):
    r = user_client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 503, r.text
    err = r.json()["error"]
    assert err["code"] == "billing_disabled"
    assert "gratuito continua disponível" in err["message"]
    r = user_client.get("/api/v1/billing/subscription")
    assert r.status_code == 200
    assert r.json()["billing_mode"] == "disabled"
    assert r.json()["subscription"] is None


def test_checkout_disabled_even_with_fake_provider(user_client, fake):
    r = user_client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing_disabled"
    assert fake.calls == []


def test_checkout_price_not_set_409(user_client, billing_on):
    r = user_client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "price_not_set"
    r = user_client.post(
        "/api/v1/billing/checkout", json={"plan_code": "free", "interval": "month"}
    )
    assert r.status_code == 422
    r = user_client.post(
        "/api/v1/billing/checkout", json={"plan_code": "nada", "interval": "month"}
    )
    assert r.status_code == 404


def test_checkout_return_does_not_grant_access_until_webhook(user_client, billing_on):
    fake = billing_on
    data, pid = start_pro(user_client, fake)
    assert data["status"] == "pending"
    assert fake.count("create") == 1
    # "Voltou da URL de sucesso": nada muda até o provedor confirmar
    r = user_client.get("/api/v1/billing/subscription")
    body = r.json()
    assert body["subscription"]["status"] == "pending"
    assert body["subscription"]["checkout_url"].startswith("https://")
    assert body["entitlements"]["plan_code"] == "free"
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "free"
    # webhook chega, mas o estado real ainda é pending → continua free
    r = post_webhook(user_client, pid, "evt-1")
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert (
        user_client.get("/api/v1/billing/subscription").json()["entitlements"]["plan_code"]
        == "free"
    )
    # provedor autoriza → webhook ativa
    fake.set_status(pid, "authorized", next_payment_date=utcnow() + timedelta(days=30))
    r = post_webhook(user_client, pid, "evt-2")
    assert r.status_code == 200 and r.json()["status"] == "processed"
    body = user_client.get("/api/v1/billing/subscription").json()
    assert body["subscription"]["status"] == "active"
    assert body["entitlements"]["plan_code"] == "pro"
    assert body["entitlements"]["source"] == "subscription"
    assert body["next_charge_at"] is not None
    assert body["cancel_at_period_end"] is False
    # notificação in-app de ativação
    with SessionLocal() as db:
        kinds = [n.kind for n in db.execute(select(Notification)).scalars()]
    assert "billing_active" in kinds


def test_checkout_reuses_recent_pending_subscription(user_client, billing_on):
    a, _ = start_pro(user_client, billing_on)
    r = user_client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 201
    assert r.json()["subscription_id"] == a["subscription_id"]
    assert billing_on.count("create") == 1


def test_checkout_provider_failure_is_honest_and_leaves_no_subscription(user_client, billing_on):
    set_price(2990)
    billing_on.fail.add("create")
    r = user_client.post("/api/v1/billing/checkout", json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "provider_unavailable"
    with SessionLocal() as db:
        assert db.execute(select(Subscription)).scalars().first() is None


# --- Webhook ----------------------------------------------------------------------------------


def test_webhook_without_credentials_503(user_client, fake):
    r = post_webhook(user_client, "x", "evt")
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing_disabled"


def test_webhook_invalid_signature_401_and_event_ignored(user_client, billing_on):
    fake = billing_on
    _, pid = start_pro(user_client, fake)
    fake.set_status(pid, "authorized")
    r = post_webhook(user_client, pid, "evt-bad", valid=False)
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_signature"
    with SessionLocal() as db:
        ev = db.execute(select(BillingEvent)).scalar_one()
        assert ev.signature_valid is False and ev.status == "ignored"
        assert ev.error == "invalid_signature"
        sub = db.execute(select(Subscription)).scalar_one()
        assert sub.status == "pending"
    assert fake.count("get") == 0
    # o evento legítimo com o mesmo id ainda pode ser processado (não foi "envenenado")
    r = post_webhook(user_client, pid, "evt-bad", valid=True)
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert (
        user_client.get("/api/v1/billing/subscription").json()["subscription"]["status"] == "active"
    )


def test_webhook_duplicate_is_processed_once(user_client, billing_on):
    fake = billing_on
    _, pid = start_pro(user_client, fake)
    fake.set_status(pid, "authorized")
    r1 = post_webhook(user_client, pid, "evt-dup")
    r2 = post_webhook(user_client, pid, "evt-dup")
    assert r1.status_code == 200 and r1.json()["status"] == "processed"
    assert r2.status_code == 200 and r2.json()["status"] == "duplicate"
    assert fake.count("get") == 1
    with SessionLocal() as db:
        assert len(list(db.execute(select(BillingEvent)).scalars())) == 1


def test_webhook_out_of_order_old_cancelled_does_not_downgrade(user_client, billing_on):
    fake = billing_on
    _, pid = activate_pro(user_client, fake)
    # evento "antigo" dizendo cancelled chega depois; o estado real continua authorized
    r = post_webhook(
        user_client, pid, "evt-old", action="updated", extra_data={"status": "cancelled"}
    )
    assert r.status_code == 200 and r.json()["status"] == "processed"
    body = user_client.get("/api/v1/billing/subscription").json()
    assert body["subscription"]["status"] == "active"
    assert body["entitlements"]["plan_code"] == "pro"


def test_webhook_unknown_resource_or_topic_is_ignored(user_client, billing_on):
    r = post_webhook(user_client, "nao-existe", "evt-x")
    assert r.status_code == 200 and r.json()["status"] == "ignored"
    r = post_webhook(user_client, "123", "evt-y", topic="payment")
    assert r.status_code == 200 and r.json()["status"] == "ignored"


def test_webhook_authorized_payment_resolves_preapproval(user_client, billing_on):
    fake = billing_on
    _, pid = start_pro(user_client, fake)
    fake.set_status(pid, "authorized")
    fake.payments["pay-1"] = pid
    r = post_webhook(user_client, "pay-1", "evt-pay", topic="subscription_authorized_payment")
    assert r.status_code == 200 and r.json()["status"] == "processed"
    assert (
        user_client.get("/api/v1/billing/subscription").json()["subscription"]["status"] == "active"
    )


def test_webhook_provider_failure_returns_503_and_can_be_retried(user_client, billing_on):
    fake = billing_on
    _, pid = start_pro(user_client, fake)
    fake.set_status(pid, "authorized")
    fake.fail.add("get")
    r = post_webhook(user_client, pid, "evt-retry")
    assert r.status_code == 503
    fake.fail.discard("get")
    r = post_webhook(user_client, pid, "evt-retry")
    assert r.status_code == 200 and r.json()["status"] == "processed"


# --- Cancelamento e sincronização -----------------------------------------------------------


def test_cancel_keeps_access_until_period_end(user_client, billing_on):
    fake = billing_on
    _, pid = activate_pro(user_client, fake)
    r = user_client.post("/api/v1/billing/cancel")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["subscription"]["status"] == "cancelled"
    assert body["cancel_at_period_end"] is True
    assert body["entitlements"]["plan_code"] == "pro"  # acesso mantido
    assert "mantém o acesso" in body["message"]
    assert fake.count("cancel") == 1 and fake.store[pid]["status"] == "cancelled"
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "pro"
    r = user_client.post("/api/v1/billing/cancel")
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_cancelled"
    # fim do período: reconciliação expira e o acesso volta ao gratuito
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(
            db, provider=fake, now=utcnow() + timedelta(days=40)
        )
        db.commit()
    assert summary["expired"] == 1
    body = user_client.get("/api/v1/billing/subscription").json()
    assert body["entitlements"]["plan_code"] == "free"
    assert body["history"][0]["status"] == "expired"


def test_cancel_when_provider_unavailable_records_intent_and_reconcile_finishes(
    user_client, billing_on
):
    fake = billing_on
    _, pid = activate_pro(user_client, fake)
    fake.fail.add("cancel")
    r = user_client.post("/api/v1/billing/cancel")
    assert r.status_code == 200, r.text
    assert "Cancelamento registrado" in r.json()["message"]
    assert r.json()["cancel_at_period_end"] is True
    assert r.json()["subscription"]["status"] == "active"
    fake.fail.discard("cancel")
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db, provider=fake)
        db.commit()
    assert summary["cancel_retried"] == 1
    body = user_client.get("/api/v1/billing/subscription").json()
    assert body["subscription"]["status"] == "cancelled"
    assert body["entitlements"]["plan_code"] == "pro"


def test_cancel_without_subscription_404(user_client, billing_on):
    r = user_client.post("/api/v1/billing/cancel")
    assert r.status_code == 404 and r.json()["error"]["code"] == "no_subscription"


def test_sync_pulls_provider_state(user_client, billing_on):
    fake = billing_on
    _, pid = start_pro(user_client, fake)
    fake.set_status(pid, "authorized", next_payment_date=utcnow() + timedelta(days=30))
    r = user_client.post("/api/v1/billing/sync")
    assert r.status_code == 200, r.text
    assert r.json()["subscription"]["status"] == "active"
    assert r.json()["entitlements"]["plan_code"] == "pro"
    fake.set_status(pid, "paused")
    r = user_client.post("/api/v1/billing/sync")
    assert r.json()["subscription"]["status"] == "paused"
    assert r.json()["entitlements"]["plan_code"] == "free"


# --- Reconciliação -----------------------------------------------------------------------------


def test_reconcile_expires_stale_pending_and_activates_missed_webhook(user_client, billing_on):
    fake = billing_on
    # 1) pendente com 2h e provedor autorizado (webhook perdido) → ativa
    _, pid = start_pro(user_client, fake)
    fake.set_status(pid, "authorized", next_payment_date=utcnow() + timedelta(days=30))
    with SessionLocal() as db:
        sub = db.execute(select(Subscription)).scalar_one()
        sub.created_at = utcnow() - timedelta(hours=2)
        db.commit()
        summary = billing_service.reconcile_subscriptions(db, provider=fake)
        db.commit()
    assert summary["synced"] == 1
    assert (
        user_client.get("/api/v1/billing/subscription").json()["subscription"]["status"] == "active"
    )
    # 2) pendente antiga (8 dias) de outro usuário → expired, sem consultar o provedor
    user_client.cookies.clear()
    signup(user_client, email="bia@example.com")
    _, pid2 = start_pro(user_client, fake)
    calls_before = fake.count("get")
    with SessionLocal() as db:
        sub2 = db.execute(
            select(Subscription).where(Subscription.provider_ref == pid2)
        ).scalar_one()
        sub2.created_at = utcnow() - timedelta(days=8)
        db.commit()
        summary = billing_service.reconcile_subscriptions(db, provider=fake)
        db.commit()
    assert summary["expired"] == 1
    assert fake.count("get") == calls_before + 1  # só a assinatura ativa foi consultada
    body = user_client.get("/api/v1/billing/subscription").json()
    assert body["subscription"] is None and body["history"][0]["status"] == "expired"
    # reexecutar não muda nada
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db, provider=fake)
        db.commit()
    assert summary["expired"] == 0


def test_reconcile_without_provider_is_safe(user_client):
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db)
        db.commit()
    assert summary["provider_available"] is False and summary["checked"] == 0


# --- Rebaixamento sem perda ---------------------------------------------------------------------


def test_downgrade_pauses_excess_activities_without_deleting(user_client, billing_on):
    fake = billing_on
    _, pid = activate_pro(user_client, fake)
    a = make_activity(user_client, title="Inglês")
    b = make_activity(user_client, title="Violão")
    c = make_activity(user_client, title="Concurso")
    now = utcnow()
    with SessionLocal() as db:
        for act_id, delta in ((a["id"], 3), (b["id"], 2), (c["id"], 1)):
            db.get(Activity, uuid.UUID(act_id)).updated_at = now - timedelta(days=delta)
        db.commit()
    # assinatura cancelada no provedor e período encerrado → expira → plano gratuito
    fake.set_status(pid, "cancelled")
    r = post_webhook(user_client, pid, "evt-cancel")
    assert r.status_code == 200
    assert (
        user_client.get("/api/v1/billing/subscription").json()["entitlements"]["plan_code"] == "pro"
    )
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(
            db, provider=fake, now=now + timedelta(days=45)
        )
        db.commit()
    assert summary["expired"] == 1
    acts = {x["title"]: x["status"] for x in user_client.get("/api/v1/activities").json()}
    assert acts == {"Inglês": "paused", "Violão": "paused", "Concurso": "active"}
    with SessionLocal() as db:
        assert len(list(db.execute(select(Activity)).scalars())) == 3  # nada apagado
        audits = list(
            db.execute(select(AuditLog).where(AuditLog.action == "plan.downgrade_pause")).scalars()
        )
        assert {x.target_id for x in audits} == {a["id"], b["id"]}
        notes = [
            n for n in db.execute(select(Notification)).scalars() if n.kind == "plan_downgrade"
        ]
        assert len(notes) == 1 and "Nada foi apagado" in notes[0].body
        # idempotente
        user = db.execute(select(User).where(User.email == "ana@example.com")).scalar_one()
        assert billing_service.apply_entitlement_changes(db, user) == []
    # usuário pode reativar manualmente dentro do limite (pausando o atual)
    r = user_client.post(f"/api/v1/activities/{a['id']}/status", json={"status": "active"})
    assert r.status_code == 402
