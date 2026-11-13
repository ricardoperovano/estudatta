"""Desafio de começo: convite, aceite, progresso por dias estudados, conclusão e recusa."""

from __future__ import annotations

from freezegun import freeze_time
from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.study import XpEvent
from tests.conftest import make_activity

URL = "/api/v1/starter-challenge"


def _log(client, act, day: str) -> None:
    r = client.post(
        "/api/v1/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 600, "local_date": day},
    )
    assert r.status_code == 201, r.text


def test_no_offer_before_the_first_goal(user_client):
    assert user_client.get(URL).json()["state"] == "none"


@freeze_time("2026-09-15 15:00:00")
def test_accept_counts_distinct_days_and_grants_xp_once(user_client):
    act = make_activity(user_client)
    assert user_client.get(URL).json()["state"] == "offer"
    body = user_client.post(URL, json={"accept": True}).json()
    assert body["state"] == "active" and body["progress"] == 0 and body["target"] == 3
    assert body["ends_on"] == "2026-09-21"
    # duas sessões no mesmo dia contam um dia; dia anterior ao aceite não conta
    _log(user_client, act, "2026-09-14")
    _log(user_client, act, "2026-09-15")
    _log(user_client, act, "2026-09-15")
    assert user_client.get(URL).json()["progress"] == 1
    with freeze_time("2026-09-17 15:00:00"):
        _log(user_client, act, "2026-09-16")
        _log(user_client, act, "2026-09-17")
        body = user_client.get(URL).json()
        assert body["state"] == "done" and body["progress"] == 3
        user_client.get(URL)  # reconsultar não credita de novo
    with SessionLocal() as db:
        xp = (
            db.execute(select(XpEvent).where(XpEvent.dedupe_key == "challenge:starter"))
            .scalars()
            .all()
        )
        assert len(xp) == 1 and xp[0].points == 50
    # a comemoração some depois de alguns dias, e o convite não volta
    with freeze_time("2026-09-25 15:00:00"):
        assert user_client.get(URL).json()["state"] == "none"


@freeze_time("2026-09-15 15:00:00")
def test_decline_hides_the_offer_for_a_week(user_client):
    make_activity(user_client)
    assert user_client.post(URL, json={"accept": False}).json()["state"] == "none"
    with freeze_time("2026-09-20 15:00:00"):
        assert user_client.get(URL).json()["state"] == "none"
    with freeze_time("2026-09-23 15:00:00"):
        assert user_client.get(URL).json()["state"] == "offer"


@freeze_time("2026-09-15 15:00:00")
def test_missed_window_becomes_a_new_invitation_without_penalty(user_client):
    act = make_activity(user_client)
    user_client.post(URL, json={"accept": True})
    _log(user_client, act, "2026-09-15")
    # aceitar de novo no meio do prazo não reinicia a contagem
    assert user_client.post(URL, json={"accept": True}).json()["progress"] == 1
    with freeze_time("2026-09-23 15:00:00"):
        body = user_client.get(URL).json()
        assert body["state"] == "offer" and body["progress"] == 0
        assert user_client.post(URL, json={"accept": True}).json()["ends_on"] == "2026-09-29"
