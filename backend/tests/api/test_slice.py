"""Fatia vertical: cadastro → objetivo → meta → sessão → saldo → tela Hoje."""

from datetime import date

from freezegun import freeze_time

from tests.conftest import make_activity, signup

MON = "2026-09-14"


def test_register_login_session_cookie_and_csrf(client):
    data = signup(client)
    assert data["user"]["email"] == "ana@example.com"
    assert data["entitlements"]["plan_code"] == "free"
    r = client.get("/api/v1/auth/session")
    assert r.status_code == 200
    # mutação sem CSRF é recusada
    client.csrf = None
    r = client.post("/api/v1/activities", json={"title": "x"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_token"
    client.csrf = data["csrf_token"]
    r = client.post("/api/v1/auth/logout")
    assert r.status_code == 200
    r = client.get("/api/v1/auth/session")
    assert r.status_code == 401
    r = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": "senha-forte-123"}
    )
    assert r.status_code == 200
    r = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": "errada-errada"}
    )
    assert r.status_code == 401


@freeze_time("2026-09-15 12:00:00")  # terça-feira, 09:00 em São Paulo
def test_main_acceptance_60_min_per_day_skip_a_day(user_client):
    act = make_activity(user_client, start_date=MON)
    assert act["current_rule"]["minutes_by_weekday"]["0"] == 60
    r = user_client.get("/api/v1/dashboard/today")
    assert r.status_code == 200, r.text
    card = r.json()["cards"][0]
    s = card["summary"]
    assert s["target"] == 3600
    assert s["pending_prior"] == 3600  # segunda sem registro
    assert s["remaining_total"] == 7200
    assert "1h da meta" in card["next_step"] and "20 min de recuperação" in card["next_step"]
    # registra 90 minutos manualmente
    r = user_client.post(
        "/api/v1/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 5400, "local_date": "2026-09-15"},
    )
    assert r.status_code == 201, r.text
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    b = r.json()
    assert b["today"]["logged"] == 5400
    assert b["today"]["goal_met"] is True
    assert b["today"]["pending_prior"] == 1800
    assert b["days"][-1]["recovered"] == 1800


@freeze_time("2026-09-15 12:00:00")
def test_timer_flow_start_pause_resume_finish_and_single_active(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post("/api/v1/sessions/start", json={"activity_id": act["id"]})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    # segunda aba tenta iniciar: conflito com detalhes
    r2 = user_client.post("/api/v1/sessions/start", json={"activity_id": act["id"]})
    assert r2.status_code == 409
    assert r2.json()["error"]["code"] == "session_active"
    assert r2.json()["error"]["details"]["session_id"] == sid
    with freeze_time("2026-09-15 12:20:00"):
        r = user_client.post(f"/api/v1/sessions/{sid}/pause", json={})
        assert r.json()["status"] == "paused"
        assert r.json()["elapsed_seconds"] == 1200
    with freeze_time("2026-09-15 12:30:00"):
        r = user_client.post(f"/api/v1/sessions/{sid}/resume", json={})
        assert r.json()["status"] == "active"
    with freeze_time("2026-09-15 12:50:00"):
        r = user_client.post(f"/api/v1/sessions/{sid}/finish", json={"note": "unidade 4"})
        assert r.json()["status"] == "finished"
        assert r.json()["duration_seconds"] == 2400  # pausa não conta
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    assert r.json()["today"]["logged"] == 2400
    assert r.json()["today"]["missing_today"] == 1200
    r = user_client.get("/api/v1/sessions/active")
    assert r.json() is None


@freeze_time("2026-09-15 12:00:00")
def test_idempotent_start_with_client_uuid(user_client):
    act = make_activity(user_client, start_date=MON)
    body = {"activity_id": act["id"], "client_uuid": "7f2b6c1e-6a3d-4b6c-9a4c-1b2c3d4e5f60"}
    r1 = user_client.post("/api/v1/sessions/start", json=body)
    r2 = user_client.post("/api/v1/sessions/start", json=body)
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]


@freeze_time("2026-09-16 12:00:00")
def test_recovery_plan_preview_and_apply_without_new_debt(user_client):
    act = make_activity(user_client, start_date=MON)
    # segunda e terça sem registro: 120 pendentes na quarta
    r = user_client.post(
        f"/api/v1/activities/{act['id']}/recovery-plans/preview",
        json={"strategy": "distribute", "horizon_days": 4},
    )
    pv = r.json()
    assert pv["pending_seconds"] == 7200
    assert pv["allocated"] == 7200
    assert set(pv["allocations"].values()) == {1800}
    r = user_client.post(
        f"/api/v1/activities/{act['id']}/recovery-plans",
        json={"strategy": "distribute", "horizon_days": 4},
    )
    assert r.status_code == 201, r.text
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    t = r.json()["today"]
    assert t["target"] == 3600
    assert t["suggested_recovery"] == 1800
    assert t["pending_prior"] == 7200  # dívida não aumentou
    assert t["next_step_seconds"] == 5400
    # recuperar tudo hoje: excede capacidade (limite 120 - 60 meta = 60 extras)
    r = user_client.post(
        f"/api/v1/activities/{act['id']}/recovery-plans/preview", json={"strategy": "today"}
    )
    assert r.json()["exceeds_capacity_on"] == ["2026-09-16"]


@freeze_time("2026-09-16 12:00:00")
def test_forgive_is_explicit_and_audited(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post(f"/api/v1/activities/{act['id']}/forgive/preview", json={"seconds": 3600})
    assert r.json() == {
        "pending_before": 7200,
        "forgiven": 3600,
        "pending_after": 3600,
        "applies_on": "2026-09-16",
    }
    r = user_client.post(
        f"/api/v1/activities/{act['id']}/forgive",
        json={"seconds": 3600, "reason": "semana difícil"},
    )
    assert r.status_code == 200
    assert r.json()["today"]["pending_prior"] == 3600
    r = user_client.get("/api/v1/sessions")
    assert r.json() == []  # nenhuma sessão fictícia


@freeze_time("2026-09-16 12:00:00")
def test_goal_change_effective_tomorrow_does_not_rewrite_past(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post(
        f"/api/v1/activities/{act['id']}/goal-rules",
        json={"daily_minutes": 30, "active_days": [0, 1, 2, 3, 4]},
    )
    assert r.status_code == 201
    assert r.json()["effective_from"] == "2026-09-17"
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    assert r.json()["today"]["target"] == 3600
    assert r.json()["today"]["pending_prior"] == 7200


@freeze_time("2026-09-16 12:00:00")
def test_edit_and_delete_session_recomputes_balance(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post(
        "/api/v1/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 3600, "local_date": "2026-09-14"},
    )
    sid = r.json()["id"]
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    assert r.json()["today"]["pending_prior"] == 3600
    r = user_client.patch(
        f"/api/v1/sessions/{sid}", json={"duration_seconds": 1800, "reason": "corrigi"}
    )
    assert r.status_code == 200
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    assert r.json()["today"]["pending_prior"] == 5400
    r = user_client.get(f"/api/v1/sessions/{sid}/revisions")
    assert [x["action"] for x in r.json()] == ["create", "update"]
    r = user_client.delete(f"/api/v1/sessions/{sid}")
    assert r.status_code == 200
    r = user_client.get(f"/api/v1/activities/{act['id']}/balance")
    assert r.json()["today"]["pending_prior"] == 7200


@freeze_time("2026-09-16 12:00:00")
def test_manual_with_time_detects_overlap_and_duration_only_checks_plausibility(user_client):
    act = make_activity(user_client, start_date=MON)
    r = user_client.post(
        "/api/v1/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 3600,
            "local_date": "2026-09-15",
            "start_time": "19:00",
        },
    )
    assert r.status_code == 201
    r = user_client.post(
        "/api/v1/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 1800,
            "local_date": "2026-09-15",
            "start_time": "19:30",
        },
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "overlap"
    r = user_client.post(
        "/api/v1/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 16 * 3600, "local_date": "2026-09-15"},
    )
    assert r.status_code == 201
    r = user_client.post(
        "/api/v1/sessions/manual",
        json={"activity_id": act["id"], "duration_seconds": 8 * 3600, "local_date": "2026-09-15"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "day_limit"


def test_user_isolation(client):
    signup(client, email="a@example.com")
    act = make_activity(client)
    a_csrf = client.csrf
    client.cookies.clear()
    signup(client, email="b@example.com")
    r = client.get(f"/api/v1/activities/{act['id']}")
    assert r.status_code == 404
    r = client.post(
        "/api/v1/sessions/manual",
        json={
            "activity_id": act["id"],
            "duration_seconds": 600,
            "local_date": date.today().isoformat(),
        },
    )
    assert r.status_code == 404
    r = client.patch(f"/api/v1/activities/{act['id']}", json={"title": "hack"})
    assert r.status_code == 404
    assert a_csrf != client.csrf


def test_free_plan_limits_active_activities(user_client):
    make_activity(user_client, title="Inglês")
    r = user_client.post(
        "/api/v1/activities",
        json={"title": "Violão", "category": "pratica", "goal": {"daily_minutes": 30}},
    )
    assert r.status_code == 402
    assert r.json()["error"]["code"] == "activity_limit"


@freeze_time("2026-09-15 12:00:00")
def test_two_activities_extra_time_does_not_cross(client):
    signup(client)
    # simula plano pro via grant: cria segunda atividade após pausar a primeira
    a = make_activity(client, title="Inglês", start_date=MON)
    client.post(f"/api/v1/activities/{a['id']}/status", json={"status": "paused"})
    b = make_activity(client, title="Violão", start_date=MON)
    client.post(f"/api/v1/activities/{a['id']}/status", json={"status": "active"})
    # (a volta a ativa só porque b... no plano free isso falha)
    client.post(
        "/api/v1/sessions/manual",
        json={"activity_id": b["id"], "duration_seconds": 7200, "local_date": "2026-09-15"},
    )
    rb = client.get(f"/api/v1/activities/{b['id']}/balance").json()
    ra = client.get(f"/api/v1/activities/{a['id']}/balance").json()
    assert rb["today"]["extra"] == 0 and rb["today"]["pending_prior"] == 0
    assert ra["today"]["pending_prior"] == 3600


def test_export_works_without_subscription(user_client):
    make_activity(user_client)
    r = user_client.get("/api/v1/me/export")
    assert r.status_code == 200 and r.json()["activities"][0]["title"] == "Inglês"
    r = user_client.get("/api/v1/me/export.csv")
    assert r.status_code == 200 and "data_local" in r.text


def test_health(client):
    assert client.get("/api/v1/health/live").json() == {"status": "ok"}
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 200  # redis pode faltar em teste (não bloqueia fora de produção)


def test_login_reset_flow_with_memory_email(client):
    from app.integrations.email import MemoryBackend

    signup(client)
    client.post("/api/v1/auth/logout")
    client.csrf = None
    MemoryBackend.sent.clear()
    r = client.post("/api/v1/auth/forgot-password", json={"email": "ana@example.com"})
    assert r.status_code == 200
    assert MemoryBackend.sent and "redefinir-senha?token=" in MemoryBackend.sent[-1].text
    token = MemoryBackend.sent[-1].text.split("token=")[1].split()[0]
    r = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "nova-senha-456"}
    )
    assert r.status_code == 200
    r = client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "nova-senha-456"}
    )
    assert r.status_code == 400  # uso único
    r = client.post(
        "/api/v1/auth/login", json={"email": "ana@example.com", "password": "nova-senha-456"}
    )
    assert r.status_code == 200
