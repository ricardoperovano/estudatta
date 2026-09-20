"""Gestão de assinaturas: acesso vitalício, cupons (desconto e dias grátis), segmentos e
campanhas de e-mail com opt-out."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.integrations.email import MemoryBackend
from app.models.notification import NotificationOutbox
from app.models.user import User
from app.services import notifications as notif
from tests.api.test_admin import make_admin
from tests.api.test_billing import set_price
from tests.api.test_billing_asaas import asaas as _asaas_fixture
from tests.conftest import ApiClient, make_activity, signup

API = "/api/v1"


@pytest.fixture(autouse=True)
def _mem_email(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "memory")
    MemoryBackend.sent.clear()
    yield


asaas = _asaas_fixture  # fixture do servidor Asaas simulado, reutilizada aqui


def other(email: str) -> ApiClient:
    from app.main import app

    c = ApiClient(app, base_url="http://localhost:8000")
    signup(c, email=email, name=email.split("@")[0].title())
    return c


def test_lifetime_promo_and_metrics(client):
    make_admin(client)
    ana = other("ana@example.com")
    uid = ana.get(f"{API}/auth/session").json()["user"]["id"]
    r = client.post(
        f"{API}/admin/users/{uid}/promo", json={"plan_code": "pro", "reason": "parceira do projeto"}
    )
    assert r.status_code == 201, r.text
    assert (
        r.json()["lifetime"] is True and r.json()["ends_at"] is None and r.json()["active"] is True
    )
    ent = ana.get(f"{API}/auth/session").json()["entitlements"]
    assert (
        ent["plan_code"] == "pro" and ent["source"] == "promo" and ent["current_period_end"] is None
    )
    m = client.get(f"{API}/admin/subscriptions/metrics").json()
    assert m["promo_active"] == 1 and m["users_total"] == 2 and m["mrr_cents"] == 0
    r = client.get(f"{API}/admin/subscriptions").json()
    assert r["total"] == 0
    assert client.get(f"{API}/admin/users/{uid}/entitlements").json()["plan_code"] == "pro"


def test_trial_coupon_grants_days_once(client):
    make_admin(client)
    r = client.post(
        f"{API}/admin/coupons",
        json={
            "code": "bemvindo30",
            "kind": "trial",
            "value": 30,
            "plan_code": "essencial",
            "max_uses": 2,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["code"] == "BEMVINDO30" and r.json()["valid"] is True
    assert (
        client.post(
            f"{API}/admin/coupons", json={"code": "x", "kind": "trial", "value": 30}
        ).status_code
        == 422
    )
    bia = other("bia@example.com")
    info = bia.post(f"{API}/billing/coupons/check", json={"code": " bemvindo30 "})
    assert info.status_code == 200 and "30 dias" in info.json()["description"]
    r = bia.post(f"{API}/billing/coupons/redeem", json={"code": "BEMVINDO30"})
    assert r.status_code == 200, r.text
    assert r.json()["entitlements"]["plan_code"] == "essencial" and "30 dias" in r.json()["message"]
    r = bia.post(f"{API}/billing/coupons/check", json={"code": "BEMVINDO30"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "coupon_used"
    assert client.get(f"{API}/admin/coupons").json()[0]["uses"] == 1
    # desativar bloqueia novos usos
    cid = client.get(f"{API}/admin/coupons").json()[0]["id"]
    client.post(f"{API}/admin/coupons/{cid}/toggle")
    caio = other("caio@example.com")
    r = caio.post(f"{API}/billing/coupons/check", json={"code": "BEMVINDO30"})
    assert r.status_code == 422 and "desativado" in r.json()["error"]["message"]


def test_percent_coupon_lowers_checkout_value(client, asaas):
    make_admin(client)
    client.post(f"{API}/admin/coupons", json={"code": "VOLTA50", "kind": "percent", "value": 50})
    dani = other("dani@example.com")
    set_price(1990)
    r = dani.post(
        f"{API}/billing/checkout",
        json={"plan_code": "pro", "interval": "month", "coupon_code": "volta50"},
    )
    assert r.status_code == 201, r.text
    assert asaas.checkouts["chk_1"]["items"][0]["value"] == 9.95
    lst = client.get(f"{API}/admin/subscriptions").json()
    assert (
        lst["total"] == 1
        and lst["items"][0]["coupon_code"] == "VOLTA50"
        and lst["items"][0]["amount_cents"] == 995
    )
    # cupom de dias grátis não vale no checkout pago
    client.post(
        f"{API}/admin/coupons",
        json={"code": "TESTE7", "kind": "trial", "value": 7, "plan_code": "pro"},
    )
    with SessionLocal() as db:
        from app.models.billing import Subscription

        db.execute(select(Subscription)).scalar_one().status = "expired"
        db.commit()
    r = dani.post(
        f"{API}/billing/checkout",
        json={"plan_code": "pro", "interval": "month", "coupon_code": "TESTE7"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "coupon_kind"


def test_segments_and_campaign_send_respects_opt_out(client):
    make_admin(client)
    eva = other("eva@example.com")
    act = make_activity(eva, start_date="2026-09-01")
    eva.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 1800,
            "local_date": (utcnow() - timedelta(days=10)).date().isoformat(),
        },
    )
    fabi = other("fabi@example.com")  # sem objetivo
    fabi.patch(f"{API}/notifications/preferences", json={"reengagement_email": False})
    segs = {s["key"]: s["count"] for s in client.get(f"{API}/admin/campaigns/segments").json()}
    assert (
        segs["all"] == 3 and segs["no_goal"] == 2 and segs["inactive_7"] >= 1 and segs["paid"] == 0
    )
    r = client.post(
        f"{API}/admin/campaigns",
        json={
            "name": "Dicas de setembro",
            "subject": "{nome}, uma dica do Tatá",
            "body": "Oi {nome}!\n\nRevisões espaçadas ajudam a fixar.\n\nBons estudos.",
            "segment": "all",
        },
    )
    assert r.status_code == 201, r.text
    cid = r.json()["id"]
    assert (
        client.patch(f"{API}/admin/campaigns/{cid}", json={"segment": "no_goal"}).json()["segment"]
        == "no_goal"
    )
    t = client.post(f"{API}/admin/campaigns/{cid}/test").json()
    assert t["queued"] == 1 and t["status"] == "draft"
    s = client.post(f"{API}/admin/campaigns/{cid}/send").json()
    assert (
        s["status"] == "sent" and s["queued"] == 1
    )  # admin sem objetivo recebe; Fabi optou por não receber
    assert client.post(f"{API}/admin/campaigns/{cid}/send").status_code == 409
    with SessionLocal() as db:
        rows = list(
            db.execute(
                select(NotificationOutbox).where(NotificationOutbox.kind == "campaign")
            ).scalars()
        )
        assert len(rows) == 2 and all(r.channels == ["email"] for r in rows)
        notif.dispatch_outbox(db, now=utcnow() + timedelta(seconds=1))
        db.commit()
    mails = [m for m in MemoryBackend.sent if "dica" in m.subject]
    assert len(mails) == 2 and all("uma dica do Tatá" in m.subject for m in mails)
    assert "Admin" in mails[-1].subject or "Admin" in mails[0].subject
    assert all("unsubscribe" in m.text for m in mails)
    with SessionLocal() as db:
        assert db.execute(select(User).where(User.email == "fabi@example.com")).scalar_one()
    assert client.delete(f"{API}/admin/campaigns/{cid}").status_code == 404  # enviada: não apaga
