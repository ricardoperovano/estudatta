"""Conteúdo: matérias e tópicos em árvore, progresso separado do tempo, isolamento."""

from uuid import UUID

from freezegun import freeze_time

from tests.conftest import make_activity, signup

MON = "2026-09-14"
API = "/api/v1"


def _subject(client, act_id, title="Gramática", **extra):
    r = client.post(f"{API}/activities/{act_id}/subjects", json={"title": title, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _topic(client, subject_id, title, **extra):
    r = client.post(f"{API}/subjects/{subject_id}/topics", json={"title": title, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_subject_topic_tree_depth_cycles_and_reorder(user_client):
    act = make_activity(user_client, start_date=MON)
    s1 = _subject(user_client, act["id"], "Gramática", color="#ff0000")
    s2 = _subject(user_client, act["id"], "Listening")
    assert s1["sort_order"] == 0 and s2["sort_order"] == 1 and s1["color"] == "#ff0000"

    root = _topic(user_client, s1["id"], "Verbos", estimated_minutes=120)
    child = _topic(user_client, s1["id"], "Present perfect", parent_id=root["id"])
    grand = _topic(user_client, s1["id"], "Uso com since", parent_id=child["id"])
    # 4º nível não é permitido
    r = user_client.post(
        f"{API}/subjects/{s1['id']}/topics", json={"title": "4º nível", "parent_id": grand["id"]}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "max_depth"
    # pai de outra matéria
    r = user_client.post(
        f"{API}/subjects/{s2['id']}/topics", json={"title": "x", "parent_id": root["id"]}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_parent"
    # ciclo: mover a raiz para dentro do neto
    r = user_client.patch(f"{API}/topics/{root['id']}", json={"parent_id": grand["id"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "topic_cycle"

    tree = user_client.get(f"{API}/activities/{act['id']}/subjects").json()
    assert [s["title"] for s in tree] == ["Gramática", "Listening"]
    g = tree[0]
    assert g["topics_total"] == 3 and g["topics_done"] == 0 and g["logged_seconds"] == 0
    assert g["topics"][0]["title"] == "Verbos"
    assert g["topics"][0]["topics"][0]["title"] == "Present perfect"
    assert g["topics"][0]["topics"][0]["topics"][0]["title"] == "Uso com since"
    assert tree[1]["topics"] == []

    # reordenar matérias
    r = user_client.post(
        f"{API}/subjects/reorder",
        json={"activity_id": act["id"], "ordered_ids": [s2["id"], s1["id"]]},
    )
    assert r.status_code == 200, r.text
    assert [s["title"] for s in r.json()] == ["Listening", "Gramática"]
    # id de outro tipo/objetivo é recusado
    r = user_client.post(
        f"{API}/subjects/reorder", json={"activity_id": act["id"], "ordered_ids": [root["id"]]}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_subject"

    # reordenar tópicos da raiz
    t2 = _topic(user_client, s1["id"], "Substantivos")
    r = user_client.post(
        f"{API}/topics/reorder",
        json={"subject_id": s1["id"], "parent_id": None, "ordered_ids": [t2["id"], root["id"]]},
    )
    assert r.status_code == 200, r.text
    assert [t["title"] for t in r.json()] == ["Substantivos", "Verbos"]
    tree = user_client.get(f"{API}/activities/{act['id']}/subjects").json()
    g = next(s for s in tree if s["id"] == s1["id"])
    assert [t["title"] for t in g["topics"]] == ["Substantivos", "Verbos"]

    # excluir tópico apaga os filhos
    assert user_client.delete(f"{API}/topics/{root['id']}").status_code == 200
    tree = user_client.get(f"{API}/activities/{act['id']}/subjects").json()
    g = next(s for s in tree if s["id"] == s1["id"])
    assert g["topics_total"] == 1 and g["topics"][0]["title"] == "Substantivos"
    assert user_client.patch(f"{API}/topics/{child['id']}", json={"title": "x"}).status_code == 404

    # editar e excluir matéria (cascata)
    r = user_client.patch(f"{API}/subjects/{s1['id']}", json={"title": "Gramática II"})
    assert r.status_code == 200 and r.json()["title"] == "Gramática II"
    assert user_client.delete(f"{API}/subjects/{s1['id']}").status_code == 200
    tree = user_client.get(f"{API}/activities/{act['id']}/subjects").json()
    assert [s["id"] for s in tree] == [s2["id"]]
    assert user_client.patch(f"{API}/topics/{t2['id']}", json={"title": "x"}).status_code == 404


@freeze_time("2026-09-15 12:00:00")
def test_topic_done_does_not_log_time_and_session_does_not_complete_topic(user_client):
    act = make_activity(user_client, start_date=MON)
    s = _subject(user_client, act["id"])
    t1 = _topic(user_client, s["id"], "Verbos")
    t2 = _topic(user_client, s["id"], "Artigos")

    r = user_client.patch(f"{API}/topics/{t1['id']}", json={"status": "done"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "done" and r.json()["completed_at"] is not None
    r = user_client.patch(f"{API}/topics/{t2['id']}", json={"status": "in_progress"})
    assert r.json()["completed_at"] is None
    r = user_client.get(f"{API}/activities/{act['id']}/content-progress")
    assert r.json() == {
        "subjects_total": 1,
        "topics_total": 2,
        "topics_done": 1,
        "topics_in_progress": 1,
        "percent_done": 50.0,
    }
    # o saldo não muda: concluir tópico não registra tempo
    b = user_client.get(f"{API}/activities/{act['id']}/balance").json()
    assert b["today"]["logged"] == 0 and b["today"]["pending_prior"] == 3600
    assert user_client.get(f"{API}/sessions").json() == []

    # voltar atrás limpa completed_at
    r = user_client.patch(f"{API}/topics/{t1['id']}", json={"status": "not_started"})
    assert r.json()["status"] == "not_started" and r.json()["completed_at"] is None

    # sessão vinculada ao tópico soma tempo, mas não conclui o tópico
    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 1800,
            "local_date": "2026-09-15",
            "subject_id": s["id"],
            "topic_id": t1["id"],
        },
    )
    assert r.status_code == 201, r.text
    tree = user_client.get(f"{API}/activities/{act['id']}/subjects").json()
    assert tree[0]["logged_seconds"] == 1800
    verbos = next(t for t in tree[0]["topics"] if t["id"] == t1["id"])
    assert verbos["logged_seconds"] == 1800 and verbos["status"] == "not_started"
    artigos = next(t for t in tree[0]["topics"] if t["id"] == t2["id"])
    assert artigos["logged_seconds"] == 0
    progress = user_client.get(f"{API}/activities/{act['id']}/content-progress").json()
    assert progress["topics_done"] == 0


def test_topic_lists_linked_materials(user_client):
    from app.core.db import SessionLocal
    from app.core.timeutil import utcnow
    from app.models.content import Material, MaterialTopic

    act = make_activity(user_client)
    s = _subject(user_client, act["id"])
    t = _topic(user_client, s["id"], "Verbos")
    me = user_client.get(f"{API}/me").json()
    with SessionLocal() as db:
        m = Material(
            user_id=UUID(me["id"]), activity_id=UUID(act["id"]), kind="pdf", title="Apostila"
        )
        db.add(m)
        db.flush()
        db.add(
            MaterialTopic(
                material_id=m.id,
                topic_id=UUID(t["id"]),
                page_from=10,
                page_to=25,
                created_at=utcnow(),
            )
        )
        db.commit()
        material_id = str(m.id)
    tree = user_client.get(f"{API}/activities/{act['id']}/subjects").json()
    assert tree[0]["topics"][0]["materials"] == [
        {"id": material_id, "kind": "pdf", "title": "Apostila", "page_from": 10, "page_to": 25}
    ]


def test_content_isolation_between_users(client):
    signup(client, email="a@example.com")
    act = make_activity(client)
    s = _subject(client, act["id"])
    t = _topic(client, s["id"], "Verbos")
    client.cookies.clear()
    signup(client, email="b@example.com")

    assert client.get(f"{API}/activities/{act['id']}/subjects").status_code == 404
    assert client.get(f"{API}/activities/{act['id']}/content-progress").status_code == 404
    r = client.post(f"{API}/activities/{act['id']}/subjects", json={"title": "x"})
    assert r.status_code == 404
    assert client.patch(f"{API}/subjects/{s['id']}", json={"title": "hack"}).status_code == 404
    assert client.delete(f"{API}/subjects/{s['id']}").status_code == 404
    assert client.post(f"{API}/subjects/{s['id']}/topics", json={"title": "x"}).status_code == 404
    assert client.patch(f"{API}/topics/{t['id']}", json={"status": "done"}).status_code == 404
    assert client.delete(f"{API}/topics/{t['id']}").status_code == 404
    r = client.post(
        f"{API}/subjects/reorder", json={"activity_id": act["id"], "ordered_ids": [s["id"]]}
    )
    assert r.status_code == 404
    r = client.post(f"{API}/topics/reorder", json={"subject_id": s["id"], "ordered_ids": [t["id"]]})
    assert r.status_code == 404

    # a matéria de A continua intacta
    client.cookies.clear()
    r = client.post(
        f"{API}/auth/login", json={"email": "a@example.com", "password": "senha-forte-123"}
    )
    assert r.status_code == 200
    tree = client.get(f"{API}/activities/{act['id']}/subjects").json()
    assert tree[0]["title"] == "Gramática" and tree[0]["topics"][0]["status"] == "not_started"
