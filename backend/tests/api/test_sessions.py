"""Sessões: registro manual diante de um cronômetro esquecido aberto."""

from __future__ import annotations

from freezegun import freeze_time

from tests.conftest import make_activity


def test_forgotten_open_timer_is_named_when_it_blocks_a_manual_entry(user_client):
    """Um cronômetro esquecido ocupa todo o tempo desde que começou. A recusa precisa dizer isso:
    a mensagem genérica de sobreposição deixava a pessoa sem saber o que fazer."""
    act = make_activity(user_client)
    with freeze_time("2026-09-14 23:59:00"):
        r = user_client.post("/api/v1/sessions/start", json={"activity_id": act["id"]})
        assert r.status_code == 201, r.text
    with freeze_time("2026-09-16 23:00:00"):
        body = {
            "activity_id": act["id"],
            "duration_seconds": 1800,
            "local_date": "2026-09-16",
            "start_time": "10:00",
        }
        r = user_client.post("/api/v1/sessions/manual", json=body)
        assert r.status_code == 409 and r.json()["error"]["code"] == "open_session", r.text
        assert "cronômetro aberto desde 14/09 às 20:59" in r.json()["error"]["message"]
        # por duração, sem horário, continua possível (não há o que sobrepor)
        del body["start_time"]
        assert user_client.post("/api/v1/sessions/manual", json=body).status_code == 201
