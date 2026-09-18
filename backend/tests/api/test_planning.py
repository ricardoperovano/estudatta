"""Planejamento: tarefas, séries com ocorrências virtuais, reprogramação, auto-plano, calendário."""

from datetime import date

from freezegun import freeze_time
from sqlalchemy import func, select

from tests.conftest import make_activity, signup

MON = "2026-09-14"
API = "/api/v1"


def _task(client, act_id, title, local_date, **extra):
    body = {"activity_id": act_id, "title": title, "local_date": local_date, **extra}
    r = client.post(f"{API}/tasks", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _tasks(client, start, end, **params):
    r = client.get(f"{API}/tasks", params={"start": start, "end": end, **params})
    assert r.status_code == 200, r.text
    return r.json()


@freeze_time("2026-09-15 12:00:00")
def test_task_crud_status_and_version_conflict(user_client):
    act = make_activity(user_client, start_date=MON)
    t = _task(
        user_client,
        act["id"],
        "Unidade 4",
        "2026-09-15",
        estimated_seconds=1800,
        start_time="19:00",
        kind="study",
        priority=1,
        due_date="2026-09-18",
    )
    assert t["version"] == 1 and t["start_time"] == "19:00" and t["virtual"] is False
    assert t["priority"] == 1 and t["due_date"] == "2026-09-18" and t["status"] == "planned"

    r = user_client.patch(
        f"{API}/tasks/{t['id']}", json={"title": "Unidade 5", "expected_version": 99}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "version_conflict"
    assert r.json()["error"]["details"]["version"] == 1
    r = user_client.patch(
        f"{API}/tasks/{t['id']}",
        json={"title": "Unidade 5", "expected_version": 1, "clear_start_time": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 2 and r.json()["start_time"] is None
    assert r.json()["title"] == "Unidade 5"

    r = user_client.post(f"{API}/tasks/{t['id']}/complete")
    assert r.json()["status"] == "done" and r.json()["completed_at"] is not None
    r = user_client.post(f"{API}/tasks/{t['id']}/uncomplete")
    assert r.json()["status"] == "planned" and r.json()["completed_at"] is None
    r = user_client.post(f"{API}/tasks/{t['id']}/skip")
    assert r.json()["status"] == "skipped" and r.json()["completed_at"] is None

    assert [x["id"] for x in _tasks(user_client, MON, "2026-09-20")] == [t["id"]]
    assert _tasks(user_client, "2026-09-21", "2026-09-27") == []
    assert user_client.delete(f"{API}/tasks/{t['id']}").status_code == 200
    assert user_client.get(f"{API}/tasks/{t['id']}").status_code == 404

    # páginas invertidas
    r = user_client.post(
        f"{API}/tasks",
        json={
            "activity_id": act["id"],
            "title": "x",
            "local_date": MON,
            "page_from": 30,
            "page_to": 10,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_pages"


@freeze_time("2026-09-15 12:00:00")
def test_checklist_completion_does_not_log_time(user_client):
    act = make_activity(user_client, start_date=MON)
    t = _task(user_client, act["id"], "Revisar flashcards", "2026-09-15", kind="checklist")
    assert user_client.post(f"{API}/tasks/{t['id']}/complete").status_code == 200
    b = user_client.get(f"{API}/activities/{act['id']}/balance").json()
    assert b["today"]["logged"] == 0 and b["today"]["missing_today"] == 3600
    assert user_client.get(f"{API}/sessions").json() == []


@freeze_time("2026-09-15 12:00:00")
def test_series_occurrences_materialized_on_demand_without_duplicates(user_client):
    from app.core.db import SessionLocal
    from app.models.planning import PlannedTask

    act = make_activity(user_client, start_date=MON)
    r = user_client.post(
        f"{API}/tasks/series",
        json={
            "activity_id": act["id"],
            "title": "Anki",
            "weekdays": [4, 0, 2, 2],
            "start_date": MON,
            "end_date": "2026-09-25",
            "kind": "checklist",
            "estimated_seconds": 600,
            "start_time": "08:00",
        },
    )
    assert r.status_code == 201, r.text
    series = r.json()
    assert series["weekdays"] == [0, 2, 4] and series["start_time"] == "08:00"

    occ = _tasks(user_client, MON, "2026-09-20")
    assert [o["local_date"] for o in occ] == ["2026-09-14", "2026-09-16", "2026-09-18"]
    assert all(o["id"] is None and o["virtual"] and o["series_id"] == series["id"] for o in occ)
    assert occ[0]["start_time"] == "08:00" and occ[0]["kind"] == "checklist"

    # concluir a quarta materializa a linha real
    r = user_client.post(
        f"{API}/tasks/series/{series['id']}/occurrences/2026-09-16", json={"status": "done"}
    )
    assert r.status_code == 201, r.text
    real = r.json()
    assert real["id"] and real["status"] == "done" and real["virtual"] is False
    assert real["completed_at"] is not None and real["series_id"] == series["id"]
    # idempotente: mesma linha
    r2 = user_client.post(f"{API}/tasks/series/{series['id']}/occurrences/2026-09-16", json={})
    assert r2.status_code == 201 and r2.json()["id"] == real["id"]

    occ = _tasks(user_client, MON, "2026-09-20")
    assert len(occ) == 3
    assert [o["id"] for o in occ] == [None, real["id"], None]

    # data fora da série
    r = user_client.post(f"{API}/tasks/series/{series['id']}/occurrences/2026-09-15", json={})
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_in_series"

    # nada de cópias em massa no banco: só a ocorrência editada existe
    with SessionLocal() as db:
        assert db.execute(select(func.count()).select_from(PlannedTask)).scalar_one() == 1

    # a ocorrência real é uma tarefa comum (concluir/desfazer)
    r = user_client.post(f"{API}/tasks/{real['id']}/uncomplete")
    assert r.json()["status"] == "planned"

    # desativar a série: virtuais somem, a real fica
    assert user_client.delete(f"{API}/tasks/series/{series['id']}").status_code == 200
    assert [o["id"] for o in _tasks(user_client, MON, "2026-09-20")] == [real["id"]]
    assert user_client.get(f"{API}/tasks/series").json() == []
    r = user_client.get(f"{API}/tasks/series", params={"include_inactive": "true"})
    assert r.json()[0]["active"] is False


@freeze_time("2026-09-15 12:00:00")
def test_reschedule_keeps_same_id_and_original_date(user_client):
    act = make_activity(user_client, start_date=MON)
    t = _task(user_client, act["id"], "Unidade 4", "2026-09-15", estimated_seconds=1800)
    r = user_client.post(
        f"{API}/tasks/{t['id']}/reschedule", json={"local_date": "2026-09-16", "start_time": "20:00"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["id"] == t["id"] and r.json()["local_date"] == "2026-09-16"
    assert r.json()["original_date"] == "2026-09-15" and r.json()["start_time"] == "20:00"
    r = user_client.post(f"{API}/tasks/{t['id']}/reschedule", json={"local_date": "2026-09-17"})
    assert r.json()["original_date"] == "2026-09-15" and r.json()["version"] == 3
    assert [x["id"] for x in _tasks(user_client, MON, "2026-09-20")] == [t["id"]]

    # ocorrência de série reprogramada não reaparece como virtual no dia original
    s = user_client.post(
        f"{API}/tasks/series",
        json={"activity_id": act["id"], "title": "Anki", "weekdays": [0, 1, 2, 3, 4], "start_date": MON},
    ).json()
    occ = user_client.post(f"{API}/tasks/series/{s['id']}/occurrences/2026-09-16", json={}).json()
    r = user_client.post(f"{API}/tasks/{occ['id']}/reschedule", json={"local_date": "2026-09-19"})
    assert r.status_code == 200, r.text
    rows = [
        (x["local_date"], x["id"])
        for x in _tasks(user_client, MON, "2026-09-20", activity_id=act["id"])
        if x["series_id"] == s["id"]
    ]
    assert ("2026-09-16", None) not in rows
    assert ("2026-09-19", occ["id"]) in rows
    assert len(rows) == 5  # seg, ter, qui, sex virtuais + a reprogramada no sábado
    # mover para uma data que já tem ocorrência real da mesma série conflita
    occ2 = user_client.post(f"{API}/tasks/series/{s['id']}/occurrences/2026-09-17", json={}).json()
    r = user_client.post(f"{API}/tasks/{occ2['id']}/reschedule", json={"local_date": "2026-09-19"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "occurrence_exists"


@freeze_time("2026-09-14 12:00:00")  # segunda, 09:00 em São Paulo
def test_auto_plan_is_deterministic_keeps_pinned_and_avoids_time_overlap(user_client):
    act = make_activity(user_client, start_date=MON)  # 60 min/dia seg–sex, limite 120
    a = _task(
        user_client, act["id"], "A fixa", MON, estimated_seconds=1800, start_time="19:00", pinned=True
    )
    b = _task(user_client, act["id"], "B 19:15", MON, estimated_seconds=1800, start_time="19:15")
    c = _task(user_client, act["id"], "C livre", MON, estimated_seconds=1800)
    d = _task(user_client, act["id"], "D 45 min", MON, estimated_seconds=2700)
    e = _task(user_client, act["id"], "E 90 min", MON, estimated_seconds=5400)
    f = _task(user_client, act["id"], "F sem estimativa", MON)
    body = {"start": MON, "end": "2026-09-20"}

    p1 = user_client.post(f"{API}/activities/{act['id']}/auto-plan/preview", json=body).json()
    p2 = user_client.post(f"{API}/activities/{act['id']}/auto-plan/preview", json=body).json()
    assert p1 == p2 and p1["applied"] is False
    moves = {m["task_id"]: m["to_date"] for m in p1["moves"]}
    assert a["id"] not in moves  # fixada: não se move
    assert moves[b["id"]] == "2026-09-15"  # 19:15 cruza com A (19:00–19:30) na segunda
    assert c["id"] not in moves  # cabe na segunda: 30 (A) + 30 = 60
    assert moves[d["id"]] == "2026-09-16"  # não cabe na segunda (0) nem na terça (30 de B)
    unplaced = {u["task_id"]: u["reason"] for u in p1["unplaced"]}
    assert unplaced == {e["id"]: "nao_coube", f["id"]: "sem_estimativa"}
    mon = next(x for x in p1["days"] if x["local_date"] == MON)
    assert mon["fixed_seconds"] == 1800 and mon["is_active"] is True
    assert mon["before_seconds"] == 1800 + 1800 + 1800 + 2700 + 5400
    assert mon["after_seconds"] == 1800 + 1800 + 5400  # A fixa + C + E (não coube, fica)
    assert set(mon["after"]) == {c["id"], e["id"]}
    sat = next(x for x in p1["days"] if x["local_date"] == "2026-09-19")
    assert sat["is_active"] is False

    # nada mudou no banco antes de aplicar
    assert user_client.get(f"{API}/tasks/{b['id']}").json()["local_date"] == MON

    r = user_client.post(f"{API}/activities/{act['id']}/auto-plan", json=body)
    assert r.status_code == 200 and r.json()["applied"] is True
    assert r.json()["moves"] == p1["moves"]
    tb = user_client.get(f"{API}/tasks/{b['id']}").json()
    assert tb["local_date"] == "2026-09-15" and tb["original_date"] == MON
    assert tb["start_time"] == "19:15" and tb["version"] == 2
    td = user_client.get(f"{API}/tasks/{d['id']}").json()
    assert td["local_date"] == "2026-09-16" and td["original_date"] == MON
    ta = user_client.get(f"{API}/tasks/{a['id']}").json()
    assert ta["local_date"] == MON and ta["original_date"] is None and ta["version"] == 1

    # prévia após aplicar: nada a mover (estável)
    p3 = user_client.post(f"{API}/activities/{act['id']}/auto-plan/preview", json=body).json()
    assert p3["moves"] == []
    assert {u["task_id"] for u in p3["unplaced"]} == {e["id"], f["id"]}

    # task_ids restringe o conjunto; id de outro objetivo → 404
    p4 = user_client.post(
        f"{API}/activities/{act['id']}/auto-plan/preview", json={**body, "task_ids": [c["id"]]}
    ).json()
    assert p4["moves"] == [] and p4["unplaced"] == []
    r = user_client.post(
        f"{API}/activities/{act['id']}/auto-plan/preview",
        json={**body, "task_ids": ["00000000-0000-0000-0000-000000000001"]},
    )
    assert r.status_code == 404


@freeze_time("2026-09-16 12:00:00")  # quarta
def test_calendar_shows_recovery_overload_and_virtual_series(user_client):
    act = make_activity(user_client, start_date=MON)
    # segunda e terça sem registro → plano distribui 120 min em 4 dias (30/dia a partir de hoje)
    r = user_client.post(
        f"{API}/activities/{act['id']}/recovery-plans",
        json={"strategy": "distribute", "horizon_days": 4},
    )
    assert r.status_code == 201, r.text
    _task(user_client, act["id"], "Maratona", "2026-09-17", estimated_seconds=3 * 3600)
    _task(user_client, act["id"], "Checklist", "2026-09-17", kind="checklist", estimated_seconds=3600)
    r = user_client.post(
        f"{API}/tasks/series",
        json={
            "activity_id": act["id"],
            "title": "Anki",
            "weekdays": [3],
            "start_date": MON,
            "estimated_seconds": 600,
            "kind": "study",
        },
    )
    assert r.status_code == 201, r.text

    r = user_client.get(f"{API}/calendar", params={"start": MON, "end": "2026-09-20"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["start"] == MON and body["end"] == "2026-09-20" and len(body["days"]) == 7
    days = {d["local_date"]: d for d in body["days"]}
    mon = days[MON]
    assert mon["target_seconds"] == 3600 and mon["logged_seconds"] == 0 and mon["is_today"] is False
    assert mon["over_capacity"] is False and mon["planned_seconds"] == 0
    today = days["2026-09-16"]
    assert today["is_today"] is True and today["recovery_seconds"] == 1800
    thu = days["2026-09-17"]
    assert thu["recovery_seconds"] == 1800 and thu["target_seconds"] == 3600
    assert thu["planned_seconds"] == 3 * 3600 + 600  # checklist não conta; série virtual conta
    assert thu["available_seconds"] == 3600 and thu["daily_limit_seconds"] == 7200
    assert thu["over_capacity"] is True and thu["overload_seconds"] == 3 * 3600 + 600 - 7200
    assert {t["title"] for t in thu["tasks"]} == {"Maratona", "Checklist", "Anki"}
    anki = next(t for t in thu["tasks"] if t["title"] == "Anki")
    assert anki["id"] is None and anki["virtual"] is True
    assert thu["activities"] == [
        {
            "activity_id": act["id"],
            "title": "Inglês",
            "target_seconds": 3600,
            "logged_seconds": 0,
            "recovery_seconds": 1800,
            "planned_seconds": 3 * 3600 + 600,
            "daily_limit_seconds": 7200,
            "is_rest": False,
            "is_paused": False,
            "in_range": True,
        }
    ]
    sat = days["2026-09-19"]
    assert sat["is_rest"] is True and sat["target_seconds"] == 0 and sat["is_paused"] is False

    # pausa planejada aparece como is_paused
    r = user_client.post(
        f"{API}/activities/{act['id']}/pauses",
        json={"start_date": "2026-09-18", "end_date": "2026-09-18", "reason": "viagem"},
    )
    assert r.status_code == 201
    days = {
        d["local_date"]: d
        for d in user_client.get(
            f"{API}/calendar", params={"start": MON, "end": "2026-09-20", "activity_id": act["id"]}
        ).json()["days"]
    }
    assert days["2026-09-18"]["is_paused"] is True and days["2026-09-18"]["target_seconds"] == 0


@freeze_time("2026-09-16 12:00:00")
def test_week_print_returns_seven_days_and_range_is_limited(user_client):
    act = make_activity(user_client, start_date=MON)
    _task(user_client, act["id"], "Unidade 4", "2026-09-17", estimated_seconds=1800)
    r = user_client.get(f"{API}/planning/week-print", params={"start": MON})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["start"] == MON and body["end"] == "2026-09-20" and len(body["days"]) == 7
    assert body["target_seconds"] == 5 * 3600 and body["planned_seconds"] == 1800
    assert body["recovery_seconds"] == 0 and body["week_starts_on"] == 0
    assert body["activities"][0]["id"] == act["id"] and body["generated_at"]
    r = user_client.get(f"{API}/calendar", params={"start": MON, "end": "2027-01-01"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "range_too_long"
    r = user_client.get(f"{API}/tasks", params={"start": "2026-09-20", "end": MON})
    assert r.status_code == 422


def test_planning_isolation_and_cross_references(client):
    signup(client, email="a@example.com")
    act_a = make_activity(client)
    subj = client.post(f"{API}/activities/{act_a['id']}/subjects", json={"title": "Gramática"}).json()
    t = _task(client, act_a["id"], "Tarefa A", date.today().isoformat())
    series = client.post(
        f"{API}/tasks/series",
        json={"activity_id": act_a["id"], "title": "Anki", "weekdays": [0], "start_date": MON},
    ).json()
    client.cookies.clear()
    signup(client, email="b@example.com")

    assert client.get(f"{API}/tasks/{t['id']}").status_code == 404
    assert client.patch(f"{API}/tasks/{t['id']}", json={"title": "hack"}).status_code == 404
    assert client.delete(f"{API}/tasks/{t['id']}").status_code == 404
    assert client.post(f"{API}/tasks/{t['id']}/complete").status_code == 404
    assert client.post(f"{API}/tasks/{t['id']}/reschedule", json={"local_date": MON}).status_code == 404
    r = client.post(f"{API}/tasks", json={"activity_id": act_a["id"], "title": "x", "local_date": MON})
    assert r.status_code == 404
    assert client.patch(f"{API}/tasks/series/{series['id']}", json={"title": "x"}).status_code == 404
    assert client.delete(f"{API}/tasks/series/{series['id']}").status_code == 404
    r = client.post(f"{API}/tasks/series/{series['id']}/occurrences/{MON}", json={})
    assert r.status_code == 404
    assert _tasks(client, MON, "2026-09-20") == []
    assert client.get(f"{API}/tasks", params={"start": MON, "end": MON, "activity_id": act_a["id"]}).status_code == 404
    r = client.post(
        f"{API}/activities/{act_a['id']}/auto-plan/preview", json={"start": MON, "end": MON}
    )
    assert r.status_code == 404
    assert client.get(f"{API}/calendar", params={"start": MON, "end": MON, "activity_id": act_a["id"]}).status_code == 404

    # referência cruzada: matéria de outro usuário/objetivo é recusada
    act_b = make_activity(client)
    r = client.post(
        f"{API}/tasks",
        json={"activity_id": act_b["id"], "title": "x", "local_date": MON, "subject_id": subj["id"]},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_subject"
    r = client.post(
        f"{API}/tasks/series",
        json={
            "activity_id": act_b["id"],
            "title": "x",
            "weekdays": [0],
            "start_date": MON,
            "subject_id": subj["id"],
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_subject"
