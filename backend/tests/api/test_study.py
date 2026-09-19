"""Tipos de sessão e questões, revisões espaçadas, simulados, análise (próxima matéria,
edital coberto, semana) e gamificação (XP, níveis, conquistas, desafios)."""

from __future__ import annotations

from freezegun import freeze_time
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models.study import UserAchievement, XpEvent
from tests.conftest import make_activity, signup

API = "/api/v1"
MON = "2026-09-14"


def subject(client, act_id, title, weight=1, difficulty="media"):
    r = client.post(
        f"{API}/activities/{act_id}/subjects",
        json={"title": title, "weight": weight, "difficulty": difficulty},
    )
    assert r.status_code == 201, r.text
    return r.json()


def topic(client, subject_id, title):
    r = client.post(f"{API}/subjects/{subject_id}/topics", json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


def log(client, act_id, day, minutes, **extra):
    r = client.post(
        f"{API}/sessions/manual",
        json={"activity_id": act_id, "duration_seconds": minutes * 60, "local_date": day, **extra},
    )
    assert r.status_code == 201, r.text
    return r.json()


@freeze_time("2026-09-16 12:00:00")
def test_study_type_and_questions_are_validated_and_returned(user_client):
    act = make_activity(user_client, start_date=MON)
    s = log(
        user_client,
        act["id"],
        "2026-09-16",
        30,
        study_type="questoes",
        questions_total=40,
        questions_correct=31,
    )
    assert (
        s["study_type"] == "questoes"
        and s["questions_total"] == 40
        and s["questions_correct"] == 31
    )
    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 600,
            "local_date": "2026-09-16",
            "questions_total": 5,
            "questions_correct": 6,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_questions"
    r = user_client.post(
        f"{API}/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 600,
            "local_date": "2026-09-16",
            "study_type": "dormir",
        },
    )
    assert r.status_code == 422
    # edição mantém trilha e aceita novos campos
    r = user_client.patch(
        f"{API}/sessions/{s['id']}", json={"questions_correct": 35, "reason": "corrigi"}
    )
    assert r.status_code == 200 and r.json()["questions_correct"] == 35
    r = user_client.patch(
        f"{API}/sessions/{s['id']}",
        json={"study_type": "teoria", "clear_questions": True, "reason": "era teoria"},
    )
    assert r.status_code == 200 and r.json()["questions_total"] is None
    assert r.json()["study_type"] == "teoria"


@freeze_time("2026-09-16 12:00:00")
def test_revisions_scheduled_completed_and_chained(user_client):
    act = make_activity(user_client, start_date=MON)
    subj = subject(user_client, act["id"], "Gramática")
    t = topic(user_client, subj["id"], "Present perfect")
    log(
        user_client,
        act["id"],
        "2026-09-15",
        30,
        subject_id=subj["id"],
        topic_id=t["id"],
        study_type="teoria",
    )
    revs = user_client.get(f"{API}/revisions").json()
    assert len(revs) == 1 and revs[0]["due_date"] == "2026-09-16" and revs[0]["step"] == 1
    assert revs[0]["title"] == "Gramática · Present perfect"
    # uma segunda sessão de teoria no mesmo tópico não duplica a revisão pendente
    log(
        user_client,
        act["id"],
        "2026-09-16",
        20,
        subject_id=subj["id"],
        topic_id=t["id"],
        study_type="teoria",
    )
    assert len(user_client.get(f"{API}/revisions").json()) == 1
    summ = user_client.get(f"{API}/revisions/summary").json()
    assert summ["due_today"] == 1 and summ["overdue"] == 0
    # concluir pela sessão de revisão agenda a etapa 2 (+7 dias a partir de hoje)
    log(
        user_client,
        act["id"],
        "2026-09-16",
        15,
        subject_id=subj["id"],
        topic_id=t["id"],
        study_type="revisao",
    )
    pend = user_client.get(f"{API}/revisions").json()
    assert len(pend) == 1 and pend[0]["step"] == 2 and pend[0]["due_date"] == "2026-09-23"
    # concluir manualmente agenda a etapa 3 (+30)
    r = user_client.post(f"{API}/revisions/{pend[0]['id']}/done")
    assert r.status_code == 200 and r.json()["step"] == 3 and r.json()["due_date"] == "2026-10-16"
    # a última etapa não agenda mais nada
    r = user_client.post(f"{API}/revisions/{r.json()['id']}/done")
    assert r.status_code == 200 and r.json() is None
    assert len(user_client.get(f"{API}/revisions", params={"status": "done"}).json()) == 3


@freeze_time("2026-09-16 12:00:00")
def test_revisions_respect_preferences_and_skip(user_client):
    act = make_activity(user_client, start_date=MON)
    subj = subject(user_client, act["id"], "Listening")
    r = user_client.patch(f"{API}/me/preferences", json={"revision_intervals": [2, 5]})
    assert r.status_code == 200 and r.json()["revision_intervals"] == [2, 5]
    assert (
        user_client.patch(
            f"{API}/me/preferences", json={"revision_intervals": [0, 900]}
        ).status_code
        == 422
    )
    log(user_client, act["id"], "2026-09-16", 30, subject_id=subj["id"], study_type="aula")
    rev = user_client.get(f"{API}/revisions").json()[0]
    assert rev["due_date"] == "2026-09-18"
    assert user_client.post(f"{API}/revisions/{rev['id']}/skip").status_code == 200
    assert user_client.get(f"{API}/revisions").json() == []
    user_client.patch(f"{API}/me/preferences", json={"revisions_enabled": False})
    log(user_client, act["id"], "2026-09-16", 30, subject_id=subj["id"], study_type="teoria")
    assert user_client.get(f"{API}/revisions").json() == []


@freeze_time("2026-09-16 12:00:00")
def test_mock_exams_overview_and_isolation(client):
    signup(client, email="m@example.com")
    act = make_activity(client, start_date=MON, title="Concurso")
    port = subject(client, act["id"], "Português")
    r = client.post(
        f"{API}/activities/{act['id']}/mock-exams",
        json={
            "title": "Simulado 1",
            "taken_on": "2026-09-10",
            "subjects": [
                {"subject_id": port["id"], "total": 20, "correct": 12},
                {"subject_title": "Raciocínio lógico", "total": 10, "correct": 5},
            ],
        },
    )
    assert r.status_code == 201, r.text
    e1 = r.json()
    assert e1["total_questions"] == 30 and e1["correct"] == 17 and e1["percent"] == 56.7
    r = client.post(
        f"{API}/activities/{act['id']}/mock-exams",
        json={
            "title": "Simulado 2",
            "taken_on": "2026-09-15",
            "total_questions": 30,
            "correct": 21,
        },
    )
    assert r.status_code == 201
    ov = client.get(f"{API}/activities/{act['id']}/mock-exams").json()
    assert (
        ov["count"] == 2
        and ov["best_percent"] == 70.0
        and ov["last_percent"] == 70.0
        and ov["change_from_previous"] == 13.3
    )
    assert (
        ov["subjects"][0]["subject_title"] == "Raciocínio lógico"
        and ov["subjects"][0]["percent"] == 50.0
    )
    bad = client.post(
        f"{API}/activities/{act['id']}/mock-exams",
        json={"taken_on": "2026-09-15", "total_questions": 10, "correct": 11},
    )
    assert bad.status_code == 422
    client.cookies.clear()
    signup(client, email="n@example.com")
    assert client.get(f"{API}/activities/{act['id']}/mock-exams").status_code == 404
    assert client.delete(f"{API}/mock-exams/{e1['id']}").status_code == 404


@freeze_time("2026-09-16 12:00:00")
def test_insights_next_subject_coverage_and_week(user_client):
    act = make_activity(user_client, start_date=MON)
    user_client.patch(
        f"{API}/activities/{act['id']}",
        json={"weekly_questions_goal": 100, "weekly_pages_goal": 50},
    )
    a = subject(user_client, act["id"], "Português", weight=1, difficulty="facil")
    b = subject(user_client, act["id"], "Direito Constitucional", weight=3, difficulty="dificil")
    ta = topic(user_client, a["id"], "Crase")
    tb = topic(user_client, b["id"], "Direitos fundamentais")
    topic(user_client, b["id"], "Controle de constitucionalidade")
    log(
        user_client,
        act["id"],
        "2026-09-15",
        60,
        subject_id=a["id"],
        topic_id=ta["id"],
        study_type="teoria",
        page_from=10,
        page_to=29,
    )
    log(
        user_client,
        act["id"],
        "2026-09-16",
        30,
        subject_id=b["id"],
        topic_id=tb["id"],
        study_type="questoes",
        questions_total=20,
        questions_correct=15,
    )
    ins = user_client.get(f"{API}/activities/{act['id']}/insights").json()
    nxt = ins["next_subject"]
    assert (
        nxt["subject_title"] == "Direito Constitucional"
    )  # maior peso × dificuldade, pouco tempo recente
    assert (
        nxt["topic_title"] == "Controle de constitucionalidade"
        or nxt["topic_title"] == "Direitos fundamentais"
    )
    assert (
        ins["coverage"]["topics_total"] == 3
        and ins["coverage"]["topics_studied"] == 2
        and ins["coverage"]["percent_studied"] == 67
    )
    w = ins["week"]
    assert (
        w["questions"] == 20
        and w["accuracy"] == 75.0
        and w["pages"] == 20
        and w["questions_goal"] == 100
        and w["pages_goal"] == 50
    )
    assert {t["study_type"] for t in w["by_type"]} == {"teoria", "questoes"}
    assert ins["accuracy_by_subject"][0]["subject_title"] == "Direito Constitucional"


@freeze_time("2026-09-16 12:00:00")
def test_gamification_xp_achievements_challenges_idempotent_and_never_revoked(user_client):
    act = make_activity(user_client, start_date=MON)
    g0 = user_client.get(f"{API}/gamification").json()
    assert (
        g0["xp"] == 0 and g0["level"]["number"] == 1 and g0["level"]["title"] == "Primeiros passos"
    )
    assert g0["total_achievements"] >= 40 and g0["unlocked_count"] == 0
    assert len(g0["challenges"]["items"]) >= 1
    s = log(
        user_client,
        act["id"],
        "2026-09-14",
        60,
        study_type="questoes",
        questions_total=10,
        questions_correct=8,
    )
    g = user_client.get(f"{API}/gamification").json()
    unlocked = {a["code"] for a in g["achievements"] if a["unlocked"]}
    assert {"first_session", "first_goal", "hours_1"} <= unlocked
    # XP: 60 min + 20 (meta do dia) + 10 questões + 8 acertos + bônus de conquistas (25 cada)
    bonus = 25 * len(unlocked)
    assert g["xp"] == 60 + 20 + 10 + 8 + bonus and g["xp_breakdown"]["bonus"] == bonus
    assert {a["code"] for a in g["unseen"]} == unlocked
    # idempotente: avaliar de novo não duplica bônus nem conquistas
    user_client.get(f"{API}/gamification")
    with SessionLocal() as db:
        assert db.execute(select(func.count()).select_from(XpEvent)).scalar_one() == len(unlocked)
        assert db.execute(select(func.count()).select_from(UserAchievement)).scalar_one() == len(
            unlocked
        )
    # marcar como vistas
    assert user_client.post(f"{API}/gamification/seen", json={}).status_code == 200
    assert user_client.get(f"{API}/gamification").json()["unseen"] == []
    # excluir a sessão reduz o XP de estudo, mas não revoga conquistas
    user_client.delete(f"{API}/sessions/{s['id']}")
    g2 = user_client.get(f"{API}/gamification").json()
    assert (
        g2["xp"] == bonus and {a["code"] for a in g2["achievements"] if a["unlocked"]} == unlocked
    )
    # notificação in-app de conquista
    notes = user_client.get(f"{API}/notifications").json()
    items = notes["items"] if isinstance(notes, dict) else notes
    assert any(n["kind"] == "achievement" for n in items)


@freeze_time("2026-09-19 12:00:00")  # sábado
def test_streak_and_comeback_achievements(user_client):
    act = make_activity(user_client, start_date=MON)
    # seg–qua cumpridas, quinta sem registro, sexta recupera 60 (total 120)
    for d in ("2026-09-14", "2026-09-15", "2026-09-16"):
        log(user_client, act["id"], d, 60)
    log(user_client, act["id"], "2026-09-18", 120)
    g = user_client.get(f"{API}/gamification").json()
    unlocked = {a["code"] for a in g["achievements"] if a["unlocked"]}
    assert "streak_3" in unlocked and "comeback" in unlocked
    assert g["records"]["best_streak"] == 3 and g["records"]["longest_session_seconds"] == 7200


def test_subject_weight_and_difficulty_roundtrip(user_client):
    act = make_activity(user_client)
    s = subject(user_client, act["id"], "Matemática", weight=4, difficulty="dificil")
    assert s["weight"] == 4 and s["difficulty"] == "dificil"
    r = user_client.patch(f"{API}/subjects/{s['id']}", json={"weight": 2})
    assert r.status_code == 200 and r.json()["weight"] == 2 and r.json()["difficulty"] == "dificil"
    assert (
        user_client.post(
            f"{API}/activities/{act['id']}/subjects", json={"title": "X", "weight": 9}
        ).status_code
        == 422
    )


@freeze_time("2026-09-15 15:00:00")
def test_study_fields_pass_through_offline_sync_and_timer(user_client):
    import uuid

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
            study_type="questoes",
        ),
        op(
            "session.finish",
            client_uuid=cu,
            at="2026-09-15T13:40:00Z",
            questions_total=25,
            questions_correct=20,
        ),
        op(
            "session.manual",
            activity_id=act["id"],
            duration_seconds=1200,
            local_date="2026-09-15",
            study_type="simulado",
            questions_total=10,
            questions_correct=7,
        ),
    ]
    r = user_client.post(
        f"{API}/sync/batch", json={"operations": ops}, headers={"X-Device-Id": "celular"}
    )
    res = r.json()["results"]
    assert [x["status"] for x in res] == ["applied"] * 3, res
    fin = res[1]["result"]
    assert (
        fin["study_type"] == "questoes"
        and fin["questions_total"] == 25
        and fin["questions_correct"] == 20
    )
    assert res[2]["result"]["study_type"] == "simulado"
    # cronômetro online com tipo
    s = user_client.post(
        f"{API}/sessions/start", json={"activity_id": act["id"], "study_type": "leitura"}
    )
    assert s.status_code in (200, 201), s.text and s.json()["study_type"] == "leitura"
    assert s.json()["study_type"] == "leitura"
    f = user_client.post(
        f"{API}/sessions/{s.json()['id']}/finish", json={"page_from": 1, "page_to": 12}
    )
    assert f.status_code == 200, f.text
    assert f.json()["study_type"] == "leitura"


def test_study_type_literals_match_service_list():
    import typing

    from app.schemas.sessions import StudyTypeLit
    from app.services.insights import TYPE_LABEL
    from app.services.sessions import STUDY_TYPES

    assert set(typing.get_args(StudyTypeLit)) == set(STUDY_TYPES) == set(TYPE_LABEL)
