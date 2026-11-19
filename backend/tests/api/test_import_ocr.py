"""OCR na importação de PDF digitalizado: desligado por padrão; ligado, lê um arquivo por vez,
remonta as linhas pela posição das palavras e marca a proposta quando a leitura ficou incompleta.

O Tesseract não roda aqui (não está na máquina de testes): o que se testa é tudo em volta dele.
A leitura real é conferida dentro da imagem Docker (ver docs/importacao-e-materiais.md).
"""

from __future__ import annotations

import uuid

import pytest

from app.core.config import settings
from app.core.db import SessionLocal
from app.jobs.celery_app import celery_app
from app.models.content import ImportJob
from app.services import imports as imports_service
from app.services import ocr
from tests.api.test_imports import API, BLANK_PDF, _import_file
from tests.conftest import make_activity


@pytest.fixture
def eager_celery():
    previous = celery_app.conf.task_always_eager
    celery_app.conf.task_always_eager = True
    yield
    celery_app.conf.task_always_eager = previous


# --- das palavras às linhas -------------------------------------------------------------


def words(*items: tuple[str, int, int, int, tuple[int, int, int]]) -> dict:
    """Saída do Tesseract (`image_to_data`): texto, esquerda, topo, largura e (bloco, par, linha)."""
    data = {k: [] for k in ("text", "conf", "left", "top", "width", "height")}
    data |= {"block_num": [], "par_num": [], "line_num": []}
    for text, left, top, width, (block, par, line) in items:
        data["text"].append(text)
        data["conf"].append(92.0)
        data["left"].append(left)
        data["top"].append(top)
        data["width"].append(width)
        data["height"].append(30)
        data["block_num"].append(block)
        data["par_num"].append(par)
        data["line_num"].append(line)
    return data


def test_table_rows_are_rebuilt_from_word_positions():
    """O Tesseract separa a tabela em blocos (números, conteúdo, caixas). As linhas são
    remontadas pela altura: o número fica na linha do texto com que divide a altura, ou sozinho
    entre duas linhas. As caixas de marcação, lidas como letras soltas, saem."""
    data = words(
        # bloco 1: coluna dos números (item 1 de três linhas, item 2 de duas)
        ("1", 150, 144, 20, (1, 1, 1)),
        ("2", 150, 254, 20, (1, 1, 2)),
        # bloco 2: conteúdo
        ("Antiguidade.", 240, 100, 200, (2, 1, 1)),
        ("Grécia", 460, 100, 100, (2, 1, 1)),
        ("e", 240, 144, 20, (2, 1, 2)),
        ("Roma.", 270, 144, 90, (2, 1, 2)),
        ("Cidades-Estado.", 240, 188, 250, (2, 1, 3)),
        ("Idade", 240, 232, 90, (2, 2, 1)),
        ("Média.", 340, 232, 100, (2, 2, 1)),
        ("Feudalismo.", 240, 276, 190, (2, 2, 2)),
        # bloco 3: caixas de marcação, lidas como letras
        ("O", 1330, 144, 24, (3, 1, 1)),
        ("O", 1400, 144, 24, (3, 1, 1)),
        ("O", 1470, 144, 24, (3, 1, 1)),
        ("O", 1330, 254, 24, (3, 1, 2)),
        ("D", 1400, 254, 24, (3, 1, 2)),
        ("O", 1470, 254, 24, (3, 1, 2)),
    )
    assert ocr.rows_from_words(data, 1654).split("\n") == [
        "Antiguidade. Grécia",
        "1 e Roma.",  # altura ímpar: o número divide a linha do meio
        "Cidades-Estado.",
        "Idade Média.",
        "2",  # altura par: o número sai sozinho, entre as duas linhas
        "Feudalismo.",
    ]


def test_two_text_columns_are_read_one_after_the_other():
    items = []
    for n in range(8):
        y = 100 + n * 50
        items.append((f"esquerda{n}", 120, y, 300, (1, 1, n + 1)))
        items.append(("texto.", 440, y, 120, (1, 1, n + 1)))
        items.append((f"direita{n}", 900, y, 300, (2, 1, n + 1)))
        items.append(("texto.", 1220, y, 120, (2, 1, n + 1)))
    rows = ocr.rows_from_words(words(*items), 1654).split("\n")
    assert rows == [f"esquerda{n} texto." for n in range(8)] + [
        f"direita{n} texto." for n in range(8)
    ]


def test_low_confidence_noise_is_dropped_and_boxes_need_a_pair():
    data = words(("Processo", 200, 100, 150, (1, 1, 1)), ("O", 400, 100, 20, (1, 1, 1)))
    assert ocr.rows_from_words(data, 1654) == "Processo O"  # uma letra só não é caixa
    data["conf"][0] = 3.0  # borda de tabela lida como texto
    assert ocr.rows_from_words(data, 1654) == ""  # sobra uma letra solta: rabisco
    assert ocr.rows_from_words(words(), 1654) == ""
    # restos de tabela ao lado do número e caixas lidas como uma palavra só
    assert ocr._clean_row("1 = . R Doo") == "1"
    assert ocr._clean_row("3 Idade Moderna. Dodo") == "3 Idade Moderna."
    assert ocr._clean_row("| Antiguidade. Grécia e Roma |") == "Antiguidade. Grécia e Roma"
    assert ocr._clean_row('"Nº Conteúdo') == "Nº Conteúdo"
    assert ocr._clean_row("5 nono") == "5" and ocr._clean_row("no nono ano") == "no nono ano"
    assert ocr._clean_row("L 5 | População. Migrações.") == "5 População. Migrações."
    # canto da tabela + número: fica o número (fora da sequência, o leitor de itens o ignora)
    assert ocr._clean_row("L 4") == "4" and ocr._clean_row("e a") == ""
    assert ocr._clean_row("Tipos de clima do") == "Tipos de clima do"


def test_only_one_ocr_at_a_time(tmp_path):
    lock = str(tmp_path / "ocr.lock")
    with ocr.one_at_a_time(lock):
        with pytest.raises(ocr.OcrBusy), ocr.one_at_a_time(lock):
            pass
    with ocr.one_at_a_time(lock):  # liberada ao sair
        pass


# --- no fluxo de importação -------------------------------------------------------------

SCANNED = [
    (
        1,
        "Matematica Basica\n1\nConjuntos numericos. Operacoes com\nnaturais e inteiros. ☐\n"
        "2 Razao e proporcao. ☐\n3 Equacoes. ☐\n4 Funcoes. ☐",
    ),
    (
        2,
        "Lingua Portuguesa\n1 Fonologia. ☐\n2 Morfologia. ☐\n3 Sintaxe. ☐\n4 Pontuacao. ☐",
    ),
]


def fake_ocr(pages, *, total=2, truncated=False):
    def run(data: bytes) -> ocr.OcrResult:
        assert data.startswith(b"%PDF")
        return ocr.OcrResult(pages=pages, total=total, truncated=truncated, seconds=1.0)

    return run


def test_scanned_pdf_is_refused_while_ocr_is_off(user_client, eager_celery, monkeypatch):
    monkeypatch.setattr(ocr, "ocr_pdf", lambda data: pytest.fail("OCR não pode rodar desligado"))
    act = make_activity(user_client)
    job = _import_file(user_client, act["id"], BLANK_PDF, "digitalizado.pdf").json()
    assert job["status"] == "failed" and job["error_code"] == "no_text_layer"
    assert "OCR" in job["error_message"] and "não está disponível" in job["error_message"]


def test_scanned_pdf_is_read_with_ocr_on(user_client, eager_celery, monkeypatch):
    monkeypatch.setattr(settings, "OCR_ENABLED", True)
    monkeypatch.setattr(ocr, "ocr_pdf", fake_ocr(SCANNED))
    act = make_activity(user_client)
    r = _import_file(user_client, act["id"], BLANK_PDF, "digitalizado.pdf")
    assert r.status_code == 201, r.text
    job = r.json()
    assert job["status"] == "needs_review" and job["has_text_layer"] is False, job
    stats = job["proposal"]["stats"]
    assert stats["ocr"] is True and stats["layout"] == "numbered" and stats["truncated"] is False
    subjects = job["proposal"]["subjects"]
    assert [s["title"] for s in subjects] == ["Matematica Basica", "Lingua Portuguesa"]
    assert subjects[0]["topics"][0] == {
        "title": "Conjuntos numericos",
        "page": 1,
        "children": [{"title": "Operacoes com naturais e inteiros", "page": 1}],
    }
    assert [t["title"] for t in subjects[1]["topics"]] == [
        "Fonologia",
        "Morfologia",
        "Sintaxe",
        "Pontuacao",
    ]
    r = user_client.post(f"{API}/imports/{job['id']}/confirm")
    assert r.status_code == 200 and r.json()["created_subjects"] == 2


def test_partial_ocr_is_marked_as_incomplete(user_client, eager_celery, monkeypatch):
    monkeypatch.setattr(settings, "OCR_ENABLED", True)
    monkeypatch.setattr(ocr, "ocr_pdf", fake_ocr(SCANNED[:1], total=90, truncated=True))
    act = make_activity(user_client)
    job = _import_file(user_client, act["id"], BLANK_PDF, "livro.pdf").json()
    assert job["status"] == "needs_review"
    assert job["proposal"]["stats"]["truncated"] is True and job["proposal"]["stats"]["ocr"] is True


def test_ocr_that_reads_nothing_fails_honestly(user_client, eager_celery, monkeypatch):
    monkeypatch.setattr(settings, "OCR_ENABLED", True)
    monkeypatch.setattr(ocr, "ocr_pdf", fake_ocr([(1, ""), (2, "  ")]))
    act = make_activity(user_client)
    job = _import_file(user_client, act["id"], BLANK_PDF, "borrado.pdf").json()
    assert job["status"] == "failed" and job["error_code"] == "no_text_layer"
    assert "não reconheceu texto suficiente" in job["error_message"]


def test_busy_ocr_sends_the_job_back_to_the_queue(user_client, monkeypatch):
    """Com outro arquivo em leitura, a importação não falha nem prende o worker: volta para a
    fila (a tarefa tenta de novo em seguida)."""
    monkeypatch.setattr(settings, "OCR_ENABLED", True)

    def busy(data: bytes):
        raise ocr.OcrBusy

    monkeypatch.setattr(ocr, "ocr_pdf", busy)
    # sem worker neste teste: o envio só cria o job, e o processamento é chamado à mão
    monkeypatch.setattr("app.api.v1.imports._enqueue", lambda db, job: None)
    act = make_activity(user_client)
    job = _import_file(user_client, act["id"], BLANK_PDF, "digitalizado.pdf").json()
    assert job["status"] == "queued"
    with SessionLocal() as db:
        row = db.get(ImportJob, uuid.UUID(job["id"]))
        with pytest.raises(ocr.OcrBusy):
            imports_service.process(db, row.id)
        db.rollback()
        assert db.get(ImportJob, row.id).status == "processing"  # o que `process` já gravou
        imports_service.requeue(db, row.id)
        db.commit()
        assert db.get(ImportJob, row.id).status == "queued"
        # na vez dela, a leitura acontece
        monkeypatch.setattr(ocr, "ocr_pdf", fake_ocr(SCANNED))
        imports_service.process(db, row.id)
        db.commit()
        assert db.get(ImportJob, row.id).status == "needs_review"
