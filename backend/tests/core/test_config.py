from app.core.config import Settings


def test_cors_origins_accepts_comma_separated_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://estudatta.com.br, http://localhost:5190")
    monkeypatch.setenv("TRUSTED_ORIGINS", "")
    s = Settings(_env_file=None)
    assert s.CORS_ORIGINS == ["https://estudatta.com.br", "http://localhost:5190"]
    assert s.TRUSTED_ORIGINS == []


def test_public_endpoints_allow_site_origin_via_cors():
    """O site público (outro domínio) chama só endpoints públicos, sem cookie."""
    from fastapi.testclient import TestClient

    from app.core import config
    from app.main import create_app

    old = config.settings.CORS_ORIGINS
    config.settings.CORS_ORIGINS = ["https://estudatta.com.br"]
    try:
        client = TestClient(create_app())
        r = client.options(
            "/api/v1/public/waitlist",
            headers={
                "Origin": "https://estudatta.com.br",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == "https://estudatta.com.br"
        r = client.options(
            "/api/v1/public/waitlist",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
        )
        assert "access-control-allow-origin" not in r.headers
    finally:
        config.settings.CORS_ORIGINS = old
