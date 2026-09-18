"""Fixtures de API: banco SQLite isolado por teste, cliente com cookies/CSRF."""

from __future__ import annotations

import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("EMAIL_BACKEND", "memory")
os.environ.setdefault("STORAGE_LOCAL_PATH", "var/test-storage")
os.environ.setdefault("RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("SECRET_KEY", "test-secret-key-with-enough-length-1234")

import pytest
from fastapi.testclient import TestClient

from app.core.db import Base, engine
from app.main import app


@pytest.fixture(autouse=True)
def _fresh_db():
    import app.models  # noqa: F401

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    from app.core.db import SessionLocal
    from app.services.plans import ensure_default_plans

    with SessionLocal() as db:
        ensure_default_plans(db)
        db.commit()
    yield
    Base.metadata.drop_all(engine)


class ApiClient(TestClient):
    csrf: str | None = None

    def request(self, method, url, **kwargs):  # type: ignore[override]
        headers = dict(kwargs.pop("headers", {}) or {})
        if self.csrf and method.upper() not in ("GET", "HEAD", "OPTIONS"):
            headers.setdefault("X-CSRF-Token", self.csrf)
        headers.setdefault("Origin", "http://localhost:5173")
        return super().request(method, url, headers=headers, **kwargs)


@pytest.fixture
def client():
    with ApiClient(app, base_url="http://localhost:8000") as c:
        yield c


def signup(
    client: ApiClient, email="ana@example.com", password="senha-forte-123", name="Ana"
) -> dict:
    r = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "name": name, "timezone": "America/Sao_Paulo"},
    )
    assert r.status_code == 201, r.text
    data = r.json()
    client.csrf = data["csrf_token"]
    return data


@pytest.fixture
def user_client(client):
    signup(client)
    return client


def make_activity(
    client: ApiClient, title="Inglês", daily_minutes=60, start_date=None, **extra
) -> dict:
    body = {
        "title": title,
        "category": "ingles",
        "goal": {
            "daily_minutes": daily_minutes,
            "active_days": [0, 1, 2, 3, 4],
            "daily_limit_minutes": 120,
        },
    }
    if start_date:
        body["start_date"] = start_date
    body.update(extra)
    r = client.post("/api/v1/activities", json=body)
    assert r.status_code == 201, r.text
    return r.json()
