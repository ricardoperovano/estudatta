"""Importação: texto/CSV → proposta editável (`needs_review`) → confirmação cria matérias e
tópicos com `source_ref`; PDF com texto traz páginas; PDF sem camada de texto falha com
mensagem honesta; modelo CSV; limites; isolamento entre usuários."""

from __future__ import annotations

import shutil
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.integrations.storage import get_storage
from app.jobs.celery_app import celery_app
from app.models.content import ImportJob, Topic
from app.services import imports as imports_service
from tests.conftest import make_activity, signup
from tests.fixtures.pdf import make_encrypted_pdf, make_image_only_pdf, make_text_pdf

API = "/api/v1"
TEXT = "Gramática\n  Present simple\n  Past simple\nListening\n  Podcasts curtos ...... 12\n"
TEXT_PDF = make_text_pdf(
    [["GRAMATICA", "1.1 Present simple", "1.2 Past simple"], ["LISTENING", "2.1 Podcasts curtos"]]
)
BLANK_PDF = make_image_only_pdf(2)


@pytest.fixture(scope="module", autouse=True)
def _clean_test_storage():
    yield
    shutil.rmtree(Path(settings.STORAGE_LOCAL_PATH), ignore_errors=True)


@pytest.fixture
def eager_celery():
    """Executa a tarefa de importação no próprio processo, como o worker faria."""
    previous = celery_app.conf.task_always_eager
    celery_app.conf.task_always_eager = True
    yield
    celery_app.conf.task_always_eager = previous


def _import_json(client, act_id, source, content):
    return client.post(
        f"{API}/imports", json={"activity_id": act_id, "source": source, "content": content}
    )


def _import_file(client, act_id, data, filename, content_type="application/pdf", **form):
    return client.post(
        f"{API}/imports",
        files={"file": (filename, data, content_type)},
        data={"activity_id": act_id, **form},
    )


def _tree(client, act_id):
    return client.get(f"{API}/activities/{act_id}/subjects").json()


def _download_path(url: str) -> str:
    p = urlparse(url)
    return f"{p.path}?{p.query}"


def _source_refs() -> dict[str, dict | None]:
    with SessionLocal() as db:
        return {t.title: t.source_ref for t in db.execute(select(Topic)).scalars()}


# --- Texto e CSV ---------------------------------------------------------------------


def test_text_import_proposal_is_editable_and_confirm_creates_content(user_client):
    act = make_activity(user_client)
    r = _import_json(user_client, act["id"], "text", TEXT)
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "needs_review" and job["source"] == "text"
    assert job["started_at"] and job["finished_at"] and job["confirmed_at"] is None
    assert job["has_text_layer"] is True and job["ai_used"] is False
    assert "raw_text" not in job and "file_key" not in job
    p = job["proposal"]
    assert [s["title"] for s in p["subjects"]] == ["Gramática", "Listening"]
    assert [t["title"] for t in p["subjects"][0]["topics"]] == ["Present simple", "Past simple"]
    assert p["subjects"][1]["topics"][0] == {"title": "Podcasts curtos", "page": 12, "children": []}
    assert p["stats"]["subjects"] == 2 and p["stats"]["topics"] == 3
    assert p["stats"]["source"] == "text" and p["stats"]["truncated"] is False
    assert _tree(user_client, act["id"]) == []  # nada é criado antes da confirmação

    edited = {
        "subjects": [
            {
                "title": "Gramática",
                "topics": [
                    {
                        "title": "  Presente\tsimples ",
                        "estimated_minutes": 45,
                        "children": [{"title": "Perguntas", "page": 3}],
                    }
                ],
            },
            {"title": "Listening", "topics": [{"title": "Podcasts curtos", "page": 12}]},
        ]
    }
    r = user_client.patch(f"{API}/imports/{job['id']}", json={"proposal": edited})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "needs_review"
    p = r.json()["proposal"]
    assert p["subjects"][0]["topics"][0]["title"] == "Presente simples"  # texto saneado
    assert p["subjects"][0]["topics"][0]["children"][0]["page"] == 3
    assert p["stats"]["edited"] is True and p["stats"]["topics"] == 2
    assert p["stats"]["subtopics"] == 1 and p["stats"]["source"] == "text"
    # proposta inválida não é aceita
    r = user_client.patch(
        f"{API}/imports/{job['id']}",
        json={"proposal": {"subjects": [{"title": "", "topics": []}]}},
    )
    assert r.status_code == 422

    r = user_client.post(f"{API}/imports/{job['id']}/confirm")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["import"]["status"] == "confirmed" and body["import"]["confirmed_at"]
    assert body["created_subjects"] == 2 and body["created_topics"] == 3
    assert body["linked_topics"] == 0
    tree = _tree(user_client, act["id"])
    assert [s["title"] for s in tree] == ["Gramática", "Listening"]
    topic = tree[0]["topics"][0]
    assert topic["title"] == "Presente simples" and topic["estimated_minutes"] == 45
    assert topic["topics"][0]["title"] == "Perguntas"
    refs = _source_refs()
    assert refs["Perguntas"] == {"import_id": job["id"], "page": 3}
    assert refs["Podcasts curtos"] == {"import_id": job["id"], "page": 12}
    assert refs["Presente simples"] == {"import_id": job["id"], "page": None}
    # estado final não muda mais
    r = user_client.post(f"{API}/imports/{job['id']}/confirm")
    assert r.status_code == 409 and r.json()["error"]["code"] == "bad_state"
    r = user_client.patch(f"{API}/imports/{job['id']}", json={"proposal": edited})
    assert r.status_code == 409 and r.json()["error"]["code"] == "bad_state"
    assert user_client.post(f"{API}/imports/{job['id']}/cancel").status_code == 409
    assert user_client.get(f"{API}/imports/{job['id']}").json()["status"] == "confirmed"


def test_csv_template_and_csv_import(user_client):
    act = make_activity(user_client)
    r = user_client.get(f"{API}/imports/template.csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"] == 'attachment; filename="modelo-conteudo.csv"'
    template = r.text
    assert template.splitlines()[0] == "materia;topico;subtopico;paginas;minutos_estimados"

    r = _import_json(user_client, act["id"], "csv", template)
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "needs_review" and job["source"] == "csv"
    subjects = job["proposal"]["subjects"]
    assert [s["title"] for s in subjects] == ["Gramática", "Listening", "Vocabulário"]
    present, past = subjects[0]["topics"]
    assert present["title"] == "Present simple" and present["page"] == 12
    assert present["page_to"] == 20 and present["estimated_minutes"] == 30
    assert present["children"] == [
        {"title": "Verbos regulares", "page": 12, "page_to": 15, "estimated_minutes": 10}
    ]
    assert past["title"] == "Past simple" and past["page"] == 21 and past["page_to"] == 30
    podcasts = subjects[1]["topics"][0]
    assert podcasts["page"] is None and podcasts["estimated_minutes"] == 25
    assert subjects[2]["topics"][0]["children"][0] == {
        "title": "Aeroporto",
        "page": None,
        "page_to": None,
        "estimated_minutes": 20,
    }
    stats = job["proposal"]["stats"]
    assert stats["source"] == "csv" and stats["subjects"] == 3
    assert stats["topics"] == 4 and stats["subtopics"] == 2 and stats["lines"] == 5

    # confirmar enviando a proposta revisada no próprio corpo
    proposal = job["proposal"]
    proposal["subjects"][1]["title"] = "Listening (podcasts)"
    r = user_client.post(f"{API}/imports/{job['id']}/confirm", json={"proposal": proposal})
    assert r.status_code == 200, r.text
    assert r.json()["created_subjects"] == 3 and r.json()["created_topics"] == 6
    tree = _tree(user_client, act["id"])
    assert [s["title"] for s in tree] == ["Gramática", "Listening (podcasts)", "Vocabulário"]
    assert tree[0]["topics"][0]["estimated_minutes"] == 30
    assert tree[0]["topics"][0]["topics"][0]["title"] == "Verbos regulares"
    assert _source_refs()["Verbos regulares"] == {"import_id": job["id"], "page": 12}

    # CSV enviado como arquivo é processado na hora; vírgula e cabeçalho com acento também valem
    r = _import_file(user_client, act["id"], template.encode("utf-8"), "modelo.csv", "text/csv")
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "needs_review" and r.json()["source"] == "csv"
    assert r.json()["file_name"] == "modelo.csv"
    r = _import_json(user_client, act["id"], "csv", "Matéria,Tópico\nHistória,Brasil Colônia\n")
    assert r.status_code == 201, r.text
    assert r.json()["proposal"]["subjects"] == [
        {
            "title": "História",
            "topics": [
                {
                    "title": "Brasil Colônia",
                    "page": None,
                    "page_to": None,
                    "estimated_minutes": None,
                    "children": [],
                }
            ],
        }
    ]
    # sem o cabeçalho obrigatório
    r = _import_json(user_client, act["id"], "csv", "a;b\n1;2\n")
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "csv_header"
    assert r.json()["error"]["details"]["expected"][0] == "materia"
    assert "template.csv" in r.json()["error"]["message"]


# --- PDF -------------------------------------------------------------------------------


def test_pdf_with_text_layer_yields_items_with_pages(user_client, eager_celery):
    act = make_activity(user_client)
    r = _import_file(user_client, act["id"], TEXT_PDF, "sumario.pdf", create_material="true")
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["source"] == "pdf" and job["status"] == "needs_review", job
    assert job["has_text_layer"] is True and job["pages_total"] == 2
    assert job["material_id"] and job["error_code"] is None
    assert job["size_bytes"] == len(TEXT_PDF) and job["file_name"] == "sumario.pdf"
    subjects = job["proposal"]["subjects"]
    assert [s["title"] for s in subjects] == ["GRAMATICA", "LISTENING"]
    assert subjects[0]["topics"] == [
        {"title": "Present simple", "page": 1, "children": []},
        {"title": "Past simple", "page": 1, "children": []},
    ]
    assert subjects[1]["topics"] == [{"title": "Podcasts curtos", "page": 2, "children": []}]
    stats = job["proposal"]["stats"]
    assert stats["source"] == "pdf" and stats["pages_total"] == 2 and stats["ocr"] is False
    # o material foi criado junto, ainda sem vínculos
    m = user_client.get(f"{API}/materials/{job['material_id']}").json()
    assert m["kind"] == "pdf" and m["pages_total"] == 2 and m["topics"] == []

    r = user_client.post(f"{API}/imports/{job['id']}/confirm")
    assert r.status_code == 200, r.text
    assert r.json()["created_subjects"] == 2 and r.json()["created_topics"] == 3
    assert r.json()["linked_topics"] == 3
    m = user_client.get(f"{API}/materials/{job['material_id']}").json()
    links = sorted((x["topic_title"], x["page_from"], x["page_to"]) for x in m["topics"])
    assert links == [("Past simple", 1, 1), ("Podcasts curtos", 2, 2), ("Present simple", 1, 1)]
    assert {t: ref["page"] for t, ref in _source_refs().items()} == {
        "Present simple": 1,
        "Past simple": 1,
        "Podcasts curtos": 2,
    }
    # o arquivo do material continua disponível depois da confirmação
    assert user_client.get(_download_path(m["download_url"])).status_code == 200


def test_pdf_without_text_layer_fails_with_honest_message(user_client, eager_celery):
    act = make_activity(user_client)
    r = _import_file(user_client, act["id"], BLANK_PDF, "digitalizado.pdf")
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "failed" and job["error_code"] == "no_text_layer"
    assert job["has_text_layer"] is False and job["pages_total"] == 2
    assert job["proposal"] is None and job["material_id"] is None
    assert "OCR" in job["error_message"] and "com texto" in job["error_message"]
    assert "digitalizado" in job["error_message"]
    assert _tree(user_client, act["id"]) == []
    r = user_client.post(f"{API}/imports/{job['id']}/confirm")
    assert r.status_code == 409 and r.json()["error"]["code"] == "bad_state"
    assert r.json()["error"]["details"] == {"status": "failed"}
    lst = user_client.get(f"{API}/imports", params={"activity_id": act["id"]}).json()
    assert [j["id"] for j in lst] == [job["id"]]
    # cancelar descarta a cópia própria do arquivo
    with SessionLocal() as db:
        key = db.get(ImportJob, uuid.UUID(job["id"])).file_key
    assert key and get_storage().exists(key)
    r = user_client.post(f"{API}/imports/{job['id']}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert not get_storage().exists(key)


def test_ocr_enabled_without_engine_is_honest(user_client, eager_celery, monkeypatch):
    monkeypatch.setattr(settings, "OCR_ENABLED", True)
    monkeypatch.setitem(sys.modules, "pytesseract", None)  # import falha como se não instalado
    act = make_activity(user_client)
    job = _import_file(user_client, act["id"], BLANK_PDF, "digitalizado.pdf").json()
    assert job["status"] == "failed" and job["error_code"] == "no_text_layer"
    assert "OCR" in job["error_message"] and "não está instalado" in job["error_message"]


def test_pdf_page_limit_is_enforced(user_client, eager_celery, monkeypatch):
    monkeypatch.setattr(settings, "MAX_PDF_PAGES", 1)
    act = make_activity(user_client)
    job = _import_file(user_client, act["id"], TEXT_PDF, "grande.pdf").json()
    assert job["status"] == "failed" and job["error_code"] == "too_many_pages"
    assert "limite é 1" in job["error_message"]


def test_encrypted_pdf_is_reported():
    data = make_encrypted_pdf("segredo")
    if data is None:
        pytest.skip("backend criptográfico do pypdf indisponível")
    with pytest.raises(imports_service.ImportFailure) as exc:
        imports_service.extract_pdf_pages(data)
    assert exc.value.code == "pdf_encrypted"


# --- Isolamento e validação de entrada ---------------------------------------------------


def test_imports_are_isolated_per_user(client):
    signup(client, email="a@example.com")
    act_a = make_activity(client)
    job = _import_json(client, act_a["id"], "text", TEXT).json()
    client.cookies.clear()
    signup(client, email="b@example.com")
    assert client.get(f"{API}/imports").json() == []
    assert client.get(f"{API}/imports/{job['id']}").status_code == 404
    r = client.patch(f"{API}/imports/{job['id']}", json={"proposal": {"subjects": []}})
    assert r.status_code == 404
    assert client.post(f"{API}/imports/{job['id']}/confirm").status_code == 404
    assert client.post(f"{API}/imports/{job['id']}/cancel").status_code == 404
    # B também não importa para o objetivo de A
    assert _import_json(client, act_a["id"], "text", TEXT).status_code == 404
    assert _import_file(client, act_a["id"], TEXT_PDF, "x.pdf").status_code == 404
    with SessionLocal() as db:
        assert db.get(ImportJob, uuid.UUID(job["id"])).status == "needs_review"


def test_import_input_validation(user_client):
    act = make_activity(user_client)
    r = user_client.post(
        f"{API}/imports", json={"activity_id": act["id"], "source": "pdf", "content": "x"}
    )
    assert r.status_code == 422  # PDF só por arquivo
    r = _import_file(
        user_client, act["id"], b"PK\x03\x04binario", "apostila.docx", "application/octet-stream"
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_file"
    r = _import_file(user_client, act["id"], TEXT_PDF, "x.pdf", source="csv")
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_source"
    r = user_client.post(f"{API}/imports", files={"file": ("x.pdf", TEXT_PDF, "application/pdf")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "missing_activity"
    r = user_client.post(
        f"{API}/imports",
        files={"outro": ("x.pdf", TEXT_PDF, "application/pdf")},
        data={"activity_id": act["id"]},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "missing_file"
    r = user_client.post(
        f"{API}/imports", content=b"nao e json", headers={"Content-Type": "application/json"}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_body"
    r = user_client.post(f"{API}/imports", json={"activity_id": act["id"], "source": "text"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_failed"
    # proposta esvaziada não confirma; reprocessar um job em revisão não muda nada
    job = _import_json(user_client, act["id"], "text", "só um título\n").json()
    assert job["proposal"]["subjects"] == [{"title": "só um título", "topics": []}]
    r = user_client.patch(f"{API}/imports/{job['id']}", json={"proposal": {"subjects": []}})
    assert r.status_code == 200 and r.json()["proposal"]["subjects"] == []
    r = user_client.post(f"{API}/imports/{job['id']}/confirm")
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_proposal"
    with SessionLocal() as db:
        again = imports_service.process(db, uuid.UUID(job["id"]))
        assert again.status == "needs_review" and again.proposal["subjects"] == []
    assert user_client.get(f"{API}/imports").json()[0]["status"] == "needs_review"
