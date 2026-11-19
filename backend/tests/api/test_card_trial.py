# ruff: noqa: F811  (a fixture `asaas` é importada e depois recebida como parâmetro)
"""Teste grátis com cartão: a pessoa cadastra o cartão no checkout, usa o plano por 7 dias e só
então é cobrada, todo mês, até cancelar. Cancelando antes, nada é cobrado e o acesso vai até o
fim do teste; cartão recusado no fim devolve a conta ao gratuito."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.integrations.email import MemoryBackend
from app.models.billing import Subscription
from app.models.notification import Notification
from app.services import billing as billing_service
from tests.api.test_billing import set_price
from tests.api.test_billing_asaas import asaas, hook  # noqa: F401  (`asaas` é fixture)

BR = ZoneInfo("America/Sao_Paulo")
CHECKOUT = "/api/v1/billing/checkout"
STATE = "/api/v1/billing/subscription"


@pytest.fixture(autouse=True)
def _trial_on(monkeypatch):
    monkeypatch.setattr(settings, "CARD_TRIAL_DAYS", 7)
    monkeypatch.setattr(settings, "CARD_TRIAL_PLAN_CODE", "pro")
    set_price(1990)
    MemoryBackend.sent.clear()


def charge_day() -> date:
    return datetime.now(BR).date() + timedelta(days=7)


def start_trial(client, **extra) -> str:
    r = client.post(
        CHECKOUT, json={"plan_code": "pro", "interval": "month", "trial": True, **extra}
    )
    assert r.status_code == 201, r.text
    return r.json()["checkout_url"].split("id=")[1]


def card_registered(fake, cid: str, sid: str = "sub_1") -> dict:
    """O que o Asaas faz quando a pessoa conclui o checkout do teste: cria a assinatura e a
    primeira cobrança, pendente, com vencimento na data pedida. Nada é cobrado ainda."""
    body = fake.checkouts[cid]
    due = body["subscription"]["nextDueDate"]
    fake.subs[sid] = {
        "id": sid,
        "status": "ACTIVE",
        "description": None,
        "externalReference": None,  # a assinatura do checkout nasce sem a nossa referência
        "customer": "cus_1",
        "nextDueDate": due,
        "deleted": False,
    }
    pay = {
        "id": "pay_1",
        "subscription": sid,
        "status": "PENDING",
        "dueDate": due,
        "checkoutSession": cid,
        "value": 19.9,
    }
    fake.payments[sid] = [pay]
    return pay


def in_trial(client, fake) -> dict:
    cid = start_trial(client)
    pay = card_registered(fake, cid)
    r = hook(client, "PAYMENT_CREATED", payment=pay)
    assert r.status_code == 200 and r.json()["status"] == "processed", r.text
    return pay


def trial_mails() -> list:
    return [m for m in MemoryBackend.sent if "teste" in m.subject]


def notifications(kind: str) -> list[Notification]:
    with SessionLocal() as db:
        return list(db.execute(select(Notification).where(Notification.kind == kind)).scalars())


def test_offer_is_public_and_per_account(user_client, asaas):
    offer = user_client.get("/api/v1/public/plans").json()["card_trial"]
    assert offer == {
        "days": 7,
        "plan_code": "pro",
        "plan_name": offer["plan_name"],
        "amount_cents": 1990,
        "currency": "BRL",
    }
    assert user_client.get(STATE).json()["card_trial"]["days"] == 7


def test_offer_disappears_when_trial_is_off_or_billing_disabled(user_client, asaas, monkeypatch):
    monkeypatch.setattr(settings, "CARD_TRIAL_DAYS", 0)
    assert user_client.get("/api/v1/public/plans").json()["card_trial"] is None
    r = user_client.post(CHECKOUT, json={"plan_code": "pro", "interval": "month", "trial": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "trial_unavailable"
    monkeypatch.setattr(settings, "CARD_TRIAL_DAYS", 7)
    monkeypatch.setattr(settings, "BILLING_MODE", "disabled")
    assert user_client.get("/api/v1/public/plans").json()["card_trial"] is None


def test_checkout_puts_first_charge_seven_days_ahead_and_grants_nothing_yet(user_client, asaas):
    cid = start_trial(user_client)
    body = asaas.checkouts[cid]
    assert body["subscription"] == {"cycle": "MONTHLY", "nextDueDate": charge_day().isoformat()}
    # a regra do teste vai escrita na página onde a pessoa digita o cartão
    assert f"{charge_day():%d/%m/%Y}" in body["items"][0]["description"]
    assert "até você cancelar" in body["items"][0]["description"]
    with SessionLocal() as db:
        sub = db.execute(select(Subscription)).scalar_one()
        assert sub.status == "pending" and sub.metadata_["trial"] is True
        assert sub.metadata_["trial_charge_date"] == charge_day().isoformat()
    assert user_client.get("/api/v1/auth/session").json()["entitlements"]["plan_code"] == "free"
    # sem o teste, a cobrança continua sendo no dia
    with SessionLocal() as db:
        db.execute(select(Subscription)).scalar_one().status = "expired"
        db.commit()
    r = user_client.post(CHECKOUT, json={"plan_code": "pro", "interval": "month"})
    assert r.status_code == 201
    assert asaas.checkouts["chk_2"]["subscription"]["nextDueDate"] == (
        datetime.now(BR).date().isoformat()
    )


def test_signup_checkout_returns_to_onboarding(user_client, asaas):
    cid = start_trial(user_client, return_to="signup")
    assert (
        "/onboarding?retorno=checkout&teste=1&status=sucesso"
        in (asaas.checkouts[cid]["callback"]["successUrl"])
    )
    cid2 = "chk_2"
    with SessionLocal() as db:
        db.execute(select(Subscription)).scalar_one().status = "expired"
        db.commit()
    start_trial(user_client)
    assert "/app/planos?retorno=checkout&teste=1" in asaas.checkouts[cid2]["callback"]["successUrl"]


def test_card_registered_starts_trial_with_plan_and_clear_terms(user_client, asaas):
    in_trial(user_client, asaas)
    state = user_client.get(STATE).json()
    sub = state["subscription"]
    assert sub["status"] == "trialing" and sub["trial"] is True
    assert state["entitlements"]["plan_code"] == "pro"
    assert state["entitlements"]["subscription_status"] == "trialing"
    assert state["card_trial"] is None  # um teste por conta
    charge = datetime.fromisoformat(state["next_charge_at"]).astimezone(BR)
    assert charge.date() == charge_day()
    day, valor = f"{charge_day():%d/%m/%Y}", "R$ 19,90"
    (note,) = notifications("billing_trial_started")
    (mail,) = trial_mails()
    for text in (note.body, mail.text):
        assert day in text and valor in text
        assert "todo mês" in text and "até você cancelar" in text
        assert "Cancelar teste" in text
    # o mesmo estado consultado de novo não repete o aviso
    with SessionLocal() as db:
        billing_service.reconcile_subscriptions(db)
        db.commit()
    assert len(notifications("billing_trial_started")) == 1 and len(trial_mails()) == 1


def test_trial_is_only_for_the_monthly_plan_once_and_without_coupon(user_client, asaas):
    set_price(19080, "year")
    r = user_client.post(CHECKOUT, json={"plan_code": "pro", "interval": "year", "trial": True})
    assert r.status_code == 422 and r.json()["error"]["code"] == "trial_plan"
    r = user_client.post(
        CHECKOUT,
        json={"plan_code": "pro", "interval": "month", "trial": True, "coupon_code": "QUALQUER"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "trial_coupon"
    in_trial(user_client, asaas)
    r = user_client.post(CHECKOUT, json={"plan_code": "pro", "interval": "month", "trial": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_subscribed"
    # depois de cancelar e o teste acabar: não testa de novo, mas pode assinar
    user_client.post("/api/v1/billing/cancel")
    with SessionLocal() as db:
        billing_service.reconcile_subscriptions(db, now=utcnow() + timedelta(days=9))
        db.commit()
    r = user_client.post(CHECKOUT, json={"plan_code": "pro", "interval": "month", "trial": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "trial_used"
    assert (
        user_client.post(CHECKOUT, json={"plan_code": "pro", "interval": "month"}).status_code
        == 201
    )


def test_abandoned_checkout_does_not_use_up_the_trial(user_client, asaas):
    start_trial(user_client)
    assert user_client.get(STATE).json()["card_trial"]["days"] == 7
    assert start_trial(user_client) == "chk_1"  # mesmo link enquanto vale


def test_cancel_during_trial_charges_nothing_and_keeps_access_until_the_end(user_client, asaas):
    in_trial(user_client, asaas)
    r = user_client.post("/api/v1/billing/cancel", json={"reason": "just_testing"})
    assert r.status_code == 200, r.text
    state = r.json()
    assert asaas.subs["sub_1"]["deleted"] is True  # sem assinatura no Asaas, não há cobrança
    assert state["subscription"]["status"] == "cancelled" and state["subscription"]["trial"] is True
    assert state["next_charge_at"] is None and state["cancel_at_period_end"] is True
    assert (
        "nada será cobrado" in state["message"] and f"{charge_day():%d/%m/%Y}" in state["message"]
    )
    assert state["entitlements"]["plan_code"] == "pro"  # o acesso segue até o fim dos 7 dias
    (note,) = notifications("billing_cancelled")
    assert note.title == "Teste cancelado" and "Nada será cobrado" in note.body
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db, now=utcnow() + timedelta(days=8))
        db.commit()
    assert summary["expired"] == 1
    state = user_client.get(STATE).json()
    assert state["entitlements"]["plan_code"] == "free" and state["subscription"] is None
    (ended,) = notifications("billing_expired")
    assert "Nada foi cobrado" in ended.body


def test_first_charge_confirmed_turns_trial_into_subscription(user_client, asaas):
    pay = in_trial(user_client, asaas)
    pay["status"] = "CONFIRMED"
    next_due = charge_day() + timedelta(days=30)
    asaas.subs["sub_1"]["nextDueDate"] = next_due.isoformat()
    asaas.payments["sub_1"].append(
        {
            "id": "pay_2",
            "subscription": "sub_1",
            "status": "PENDING",
            "dueDate": next_due.isoformat(),
        }
    )
    r = hook(user_client, "PAYMENT_CONFIRMED", payment=pay, evt="evt_2")
    assert r.json()["status"] == "processed"
    state = user_client.get(STATE).json()
    assert state["subscription"]["status"] == "active" and state["subscription"]["trial"] is False
    assert state["entitlements"]["plan_code"] == "pro"
    assert datetime.fromisoformat(state["next_charge_at"]).astimezone(BR).date() == next_due
    (note,) = notifications("billing_active")
    assert "todo mês" in note.body and "até você cancelar" in note.body


def test_card_refused_at_the_end_returns_account_to_free_without_charging(user_client, asaas):
    pay = in_trial(user_client, asaas)
    pay["status"] = "OVERDUE"
    end = datetime.fromisoformat(user_client.get(STATE).json()["next_charge_at"])
    # dentro do prazo em que o Asaas ainda tenta cobrar: segue em teste
    with SessionLocal() as db:
        billing_service.reconcile_subscriptions(db, now=end + timedelta(hours=12))
        db.commit()
    assert user_client.get(STATE).json()["subscription"]["status"] == "trialing"
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db, now=end + timedelta(days=2))
        db.commit()
    assert summary["expired"] == 1
    assert asaas.subs["sub_1"]["deleted"] is True  # nada de cobrança tardia
    state = user_client.get(STATE).json()
    assert state["entitlements"]["plan_code"] == "free"
    with SessionLocal() as db:
        sub = db.execute(select(Subscription)).scalar_one()
        assert sub.status == "expired" and sub.metadata_["expired_reason"] == "trial_unpaid"
    (note,) = notifications("billing_expired")
    assert "Não conseguimos cobrar" in note.body and "nada foi cobrado" in note.body


def test_trial_is_not_expired_while_asaas_is_unreachable(user_client, asaas):
    in_trial(user_client, asaas)
    end = datetime.fromisoformat(user_client.get(STATE).json()["next_charge_at"])
    asaas.fail = True
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db, now=end + timedelta(days=2))
        db.commit()
    assert summary["errors"] == 1 and summary["expired"] == 0
    assert user_client.get(STATE).json()["subscription"]["status"] == "trialing"


def test_reminder_two_days_before_the_charge_only_once(user_client, asaas):
    in_trial(user_client, asaas)
    MemoryBackend.sent.clear()
    end = datetime.fromisoformat(user_client.get(STATE).json()["next_charge_at"])
    with SessionLocal() as db:
        early = billing_service.reconcile_subscriptions(db, now=end - timedelta(days=4))
        first = billing_service.reconcile_subscriptions(db, now=end - timedelta(days=1, hours=12))
        again = billing_service.reconcile_subscriptions(db, now=end - timedelta(days=1))
        db.commit()
    assert (early["card_trial_reminders"], first["card_trial_reminders"]) == (0, 1)
    assert again["card_trial_reminders"] == 0
    (note,) = notifications("billing_trial_ending")
    (mail,) = MemoryBackend.sent
    for text in (note.body, mail.text):
        assert f"{charge_day():%d/%m/%Y}" in text and "R$ 19,90" in text
        assert "todo mês" in text and "até você cancelar" in text


def test_no_reminder_after_cancelling(user_client, asaas):
    in_trial(user_client, asaas)
    user_client.post("/api/v1/billing/cancel")
    end = utcnow() + timedelta(days=7)
    with SessionLocal() as db:
        summary = billing_service.reconcile_subscriptions(db, now=end - timedelta(days=1))
        db.commit()
    assert summary["card_trial_reminders"] == 0 and not notifications("billing_trial_ending")


def test_new_accounts_no_longer_get_the_cardless_trial(client, asaas):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "nova@example.com", "password": "senha-forte-1", "name": "Nova"},
    )
    assert r.status_code in (200, 201), r.text
    ent = client.get("/api/v1/auth/session").json()["entitlements"]
    assert ent["plan_code"] == "free" and ent["source"] == "free"
    assert settings.TRIAL_DAYS == 0


def test_abandoned_checkout_stays_free_and_the_dead_link_is_not_offered(user_client, asaas):
    """Quem escolhe o teste e não informa o cartão continua no gratuito. O registro do checkout
    fica como pendente; passada a validade do link no Asaas, ele deixa de ser oferecido."""
    start_trial(user_client)
    state = user_client.get(STATE).json()
    sub = state["subscription"]
    assert sub["status"] == "pending" and sub["trial"] is True
    assert sub["checkout_url"] and sub["checkout_expired"] is False
    assert state["entitlements"]["plan_code"] == "free"
    with SessionLocal() as db:
        row = db.execute(select(Subscription)).scalar_one()
        row.created_at = utcnow() - timedelta(minutes=settings.ASAAS_CHECKOUT_MINUTES + 1)
        db.commit()
    state = user_client.get(STATE).json()
    sub = state["subscription"]
    assert sub["status"] == "pending" and sub["checkout_expired"] is True
    assert sub["checkout_url"] is None
    assert state["entitlements"]["plan_code"] == "free"
    assert state["card_trial"]["days"] == 7  # pode começar de novo: o teste não foi usado
    assert start_trial(user_client) == "chk_2"  # e o recomeço abre um checkout novo
