"""Idioma da conta e do Accept-Language: erros, próximo passo, conquistas e e-mails em inglês."""

from tests.conftest import make_activity, signup

API = "/api/v1"


def test_register_stores_locale_and_errors_follow_account(client):
    r = client.post(
        f"{API}/auth/register",
        json={
            "email": "en@example.com",
            "password": "senha-forte-123",
            "name": "Ann",
            "timezone": "America/Sao_Paulo",
            "locale": "en-US",
        },
    )
    assert r.status_code == 201, r.text
    client.csrf = r.json()["csrf_token"]
    assert r.json()["user"]["locale"] == "en"
    # erro de domínio traduzido no handler
    r = client.post(f"{API}/auth/register", json={"email": "en@example.com", "password": "x" * 9})
    assert r.status_code == 409
    assert r.json()["error"]["message"] == "There’s already an account with this email."
    # troca pelo PATCH /me e validação
    r = client.patch(f"{API}/me", json={"locale": "xx"})
    assert r.status_code == 422
    r = client.patch(f"{API}/me", json={"locale": "pt"})
    assert r.status_code == 200 and r.json()["locale"] == "pt-BR"
    r = client.post(f"{API}/auth/register", json={"email": "en@example.com", "password": "x" * 9})
    assert r.json()["error"]["message"] == "Já existe uma conta com este e-mail."


def test_accept_language_applies_to_public_routes(client):
    r = client.get(f"{API}/public/plans", headers={"Accept-Language": "en-GB,en;q=0.9"})
    assert r.status_code == 200
    names = [p["name"] for p in r.json()["plans"]]
    assert "Free" in names and "Gratuito" not in names
    r = client.get(f"{API}/public/plans", headers={"Accept-Language": "pt-BR"})
    assert "Gratuito" in [p["name"] for p in r.json()["plans"]]


def test_next_step_and_achievements_in_english(client):
    signup(client, email="ann@example.com")
    client.patch(f"{API}/me", json={"locale": "en"})
    act = make_activity(client, title="English", daily_minutes=30)
    today = client.get(f"{API}/dashboard/today").json()
    card = next(c for c in today["cards"] if c["activity"]["id"] == act["id"])
    assert "today" in card["next_step"].lower() or "rest day" in card["next_step"].lower()
    r = client.post(
        f"{API}/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 1800, "local_date": today["date"]},
    )
    assert r.status_code == 201, r.text
    prof = client.get(f"{API}/gamification").json()
    titles = {a["title"] for a in prof["achievements"] if a.get("unlocked_at")}
    assert "First session" in titles
    assert prof["level"]["title"] in ("First steps", "Rhythm")
    notes = client.get(f"{API}/notifications").json()["items"]
    assert any(n["title"] == "Achievement: First session" for n in notes)
