"""Tours guiados: quais já foram vistos fica na conta (vale em todos os aparelhos)."""

API = "/api/v1"


def test_tours_seen_is_idempotent_resettable_and_isolated(user_client, client):
    assert user_client.get(f"{API}/me/preferences").json()["tours_seen"] == []
    r = user_client.post(f"{API}/me/tours/seen", json={"key": "hoje"})
    assert r.status_code == 200 and r.json()["tours_seen"] == ["hoje"]
    user_client.post(f"{API}/me/tours/seen", json={"key": "hoje"})
    user_client.post(f"{API}/me/tours/seen", json={"key": "sessao-inicio"})
    assert user_client.get(f"{API}/me/preferences").json()["tours_seen"] == [
        "hoje",
        "sessao-inicio",
    ]
    assert user_client.post(f"{API}/me/tours/seen", json={"key": "Não Vale!"}).status_code == 422
    r = user_client.post(f"{API}/me/tours/reset", json={"keys": ["hoje"]})
    assert r.json()["tours_seen"] == ["sessao-inicio"]
    r = user_client.post(f"{API}/me/tours/reset", json={})
    assert r.json()["tours_seen"] == []
    # sem login
    user_client.cookies.clear()
    assert user_client.post(f"{API}/me/tours/seen", json={"key": "hoje"}).status_code == 401
