"""Relatórios: resumo com leitura honesta, histórico com títulos, CSV e progresso de conteúdo."""

import csv
import io

from freezegun import freeze_time

from tests.conftest import make_activity, signup

MON = "2026-09-14"
API = "/api/v1"
CLOSING = "Tempo registrado mede constância, não aprendizado."


def _log(client, act_id, local_date, seconds, **extra):
    r = client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act_id,
            "duration_seconds": seconds,
            "local_date": local_date,
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _subject_and_topic(client, act_id):
    s = client.post(f"{API}/activities/{act_id}/subjects", json={"title": "Gramática"}).json()
    t = client.post(f"{API}/subjects/{s['id']}/topics", json={"title": "Verbos"}).json()
    return s, t


@freeze_time("2026-09-19 12:00:00")  # sábado, 09:00 em São Paulo
def test_weekly_summary_reads_recovered_day_honestly(user_client):
    act = make_activity(user_client, start_date=MON)
    subj, _ = _subject_and_topic(user_client, act["id"])
    _log(user_client, act["id"], "2026-09-14", 3600, subject_id=subj["id"])
    _log(user_client, act["id"], "2026-09-15", 3600)
    # quarta sem registro; quinta e sexta com 90 min recuperam 30 + 30
    _log(user_client, act["id"], "2026-09-17", 5400)
    _log(user_client, act["id"], "2026-09-18", 5400)

    r = user_client.get(f"{API}/reports/summary", params={"period": "week", "date": "2026-09-19"})
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["period"] == "week" and s["start"] == MON and s["end"] == "2026-09-20"
    assert s["planned_seconds"] == 5 * 3600 and s["logged_seconds"] == 18000
    assert s["goal_days_planned"] == 5 and s["goal_days_met"] == 4 and s["days_with_log"] == 4
    assert s["recovered_seconds"] == 3600 and s["pending_open_seconds"] == 0
    assert s["extra_seconds"] == 0
    assert s["streak_current"] == 2 and s["streak_best"] == 2
    assert s["reading"] == (
        "Quarta ficou sem registro e o tempo foi recuperado na quinta e na sexta. " + CLOSING
    )
    wed = next(d for d in s["per_day"] if d["local_date"] == "2026-09-16")
    assert wed["deficit"] == 3600 and wed["goal_met"] is False and wed["logged"] == 0
    assert wed["is_rest"] is False and wed["is_paused"] is False
    thu = next(d for d in s["per_day"] if d["local_date"] == "2026-09-17")
    assert thu["recovered"] == 1800 and thu["goal_met"] is True
    sun = next(d for d in s["per_day"] if d["local_date"] == "2026-09-20")
    assert sun["is_rest"] is True and sun["target"] == 0
    assert s["by_activity"] == [
        {
            "activity_id": act["id"],
            "title": "Inglês",
            "logged": 18000,
            "target": 18000,
            "percent": 100.0,
        }
    ]
    assert {r["title"]: r["logged"] for r in s["by_subject"]} == {
        "Gramática": 3600,
        "Sem matéria": 14400,
    }
    assert s["sessions_count"] == 4 and s["avg_session_seconds"] == 4500

    # dia
    d = user_client.get(
        f"{API}/reports/summary", params={"period": "day", "date": "2026-09-16"}
    ).json()
    assert d["start"] == d["end"] == "2026-09-16" and d["logged_seconds"] == 0
    assert d["goal_days_planned"] == 1 and d["goal_days_met"] == 0
    # mês
    m = user_client.get(
        f"{API}/reports/summary", params={"period": "month", "date": "2026-09-16"}
    ).json()
    assert m["start"] == "2026-09-01" and m["end"] == "2026-09-30" and m["logged_seconds"] == 18000


@freeze_time("2026-09-16 12:00:00")  # quarta
def test_summary_reading_with_open_pending_and_week_start_preference(user_client):
    act = make_activity(user_client, start_date=MON)
    s = user_client.get(f"{API}/reports/summary", params={"period": "week"}).json()
    assert s["start"] == MON and s["pending_open_seconds"] == 7200
    assert s["reading"] == (
        "Segunda e terça ficaram sem registro; esse tempo segue como pendência. " + CLOSING
    )
    assert "não estudou" not in s["reading"]
    # sem meta ainda cumprida, sequência zero
    assert s["streak_current"] == 0 and s["streak_best"] == 0
    # semana começando no domingo
    r = user_client.patch(f"{API}/me/preferences", json={"week_starts_on": 6})
    assert r.status_code == 200, r.text
    s = user_client.get(f"{API}/reports/summary", params={"period": "week"}).json()
    assert s["start"] == "2026-09-13" and s["end"] == "2026-09-19"
    # política "none": a meta não é transferida
    user_client.patch(f"{API}/activities/{act['id']}", json={"recovery_policy": "none"})
    s = user_client.get(f"{API}/reports/summary", params={"period": "week"}).json()
    assert s["pending_open_seconds"] == 0
    assert "a meta desses dias não é transferida" in s["reading"]


@freeze_time("2026-09-19 12:00:00")
def test_sessions_report_includes_titles_and_pagination(user_client):
    act = make_activity(user_client, start_date=MON)
    subj, topic = _subject_and_topic(user_client, act["id"])
    _log(user_client, act["id"], "2026-09-15", 3600, subject_id=subj["id"], topic_id=topic["id"])
    _log(user_client, act["id"], "2026-09-17", 1800)
    r = user_client.get(f"{API}/reports/sessions", params={"start": MON, "end": "2026-09-20"})
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 2
    newest = rows[0]
    assert newest["duration_seconds"] == 1800 and newest["activity_title"] == "Inglês"
    assert newest["subject_title"] is None and newest["topic_title"] is None
    older = rows[1]
    assert older["subject_title"] == "Gramática" and older["topic_title"] == "Verbos"
    assert older["local_date"] == "2026-09-15" and older["entry_mode"] == "duration"
    assert older["version"] == 1 and older["elapsed_seconds"] == 3600  # campos de SessionOut
    r = user_client.get(f"{API}/reports/sessions", params={"limit": 1, "offset": 1})
    assert [x["id"] for x in r.json()] == [older["id"]]
    r = user_client.get(
        f"{API}/reports/sessions", params={"start": "2026-09-16", "end": "2026-09-20"}
    )
    assert [x["id"] for x in r.json()] == [newest["id"]]


@freeze_time("2026-09-19 12:00:00")
def test_export_csv_has_bom_semicolon_and_period_filter(user_client):
    act = make_activity(user_client, start_date=MON)
    subj, topic = _subject_and_topic(user_client, act["id"])
    _log(
        user_client,
        act["id"],
        "2026-09-15",
        3600,
        subject_id=subj["id"],
        topic_id=topic["id"],
        note="unidade 4; revisão",
        page_from=10,
        page_to=20,
    )
    _log(user_client, act["id"], "2026-09-17", 1800)
    r = user_client.get(f"{API}/reports/export.csv", params={"start": MON, "end": "2026-09-20"})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    text = r.content.decode("utf-8")
    assert text.startswith("﻿")
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿")), delimiter=";"))
    assert rows[0][:6] == ["data_local", "objetivo", "materia", "topico", "material", "segundos"]
    assert len(rows) == 3
    assert rows[1][:9] == [
        "2026-09-15",
        "Inglês",
        "Gramática",
        "Verbos",
        "",
        "3600",
        "60.0",
        "manual",
        "duration",
    ]
    assert rows[1][11] == "10-20" and rows[1][12] == "unidade 4; revisão"
    assert rows[1][13] == "sim" and rows[1][14] == "nao"
    assert rows[2][0] == "2026-09-17" and rows[2][5] == "1800"
    # filtro de período
    r = user_client.get(
        f"{API}/reports/export.csv", params={"start": "2026-09-17", "end": "2026-09-20"}
    )
    rows = list(csv.reader(io.StringIO(r.text.lstrip("﻿")), delimiter=";"))
    assert len(rows) == 2 and rows[1][0] == "2026-09-17"


def test_content_report_separates_topics_and_tasks_from_time(user_client):
    act = make_activity(user_client)
    subj = user_client.post(
        f"{API}/activities/{act['id']}/subjects", json={"title": "Gramática"}
    ).json()
    t1 = user_client.post(
        f"{API}/subjects/{subj['id']}/topics", json={"title": "Verbos", "estimated_minutes": 30}
    ).json()
    user_client.post(
        f"{API}/subjects/{subj['id']}/topics", json={"title": "Artigos", "estimated_minutes": 60}
    )
    user_client.patch(f"{API}/topics/{t1['id']}", json={"status": "done"})
    task = user_client.post(
        f"{API}/tasks",
        json={
            "activity_id": act["id"],
            "title": "Exercícios",
            "local_date": MON,
            "subject_id": subj["id"],
        },
    ).json()
    user_client.post(f"{API}/tasks/{task['id']}/complete")
    user_client.post(
        f"{API}/tasks", json={"activity_id": act["id"], "title": "Solta", "local_date": MON}
    )

    r = user_client.get(f"{API}/reports/content", params={"activity_id": act["id"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["activity_id"] == act["id"] and body["subjects_total"] == 1
    assert body["topics_total"] == 2 and body["topics_done"] == 1 and body["percent_done"] == 50.0
    assert body["tasks_total"] == 2 and body["tasks_done"] == 1 and body["tasks_planned"] == 1
    gram = body["by_subject"][0]
    assert gram["subject_id"] == subj["id"] and gram["topics_done"] == 1
    assert gram["estimated_minutes_total"] == 90 and gram["estimated_minutes_done"] == 30
    assert gram["tasks_total"] == 1 and gram["tasks_done"] == 1
    loose = body["by_subject"][1]
    assert (
        loose["subject_id"] is None
        and loose["title"] == "Sem matéria"
        and loose["tasks_total"] == 1
    )
    assert "não lança minutos" in body["note"]


def test_reports_isolation_between_users(client):
    signup(client, email="a@example.com")
    act = make_activity(client)
    client.cookies.clear()
    signup(client, email="b@example.com")
    p = {"activity_id": act["id"]}
    assert client.get(f"{API}/reports/summary", params=p).status_code == 404
    assert client.get(f"{API}/reports/sessions", params=p).status_code == 404
    assert client.get(f"{API}/reports/content", params=p).status_code == 404
    r = client.get(f"{API}/reports/export.csv", params={**p, "start": MON, "end": MON})
    assert r.status_code == 404
    # sem objetivo: resumo vazio, sem erro
    s = client.get(f"{API}/reports/summary").json()
    assert s["logged_seconds"] == 0 and s["by_activity"] == []
    assert s["reading"] == "Nenhum dia com meta neste período. " + CLOSING
