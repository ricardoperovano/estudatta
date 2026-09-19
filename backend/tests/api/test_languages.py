"""Objetivos de idiomas: categoria única "idioma" com idioma escolhido (padrão inglês);
"ingles" de clientes antigos vira idioma + inglês."""

from app.core.languages import DEFAULT_LANGUAGE, LANGUAGES, POPULAR
from tests.conftest import make_activity

API = "/api/v1"


def _create(client, **body):
    base = {"title": "Idioma", "goal": {"daily_minutes": 30, "active_days": [0, 1, 2, 3, 4]}}
    r = client.post(f"{API}/activities", json={**base, **body})
    return r


def test_language_catalog_is_large_and_starts_with_english():
    assert DEFAULT_LANGUAGE == "en" and next(iter(POPULAR)) == "en"
    assert len(LANGUAGES) >= 90
    assert {"es", "fr", "de", "ja", "zh", "ko", "bzs", "ase", "und"} <= set(LANGUAGES)
    assert all(name and name[0].isupper() for name in LANGUAGES.values())


def test_idioma_defaults_to_english_and_accepts_any_catalog_language(user_client):
    r = _create(user_client, title="Inglês", category="idioma")
    assert r.status_code == 201, r.text
    assert r.json()["language"] == "en" and r.json()["language_name"] == "Inglês"
    r = _create(user_client, title="Japonês", category="idioma", language="ja")
    assert r.status_code in (201, 402), r.text  # plano gratuito: 1 objetivo ativo
    bad = _create(user_client, title="X", category="idioma", language="klingon")
    assert bad.status_code == 422


def test_legacy_ingles_category_becomes_idioma_english(user_client):
    r = _create(user_client, title="Inglês", category="ingles")
    assert r.status_code == 201, r.text
    assert r.json()["category"] == "idioma" and r.json()["language"] == "en"


def test_update_language_and_category(user_client):
    act = make_activity(user_client)
    r = user_client.patch(
        f"{API}/activities/{act['id']}", json={"category": "idioma", "language": "es"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["language"] == "es" and r.json()["language_name"] == "Espanhol"
    # só o idioma
    r = user_client.patch(f"{API}/activities/{act['id']}", json={"language": "fr"})
    assert r.json()["category"] == "idioma" and r.json()["language"] == "fr"
    # outra categoria não guarda idioma
    r = user_client.patch(f"{API}/activities/{act['id']}", json={"category": "concurso"})
    assert r.json()["category"] == "concurso" and r.json()["language"] is None
    # idioma em categoria que não é idioma passa a ser objetivo de idioma
    r = user_client.patch(f"{API}/activities/{act['id']}", json={"language": "it"})
    assert r.json()["category"] == "idioma" and r.json()["language"] == "it"
