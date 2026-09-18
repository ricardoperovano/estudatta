"""Painel administrativo: acesso restrito, métricas, usuários, catálogo, configurações,
filas, eventos de cobrança, reconciliação e acesso promocional."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.main import app
from app.models.notification import NotificationOutbox
from app.models.system import AiUsage
from app.models.user import User
from app.services.admin import get_setting
from tests.conftest import ApiClient, make_activity, signup


def make_admin(client, email="admin@example.com") -> dict:
    data = signup(client, email=email, name="Admin")
    with SessionLocal() as db:
        u = db.get(User, uuid.UUID(data["user"]["id"]))
        u.role = "admin"
        db.commit()
    return data


def second_client() -> ApiClient:
    return ApiClient(app, base_url="http://localhost:8000")


def test_admin_requires_admin_role(client):
    r = client.get("/api/v1/admin/overview")
    assert r.status_code == 401
    signup(client)
    for path in ("/overview", "/users", "/plans", "/queues", "/audit", "/billing/events"):
        r = client.get(f"/api/v1/admin{path}")
        assert r.status_code == 403, path
        assert r.json()["error"]["code"] == "admin_only"
    r = client.post("/api/v1/admin/billing/reconcile")
    assert r.status_code == 403


def test_overview_users_and_detail_without_content(client):
    admin = make_admin(client)
    with second_client() as uc:
        u = signup(uc, email="ana@example.com")
        act = make_activity(uc, title="Segredo do estudo")
        uc.post(
            "/api/v1/sessions/manual",
            json={"activity_id": act["id"], "duration_seconds": 1800, "local_date": "2026-09-15"},
        )
    with SessionLocal() as db:
        db.add(
            AiUsage(
                user_id=uuid.UUID(u["user"]["id"]),
                action="suggest_plan",
                status="ok",
                tokens_in=100,
                tokens_out=40,
                created_at=utcnow(),
            )
        )
        db.commit()
    r = client.get("/api/v1/admin/overview")
    assert r.status_code == 200, r.text
    ov = r.json()
    assert ov["users"]["total"] == 2 and ov["users"]["admins"] == 1
    assert ov["users"]["active_7d"] >= 1
    assert ov["activities"]["total"] == 1
    assert ov["ai_usage_7d"]["actions"] == 1 and ov["ai_usage_7d"]["tokens_in"] == 100
    assert ov["outbox"]["pending"] == 0
    r = client.get("/api/v1/admin/users", params={"q": "ana"})
    assert r.status_code == 200
    assert r.json()["total"] == 1 and r.json()["items"][0]["email"] == "ana@example.com"
    assert r.json()["items"][0]["plan_code"] == "free"
    r = client.get(f"/api/v1/admin/users/{u['user']['id']}")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["usage"]["activities_total"] == 1
    assert detail["usage"]["minutes_30d"] == 30
    assert detail["entitlements"]["plan_code"] == "free"
    assert "Segredo do estudo" not in r.text  # sem conteúdo de estudo
    assert admin["user"]["email"] == "admin@example.com"


def test_role_deactivate_reactivate_are_audited(client):
    admin = make_admin(client)
    with second_client() as uc:
        u = signup(uc, email="ana@example.com")
    uid = u["user"]["id"]
    r = client.post(f"/api/v1/admin/users/{uid}/role", json={"role": "admin"})
    assert r.status_code == 200 and r.json()["role"] == "admin"
    r = client.post(f"/api/v1/admin/users/{admin['user']['id']}/role", json={"role": "user"})
    assert r.status_code == 409  # não remove o próprio acesso
    r = client.post(f"/api/v1/admin/users/{uid}/role", json={"role": "user"})
    assert r.json()["role"] == "user"
    r = client.post(f"/api/v1/admin/users/{uid}/deactivate")
    assert r.status_code == 200 and r.json()["is_active"] is False
    with second_client() as uc:
        r = uc.post(
            "/api/v1/auth/login", json={"email": "ana@example.com", "password": "senha-forte-123"}
        )
        assert r.status_code == 401
    r = client.post(f"/api/v1/admin/users/{uid}/reactivate")
    assert r.json()["is_active"] is True
    r = client.get("/api/v1/admin/audit", params={"action": "admin.user"})
    actions = [x["action"] for x in r.json()["items"]]
    assert actions[:4] == [
        "admin.user.reactivate",
        "admin.user.deactivate",
        "admin.user.role",
        "admin.user.role",
    ]
    r = client.get("/api/v1/admin/audit", params={"actor_id": admin["user"]["id"]})
    assert r.json()["total"] >= 4


def test_plans_and_prices_editing_with_limit_validation(client):
    make_admin(client)
    plans = {p["code"]: p for p in client.get("/api/v1/admin/plans").json()}
    pro, free = plans["pro"], plans["free"]
    r = client.patch(f"/api/v1/admin/plans/{pro['id']}", json={"limits": {"foo": 1}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_limits"
    r = client.patch(f"/api/v1/admin/plans/{pro['id']}", json={"limits": {"reports": "x"}})
    assert r.status_code == 422
    r = client.patch(
        f"/api/v1/admin/plans/{pro['id']}",
        json={"name": "Completo+", "limits": {**pro["limits"], "ai_daily_actions": 50}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Completo+" and r.json()["limits"]["ai_daily_actions"] == 50
    r = client.patch(f"/api/v1/admin/plans/{free['id']}", json={"active": False})
    assert r.status_code == 422
    r = client.put(
        f"/api/v1/admin/plans/{pro['id']}/prices",
        json={
            "prices": [
                {"interval": "month", "amount_cents": 2990},
                {"interval": "year", "amount_cents": 29900},
            ]
        },
    )
    assert r.status_code == 200, r.text
    r = client.put(
        f"/api/v1/admin/plans/{free['id']}/prices",
        json={"prices": [{"interval": "month", "amount_cents": 1}]},
    )
    assert r.status_code == 422
    pub = {p["code"]: p for p in client.get("/api/v1/public/plans").json()["plans"]}
    assert {p["interval"]: p["amount_cents"] for p in pub["pro"]["prices"]} == {
        "month": 2990,
        "year": 29900,
    }
    assert pub["pro"]["name"] == "Completo+"
    r = client.post(
        "/api/v1/admin/plans",
        json={
            "code": "equipe",
            "name": "Equipe",
            "limits": {"max_active_activities": None},
            "recommended": True,
        },
    )
    assert r.status_code == 201, r.text
    r = client.post("/api/v1/admin/plans", json={"code": "equipe", "name": "Equipe"})
    assert r.status_code == 409
    plans = {p["code"]: p for p in client.get("/api/v1/admin/plans").json()}
    assert plans["equipe"]["recommended"] is True and plans["pro"]["recommended"] is False


def test_settings_brand_and_feature_flags(client):
    admin = make_admin(client)
    r = client.get("/api/v1/admin/settings/brand")
    assert r.status_code == 200
    assert r.json()["is_default"] is True
    assert set(r.json()["value"]["pending"]) == {"company_name", "cnpj"}
    r = client.put(
        "/api/v1/admin/settings/brand",
        json={
            "value": {
                "company_name": "Estudatta Ltda",
                "social": {"instagram": "https://instagram.com/estudatta"},
            }
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["value"]["pending"] == ["cnpj"]
    assert r.json()["value"]["name"] == "Estudatta"  # padrão preservado
    assert r.json()["updated_by"] == admin["user"]["id"]
    r = client.put("/api/v1/admin/settings/brand", json={"value": {"xyz": 1}})
    assert r.status_code == 422
    r = client.put("/api/v1/admin/settings/feature_flags", json={"value": {"ai": "sim"}})
    assert r.status_code == 422
    r = client.put(
        "/api/v1/admin/settings/feature_flags", json={"value": {"ai": False, "beta": True}}
    )
    assert r.status_code == 200
    assert r.json()["value"]["beta"] is True and r.json()["value"]["billing"] is False
    r = client.put("/api/v1/admin/settings/limits", json={"value": {"max_materials": 5}})
    assert r.status_code == 200 and r.json()["value"] == {"max_materials": 5}
    r = client.get("/api/v1/admin/settings/outra")
    assert r.status_code == 404
    with SessionLocal() as db:
        assert get_setting(db, "feature_flags")["beta"] is True
        assert get_setting(db, "brand")["company_name"] == "Estudatta Ltda"
        assert get_setting(db, "qualquer", {"x": 1}) == {"x": 1}


def test_promo_grant_and_revoke(client):
    make_admin(client)
    with second_client() as uc:
        u = signup(uc, email="ana@example.com")
        a = make_activity(uc, title="Inglês")
        r = uc.post(
            "/api/v1/activities",
            json={"title": "Violão", "category": "pratica", "goal": {"daily_minutes": 30}},
        )
        assert r.status_code == 402
        r = client.post(
            f"/api/v1/admin/users/{u['user']['id']}/promo",
            json={"plan_code": "pro", "days": 30, "reason": "beta tester"},
        )
        assert r.status_code == 201, r.text
        grant = r.json()
        assert grant["active"] is True and grant["plan_code"] == "pro"
        ent = uc.get("/api/v1/auth/session").json()["entitlements"]
        assert ent["plan_code"] == "pro" and ent["source"] == "promo"
        b = make_activity(uc, title="Violão")
        detail = client.get(f"/api/v1/admin/users/{u['user']['id']}").json()
        assert detail["promo_grants"][0]["id"] == grant["id"]
        assert detail["user"]["plan_source"] == "promo"
        r = client.delete(f"/api/v1/admin/promo/{grant['id']}")
        assert r.status_code == 200 and r.json()["active"] is False
        r = client.delete(f"/api/v1/admin/promo/{grant['id']}")
        assert r.status_code == 409
        ent = uc.get("/api/v1/auth/session").json()["entitlements"]
        assert ent["plan_code"] == "free"
        # rebaixamento: mantém o mais recente (Violão) e pausa Inglês; nada apagado
        acts = {x["title"]: x["status"] for x in uc.get("/api/v1/activities").json()}
        assert acts == {"Inglês": "paused", "Violão": "active"}
        assert uc.get(f"/api/v1/activities/{a['id']}").status_code == 200
        assert uc.get(f"/api/v1/activities/{b['id']}").status_code == 200
    r = client.post(
        f"/api/v1/admin/users/{u['user']['id']}/promo",
        json={"plan_code": "free", "days": 1, "reason": "teste"},
    )
    assert r.status_code == 422
    actions = [
        x["action"]
        for x in client.get("/api/v1/admin/audit", params={"action": "admin.promo"}).json()["items"]
    ]
    assert actions == ["admin.promo.revoke", "admin.promo.grant"]


def test_queues_and_outbox_retry(client):
    admin = make_admin(client)
    with SessionLocal() as db:
        row = NotificationOutbox(
            user_id=uuid.UUID(admin["user"]["id"]),
            kind="system",
            dedupe_key="teste-falha",
            payload={"title": "x"},
            channels=["inapp"],
            status="failed",
            next_run_at=utcnow(),
            attempts=5,
            max_attempts=5,
            last_error="boom",
            created_at=utcnow(),
        )
        db.add(row)
        db.commit()
        oid = str(row.id)
    r = client.get("/api/v1/admin/queues")
    assert r.status_code == 200, r.text
    q = r.json()
    assert q["outbox_by_status"]["failed"] == 1
    assert q["failed_outbox"]["total"] == 1 and q["failed_outbox"]["items"][0]["id"] == oid
    assert q["failed_imports"]["total"] == 0
    r = client.post(f"/api/v1/admin/outbox/{oid}/retry")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "pending" and r.json()["max_attempts"] == 6
    assert client.get("/api/v1/admin/queues").json()["outbox_by_status"]["failed"] == 0
    r = client.post(f"/api/v1/admin/outbox/{uuid.uuid4()}/retry")
    assert r.status_code == 404


def test_billing_events_and_reconcile(client):
    make_admin(client)
    r = client.post("/api/v1/admin/billing/reconcile")
    assert r.status_code == 200, r.text
    assert r.json()["summary"]["provider_available"] is False
    assert r.json()["summary"]["checked"] == 0
    r = client.get("/api/v1/admin/billing/events", params={"status": "ignored"})
    assert r.status_code == 200 and r.json()["total"] == 0
    actions = [
        x["action"]
        for x in client.get("/api/v1/admin/audit", params={"action": "admin.billing"}).json()[
            "items"
        ]
    ]
    assert actions == ["admin.billing.reconcile"]
    with SessionLocal() as db:
        assert db.execute(select(NotificationOutbox)).scalars().first() is None
