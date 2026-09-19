"""Lembretes de retorno: convite para quem não criou objetivo e chamado para quem parou de
estudar. Uma mensagem por etapa, silêncio em pausas, e-mail com descadastro de um clique."""

from __future__ import annotations

from datetime import timedelta

import pytest
from freezegun import freeze_time
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.timeutil import utcnow
from app.integrations.email import MemoryBackend
from app.models.notification import NotificationOutbox
from app.models.user import NotificationPreferences, User
from app.services import notifications as svc
from tests.conftest import make_activity, signup

API = "/api/v1"


@pytest.fixture(autouse=True)
def _email_memory(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "memory")
    MemoryBackend.sent.clear()
    yield
    MemoryBackend.sent.clear()


def _signed_up_days_ago(email: str, days: int):
    """created_at vem do relógio do banco (fora do freezegun): fixa em relação ao "agora" do teste."""
    with SessionLocal() as db:
        u = db.execute(select(User).where(User.email == email)).scalar_one()
        u.created_at = utcnow() - timedelta(days=days)
        db.commit()


def _run(now=None) -> dict:
    with SessionLocal() as db:
        return svc.schedule_reengagement(db, now=now)


def _rows(kind: str) -> list[NotificationOutbox]:
    with SessionLocal() as db:
        return list(
            db.execute(select(NotificationOutbox).where(NotificationOutbox.kind == kind)).scalars()
        )


def _dispatch(now):
    with SessionLocal() as db:
        return svc.dispatch_outbox(db, now=now)


@freeze_time("2026-09-16 12:00:00")  # quarta, 09:00 em São Paulo
def test_no_goal_nudges_follow_steps_once(client):
    signup(client, email="nova@example.com")
    _signed_up_days_ago("nova@example.com", 0)
    assert _run()["enqueued"] == 0  # dia 0: nada
    _signed_up_days_ago("nova@example.com", 1)
    assert _run()["enqueued"] == 1
    assert _run()["enqueued"] == 0  # idempotente
    _signed_up_days_ago("nova@example.com", 2)  # entre etapas
    assert _run()["enqueued"] == 0
    _signed_up_days_ago("nova@example.com", 3)
    assert _run()["enqueued"] == 1
    _signed_up_days_ago("nova@example.com", 33)  # muito depois: não insiste
    assert _run()["enqueued"] == 0
    rows = _rows("no_goal")
    assert len(rows) == 2 and "email" in rows[0].channels
    # envio no horário de lembrete (19:30 local = 22:30 UTC), com e-mail e descadastro
    stats = _dispatch(rows[0].next_run_at + timedelta(minutes=1))
    assert stats.get("sent", 0) + stats.get("partial", 0) >= 1
    mail = MemoryBackend.sent[-1]
    assert "objetivo" in mail.text and "/api/v1/public/unsubscribe?u=" in mail.text
    assert mail.headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert 'href="' in mail.html and "tata-email.png" in mail.html


@freeze_time("2026-09-16 12:00:00")
def test_inactive_after_last_session_and_unsubscribe(client):
    signup(client, email="parou@example.com")
    act = make_activity(client, start_date="2026-09-01")
    r = client.post(
        f"{API}/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 1800, "local_date": "2026-09-13"},
    )
    assert r.status_code == 201
    assert _run()["enqueued"] == 1  # 3 dias sem estudar
    row = _rows("inactive")[0]
    assert row.payload["days_without"] == 3
    _dispatch(row.next_run_at + timedelta(minutes=1))
    mail = MemoryBackend.sent[-1]
    assert "3 dias" in mail.text
    link = mail.text.split("? ")[-1].strip()
    path = (
        link.split("estudatta", 1)[-1]
        if "://" not in link
        else "/" + link.split("://", 1)[1].split("/", 1)[1]
    )
    page = client.get(path)
    assert page.status_code == 200 and "Pronto" in page.text
    with SessionLocal() as db:
        u = db.execute(select(User).where(User.email == "parou@example.com")).scalar_one()
        assert db.get(NotificationPreferences, u.id).reengagement_email is False
    assert client.get("/api/v1/public/unsubscribe?u=x&t=y").status_code == 400
    # a sessão nova zera a contagem: nada até 3 dias depois dela
    client.post(
        f"{API}/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 1800, "local_date": "2026-09-16"},
    )
    assert _run()["enqueued"] == 0


@freeze_time("2026-09-16 12:00:00")
def test_silence_when_paused_disabled_or_everything_archived(client):
    signup(client, email="pausa@example.com")
    act = make_activity(client, start_date="2026-09-01")
    # pausa planejada cobrindo hoje
    r = client.post(
        f"{API}/activities/{act['id']}/pauses",
        json={"start_date": "2026-09-15", "end_date": "2026-09-20"},
    )
    assert r.status_code in (200, 201), r.text
    assert _run()["enqueued"] == 0
    with SessionLocal() as db:
        from app.models.activity import ActivityPause

        for p in db.execute(select(ActivityPause)).scalars():
            db.delete(p)
        db.commit()
    # desligado nas preferências
    assert (
        client.patch(f"{API}/notifications/preferences", json={"reengagement": False}).status_code
        == 200
    )
    assert _run()["enqueued"] == 0
    client.patch(f"{API}/notifications/preferences", json={"reengagement": True})
    # objetivo pausado: a pessoa decidiu parar
    client.post(f"{API}/activities/{act['id']}/status", json={"status": "paused"})
    assert _run()["enqueued"] == 0
    client.post(f"{API}/activities/{act['id']}/status", json={"status": "active"})
    assert _run()["enqueued"] == 1


def test_step_windows():
    assert svc._step_for(0, svc.INACTIVE_STEPS) is None
    assert svc._step_for(3, svc.INACTIVE_STEPS) == 3
    assert svc._step_for(6, svc.INACTIVE_STEPS) == 3
    assert svc._step_for(7, svc.INACTIVE_STEPS) == 7
    assert svc._step_for(44, svc.INACTIVE_STEPS) == 30
    assert svc._step_for(45, svc.INACTIVE_STEPS) is None
