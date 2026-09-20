"""Limites do catálogo sugerido aplicados no servidor (IA, relatórios, auto-plano, lembretes)."""

from __future__ import annotations

from datetime import timedelta

import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.models.billing import Plan, PromoGrant
from app.models.notification import NotificationOutbox
from app.models.system import AiUsage
from app.models.user import User
from app.services.plans import SUGGESTED_CATALOG, apply_catalog
from tests.conftest import make_activity, signup
from tests.fixtures.plans import set_free_plan_limits

API = "/api/v1"


def grant(email: str, plan_code: str) -> None:
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one()
        plan = db.execute(select(Plan).where(Plan.code == plan_code)).scalar_one()
        now = utcnow()
        db.add(
            PromoGrant(
                user_id=user.id,
                plan_id=plan.id,
                reason="teste",
                starts_at=now - timedelta(minutes=1),
                ends_at=now + timedelta(days=30),
                created_at=now,
            )
        )
        db.commit()


@freeze_time("2026-09-16 12:00:00")
def test_free_blocks_month_report_and_auto_plan_but_essencial_allows(client):
    signup(client, email="f@example.com")
    act = make_activity(client, start_date="2026-09-14")
    r = client.get(f"{API}/reports/summary", params={"period": "month"})
    assert r.status_code == 402 and r.json()["error"]["code"] == "plan_reports"
    assert client.get(f"{API}/reports/summary", params={"period": "week"}).status_code == 200
    body = {"start": "2026-09-16", "end": "2026-09-20"}
    r = client.post(f"{API}/activities/{act['id']}/auto-plan/preview", json=body)
    assert r.status_code == 402 and r.json()["error"]["code"] == "plan_auto_planning"
    grant("f@example.com", "essencial")
    assert client.get(f"{API}/reports/summary", params={"period": "month"}).status_code == 200
    assert (
        client.post(f"{API}/activities/{act['id']}/auto-plan/preview", json=body).status_code == 200
    )


def test_essencial_allows_three_active_activities(client):
    signup(client, email="e@example.com")
    grant("e@example.com", "essencial")
    for t in ("Inglês", "Concurso", "Violão"):
        make_activity(client, title=t)
    r = client.post(
        f"{API}/activities",
        json={"title": "Leitura", "category": "leitura", "goal": {"daily_minutes": 20}},
    )
    assert r.status_code == 402 and r.json()["error"]["code"] == "activity_limit"


@pytest.fixture
def ai_on(monkeypatch):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_API_KEY", "test-key")


def test_ai_status_by_plan_and_monthly_quota(client, ai_on):
    signup(client, email="a@example.com")
    # Gratuito: poucas ações (3/dia, 10/mês); um plano sem IA responde 402
    st = client.get(f"{API}/ai/status").json()
    assert st["reason"] is None and st["plan_limit"] == 3 and st["monthly_limit"] == 10
    set_free_plan_limits(ai_daily_actions=0, ai_monthly_actions=0)
    st = client.get(f"{API}/ai/status").json()
    assert st["reason"] == "ai_plan" and st["remaining_today"] == 0
    r = client.post(f"{API}/ai/suggest-structure", json={"text": "Gramática\n  Verbos"})
    assert r.status_code == 402 and r.json()["error"]["code"] == "ai_plan"

    grant("a@example.com", "essencial")
    st = client.get(f"{API}/ai/status").json()
    assert st["reason"] is None and st["plan_limit"] == 10 and st["monthly_limit"] == 60
    assert st["remaining_today"] == 10 and st["remaining_this_month"] == 60

    # 60 ações já usadas neste mês (em dias anteriores) → cota mensal esgotada
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == "a@example.com")).scalar_one()
        base = utcnow().replace(day=1, hour=1, minute=0, second=0, microsecond=0)
        for _ in range(60):
            db.add(
                AiUsage(
                    user_id=user.id,
                    action="suggest_structure",
                    status="ok",
                    input_chars=10,
                    created_at=base,
                )
            )
        db.commit()
    st = client.get(f"{API}/ai/status").json()
    if utcnow().day != 1:  # no dia 1º as 60 ações também contam no limite diário
        assert (
            st["reason"] == "ai_monthly_quota"
            and st["remaining_this_month"] == 0
            and st["remaining_today"] == 0
        )
    r = client.post(f"{API}/ai/suggest-structure", json={"text": "Gramática\n  Verbos"})
    assert r.status_code == 429 and r.json()["error"]["code"] in ("ai_monthly_quota", "ai_quota")


@freeze_time("2026-09-16 12:00:00")  # quarta, 09:00 em São Paulo
def test_basic_reminders_only_planned_start_full_adds_follow_up(client):
    from app.services.notifications import schedule_reminders

    signup(client, email="r@example.com")
    make_activity(client, start_date="2026-09-14", preferred_times=["19:30"])
    with SessionLocal() as db:
        schedule_reminders(db)
        kinds = {r.kind for r in db.execute(select(NotificationOutbox)).scalars()}
    assert "planned_start" in kinds and "follow_up" not in kinds and "end_of_window" not in kinds

    grant("r@example.com", "essencial")
    with SessionLocal() as db:
        schedule_reminders(db)
        kinds = {r.kind for r in db.execute(select(NotificationOutbox)).scalars()}
    assert {"planned_start", "follow_up"} <= kinds


def test_apply_catalog_keeps_admin_edits_unless_overwrite():
    with SessionLocal() as db:
        from app.models.billing import PlanPrice

        pro = db.execute(select(Plan).where(Plan.code == "pro")).scalar_one()
        price = db.execute(
            select(PlanPrice).where(PlanPrice.plan_id == pro.id, PlanPrice.interval == "month")
        ).scalar_one()
        price.amount_cents = 2490  # editado no painel
        db.commit()
        assert apply_catalog(db, SUGGESTED_CATALOG, overwrite=False) == []
        db.commit()
        assert price.amount_cents == 2490
        changes = apply_catalog(db, SUGGESTED_CATALOG, overwrite=True)
        db.commit()
        assert price.amount_cents == 1990 and any("pro/month" in c for c in changes)
