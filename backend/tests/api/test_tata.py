"""Tatá com IA e voz: contexto só com dados reais, conversa dentro da cota, voz natural com cache
e fallback quando a cota acaba."""

from __future__ import annotations

import pathlib

import httpx
import pytest

from app.core.config import settings
from app.integrations import ai as ai_integration
from app.integrations import elevenlabs
from app.services import tata as tata_service
from tests.api.test_ai import FakeAiClient
from tests.conftest import make_activity
from tests.fixtures.plans import set_free_plan_limits

API = "/api/v1"


@pytest.fixture
def ai(monkeypatch):
    monkeypatch.setattr(settings, "AI_ENABLED", True)
    monkeypatch.setattr(settings, "AI_API_KEY", "chave-de-teste")
    fake = FakeAiClient(
        [{"reply": "Oi, Ana! Hoje faltam 20 min. Que tal 15 minutinhos?", "mood": "encourage"}] * 5
    )
    monkeypatch.setattr(ai_integration, "get_client", lambda: fake)
    return fake


@pytest.fixture
def voice(monkeypatch):
    calls = []

    def handler(req: httpx.Request) -> httpx.Response:
        calls.append(req)
        assert req.headers["xi-api-key"] == "xi-teste"
        return httpx.Response(
            200,
            content=b"ID3mp3-fake-" + bytes(str(len(calls)), "ascii"),
            headers={"content-type": "audio/mpeg"},
        )

    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", "xi-teste")
    original = elevenlabs.synthesize
    monkeypatch.setattr(
        elevenlabs,
        "synthesize",
        lambda text, transport=None: original(text, transport=httpx.MockTransport(handler)),
    )
    return calls


def test_context_uses_only_real_data(user_client):
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.models.user import User

    act = make_activity(user_client, start_date="2026-09-01")
    with SessionLocal() as db:
        u = db.execute(select(User)).scalar_one()
        ctx = tata_service.build_context(db, u)
    assert "Inglês" in ctx and "meta de hoje" in ctx and "nível" in ctx
    assert act["id"] not in ctx  # nada de ids


def test_chat_counts_ai_actions_and_free_plan_quota(user_client, ai):
    set_free_plan_limits(ai_daily_actions=2, ai_monthly_actions=2)
    make_activity(user_client)
    st = user_client.get(f"{API}/tata/status").json()
    assert st["chat_enabled"] is True and st["chat_remaining_today"] == 2
    r = user_client.post(f"{API}/tata/chat", json={"message": "como está meu dia?"})
    assert r.status_code == 200, r.text
    assert "15 minutinhos" in r.json()["reply"] and r.json()["mood"] == "encourage"
    assert r.json()["status"]["chat_remaining_today"] == 1
    sent = ai.calls[-1]
    assert "<dados>" in sent["user"] and "Tatá" in sent["system"]
    r = user_client.post(
        f"{API}/tata/chat",
        json={
            "message": "e amanhã?",
            "history": [
                {"role": "user", "text": "como está meu dia?"},
                {"role": "tata", "text": "Oi!"},
            ],
        },
    )
    assert r.status_code == 200 and "Conversa até aqui" in ai.calls[-1]["user"]
    r = user_client.post(f"{API}/tata/chat", json={"message": "mais uma"})
    assert r.status_code == 429 and r.json()["error"]["code"] in ("ai_quota", "ai_monthly_quota")
    assert user_client.get(f"{API}/tata/status").json()["chat_enabled"] is False


@pytest.fixture
def clean_voice_cache():
    """O cache de falas fica no storage local e sobreviveria entre execuções."""
    import shutil

    from app.core.config import settings

    shutil.rmtree(pathlib.Path(settings.STORAGE_LOCAL_PATH) / "tata-voice", ignore_errors=True)
    yield
    shutil.rmtree(pathlib.Path(settings.STORAGE_LOCAL_PATH) / "tata-voice", ignore_errors=True)


def test_voice_quota_cache_and_fallback(clean_voice_cache, user_client, voice):
    set_free_plan_limits(tata_voice_monthly=2)
    r = user_client.post(f"{API}/tata/voice", json={"text": "Bora! Eu fico aqui quietinho."})
    assert (
        r.status_code == 200
        and r.headers["content-type"] == "audio/mpeg"
        and r.content.startswith(b"ID3")
    )
    # mesma frase: vem do cache, sem nova chamada nem cota
    r2 = user_client.post(f"{API}/tata/voice", json={"text": "Bora!  Eu fico aqui quietinho."})
    assert r2.status_code == 200 and r2.content == r.content and len(voice) == 1
    st = user_client.get(f"{API}/tata/status").json()
    assert st["voice_used_month"] == 1 and st["voice_natural"] is True
    assert user_client.post(f"{API}/tata/voice", json={"text": "Segunda frase."}).status_code == 200
    r = user_client.post(f"{API}/tata/voice", json={"text": "Terceira frase."})
    assert r.status_code == 429 and r.json()["error"]["code"] == "voice_quota"
    assert user_client.get(f"{API}/tata/status").json()["voice_natural"] is False
    # frase já em cache continua disponível mesmo sem cota
    assert user_client.post(f"{API}/tata/voice", json={"text": "Segunda frase."}).status_code == 200
    # voz não consome ações de IA
    assert user_client.get(f"{API}/ai/status").json()["used_this_month"] == 0


def test_voice_disabled_without_key(user_client, monkeypatch):
    monkeypatch.setattr(settings, "ELEVENLABS_API_KEY", None)
    assert user_client.get(f"{API}/tata/status").json()["voice_natural"] is False
    r = user_client.post(f"{API}/tata/voice", json={"text": "oi"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "voice_disabled"
