"""Cloudflare Email Sending pela API REST: formato da chamada e falhas que não derrubam o fluxo."""

import httpx

from app.core.config import settings
from app.integrations import email as email_mod


class _Res:
    def __init__(self, status, data):
        self.status_code = status
        self._data = data
        self.content = b"x"

    def json(self):
        return self._data


def _configure(monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_BACKEND", "cloudflare")
    monkeypatch.setattr(settings, "CLOUDFLARE_ACCOUNT_ID", "acc123")
    monkeypatch.setattr(settings, "CLOUDFLARE_EMAIL_API_TOKEN", "tok")
    monkeypatch.setattr(settings, "EMAIL_FROM", "Estudatta <no-reply@estudatta.com.br>")


def test_sends_via_cloudflare_rest_api(monkeypatch):
    _configure(monkeypatch)
    calls = []

    def fake_post(url, json, headers, timeout):
        calls.append((url, json, headers))
        return _Res(200, {"success": True, "result": {"delivered": ["a@b.com"]}})

    monkeypatch.setattr(httpx, "post", fake_post)
    assert email_mod.send_password_reset_email("a@b.com", "https://app/x") is True
    url, body, headers = calls[0]
    assert url == "https://api.cloudflare.com/client/v4/accounts/acc123/email/sending/send"
    assert headers["Authorization"] == "Bearer tok"
    assert body["from"] == {"address": "no-reply@estudatta.com.br", "name": "Estudatta"}
    assert body["to"] == "a@b.com" and "Redefinir senha" in body["subject"] and body["html"]


def test_failures_and_missing_config_return_false(monkeypatch):
    _configure(monkeypatch)
    monkeypatch.setattr(
        httpx, "post", lambda *a, **k: _Res(403, {"success": False, "errors": [{"code": 10000}]})
    )
    assert email_mod.send_email("a@b.com", "s", "t") is False
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: _Res(200, {"success": True, "result": {"permanent_bounces": ["a@b.com"]}}),
    )
    assert email_mod.send_email("a@b.com", "s", "t") is False

    def boom(*a, **k):
        raise httpx.ConnectError("sem rede")

    monkeypatch.setattr(httpx, "post", boom)
    assert email_mod.send_email("a@b.com", "s", "t") is False
    monkeypatch.setattr(settings, "CLOUDFLARE_EMAIL_API_TOKEN", None)
    assert email_mod.send_email("a@b.com", "s", "t") is False
