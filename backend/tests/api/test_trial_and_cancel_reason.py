"""Teste grátis no cadastro (acesso promocional com motivo "trial") e motivo do cancelamento."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.models.billing import PromoGrant, Subscription
from app.models.notification import Notification
from app.models.system import AuditLog
from app.services import billing as billing_service
from tests.api.test_billing import activate_pro, billing_on, fake  # noqa: F401  (fixtures)
from tests.conftest import signup


def test_new_account_gets_the_trial_and_falls_back_to_free(client, monkeypatch):
    monkeypatch.setattr(settings, "TRIAL_DAYS", 14)
    signup(client, email="nova@example.com")
    ent = client.get("/api/v1/auth/session").json()["entitlements"]
    assert ent["plan_code"] == "essencial" and ent["source"] == "trial"
    assert ent["current_period_end"] is not None
    # depois do prazo, volta ao gratuito sem intervenção
    with SessionLocal() as db:
        grant = db.execute(select(PromoGrant)).scalar_one()
        assert grant.reason == "trial" and grant.granted_by is None
        grant.ends_at = utcnow() - timedelta(minutes=1)
        db.commit()
    ent = client.get("/api/v1/auth/session").json()["entitlements"]
    assert ent["plan_code"] == "free" and ent["source"] == "free"


def test_trial_is_off_when_days_is_zero(client, monkeypatch):
    monkeypatch.setattr(settings, "TRIAL_DAYS", 0)
    signup(client, email="semteste@example.com")
    assert client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "free"
    with SessionLocal() as db:
        assert db.execute(select(PromoGrant)).first() is None


def test_trial_notices_are_sent_once_each(client, monkeypatch):
    monkeypatch.setattr(settings, "TRIAL_DAYS", 14)
    signup(client, email="aviso@example.com")
    now = utcnow()
    with SessionLocal() as db:
        # longe do fim: nada
        assert billing_service.notify_trials(db, now=now) == 0
        # a 2 dias do fim: avisa uma vez só
        perto = now + timedelta(days=12)
        assert billing_service.notify_trials(db, now=perto) == 1
        assert billing_service.notify_trials(db, now=perto) == 0
        # terminou: avisa uma vez só
        depois = now + timedelta(days=14, hours=1)
        assert billing_service.notify_trials(db, now=depois) == 1
        assert billing_service.notify_trials(db, now=depois) == 0
        db.commit()
        kinds = sorted(
            k
            for (k,) in db.execute(
                select(Notification.kind).where(Notification.kind.like("trial_%"))
            )
        )
        assert kinds == ["trial_ended", "trial_ending"]


def test_cancel_reason_is_optional_and_recorded(user_client, billing_on):  # noqa: F811
    activate_pro(user_client, billing_on)
    r = user_client.post(
        "/api/v1/billing/cancel",
        json={"reason": "technical", "comment": "  a importação do edital não funcionou  "},
    )
    assert r.status_code == 200, r.text
    with SessionLocal() as db:
        sub = db.execute(select(Subscription)).scalar_one()
        assert sub.metadata_["cancel_reason"] == "technical"
        assert sub.metadata_["cancel_comment"] == "a importação do edital não funcionou"
        log = db.execute(select(AuditLog).where(AuditLog.action == "billing.cancel")).scalar_one()
        assert log.metadata_["reason"] == "technical"


def test_cancel_without_reason_and_with_unknown_reason_still_cancels(user_client, billing_on):  # noqa: F811
    activate_pro(user_client, billing_on)
    r = user_client.post("/api/v1/billing/cancel", json={"reason": "inventado"})
    assert r.status_code == 200 and r.json()["subscription"]["status"] == "cancelled"
    with SessionLocal() as db:
        assert db.execute(select(Subscription)).scalar_one().metadata_["cancel_reason"] == "other"
