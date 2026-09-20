"""Marcador de página: livro atual do objetivo de leitura e avanço com "li N páginas"."""

from tests.conftest import make_activity

API = "/api/v1"


def _book(client, act_id, title="Dom Casmurro", pages_total=200):
    r = client.post(
        f"{API}/materials/physical",
        json={"activity_id": act_id, "title": title, "pages_total": pages_total},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _reading(client):
    return make_activity(client, title="Leitura", category="leitura")


def test_set_current_book_and_page(user_client):
    act = _reading(user_client)
    book = _book(user_client, act["id"])
    r = user_client.patch(f"{API}/materials/{book['id']}", json={"current_page": 42})
    assert r.status_code == 200, r.text
    assert r.json()["current_page"] == 42

    r = user_client.patch(f"{API}/activities/{act['id']}", json={"current_material_id": book["id"]})
    assert r.status_code == 200, r.text
    cur = r.json()["current_material"]
    assert cur["id"] == book["id"]
    assert cur["current_page"] == 42
    assert cur["pages_total"] == 200
    assert cur["percent"] == 21

    # aparece também na listagem
    lst = user_client.get(f"{API}/activities").json()
    assert lst[0]["current_material"]["title"] == "Dom Casmurro"


def test_pages_read_advances_bookmark(user_client):
    act = _reading(user_client)
    book = _book(user_client, act["id"])
    user_client.patch(f"{API}/materials/{book['id']}", json={"current_page": 10})
    user_client.patch(f"{API}/activities/{act['id']}", json={"current_material_id": book["id"]})

    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 1800,
            "local_date": "2026-09-20",
            "pages_read": 8,
        },
    )
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["material_id"] == book["id"]
    assert (s["page_from"], s["page_to"]) == (11, 18)

    m = user_client.get(f"{API}/materials/{book['id']}").json()
    assert m["current_page"] == 18
    assert m["last_position"] == "p. 18"


def test_page_to_moves_bookmark_and_clamps_to_total(user_client):
    act = _reading(user_client)
    book = _book(user_client, act["id"], pages_total=100)
    user_client.patch(f"{API}/activities/{act['id']}", json={"current_material_id": book["id"]})

    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 600,
            "local_date": "2026-09-20",
            "page_from": 90,
            "page_to": 97,
        },
    )
    assert r.status_code == 201, r.text
    assert user_client.get(f"{API}/materials/{book['id']}").json()["current_page"] == 97

    # "li 10 páginas" a partir da 97 não passa do total
    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 600,
            "local_date": "2026-09-20",
            "pages_read": 10,
        },
    )
    assert r.status_code == 201, r.text
    m = user_client.get(f"{API}/materials/{book['id']}").json()
    assert m["current_page"] == 100
    assert (
        user_client.get(f"{API}/activities/{act['id']}").json()["current_material"]["percent"]
        == 100
    )


def test_timer_finish_with_pages_read(user_client):
    act = _reading(user_client)
    book = _book(user_client, act["id"])
    user_client.patch(f"{API}/activities/{act['id']}", json={"current_material_id": book["id"]})

    r = user_client.post(f"{API}/sessions/start", json={"activity_id": act["id"]})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    r = user_client.post(
        f"{API}/sessions/{sid}/finish", json={"pages_read": 5, "confirmed_duration_seconds": 600}
    )
    assert r.status_code == 200, r.text
    assert user_client.get(f"{API}/materials/{book['id']}").json()["current_page"] == 5


def test_zero_pages_read_changes_nothing(user_client):
    act = _reading(user_client)
    book = _book(user_client, act["id"])
    user_client.patch(f"{API}/materials/{book['id']}", json={"current_page": 30})
    user_client.patch(f"{API}/activities/{act['id']}", json={"current_material_id": book["id"]})
    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 600,
            "local_date": "2026-09-20",
            "pages_read": 0,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["page_to"] is None
    assert user_client.get(f"{API}/materials/{book['id']}").json()["current_page"] == 30


def test_current_material_must_belong_to_user(client):
    from tests.conftest import signup

    signup(client, email="a@example.com")
    act_a = _reading(client)
    book_a = _book(client, act_a["id"])

    client.cookies.clear()
    signup(client, email="b@example.com")
    act_b = _reading(client)
    r = client.patch(f"{API}/activities/{act_b['id']}", json={"current_material_id": book_a["id"]})
    assert r.status_code == 404, r.text


def test_clear_current_material_and_page(user_client):
    act = _reading(user_client)
    book = _book(user_client, act["id"])
    user_client.patch(f"{API}/materials/{book['id']}", json={"current_page": 30})
    user_client.patch(f"{API}/activities/{act['id']}", json={"current_material_id": book["id"]})

    r = user_client.patch(f"{API}/activities/{act['id']}", json={"clear_current_material": True})
    assert r.status_code == 200, r.text
    assert r.json()["current_material"] is None

    r = user_client.patch(f"{API}/materials/{book['id']}", json={"clear_current_page": True})
    assert r.status_code == 200, r.text
    assert r.json()["current_page"] is None

    r = user_client.patch(f"{API}/materials/{book['id']}", json={"current_page": 999})
    assert r.status_code == 422, r.text
