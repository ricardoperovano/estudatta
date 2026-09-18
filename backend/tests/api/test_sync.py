"""Sincronização offline: `POST /sync/batch` idempotente, conflitos entre aparelhos que nunca
somam tempo, lote resiliente a operações inválidas e isolamento entre usuários."""

from __future__ import annotations

import uuid

import pytest
from freezegun import freeze_time
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.main import app
from app.models.session import StudySession
from app.models.system import SyncOperation
from tests.conftest import ApiClient, make_activity, signup

API = "/api/v1"
MON = "2026-09-14"
NOON = "2026-09-15 15:00:00"  # terça, 12:00 em São Paulo


@pytest.fixture
def other_client():
    with ApiClient(app, base_url="http://localhost:8000") as c:
        signup(c, email="bia@example.com", name="Bia")
        yield c


def _batch(client, ops, device="celular", body_device=None):
    body = {"operations": ops}
    if body_device:
        body["device_id"] = body_device
    r = client.post(f"{API}/sync/batch", json=body, headers={"X-Device-Id": device})
    assert r.status_code == 200, r.text
    return r.json()["results"]


def _manual(act_id, op_id=None, **payload):
    base = {"activity_id": act_id, "duration_seconds": 1800, "local_date": "2026-09-15"}
    base.update(payload)
    return {"op_id": op_id or str(uuid.uuid4()), "kind": "session.manual", "payload": base}


def _logged_today(client, act_id) -> int:
    return client.get(f"{API}/activities/{act_id}/balance").json()["today"]["logged"]


def _count(model) -> int:
    with SessionLocal() as db:
        return int(db.execute(select(func.count()).select_from(model)).scalar_one())


@freeze_time(NOON)
def test_manual_op_is_applied_and_resend_is_duplicate(user_client):
    act = make_activity(user_client, start_date=MON)
    op = _manual(act["id"], note="offline no ônibus")
    (res,) = _batch(user_client, [op])
    assert res["op_id"] == op["op_id"] and res["status"] == "applied" and res["error"] is None
    sess = res["result"]
    assert sess["status"] == "finished" and sess["duration_seconds"] == 1800
    assert sess["activity_id"] == act["id"] and sess["device_id"] == "celular"
    assert sess["client_uuid"] == op["op_id"] and sess["note"] == "offline no ônibus"
    assert _logged_today(user_client, act["id"]) == 1800

    # a resposta se perdeu e o aparelho reenviou: nada é reaplicado
    (again,) = _batch(user_client, [op])
    assert again["status"] == "duplicate" and again["result"]["id"] == sess["id"]
    # reenviada dentro de um lote maior, e duas vezes no mesmo lote
    other = _manual(act["id"], duration_seconds=600)
    results = _batch(user_client, [op, other, other])
    assert [r["status"] for r in results] == ["duplicate", "applied", "duplicate"]
    assert _logged_today(user_client, act["id"]) == 2400
    assert _count(StudySession) == 2 and _count(SyncOperation) == 2

    status = user_client.get(f"{API}/sync/status", headers={"X-Device-Id": "celular"}).json()
    assert status["last_sync_at"].startswith("2026-09-15T15:00:00")
    assert status["active_session"] is None
    status = user_client.get(f"{API}/sync/status", headers={"X-Device-Id": "outro"}).json()
    assert status["last_sync_at"] is None


@freeze_time(NOON)
def test_same_op_id_with_different_payload_is_still_duplicate(user_client):
    act = make_activity(user_client, start_date=MON)
    op = _manual(act["id"])
    _batch(user_client, [op])
    tampered = _manual(act["id"], op_id=op["op_id"], duration_seconds=7200)
    (res,) = _batch(user_client, [tampered], device="notebook")
    assert res["status"] == "duplicate" and res["result"]["duration_seconds"] == 1800
    assert _logged_today(user_client, act["id"]) == 1800


@freeze_time(NOON)
def test_conflict_between_two_devices_does_not_double_count(user_client):
    act = make_activity(user_client, start_date=MON)
    phone = _manual(act["id"], duration_seconds=3600, start_time="08:00")
    (first,) = _batch(user_client, [phone], device="celular")
    assert first["status"] == "applied" and first["result"]["needs_review"] is False
    assert _logged_today(user_client, act["id"]) == 3600

    # o notebook, offline, cronometrou o mesmo período (08:30–09:30)
    laptop = _manual(act["id"], duration_seconds=3600, start_time="08:30")
    (second,) = _batch(user_client, [laptop], device="notebook")
    assert second["status"] == "conflict"
    assert second["error"]["code"] == "overlap"
    details = second["error"]["details"]
    assert details["overlaps_with"] == first["result"]["id"]
    assert details["other_device_id"] == "celular" and details["needs_review"] is True
    # o registro é preservado para revisão, mas não entra no saldo
    kept = second["result"]
    assert kept["id"] == details["session_id"] and kept["needs_review"] is True
    assert kept["review_reason"] == "offline_conflict" and kept["device_id"] == "notebook"
    assert _logged_today(user_client, act["id"]) == 3600
    assert _count(StudySession) == 2

    # reenviar o conflito não cria um terceiro registro nem muda o saldo
    (again,) = _batch(user_client, [laptop], device="notebook")
    assert again["status"] == "duplicate" and again["error"]["code"] == "overlap"
    assert again["result"]["id"] == kept["id"]
    assert _count(StudySession) == 2 and _logged_today(user_client, act["id"]) == 3600
    listed = user_client.get(f"{API}/sessions/{kept['id']}").json()
    assert listed["needs_review"] is True


@freeze_time(NOON)
def test_start_on_second_device_conflicts_with_active_session(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post(
        f"{API}/sessions/start", json={"activity_id": act["id"]}, headers={"X-Device-Id": "web"}
    )
    assert r.status_code == 201, r.text
    op = {
        "op_id": str(uuid.uuid4()),
        "kind": "session.start",
        "payload": {"activity_id": act["id"]},
    }
    (res,) = _batch(user_client, [op], device="celular")
    assert res["status"] == "conflict" and res["error"]["code"] == "session_active"
    assert res["error"]["details"]["session_id"] == r.json()["id"]
    assert res["error"]["details"]["resubmit_as"] == "session.manual"
    assert _count(StudySession) == 1


@freeze_time(NOON)
def test_offline_timer_start_pause_resume_finish_in_one_batch(user_client):
    act = make_activity(user_client, start_date=MON)
    cu = str(uuid.uuid4())

    def op(kind, **payload):
        return {"op_id": str(uuid.uuid4()), "kind": kind, "payload": payload}

    ops = [
        op(
            "session.start",
            activity_id=act["id"],
            client_uuid=cu,
            started_at="2026-09-15T13:00:00Z",
        ),
        op("session.pause", client_uuid=cu, at="2026-09-15T13:20:00Z"),
        op("session.resume", client_uuid=cu, at="2026-09-15T13:30:00Z"),
        op("session.finish", client_uuid=cu, at="2026-09-15T13:50:00Z", note="unidade 4"),
    ]
    results = _batch(user_client, ops)
    assert [r["status"] for r in results] == ["applied"] * 4, results
    done = results[-1]["result"]
    assert done["status"] == "finished" and done["duration_seconds"] == 2400  # 20 + 20 min
    assert _logged_today(user_client, act["id"]) == 2400
    # o lote inteiro reenviado é todo duplicado
    assert [r["status"] for r in _batch(user_client, ops)] == ["duplicate"] * 4
    assert _logged_today(user_client, act["id"]) == 2400 and _count(StudySession) == 1


@freeze_time(NOON)
def test_invalid_operations_do_not_break_the_batch(user_client, other_client):
    act = make_activity(user_client, start_date=MON)
    foreign = make_activity(other_client, start_date=MON)
    ops = [
        {"op_id": str(uuid.uuid4()), "kind": "session.teleport", "payload": {}},
        _manual(act["id"], duration_seconds=5),  # payload inválido
        _manual(act["id"], local_date="2026-09-16"),  # data futura
        _manual(foreign["id"]),  # objetivo de outro usuário
        {"op_id": str(uuid.uuid4()), "kind": "session.finish", "payload": {}},
        {
            "op_id": str(uuid.uuid4()),
            "kind": "session.pause",
            "payload": {"session_id": str(uuid.uuid4())},
        },
        {
            "op_id": str(uuid.uuid4()),
            "kind": "task.complete",
            "payload": {"task_id": str(uuid.uuid4())},
        },
        _manual(act["id"], duration_seconds=1200),  # a válida, no fim
    ]
    results = _batch(user_client, ops)
    assert [r["op_id"] for r in results] == [o["op_id"] for o in ops]  # mesma ordem
    assert [r["status"] for r in results] == ["rejected"] * 7 + ["applied"]
    codes = [r["error"]["code"] for r in results[:-1]]
    assert codes == [
        "unknown_kind",
        "bad_payload",
        "future_date",
        "not_found",
        "missing_session_ref",
        "session_not_found",
        "task_not_found",
    ]
    assert all(r["result"] is None for r in results[:-1])
    assert results[5]["error"]["details"] == {"resubmit_as": "session.manual"}
    assert _logged_today(user_client, act["id"]) == 1200
    assert _logged_today(other_client, foreign["id"]) == 0
    assert _count(StudySession) == 1
    # rejeições também são idempotentes: o aparelho pode limpar a fila com segurança
    assert [r["status"] for r in _batch(user_client, ops)] == ["duplicate"] * 8
    assert _count(StudySession) == 1

    # o envelope, esse sim, é validado: lote vazio, op_id inválido, lote grande demais
    r = user_client.post(f"{API}/sync/batch", json={"operations": []})
    assert r.status_code == 422
    r = user_client.post(
        f"{API}/sync/batch", json={"operations": [{"op_id": "x", "kind": "session.manual"}]}
    )
    assert r.status_code == 422
    many = [_manual(act["id"]) for _ in range(201)]
    assert user_client.post(f"{API}/sync/batch", json={"operations": many}).status_code == 422


@freeze_time(NOON)
def test_task_complete_and_version_conflict(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post(
        f"{API}/tasks",
        json={
            "activity_id": act["id"],
            "title": "Vocabulário · lista 12",
            "local_date": "2026-09-15",
        },
    )
    assert r.status_code == 201, r.text
    task = r.json()

    def op(kind, **payload):
        return {
            "op_id": str(uuid.uuid4()),
            "kind": kind,
            "payload": {"task_id": task["id"], **payload},
        }

    (res,) = _batch(user_client, [op("task.complete", expected_version=task["version"])])
    assert res["status"] == "applied" and res["result"]["status"] == "done"
    assert res["result"]["version"] == task["version"] + 1
    # outro aparelho ainda com a versão antiga
    (res,) = _batch(user_client, [op("task.uncomplete", expected_version=task["version"])])
    assert res["status"] == "conflict" and res["error"]["code"] == "version_conflict"
    assert res["error"]["details"]["status"] == "done"
    (res,) = _batch(user_client, [op("task.uncomplete")])
    assert res["status"] == "applied" and res["result"]["status"] == "planned"
    assert res["result"]["completed_at"] is None


@freeze_time(NOON)
def test_sync_isolation_between_users(user_client, other_client):
    assert user_client.post(f"{API}/sync/batch", json={"operations": []}).status_code == 422
    act = make_activity(user_client, start_date=MON)
    bia_act = make_activity(other_client, start_date=MON)
    op = _manual(act["id"], start_time="08:00")
    (mine,) = _batch(user_client, [op])
    assert mine["status"] == "applied"

    # a mesma op_id vinda de outra conta é outra operação (a chave é por usuário)…
    theirs_op = _manual(bia_act["id"], op_id=op["op_id"], start_time="08:00")
    (theirs,) = _batch(other_client, [theirs_op])
    assert theirs["status"] == "applied" and theirs["result"]["id"] != mine["result"]["id"]
    # …o mesmo horário em contas diferentes não é conflito, e cada saldo conta só o seu
    assert _logged_today(user_client, act["id"]) == 1800
    assert _logged_today(other_client, bia_act["id"]) == 1800

    # Bia não mexe na sessão da Ana por id nem por client_uuid
    by_id = {"session_id": mine["result"]["id"]}
    discard = {"op_id": str(uuid.uuid4()), "kind": "session.discard", "payload": by_id}
    (res,) = _batch(other_client, [discard])
    assert res["status"] == "rejected" and res["error"]["code"] == "session_not_found"
    # pelo client_uuid (igual nas duas contas) a referência resolve para a sessão *dela*
    note = {"op_id": str(uuid.uuid4()), "kind": "session.finish"}
    note["payload"] = {"client_uuid": op["op_id"], "note": "da Bia"}
    (res,) = _batch(other_client, [note])
    assert (res["result"] or {}).get("id") in (None, theirs["result"]["id"])
    assert res["status"] != "applied" or res["result"]["id"] == theirs["result"]["id"]
    assert user_client.get(f"{API}/sessions/{mine['result']['id']}").json()["status"] == "finished"
    assert _logged_today(user_client, act["id"]) == 1800


def test_sync_requires_login(client):
    op = _manual(str(uuid.uuid4()))
    assert client.post(f"{API}/sync/batch", json={"operations": [op]}).status_code == 401
    assert client.get(f"{API}/sync/status").status_code == 401
