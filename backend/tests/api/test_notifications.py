"""Central de notificações, preferências (com validação), prévia de tom, assinaturas push
e isolamento entre usuários."""

from __future__ import annotations

import uuid

import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.main import app
from app.models.user import PushSubscription, User
from app.services import outbox
from tests.conftest import ApiClient, make_activity, signup

API = "/api/v1/notifications"
ENDPOINT = "https://push.example.com/send/abc123"


@pytest.fixture(autouse=True)
def _no_vapid(monkeypatch):
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", None)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", None)


@pytest.fixture
def other_client():
    with ApiClient(app, base_url="http://localhost:8000") as c:
        signup(c, email="bia@example.com", name="Bia")
        yield c


def _notify(email: str, title: str, kind: str = "planned_start") -> str:
    with SessionLocal() as db:
        user = db.execute(select(User).where(User.email == email)).scalar_one()
        n = outbox.notify_inapp(
            db, user_id=user.id, kind=kind, title=title, body=f"Corpo de {title}", url="/app"
        )
        db.commit()
        return str(n.id)


# --- Central ----------------------------------------------------------------------------


def test_center_list_unread_and_mark_read(user_client):
    base = user_client.get(API).json()
    welcome = len(base["items"])  # o cadastro pode deixar uma mensagem de boas-vindas
    assert base["total"] == welcome and base["unread_count"] == welcome
    with freeze_time("2026-09-15 12:00:00"):
        first = _notify("ana@example.com", "Primeira")
    with freeze_time("2026-09-15 12:10:00"):
        second = _notify("ana@example.com", "Segunda", kind="goal_completed")
    with freeze_time("2026-09-15 12:20:00"):
        third = _notify("ana@example.com", "Terceira")

    body = user_client.get(API).json()
    assert body["total"] == welcome + 3 and body["unread_count"] == welcome + 3
    assert body["limit"] == 50 and body["offset"] == 0
    ours = [n for n in body["items"] if n["id"] in (first, second, third)]
    assert [n["title"] for n in ours] == ["Terceira", "Segunda", "Primeira"]  # mais novas antes
    assert ours[0]["body"] == "Corpo de Terceira" and ours[0]["url"] == "/app"
    assert ours[0]["read_at"] is None and ours[1]["kind"] == "goal_completed"
    assert user_client.get(f"{API}/unread-count").json() == {"count": welcome + 3}

    # paginação
    page = user_client.get(API, params={"limit": 1, "offset": 1}).json()
    assert len(page["items"]) == 1 and page["total"] == welcome + 3
    assert user_client.get(API, params={"limit": 0}).status_code == 422
    assert user_client.get(API, params={"limit": 201}).status_code == 422

    # marcar uma como lida (idempotente)
    r = user_client.post(f"{API}/{second}/read")
    assert r.status_code == 200 and r.json()["read_at"] is not None
    read_at = r.json()["read_at"]
    assert user_client.post(f"{API}/{second}/read").json()["read_at"] == read_at
    assert user_client.get(f"{API}/unread-count").json() == {"count": welcome + 2}
    unread = user_client.get(API, params={"unread_only": True}).json()
    assert unread["total"] == welcome + 2 and second not in [n["id"] for n in unread["items"]]
    assert unread["unread_count"] == welcome + 2

    # inexistente / id inválido
    assert user_client.post(f"{API}/{uuid.uuid4()}/read").status_code == 404
    assert user_client.post(f"{API}/nao-e-uuid/read").status_code == 422

    # marcar todas
    r = user_client.post(f"{API}/read-all")
    assert r.status_code == 200 and r.json()["ok"] is True
    assert user_client.get(f"{API}/unread-count").json() == {"count": 0}
    assert user_client.get(API, params={"unread_only": True}).json()["items"] == []
    assert user_client.get(API).json()["total"] == welcome + 3  # lidas continuam na central


def test_center_requires_login_and_csrf(client):
    assert client.get(API).status_code == 401
    assert client.get(f"{API}/preferences").status_code == 401
    signup(client)
    nid = _notify("ana@example.com", "Oi")
    client.csrf = None
    assert client.post(f"{API}/{nid}/read").status_code == 403


# --- Preferências -----------------------------------------------------------------------


def test_preferences_defaults_update_and_validation(user_client):
    prefs = user_client.get(f"{API}/preferences").json()
    assert prefs["enabled"] is True and prefs["channel_inapp"] is True
    assert prefs["channel_email"] is False and prefs["weekly_summary_email"] is False
    assert prefs["max_per_day"] == settings.NOTIFICATIONS_MAX_PROACTIVE_PER_DAY
    assert prefs["quiet_start"] == "22:00" and prefs["quiet_end"] == "07:00"
    assert prefs["show_activity_name"] is False  # privacidade: nome do objetivo oculto no push
    assert prefs["snoozed_until"] is None and prefs["paused_until"] is None

    r = user_client.patch(
        f"{API}/preferences",
        json={
            "reminder_time": "18:45",
            "reminder_days": [4, 0, 2, 2],
            "follow_up_minutes": 30,
            "quiet_start": "21:30",
            "quiet_weekends": True,
            "max_per_day": settings.NOTIFICATIONS_SYSTEM_CEILING_PER_DAY,
            "show_activity_name": True,
            "channel_push": False,
        },
    )
    assert r.status_code == 200, r.text
    got = user_client.get(f"{API}/preferences").json()
    assert got["reminder_time"] == "18:45" and got["reminder_days"] == [0, 2, 4]
    assert got["follow_up_minutes"] == 30 and got["quiet_start"] == "21:30"
    assert got["quiet_weekends"] is True and got["show_activity_name"] is True
    assert got["channel_push"] is False
    assert got["max_per_day"] == settings.NOTIFICATIONS_SYSTEM_CEILING_PER_DAY
    assert got["quiet_end"] == "07:00"  # campo não enviado não muda

    # acima do teto do sistema: recusado pelo serviço, com o teto nos detalhes
    r = user_client.patch(
        f"{API}/preferences",
        json={"max_per_day": settings.NOTIFICATIONS_SYSTEM_CEILING_PER_DAY + 1},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "max_per_day_ceiling"
    assert r.json()["error"]["details"] == {
        "ceiling": settings.NOTIFICATIONS_SYSTEM_CEILING_PER_DAY
    }
    bad_bodies = [
        {"max_per_day": 0},
        {"reminder_time": "25:00"},
        {"reminder_time": "7:30"},
        {"quiet_start": "22h"},
        {"quiet_end": "07:60"},
        {"reminder_days": [0, 7]},
        {"reminder_days": [-1]},
        {"follow_up_minutes": 5},
        {"follow_up_minutes": 1000},
        {"resume_after_days": 0},
    ]
    for body in bad_bodies:
        r = user_client.patch(f"{API}/preferences", json=body)
        assert r.status_code == 422, (body, r.text)
        assert r.json()["error"]["code"] == "validation_failed", body
    # nada do que foi recusado ficou gravado
    assert user_client.get(f"{API}/preferences").json() == got


@freeze_time("2026-09-15 12:00:00")
def test_snooze_and_pause(user_client):
    r = user_client.post(f"{API}/snooze", json={"minutes": 60})
    assert r.status_code == 200 and r.json()["snoozed_until"].startswith("2026-09-15T13:00:00")
    assert user_client.post(f"{API}/snooze", json={"minutes": 1}).status_code == 422
    assert user_client.post(f"{API}/snooze", json={"minutes": 24 * 60 + 1}).status_code == 422
    r = user_client.post(f"{API}/pause", json={"until": "2026-09-20T12:00:00Z"})
    assert r.status_code == 200 and r.json()["paused_until"].startswith("2026-09-20T12:00:00")
    r = user_client.post(f"{API}/pause", json={})
    assert r.status_code == 200 and r.json()["paused_until"] is None


# --- Prévia de tom ----------------------------------------------------------------------


def test_tone_preview(user_client):
    make_activity(user_client, title="Inglês")
    previews = {}
    for tone in ("acolhedor", "direto", "firme"):
        r = user_client.post(f"{API}/preview", json={"tone": tone, "kind": "follow_up"})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["tone"] == tone and p["kind"] == "follow_up"
        assert p["title"].strip() and p["body"].strip()
        text = (p["title"] + " " + p["body"]).lower()
        assert "inglês" not in text  # nome do objetivo oculto por padrão
        assert "você não estudou" not in text  # só falta registro: nunca acusar
        previews[tone] = (p["title"], p["body"])
    assert len(set(previews.values())) == 3  # cada tom tem texto próprio

    # com o nome do objetivo visível
    user_client.patch(f"{API}/preferences", json={"show_activity_name": True})
    p = user_client.post(f"{API}/preview", json={"tone": "direto", "kind": "planned_start"}).json()
    assert "Inglês" in p["title"] + p["body"]
    # padrões e todos os tipos
    p = user_client.post(f"{API}/preview", json={}).json()
    assert p["tone"] == "acolhedor" and p["kind"] == "planned_start"
    kinds = ["end_of_window", "goal_completed", "resume", "weekly_summary"]
    for kind in kinds:
        r = user_client.post(f"{API}/preview", json={"tone": "firme", "kind": kind})
        assert r.status_code == 200 and r.json()["body"].strip(), kind
    # a prévia não cria nada na central
    assert all(n["kind"] == "welcome" for n in user_client.get(API).json()["items"])
    assert user_client.post(f"{API}/preview", json={"tone": "agressivo"}).status_code == 422
    assert user_client.post(f"{API}/preview", json={"kind": "system"}).status_code == 422


# --- Assinaturas push -------------------------------------------------------------------


def _subscribe(client, endpoint=ENDPOINT, auth="segredo", device="aparelho-1"):
    return client.post(
        f"{API}/push/subscriptions",
        json={
            "endpoint": endpoint,
            "keys": {"p256dh": "chave-p256dh", "auth": auth},
            "user_agent": "Firefox",
        },
        headers={"X-Device-Id": device},
    )


def _subs() -> list[tuple[str, str, str]]:
    with SessionLocal() as db:
        return [
            (db.get(User, s.user_id).email, s.endpoint, s.auth)
            for s in db.execute(select(PushSubscription)).scalars()
        ]


def test_push_subscription_upsert_and_remove(user_client):
    r = _subscribe(user_client)
    assert r.status_code == 201, r.text
    sub = r.json()
    assert sub["endpoint"] == ENDPOINT and sub["device_id"] == "aparelho-1"
    assert sub["user_agent"] == "Firefox" and sub["failure_count"] == 0
    assert "auth" not in sub and "p256dh" not in sub  # segredos da assinatura não voltam
    # mesmo endpoint de novo: atualiza as chaves, não duplica
    r = _subscribe(user_client, auth="segredo-novo")
    assert r.status_code == 201 and r.json()["id"] == sub["id"]
    assert _subs() == [("ana@example.com", ENDPOINT, "segredo-novo")]
    assert _subscribe(user_client, endpoint="").status_code == 422

    r = user_client.request("DELETE", f"{API}/push/subscriptions", json={"endpoint": ENDPOINT})
    assert r.status_code == 200 and r.json()["message"] == "Assinatura removida."
    assert _subs() == []
    r = user_client.request("DELETE", f"{API}/push/subscriptions", json={"endpoint": ENDPOINT})
    assert r.status_code == 200 and "Nenhuma assinatura" in r.json()["message"]


def test_vapid_public_key_is_404_without_keys_and_public_with_keys(client, monkeypatch):
    r = client.get(f"{API}/push/vapid-public-key")
    assert r.status_code == 404 and r.json()["error"]["code"] == "push_disabled"
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", "chave-publica")
    assert client.get(f"{API}/push/vapid-public-key").status_code == 404  # falta a privada
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "chave-privada")
    r = client.get(f"{API}/push/vapid-public-key")
    assert r.status_code == 200 and r.json() == {"public_key": "chave-publica"}
    assert "chave-privada" not in r.text


# --- Isolamento -------------------------------------------------------------------------


def test_isolation_between_users(user_client, other_client):
    ana_n = _notify("ana@example.com", "Da Ana")
    bia_n = _notify("bia@example.com", "Da Bia")
    ana_ids = [n["id"] for n in user_client.get(API).json()["items"]]
    bia_ids = [n["id"] for n in other_client.get(API).json()["items"]]
    assert ana_n in ana_ids and bia_n not in ana_ids
    assert bia_n in bia_ids and ana_n not in bia_ids

    # Bia não lê nem marca a notificação da Ana
    r = other_client.post(f"{API}/{ana_n}/read")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    before = user_client.get(f"{API}/unread-count").json()["count"]
    other_client.post(f"{API}/read-all")
    assert other_client.get(f"{API}/unread-count").json() == {"count": 0}
    assert user_client.get(f"{API}/unread-count").json()["count"] == before

    # preferências são por usuário
    other_client.patch(f"{API}/preferences", json={"enabled": False, "reminder_time": "06:15"})
    ana_prefs = user_client.get(f"{API}/preferences").json()
    assert ana_prefs["enabled"] is True and ana_prefs["reminder_time"] != "06:15"

    # Bia não remove a assinatura da Ana…
    assert _subscribe(user_client).status_code == 201
    r = other_client.request("DELETE", f"{API}/push/subscriptions", json={"endpoint": ENDPOINT})
    assert "Nenhuma assinatura" in r.json()["message"]
    assert _subs() == [("ana@example.com", ENDPOINT, "segredo")]
    # …mas o mesmo navegador, ao entrar com outra conta, passa a valer só para ela
    assert _subscribe(other_client, auth="da-bia").status_code == 201
    assert _subs() == [("bia@example.com", ENDPOINT, "da-bia")]
