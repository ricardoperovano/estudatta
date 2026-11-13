"""Página Saúde: o que é registrado (erros e atritos), o relato vindo do app e o resumo do admin."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.main import app
from app.models.system import ContactMessage, ErrorEvent
from app.services import health
from tests.api.test_admin import make_admin
from tests.conftest import ApiClient, make_activity

REPORT = "/api/v1/public/client-errors"


def _events() -> list[ErrorEvent]:
    with SessionLocal() as db:
        rows = list(db.execute(select(ErrorEvent).order_by(ErrorEvent.created_at)).scalars())
        db.expunge_all()
    return rows


def test_unhandled_exception_answers_json_and_is_recorded_with_the_stack(monkeypatch):
    def explode(*_a, **_k):
        raise RuntimeError("banco de planos fora do ar")

    monkeypatch.setattr("app.services.billing.list_public_plans", explode)
    with ApiClient(app, base_url="http://localhost:8000", raise_server_exceptions=False) as c:
        r = c.get("/api/v1/public/plans")
    assert r.status_code == 500
    assert r.json()["error"]["code"] == "internal_error"  # antes saía texto puro
    (ev,) = _events()
    assert ev.source == "server" and ev.level == "error" and ev.status == 500
    assert ev.path == "/api/v1/public/plans" and "RuntimeError" in ev.message
    assert "in explode" in ev.detail and ev.request_id


def test_plan_limit_and_validation_are_friction_but_401_and_404_are_not(user_client):
    make_activity(user_client)
    r = user_client.post("/api/v1/activities", json={"title": "Segundo objetivo"})
    assert r.status_code == 402
    assert user_client.post("/api/v1/activities", json={}).status_code == 422
    assert (
        user_client.get("/api/v1/activities/00000000-0000-4000-8000-000000000000").status_code
        == 404
    )
    with ApiClient(app, base_url="http://localhost:8000") as anon:
        assert anon.get("/api/v1/activities").status_code == 401
    evs = _events()
    assert [(e.level, e.status, e.code) for e in evs] == [
        ("warning", 402, "activity_limit"),
        ("warning", 422, "validation_failed"),
    ]
    assert evs[0].user_id is not None and "title" in evs[1].message


def test_app_reports_a_broken_screen_without_login_and_secrets_are_scrubbed(client):
    r = client.post(
        REPORT,
        json={
            "kind": "render_error",
            "message": "Cannot read properties of undefined (reading 'title')",
            "stack": "at Hoje (page.tsx:42)\nat fetch https://x/y?token=abc123&z=1",
            "path": "/app/objetivos/3f2c1a9e-1111-4222-8333-444455556666?aba=plano",
            "app_version": "1.2.3",
            "online": True,
            "viewport": "390x844",
        },
    )
    assert r.status_code == 200, r.text
    (ev,) = _events()
    assert ev.source == "client" and ev.code == "render_error" and ev.user_id is None
    assert ev.path == "/app/objetivos/{id}"
    assert "abc123" not in ev.detail and "token=***" in ev.detail
    assert ev.context["viewport"] == "390x844" and ev.context["app_version"] == "1.2.3"
    # tipo desconhecido não derruba o relato
    assert client.post(REPORT, json={"kind": "inventado", "message": "x"}).status_code == 200
    assert _events()[-1].code == "js_error"


def test_same_problem_is_grouped_and_the_admin_sees_counts_users_and_checks(client):
    make_admin(client)
    for linha in (42, 57, 99):
        health.record(
            source="client",
            level="error",
            code="js_error",
            message=f"Falha ao abrir a sessão na linha {linha}",
            path="/app/sessao",
        )
    health.record(
        source="server", level="warning", code="activity_limit", message="Limite", status=402
    )
    with SessionLocal() as db:
        db.add(
            ContactMessage(
                email="ana@x.com", message="Não consigo importar o edital", created_at=utcnow()
            )
        )
        db.commit()
    body = client.get("/api/v1/admin/health").json()
    assert body["totals"]["errors_24h"] == 3 and body["totals"]["friction_24h"] == 1
    erro, atrito = body["groups"]
    assert erro["level"] == "error" and erro["count"] == 3 and erro["path"] == "/app/sessao"
    assert atrito["level"] == "warning" and atrito["code"] == "activity_limit"
    assert {c["key"] for c in body["checks"]} >= {"database", "billing", "email", "outbox"}
    assert body["contact_messages"][0]["message"] == "Não consigo importar o edital"


def test_health_page_is_admin_only_and_old_events_are_purged(user_client):
    assert user_client.get("/api/v1/admin/health").status_code == 403
    health.record(source="server", level="error", code="x", message="antigo")
    with SessionLocal() as db:
        ev = db.execute(select(ErrorEvent).where(ErrorEvent.code == "x")).scalar_one()
        ev.created_at = utcnow() - timedelta(days=31)
        db.commit()
        health.record(source="server", level="error", code="y", message="recente")
        assert health.purge(db) == 1
        db.commit()
    assert [e.code for e in _events() if e.code in ("x", "y")] == ["y"]
