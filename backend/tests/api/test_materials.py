"""Materiais: PDF enviado (tipo real, limite, cota), link https, caminho local recusado,
URL assinada só para o dono (nunca servida como HTML), vínculo material↔tópico."""

from __future__ import annotations

import shutil
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

from app.core.config import settings
from app.core.db import SessionLocal
from app.integrations.storage import get_storage, sign_local
from app.models.content import Material
from tests.conftest import make_activity, signup
from tests.fixtures.pdf import make_text_pdf
from tests.fixtures.plans import set_free_plan_limits

API = "/api/v1"
PDF = make_text_pdf([["GRAMATICA", "1.1 Present simple"], ["LISTENING", "2.1 Podcasts"]])


@pytest.fixture(scope="module", autouse=True)
def _clean_test_storage():
    yield
    shutil.rmtree(Path(settings.STORAGE_LOCAL_PATH), ignore_errors=True)


def _upload(client, data=PDF, filename="apostila.pdf", content_type="application/pdf", **form):
    return client.post(
        f"{API}/materials/upload",
        files={"file": (filename, data, content_type)},
        data={k: v for k, v in form.items() if v is not None},
    )


def _subject(client, act_id, title="Gramática"):
    r = client.post(f"{API}/activities/{act_id}/subjects", json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


def _topic(client, subject_id, title):
    r = client.post(f"{API}/subjects/{subject_id}/topics", json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


def _download_path(url: str) -> str:
    p = urlparse(url)
    return f"{p.path}?{p.query}"


def _storage_key(url: str) -> str:
    return urlparse(url).path.split(f"{API}/files/", 1)[1]


# --- Upload -----------------------------------------------------------------------


def test_upload_valid_pdf_and_owner_download(user_client):
    act = make_activity(user_client)
    r = _upload(user_client, activity_id=act["id"], title="Apostila de inglês")
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["kind"] == "pdf" and m["title"] == "Apostila de inglês"
    assert m["mime_type"] == "application/pdf" and m["size_bytes"] == len(PDF)
    assert m["pages_total"] == 2 and m["page_from"] == 1 and m["page_to"] == 2
    assert m["file_name"] == "apostila.pdf" and m["activity_id"] == act["id"]
    assert m["download_expires_in"] == settings.SIGNED_URL_TTL_SECONDS
    url = urlparse(m["download_url"])
    assert url.path.startswith(f"{API}/files/users/")
    q = parse_qs(url.query)
    assert "exp" in q and "sig" in q
    # a lista não carrega URL assinada; só o detalhe do dono
    lst = user_client.get(f"{API}/materials", params={"activity_id": act["id"]}).json()
    assert [x["id"] for x in lst] == [m["id"]] and "download_url" not in lst[0]
    # sem título, o nome do arquivo vira título
    m2 = _upload(user_client, filename="Livro do aluno.pdf").json()
    assert m2["title"] == "Livro do aluno.pdf" and m2["activity_id"] is None
    # o download usa só a assinatura (funciona sem cookie de sessão) e nunca cacheia
    user_client.cookies.clear()
    r = user_client.get(_download_path(m["download_url"]))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"].startswith('inline; filename="apostila.pdf"')
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "private, no-store"
    assert r.content == PDF


def test_upload_rejects_files_that_are_not_pdf(user_client):
    html = b"<html><script>alert(1)</script></html>"
    # extensão e tipo declarado não valem nada: o que conta é o conteúdo
    r = _upload(user_client, data=html, filename="apostila.pdf", content_type="application/pdf")
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "not_pdf"
    assert "Envie um PDF" in r.json()["error"]["message"]
    r = _upload(user_client, data=html, filename="pagina.html", content_type="text/html")
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_pdf"
    r = _upload(user_client, data=b"", filename="vazio.pdf")
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_file"
    assert user_client.get(f"{API}/materials").json() == []


def test_upload_too_large_is_honest_and_changes_nothing(user_client, monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_MB", 1)
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024)
    r = _upload(user_client, data=big)
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "file_too_large"
    assert "1 MB" in err["message"] and "Nada do seu plano foi alterado" in err["message"]
    assert user_client.get(f"{API}/materials").json() == []


def test_upload_to_activity_of_other_user_is_refused(client):
    signup(client, email="b@example.com")
    act_b = make_activity(client)
    client.cookies.clear()
    signup(client, email="a@example.com")
    r = _upload(client, activity_id=act_b["id"])
    assert r.status_code == 404
    r = client.post(
        f"{API}/materials/link",
        json={"title": "Guia", "url": "https://exemplo.com/guia", "activity_id": act_b["id"]},
    )
    assert r.status_code == 404
    assert client.get(f"{API}/materials").json() == []


# --- Links e caminhos locais ------------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        "C:\\Estudos\\apostila.pdf",
        "/home/usuario/apostila.pdf",
        "C:/Estudos/apostila.pdf",
        "file:///home/usuario/apostila.pdf",
        "\\\\servidor\\apostilas\\ingles.pdf",
        "~/Downloads/apostila.pdf",
    ],
)
def test_local_paths_are_refused(user_client, url):
    r = user_client.post(f"{API}/materials/link", json={"title": "Apostila", "url": url})
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "local_path"
    assert "caminho do seu computador" in err["message"] and "https://" in err["message"]
    assert user_client.get(f"{API}/materials").json() == []


def test_http_link_refused_and_https_accepted(user_client):
    for url in ("http://exemplo.com/apostila.pdf", "ftp://exemplo.com/apostila.pdf", "exemplo.com"):
        r = user_client.post(f"{API}/materials/link", json={"title": "Apostila", "url": url})
        assert r.status_code == 422, url
        assert r.json()["error"]["code"] == "bad_url"
    r = user_client.post(
        f"{API}/materials/link",
        json={
            "title": "Apostila",
            "url": " https://exemplo.com/apostila.pdf ",
            "description": "capítulo 3",
        },
    )
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["kind"] == "link" and m["url"] == "https://exemplo.com/apostila.pdf"
    assert m["description"] == "capítulo 3"
    assert m["download_url"] is None  # o servidor não busca nem serve o link (sem SSRF)


# --- URL assinada -------------------------------------------------------------------


def test_signed_url_is_owner_only_and_signature_is_verified(client):
    signup(client, email="a@example.com")
    m = _upload(client).json()
    path = _download_path(m["download_url"])
    key = _storage_key(m["download_url"])
    q = parse_qs(urlparse(m["download_url"]).query)
    exp, sig = q["exp"][0], q["sig"][0]

    # outro usuário não vê o material, logo não recebe URL
    client.cookies.clear()
    signup(client, email="b@example.com")
    assert client.get(f"{API}/materials/{m['id']}").status_code == 404
    assert client.patch(f"{API}/materials/{m['id']}", json={"title": "x"}).status_code == 404
    assert client.delete(f"{API}/materials/{m['id']}").status_code == 404
    assert client.get(f"{API}/materials").json() == []

    # assinatura forjada
    r = client.get(f"{API}/files/{key}", params={"exp": exp, "sig": "0" * 64})
    assert r.status_code == 403 and r.json()["error"]["code"] == "bad_signature"
    # validade adulterada
    r = client.get(f"{API}/files/{key}", params={"exp": int(exp) + 3600, "sig": sig})
    assert r.status_code == 403
    # assinatura válida de um arquivo usada em outra chave
    r = client.get(f"{API}/files/users/x/materials/outro.pdf", params={"exp": exp, "sig": sig})
    assert r.status_code == 403
    # assinatura correta mas já vencida (o link expira com o tempo)
    old = int(time.time()) - 10
    r = client.get(f"{API}/files/{key}", params={"exp": old, "sig": sign_local(key, old)})
    assert r.status_code == 403 and r.json()["error"]["code"] == "bad_signature"
    assert "expirado" in r.json()["error"]["message"]
    # assinatura válida para um arquivo que não existe
    missing = "users/x/materials/nada.pdf"
    fresh = int(time.time()) + 60
    r = client.get(
        f"{API}/files/{missing}", params={"exp": fresh, "sig": sign_local(missing, fresh)}
    )
    assert r.status_code == 404
    # a URL legítima continua funcionando dentro da validade, sem sessão
    client.cookies.clear()
    assert client.get(path).status_code == 200


def test_files_route_never_serves_html(client):
    data = signup(client, email="a@example.com")
    uid = data["user"]["id"]
    storage = get_storage()
    payload = b"<html><script>alert(1)</script></html>"
    key = f"users/{uid}/materials/evil.html"
    storage.put(key, payload, "text/html")
    with SessionLocal() as db:
        db.add(
            Material(
                user_id=uuid.UUID(uid),
                kind="pdf",
                title="Evil",
                file_key=key,
                file_name="evil.html",
                mime_type="text/html",
                size_bytes=len(payload),
            )
        )
        db.commit()
    url = storage.signed_url(key, filename="evil.html", content_type="text/html", ttl=60)
    r = client.get(_download_path(url))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["content-disposition"].startswith('attachment; filename="evil.html"')
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.content == payload
    # sem registro de material o padrão também é download genérico
    key2 = f"users/{uid}/imports/{uuid.uuid4()}.pdf"
    storage.put(key2, payload, "text/html")
    url2 = storage.signed_url(key2, filename="x.html", content_type="text/html", ttl=60)
    r = client.get(_download_path(url2))
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/octet-stream"
    assert r.headers["content-disposition"].startswith('attachment; filename="arquivo.bin"')


# --- Vínculo com tópicos -----------------------------------------------------------------


def test_link_topic_with_pages_last_position_and_unlink(client):
    signup(client, email="b@example.com")
    act_b = make_activity(client)
    s_b = _subject(client, act_b["id"])
    t_b = _topic(client, s_b["id"], "Tópico da B")
    client.cookies.clear()
    signup(client, email="a@example.com")
    act = make_activity(client)
    s = _subject(client, act["id"])
    t1 = _topic(client, s["id"], "Present simple")
    t2 = _topic(client, s["id"], "Past simple")
    m = _upload(client, activity_id=act["id"]).json()

    r = client.post(
        f"{API}/materials/{m['id']}/topics",
        json={
            "topic_id": t1["id"],
            "page_from": 12,
            "page_to": 20,
            "note": "capítulo 2",
            "last_position": "p. 15",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["topics"] == [
        {
            "topic_id": t1["id"],
            "page_from": 12,
            "page_to": 20,
            "note": "capítulo 2",
            "last_position": "p. 15",
            "topic_title": "Present simple",
            "subject_id": s["id"],
        }
    ]
    # vincular de novo atualiza o mesmo vínculo (sem duplicar)
    r = client.post(
        f"{API}/materials/{m['id']}/topics",
        json={"topic_id": t1["id"], "page_from": 12, "page_to": 25, "last_position": "p. 18"},
    )
    assert r.status_code == 201, r.text
    assert len(r.json()["topics"]) == 1
    assert r.json()["topics"][0]["page_to"] == 25 and r.json()["topics"][0]["note"] is None
    r = client.post(f"{API}/materials/{m['id']}/topics", json={"topic_id": t2["id"]})
    assert r.status_code == 201 and len(r.json()["topics"]) == 2
    # páginas invertidas e tópico de outro usuário
    r = client.post(
        f"{API}/materials/{m['id']}/topics",
        json={"topic_id": t2["id"], "page_from": 30, "page_to": 10},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_pages"
    r = client.post(f"{API}/materials/{m['id']}/topics", json={"topic_id": t_b["id"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_topic"
    # último ponto do material em si
    r = client.patch(f"{API}/materials/{m['id']}", json={"last_position": " p. 46 "})
    assert r.status_code == 200 and r.json()["last_position"] == "p. 46"
    lst = client.get(f"{API}/materials").json()
    assert {t["topic_id"] for t in lst[0]["topics"]} == {t1["id"], t2["id"]}
    # desvincular (idempotente)
    r = client.delete(f"{API}/materials/{m['id']}/topics/{t1['id']}")
    assert r.status_code == 200 and [t["topic_id"] for t in r.json()["topics"]] == [t2["id"]]
    r = client.delete(f"{API}/materials/{m['id']}/topics/{t1['id']}")
    assert r.status_code == 200 and len(r.json()["topics"]) == 1
    # apagar o tópico remove o vínculo; o material fica
    assert client.delete(f"{API}/topics/{t2['id']}").status_code == 200
    assert client.get(f"{API}/materials/{m['id']}").json()["topics"] == []


# --- Cotas, físico, exclusão -------------------------------------------------------------


def test_plan_quota_for_materials_and_storage(user_client):
    set_free_plan_limits(max_materials=2)
    for i in range(2):
        r = user_client.post(
            f"{API}/materials/link", json={"title": f"Link {i}", "url": f"https://exemplo.com/{i}"}
        )
        assert r.status_code == 201, r.text
    first = r.json()["id"]
    r = user_client.post(f"{API}/materials/physical", json={"title": "Livro", "pages_total": 300})
    assert r.status_code == 402, r.text
    assert r.json()["error"]["code"] == "materials_limit"
    assert "até 2 materiais" in r.json()["error"]["message"]
    r = _upload(user_client)
    assert r.status_code == 402 and r.json()["error"]["code"] == "materials_limit"
    assert len(user_client.get(f"{API}/materials").json()) == 2
    # remover um libera a vaga
    assert user_client.delete(f"{API}/materials/{first}").status_code == 200
    r = user_client.post(f"{API}/materials/physical", json={"title": "Livro", "pages_total": 300})
    assert r.status_code == 201
    # cota de armazenamento só conta para arquivos
    set_free_plan_limits(max_materials=20, materials_storage_mb=0)
    r = _upload(user_client)
    assert r.status_code == 402 and r.json()["error"]["code"] == "storage_quota"
    r = user_client.post(f"{API}/materials/link", json={"title": "Outro", "url": "https://e.com/a"})
    assert r.status_code == 201


def test_physical_material_update_and_delete(user_client):
    r = user_client.post(
        f"{API}/materials/physical",
        json={"title": "Livro de gramática", "page_from": 10, "page_to": 5},
    )
    assert r.status_code == 422
    r = user_client.post(
        f"{API}/materials/physical",
        json={"title": "Livro de gramática", "page_from": 1, "page_to": 300, "pages_total": 300},
    )
    assert r.status_code == 201, r.text
    m = r.json()
    assert m["kind"] == "physical" and m["download_url"] is None and m["pages_total"] == 300
    r = user_client.patch(f"{API}/materials/{m['id']}", json={"page_from": 50, "page_to": 40})
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_pages"
    r = user_client.patch(
        f"{API}/materials/{m['id']}",
        json={"page_to": 120, "last_position": "p. 46", "description": "3ª edição"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["page_from"] == 1 and r.json()["page_to"] == 120
    assert r.json()["last_position"] == "p. 46" and r.json()["description"] == "3ª edição"
    r = user_client.delete(f"{API}/materials/{m['id']}")
    assert r.status_code == 200 and r.json()["ok"] is True
    assert user_client.get(f"{API}/materials/{m['id']}").status_code == 404


def test_delete_pdf_removes_stored_file_and_account_deletion_clears_files(user_client):
    m = _upload(user_client).json()
    key = _storage_key(m["download_url"])
    assert get_storage().exists(key)
    assert user_client.delete(f"{API}/materials/{m['id']}").status_code == 200
    assert not get_storage().exists(key)
    assert user_client.get(f"{API}/materials").json() == []
    # excluir a conta apaga os arquivos que sobraram
    m2 = _upload(user_client).json()
    key2 = _storage_key(m2["download_url"])
    assert get_storage().exists(key2)
    r = user_client.post(
        f"{API}/me/delete", json={"password": "senha-forte-123", "confirm": "EXCLUIR"}
    )
    assert r.status_code == 200, r.text
    assert not get_storage().exists(key2)
