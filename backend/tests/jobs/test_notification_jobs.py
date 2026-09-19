"""Motor de lembretes: agendamento idempotente, reconferência no envio, limite diário,
silêncio e push (assinatura expirada, servidor sem chaves)."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest
import pywebpush
from freezegun import freeze_time
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.integrations import push as push_integration
from app.jobs.tasks_notifications import dispatch_outbox, schedule_reminders
from app.main import app
from app.models.notification import Notification, NotificationDelivery, NotificationOutbox
from app.models.user import PushSubscription
from tests.conftest import ApiClient, make_activity, signup

API = "/api/v1"
NOW = "2026-09-15 12:00:00"  # terça, 09:00 em São Paulo
AT_PLANNED = "2026-09-15 22:31:00"  # 19:31 local: venceu o lembrete das 19:30
AT_WINDOW = "2026-09-15 23:01:00"  # 20:01 local: venceu o aviso de fim de janela (21:00 − 1 h)
ENDPOINT = "https://push.example.com/send/abc123"


@pytest.fixture(autouse=True)
def _full_reminders():
    """Estes testes cobrem o motor completo (planos pagos); o plano básico tem teste próprio."""
    from tests.fixtures.plans import set_free_plan_limits

    set_free_plan_limits(reminders="full")


@pytest.fixture(autouse=True)
def _no_vapid(monkeypatch):
    """Padrão dos testes: servidor sem chaves (nunca depende de um `.env` local)."""
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", None)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", None)


def _enable_push(monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "chave-publica-de-teste")
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "chave-privada-de-teste")


def _activity(client, **extra):
    return make_activity(client, preferred_times=["19:30"], **extra)


def _outbox() -> dict[str, NotificationOutbox]:
    with SessionLocal() as db:
        rows = list(db.execute(select(NotificationOutbox)).scalars())
        db.expunge_all()
    assert len({r.kind for r in rows}) == len(rows), "este helper supõe um lembrete por tipo"
    return {r.kind: r for r in rows}


def _inbox() -> list[Notification]:
    """Central, sem boas-vindas (cadastro) nem conquistas (gamificação)."""
    with SessionLocal() as db:
        rows = list(
            db.execute(
                select(Notification)
                .where(Notification.kind.not_in(("welcome", "achievement")))
                .order_by(Notification.created_at)
            ).scalars()
        )
        db.expunge_all()
    return rows


def _deliveries() -> list[tuple[str, str, str | None]]:
    with SessionLocal() as db:
        return [
            (d.channel, d.status, d.error)
            for d in db.execute(
                select(NotificationDelivery).order_by(NotificationDelivery.attempted_at)
            ).scalars()
        ]


def _subscribe(client, endpoint=ENDPOINT):
    r = client.post(
        f"{API}/notifications/push/subscriptions",
        json={"endpoint": endpoint, "keys": {"p256dh": "chave-p256dh", "auth": "segredo"}},
        headers={"X-Device-Id": "aparelho-1"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _subscriptions() -> list[str]:
    with SessionLocal() as db:
        return [s.endpoint for s in db.execute(select(PushSubscription)).scalars()]


# --- (a) agendamento idempotente ------------------------------------------------------


@freeze_time(NOW)
def test_schedule_reminders_twice_does_not_duplicate_outbox(user_client):
    _activity(user_client)
    first = schedule_reminders()
    assert first == {"users": 1, "enqueued": 3}
    rows = _outbox()
    assert set(rows) == {"planned_start", "follow_up", "end_of_window"}
    assert rows["planned_start"].next_run_at == datetime(2026, 9, 15, 22, 30, tzinfo=UTC)
    assert rows["follow_up"].next_run_at == datetime(2026, 9, 16, 0, 0, tzinfo=UTC)  # +90 min
    assert rows["end_of_window"].next_run_at == datetime(2026, 9, 15, 23, 0, tzinfo=UTC)
    assert all(r.status == "pending" and r.proactive == 1 for r in rows.values())
    assert rows["planned_start"].payload["target_seconds"] == 3600

    second = schedule_reminders()
    assert second == {"users": 1, "enqueued": 0}
    with freeze_time("2026-09-15 12:05:00"):
        assert schedule_reminders()["enqueued"] == 0
    assert len(_outbox()) == 3
    # nada venceu ainda: o envio não toca em nada
    assert dispatch_outbox() == {"claimed": 0}
    assert _inbox() == []


@freeze_time(NOW)
def test_reminder_is_sent_with_current_numbers(user_client):
    act = _activity(user_client)
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        stats = dispatch_outbox()
    assert stats == {"sent": 1, "claimed": 1}
    row = _outbox()["planned_start"]
    assert row.status == "sent" and row.locked_at is None and row.sent_at is not None
    (n,) = _inbox()
    assert n.kind == "planned_start" and n.url == "/app" and n.read_at is None
    assert n.data["activity_id"] == act["id"] and n.data["local_date"] == "2026-09-15"
    assert "Inglês" not in n.title + n.body  # nome do objetivo oculto por padrão
    # sem chaves no servidor o push é pulado com honestidade; a central recebeu
    assert _deliveries() == [("inapp", "sent", None), ("push", "skipped", "push_disabled")]
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"claimed": 0}  # reexecutar não reenvia
    assert len(_inbox()) == 1


# --- (b) reconferência de relevância no envio -------------------------------------------


@freeze_time(NOW)
def test_reminder_skipped_when_session_was_logged_before_sending(user_client):
    act = _activity(user_client)
    schedule_reminders()
    r = user_client.post(
        f"{API}/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 1800, "local_date": "2026-09-15"},
    )
    assert r.status_code == 201, r.text
    rows = _outbox()
    # o registro manual já cancela o acompanhamento; o lembrete do horário é reconferido no envio
    assert rows["follow_up"].status == "cancelled"
    assert rows["follow_up"].skip_reason == "manual_logged"
    assert rows["planned_start"].status == "pending"
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"skipped": 1, "claimed": 1}
    row = _outbox()["planned_start"]
    assert row.status == "skipped" and row.skip_reason == "session_logged"
    assert _inbox() == [] and _deliveries() == []


@freeze_time(NOW)
def test_reminder_skipped_when_goal_already_met(user_client):
    act = _activity(user_client)
    schedule_reminders()
    user_client.post(
        f"{API}/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 3600, "local_date": "2026-09-15"},
    )
    with freeze_time(AT_WINDOW):
        stats = dispatch_outbox()
    assert stats == {"skipped": 2, "claimed": 2}
    rows = _outbox()
    assert rows["planned_start"].skip_reason == "goal_met"
    assert rows["end_of_window"].skip_reason == "nothing_remaining"


@freeze_time(NOW)
def test_reminder_skipped_when_activity_is_paused(user_client):
    act = _activity(user_client)
    schedule_reminders()
    r = user_client.post(f"{API}/activities/{act['id']}/status", json={"status": "paused"})
    assert r.status_code == 200, r.text
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"skipped": 1, "claimed": 1}
    row = _outbox()["planned_start"]
    assert row.status == "skipped" and row.skip_reason == "activity_inactive"
    assert _inbox() == []
    # objetivo pausado também não gera novas ocorrências
    assert schedule_reminders() == {"users": 1, "enqueued": 0}


@freeze_time(NOW)
def test_reminder_skipped_during_a_pause_period_that_silences_reminders(user_client):
    act = _activity(user_client)
    schedule_reminders()
    r = user_client.post(
        f"{API}/activities/{act['id']}/pauses",
        json={"start_date": "2026-09-15", "end_date": "2026-09-17", "reason": "viagem"},
    )
    assert r.status_code == 201, r.text
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"skipped": 1, "claimed": 1}
    assert _outbox()["planned_start"].skip_reason == "activity_paused"
    assert _inbox() == []


@freeze_time(NOW)
def test_reminder_skipped_while_a_session_is_active(user_client):
    act = _activity(user_client)
    schedule_reminders()
    with freeze_time("2026-09-15 22:20:00"):
        r = user_client.post(f"{API}/sessions/start", json={"activity_id": act["id"]})
        assert r.status_code == 201, r.text
    rows = _outbox()
    # iniciar a sessão cancela os lembretes de início de hoje…
    assert rows["planned_start"].status == "cancelled"
    assert rows["planned_start"].skip_reason == "session_started"
    assert rows["follow_up"].status == "cancelled"
    assert rows["end_of_window"].status == "pending"
    # …e o que sobrar é pulado no envio enquanto o cronômetro está rodando
    with freeze_time(AT_WINDOW):
        assert dispatch_outbox() == {"skipped": 1, "claimed": 1}
    row = _outbox()["end_of_window"]
    assert row.status == "skipped" and row.skip_reason == "session_active"
    assert _inbox() == []


# --- (c) limite diário e silêncio -------------------------------------------------------


@freeze_time(NOW)
def test_daily_cap_is_respected(user_client):
    _activity(user_client)
    r = user_client.patch(f"{API}/notifications/preferences", json={"max_per_day": 1})
    assert r.status_code == 200 and r.json()["max_per_day"] == 1
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"sent": 1, "claimed": 1}
    with freeze_time(AT_WINDOW):
        assert dispatch_outbox() == {"skipped": 1, "claimed": 1}
    rows = _outbox()
    assert rows["planned_start"].status == "sent"
    assert rows["end_of_window"].status == "skipped"
    assert rows["end_of_window"].skip_reason == "daily_cap"
    assert [n.kind for n in _inbox()] == ["planned_start"]


@freeze_time(NOW)
def test_quiet_hours_reschedule_instead_of_sending(user_client):
    _activity(user_client)
    r = user_client.patch(
        f"{API}/notifications/preferences", json={"quiet_start": "19:00", "quiet_end": "20:00"}
    )
    assert r.status_code == 200, r.text
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"rescheduled": 1, "claimed": 1}
    row = _outbox()["planned_start"]
    assert row.status == "pending" and row.locked_at is None and row.attempts == 0
    assert row.next_run_at == datetime(2026, 9, 15, 23, 0, tzinfo=UTC)  # 20:00 local
    assert _inbox() == []
    with freeze_time("2026-09-15 22:45:00"):
        assert dispatch_outbox() == {"claimed": 0}  # ainda em silêncio: nem é selecionado
    with freeze_time(AT_WINDOW):
        stats = dispatch_outbox()
    assert stats == {"sent": 2, "claimed": 2}
    assert sorted(n.kind for n in _inbox()) == ["end_of_window", "planned_start"]


@freeze_time(NOW)
def test_quiet_hours_longer_than_the_reminder_lifetime_skip_it(user_client):
    _activity(user_client)
    user_client.patch(
        f"{API}/notifications/preferences", json={"quiet_start": "19:00", "quiet_end": "07:00"}
    )
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"skipped": 1, "claimed": 1}
    row = _outbox()["planned_start"]  # expira 01:30 local; o silêncio vai até 07:00
    assert row.status == "skipped" and row.skip_reason == "quiet_hours"


# --- (d) push ---------------------------------------------------------------------------


@freeze_time(NOW)
def test_push_payload_and_success(user_client, monkeypatch):
    _enable_push(monkeypatch)
    calls = []

    def fake_webpush(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    act = _activity(user_client)
    _subscribe(user_client)
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"sent": 1, "claimed": 1}
    (call,) = calls
    assert call["subscription_info"] == {
        "endpoint": ENDPOINT,
        "keys": {"p256dh": "chave-p256dh", "auth": "segredo"},
    }
    assert call["vapid_private_key"] == "chave-privada-de-teste"
    assert call["vapid_claims"] == {"sub": settings.VAPID_SUBJECT}
    assert call["ttl"] == push_integration.PUSH_TTL_SECONDS
    row = _outbox()["planned_start"]
    (n,) = _inbox()
    payload = json.loads(call["data"])
    # contrato com o service worker
    assert payload == {
        "title": n.title,
        "body": n.body,
        "url": "/app",
        "tag": f"planned_start:{act['id']}",
        "data": {
            "kind": "planned_start",
            "outbox_id": str(row.id),
            "activity_id": act["id"],
            "local_date": "2026-09-15",
        },
    }
    assert _deliveries() == [("inapp", "sent", None), ("push", "sent", None)]


@freeze_time(NOW)
@pytest.mark.parametrize("status_code", [404, 410])
def test_push_subscription_removed_when_gone(user_client, monkeypatch, status_code):
    _enable_push(monkeypatch)

    class GoneResponse:
        text = "gone"

        def __init__(self, code):
            self.status_code = code

    def fake_webpush(**kwargs):
        raise pywebpush.WebPushException("Push failed", response=GoneResponse(status_code))

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    _activity(user_client)
    _subscribe(user_client)
    assert _subscriptions() == [ENDPOINT]
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"sent": 1, "claimed": 1}
    assert _subscriptions() == []  # o navegador cancelou: a assinatura sai
    assert _deliveries() == [
        ("inapp", "sent", None),
        ("push", "skipped", f"gone:{status_code}"),
    ]
    assert _outbox()["planned_start"].status == "sent"  # a central recebeu; sem nova tentativa
    assert len(_inbox()) == 1


@freeze_time(NOW)
def test_push_server_error_keeps_subscription_and_counts_failure(user_client, monkeypatch):
    _enable_push(monkeypatch)
    monkeypatch.setattr(
        push_integration,
        "send_push",
        lambda sub, payload, **kw: push_integration.PushResult(
            ok=False, error="http_500", status_code=500
        ),
    )
    _activity(user_client)
    _subscribe(user_client)
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"partial": 1, "claimed": 1}
    assert _subscriptions() == [ENDPOINT]
    with SessionLocal() as db:
        assert db.execute(select(PushSubscription)).scalar_one().failure_count == 1
    assert len(_inbox()) == 1  # "partial": a central recebeu e nada é reenviado
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"claimed": 0}


@freeze_time(NOW)
def test_without_vapid_keys_endpoint_is_404_and_dispatch_does_not_break(user_client):
    r = user_client.get(f"{API}/notifications/push/vapid-public-key")
    assert r.status_code == 404 and r.json()["error"]["code"] == "push_disabled"
    assert "VAPID" not in r.json()["error"]["message"]
    _subscribe(user_client)  # assinatura pode existir de quando o servidor tinha chaves
    r = user_client.post(f"{API}/notifications/push/test")
    assert r.status_code == 503 and r.json()["error"]["code"] == "push_disabled"
    # envio direto também é honesto: nada sai, nenhuma exceção
    res = push_integration.send_push(object(), {"title": "x"})
    assert res.ok is False and res.error == "push_disabled"

    _activity(user_client)
    schedule_reminders()
    with freeze_time(AT_PLANNED):
        assert dispatch_outbox() == {"sent": 1, "claimed": 1}
    assert _deliveries() == [("inapp", "sent", None), ("push", "skipped", "push_disabled")]
    assert _subscriptions() == [ENDPOINT] and len(_inbox()) == 1


@freeze_time(NOW)
def test_vapid_key_and_test_push_when_configured(user_client, monkeypatch):
    _enable_push(monkeypatch)
    sent = []
    monkeypatch.setattr(pywebpush, "webpush", lambda **kw: sent.append(json.loads(kw["data"])))
    r = user_client.get(f"{API}/notifications/push/vapid-public-key")
    assert r.status_code == 200 and r.json() == {"public_key": "chave-publica-de-teste"}
    r = user_client.post(f"{API}/notifications/push/test")
    assert r.status_code == 422 and r.json()["error"]["code"] == "no_subscription"
    _subscribe(user_client)
    r = user_client.post(f"{API}/notifications/push/test")
    assert r.status_code == 200, r.text
    assert dispatch_outbox() == {"sent": 1, "claimed": 1}
    assert sent[0]["title"] == "Teste de notificação"
    assert sent[0]["url"] == "/app/preferencias" and sent[0]["tag"] == "system:geral"
    assert sent[0]["data"]["outbox_id"] == r.json()["outbox_id"]


# --- (g) isolamento ---------------------------------------------------------------------


@freeze_time(NOW)
def test_one_user_failing_or_logging_does_not_affect_another(client):
    signup(client, email="ana@example.com")
    ana_act = _activity(client)
    with ApiClient(app, base_url="http://localhost:8000") as other:
        signup(other, email="bia@example.com", name="Bia")
        bia_act = _activity(other)
        assert schedule_reminders() == {"users": 2, "enqueued": 6}
        # Bia registra a meta inteira: só os lembretes dela deixam de fazer sentido
        other.post(
            f"{API}/sessions/manual",
            json={
                "activity_id": bia_act["id"],
                "duration_seconds": 3600,
                "local_date": "2026-09-15",
            },
        )
        with freeze_time(AT_PLANNED):
            assert dispatch_outbox() == {"sent": 1, "skipped": 1, "claimed": 2}
        ana_list = client.get(f"{API}/notifications").json()
        bia_list = other.get(f"{API}/notifications").json()
    ana_kinds = [n["kind"] for n in ana_list["items"] if n["kind"] != "achievement"]
    assert sorted(ana_kinds) == ["planned_start", "welcome"]
    reminder = next(n for n in ana_list["items"] if n["kind"] == "planned_start")
    assert reminder["data"]["activity_id"] == ana_act["id"]
    assert [n["kind"] for n in bia_list["items"] if n["kind"] != "achievement"] == ["welcome"]
