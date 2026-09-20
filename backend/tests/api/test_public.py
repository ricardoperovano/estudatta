"""Site público: catálogo, lista de interesse e contato."""

from __future__ import annotations

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.system import ContactMessage, WaitlistEntry


def test_public_catalog_has_suggested_plans_and_prices(client):
    r = client.get("/api/v1/public/plans")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["billing_mode"] == "disabled"
    assert [p["code"] for p in body["plans"]] == ["free", "essencial", "pro"]
    plans = {p["code"]: p for p in body["plans"]}
    assert plans["free"]["prices"] == []
    assert plans["free"]["limits"]["max_active_activities"] == 1
    assert (
        plans["free"]["limits"]["ai_monthly_actions"] == 10
    )  # Gratuito: poucas conversas com o Tatá
    assert plans["free"]["limits"]["tata_voice_monthly"] == 20
    assert plans["essencial"]["recommended"] is True and plans["pro"]["recommended"] is False
    price = lambda code: {p["interval"]: p["amount_cents"] for p in plans[code]["prices"]}  # noqa: E731
    assert price("essencial") == {"month": 990, "year": 9480}
    assert price("pro") == {"month": 1990, "year": 19080}
    for code in ("essencial", "pro"):
        lim = plans[code]["limits"]
        assert lim["ai_monthly_actions"] > 0 and lim["ai_daily_actions"] > 0
        assert (
            lim["auto_planning"] is True and lim["reports"] == "full" and lim["reminders"] == "full"
        )
    # histórico/exportação e recuperação nunca dependem de assinatura
    assert all(
        p["limits"]["csv_export"] and p["limits"]["recovery_distribution"] for p in body["plans"]
    )


def test_public_plans_without_price_show_null(client):
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models.billing import Plan, PlanPrice

    with SessionLocal() as db:
        pro = db.execute(select(Plan).where(Plan.code == "pro")).scalar_one()
        for p in db.execute(select(PlanPrice).where(PlanPrice.plan_id == pro.id)).scalars():
            p.amount_cents = None
        db.commit()
    plans = {p["code"]: p for p in client.get("/api/v1/public/plans").json()["plans"]}
    assert all(p["amount_cents"] is None for p in plans["pro"]["prices"])  # "Valor a definir"


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
