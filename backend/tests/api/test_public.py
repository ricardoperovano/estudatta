"""Site público: catálogo, lista de interesse e contato."""

from __future__ import annotations

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.system import ContactMessage, WaitlistEntry


def test_public_plans_without_price_show_null(client):
    r = client.get("/api/v1/public/plans")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["billing_mode"] == "disabled"
    plans = {p["code"]: p for p in body["plans"]}
    assert set(plans) == {"free", "pro"}
    assert plans["free"]["prices"] == []
    assert plans["free"]["limits"]["max_active_activities"] == 1
    assert plans["pro"]["recommended"] is True
    assert [p["interval"] for p in plans["pro"]["prices"]] == ["month", "year"]
    assert all(p["amount_cents"] is None for p in plans["pro"]["prices"])  # "Valor a definir"
    assert plans["pro"]["features"]


def test_waitlist_is_idempotent_by_email(client):
    r1 = client.post("/api/v1/public/waitlist", json={"email": "Lia@Example.com", "source": "hero"})
    r2 = client.post("/api/v1/public/waitlist", json={"email": "lia@example.com"})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() == r2.json()
    with SessionLocal() as db:
        rows = list(db.execute(select(WaitlistEntry)).scalars())
    assert len(rows) == 1
    assert rows[0].email == "lia@example.com" and rows[0].source == "hero"
    r = client.post("/api/v1/public/waitlist", json={"email": "nao-e-email"})
    assert r.status_code == 422


def test_contact_message_is_stored_with_limits(client):
    r = client.post(
        "/api/v1/public/contact",
        json={"name": "Lia", "email": "lia@example.com", "subject": "Dúvida", "message": "Olá!"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    with SessionLocal() as db:
        row = db.execute(select(ContactMessage)).scalar_one()
    assert row.email == "lia@example.com" and row.message == "Olá!" and row.subject == "Dúvida"
    r = client.post(
        "/api/v1/public/contact", json={"email": "lia@example.com", "message": "x" * 4001}
    )
    assert r.status_code == 422
    r = client.post("/api/v1/public/contact", json={"email": "lia@example.com", "message": "   "})
    assert r.status_code == 200 and r.json()["ok"] is False
