"""Cadastro exige nome: contas sem nome apareciam no painel como "Sem nome"."""

from __future__ import annotations

REGISTER = "/api/v1/auth/register"
BASE = {"email": "sem-nome@example.com", "password": "senha-forte-123"}


def test_register_requires_a_name(client):
    for name in (None, "", "   "):
        body = dict(BASE) if name is None else {**BASE, "name": name}
        r = client.post(REGISTER, json=body)
        assert r.status_code == 422, (name, r.text)
        assert r.json()["error"]["code"] == "validation_failed"


def test_register_trims_and_keeps_the_name(client):
    r = client.post(REGISTER, json={**BASE, "name": "  Ana   Lucia "})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["name"] == "Ana Lucia"
