"""Conteúdo de documento é dado não confiável: não vira marcação em e-mail, não vira fórmula em
planilha e não derruba o servidor na leitura."""

from __future__ import annotations

from freezegun import freeze_time

from app.core.csvsafe import safe_cell, safe_row
from app.integrations.email import MemoryBackend, send_nudge_email, send_weekly_summary_email
from app.services import ocr
from tests.conftest import make_activity

EVIL = '<img src=x onerror=alert(1)><a href="https://golpe.example">clique</a>'


def test_user_text_is_escaped_in_email_html():
    MemoryBackend.sent.clear()
    send_nudge_email(
        "a@example.com",
        title=f"Voltar a {EVIL}",
        body=f"Seu objetivo {EVIL} está esperando.",
        url="https://app.example/app",
        unsubscribe_url="https://app.example/u/1",
    )
    send_weekly_summary_email("a@example.com", f"Você estudou {EVIL} esta semana.")
    for mail in MemoryBackend.sent:
        assert "<img src=x" not in mail.html and 'golpe.example">' not in mail.html
        assert "&lt;img src=x onerror=alert(1)&gt;" in mail.html
        assert EVIL in mail.text  # no texto puro não há o que interpretar


def test_csv_cells_cannot_become_formulas():
    assert (
        safe_cell('=HYPERLINK("https://golpe.example")') == '\'=HYPERLINK("https://golpe.example")'
    )
    assert safe_cell("+55 27 99999") == "'+55 27 99999" and safe_cell("@SUM(A1)") == "'@SUM(A1)"
    assert safe_cell("-1+1") == "'-1+1" and safe_cell("\tx") == "'\tx"
    # números e texto comum ficam como estão
    assert safe_row(["Inglês", 3600, 60.0, "2026-11-18", ""]) == [
        "Inglês",
        3600,
        60.0,
        "2026-11-18",
        "",
    ]


def test_exports_neutralize_formulas_in_titles_and_notes(user_client):
    """O título do objetivo e a anotação da sessão saem nos dois CSVs (histórico e relatório)."""
    with freeze_time("2026-09-16 12:00:00"):
        act = make_activity(user_client, title="=cmd|' /C calc'!A0", start_date="2026-09-14")
        r = user_client.post(
            "/api/v1/sessions/manual",
            json={
                "activity_id": act["id"],
                "duration_seconds": 1800,
                "local_date": "2026-09-15",
                "note": "@SUM(A1:A9)",
            },
        )
        assert r.status_code == 201, r.text
        history = user_client.get("/api/v1/me/export.csv")
        report = user_client.get(
            "/api/v1/reports/export.csv", params={"start": "2026-09-14", "end": "2026-09-20"}
        )
    for res in (history, report):
        assert res.status_code == 200, res.text
        text = res.text
        assert "'=cmd|' /C calc'!A0" in text and "'@SUM(A1:A9)" in text
        assert ";=cmd" not in text and ";@SUM" not in text


def test_ocr_never_renders_a_page_bigger_than_the_cap():
    a4 = ocr.render_scale(595, 842, 200)
    assert abs(a4 - 200 / 72) < 1e-9  # página comum: escala cheia
    # página declarada com 50 m de lado: a escala cai até caber no teto
    huge = ocr.render_scale(141_732, 141_732, 200)
    assert (141_732 * huge) ** 2 <= ocr.MAX_PAGE_PIXELS * 1.001
    assert ocr.render_scale(0, 0, 200) == 200 / 72
