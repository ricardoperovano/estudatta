"""Seed de demonstração (idempotente, reproduz os mockups) e comandos de operação (`app.cli`)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from freezegun import freeze_time
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models.activity import Activity
from app.models.content import Material, Subject, Topic
from app.models.planning import PlannedTask
from app.models.session import StudySession
from app.models.user import User
from app.services.demo import DEMO_EMAIL, LEGACY_DEMO_EMAILS, seed_demo
from tests.conftest import signup

API = "/api/v1"
BACKEND = Path(__file__).resolve().parents[2]


def _counts() -> dict[str, int]:
    with SessionLocal() as db:

        def count(model):
            return int(db.execute(select(func.count()).select_from(model)).scalar_one())

        return {
            "users": count(User),
            "activities": count(Activity),
            "subjects": count(Subject),
            "topics": count(Topic),
            "materials": count(Material),
            "sessions": count(StudySession),
            "tasks": count(PlannedTask),
        }


def _login(client, email, password):
    r = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    client.csrf = r.json()["csrf_token"]


@freeze_time("2026-09-15 12:00:00")  # terça, 09:00 em São Paulo
def test_seed_demo_is_idempotent_and_matches_mockup(client):
    with SessionLocal() as db:
        first = seed_demo(db, password="demo-senha-123")
        db.commit()
    assert first["email"] == DEMO_EMAIL and first["user_created"] is True
    assert first["password"] is None  # senha informada não é exibida
    assert first["activity_created"] is True
    assert first["subjects_created"] == 3 and first["topics_created"] == 13
    assert first["material_created"] is True
    assert first["sessions_created"] == 6  # 07–11/09 completos + hoje; ontem (14/09) sem registro
    assert first["tasks_created"] == 5
    assert first["today"] == "2026-09-15" and first["start_date"] == "2026-09-05"
    counts = _counts()
    assert counts == {
        "users": 1,
        "activities": 1,
        "subjects": 3,
        "topics": 13,
        "materials": 1,
        "sessions": 6,
        "tasks": 5,
    }

    with SessionLocal() as db:
        second = seed_demo(db)
        db.commit()
    assert second["user_created"] is False and second["activity_created"] is False
    assert second["subjects_created"] == 0 and second["topics_created"] == 0
    assert second["material_created"] is False
    assert second["sessions_created"] == 0 and second["tasks_created"] == 0
    assert second["activity_id"] == first["activity_id"] and second["user_id"] == first["user_id"]
    assert _counts() == counts

    # o cenário dos mockups, visto pela API como o usuário demo
    _login(client, DEMO_EMAIL, "demo-senha-123")
    act = client.get(f"{API}/activities/{first['activity_id']}").json()
    assert act["title"] == "Inglês" and act["status"] == "active"
    assert act["current_rule"]["minutes_by_weekday"] == {
        "0": 60,
        "1": 60,
        "2": 60,
        "3": 60,
        "4": 60,
        "5": 0,
        "6": 0,
    }
    b = client.get(f"{API}/activities/{first['activity_id']}/balance").json()
    assert b["today"]["local_date"] == "2026-09-15"
    assert b["today"]["target"] == 3600 and b["today"]["logged"] == 2400
    assert b["today"]["missing_today"] == 1200 and b["today"]["pending_prior"] == 3600
    days = {d["local_date"]: d for d in b["days"]}
    assert days["2026-09-14"]["logged"] == 0 and days["2026-09-14"]["target"] == 3600
    for d in ("2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"):
        assert days[d]["logged"] == 3600 and days[d]["goal_met"] is True
    assert days["2026-09-12"]["is_rest"] is True
    tree = client.get(f"{API}/activities/{first['activity_id']}/subjects").json()
    assert [s["title"] for s in tree] == ["Gramática", "Listening", "Vocabulário"]
    statuses = {t["title"]: t["status"] for t in tree[0]["topics"]}
    assert statuses["Present simple"] == "done" and statuses["Past simple"] == "in_progress"
    materials = client.get(f"{API}/materials").json()
    assert len(materials) == 1 and materials[0]["kind"] == "link"
    assert materials[0]["last_position"] == "Unidade 4"
    tasks = client.get(f"{API}/tasks", params={"start": "2026-09-15", "end": "2026-09-30"}).json()
    assert [t["local_date"] for t in tasks] == [
        "2026-09-15",
        "2026-09-16",
        "2026-09-17",
        "2026-09-18",
        "2026-09-21",
    ]


@freeze_time("2026-09-15 12:00:00")
def test_seed_demo_renames_legacy_demo_user_instead_of_duplicating():
    with SessionLocal() as db:
        seed_demo(db, password="demo-senha-123")
        db.commit()
        user = db.execute(select(User).where(User.email == DEMO_EMAIL)).scalar_one()
        user.email = LEGACY_DEMO_EMAILS[0]
        db.commit()
        old_id = str(user.id)
    with SessionLocal() as db:
        result = seed_demo(db)
        db.commit()
    assert result["user_created"] is False and result["user_id"] == old_id
    assert _counts()["users"] == 1 and _counts()["sessions"] == 6
    with SessionLocal() as db:
        emails = [u.email for u in db.execute(select(User)).scalars()]
    assert emails == [DEMO_EMAIL]


def test_cli_help_runs_as_module():
    env = os.environ.copy()
    r = subprocess.run(
        [sys.executable, "-m", "app.cli", "--help"],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert r.returncode == 0, r.stderr
    for command in ("create-admin", "promote", "seed-demo", "ensure-plans", "vapid"):
        assert command in r.stdout
    r = subprocess.run(
        [sys.executable, "-m", "app.cli"], cwd=BACKEND, env=env, capture_output=True, text=True
    )
    assert r.returncode == 2  # subcomando obrigatório


def test_cli_commands(client, capsys):
    from app.cli import main

    assert main(["ensure-plans"]) == 0
    assert "free, pro" in capsys.readouterr().out
    # seed-demo é recusado sem DEMO_MODE (ou --force)
    assert main(["seed-demo"]) == 2
    assert "DEMO_MODE" in capsys.readouterr().err
    assert main(["seed-demo", "--force", "--password", "demo-senha-123"]) == 0
    out = capsys.readouterr().out
    assert f"email: {DEMO_EMAIL}" in out and "demo-senha-123" not in out
    assert main(["seed-demo", "--force"]) == 0
    assert "senha não foi alterada" in capsys.readouterr().out
    assert main(["seed-demo", "--force"]) == 0
    capsys.readouterr()
    # administradores
    assert main(["create-admin", "--email", "adm@example.com", "--password", "senha-forte-123"]) == 0
    assert "Administrador criado: adm@example.com" in capsys.readouterr().out
    assert main(["create-admin", "--email", "adm@example.com", "--password", "senha-forte-123"]) == 1
    assert "erro:" in capsys.readouterr().err
    assert main(["promote", "--email", "nao@existe.com"]) == 1
    signup(client, email="ana@example.com")
    assert main(["promote", "--email", "Ana@Example.com"]) == 0
    assert "promovido" in capsys.readouterr().out
    assert main(["promote", "--email", "ana@example.com"]) == 0
    assert "já é administrador" in capsys.readouterr().out
    with SessionLocal() as db:
        roles = {u.email: u.role for u in db.execute(select(User)).scalars()}
    assert roles["adm@example.com"] == "admin" and roles["ana@example.com"] == "admin"
    assert roles[DEMO_EMAIL] == "user"
    _login(client, "adm@example.com", "senha-forte-123")
    assert client.get(f"{API}/me").json()["role"] == "admin"
