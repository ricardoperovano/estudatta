"""Importação de conteúdo programático: texto, CSV ou PDF → proposta editável → matérias/tópicos.

Princípios:
- o conteúdo do documento é **dado não confiável**: nunca é executado nem interpretado,
  só passa por heurísticas determinísticas e sanitização de texto;
- nada é criado sem confirmação do usuário (`status='needs_review'` → `confirm`);
- limites explícitos (tamanho, páginas, tempo de extração) com mensagens honestas;
- PDF sem camada de texto **falha** com `no_text_layer` (nunca fingimos sucesso).
"""

from __future__ import annotations

import csv
import io
import re
import time
import unicodedata
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.timeutil import utcnow
from app.integrations.storage import get_storage
from app.models.activity import Activity
from app.models.content import ImportJob, Material, MaterialTopic, Subject, Topic
from app.models.user import User
from app.schemas.imports import MAX_SUBJECTS, MAX_TOPICS, ProposalIn, clean_title
from app.services import materials as materials_service

MAX_TEXT_CHARS = 400_000  # texto/CSV colado ou enviado
MAX_LINES = 20_000
MAX_RAW_TEXT_CHARS = 1_500_000  # texto extraído de PDF guardado no job
MIN_CHARS_TEXT_LAYER = 20  # página com menos que isso conta como "sem texto"
NO_TEXT_LAYER_RATIO = 0.9  # ≥ 90% das páginas sem texto → sem camada de texto
CSV_REQUIRED = ("materia", "topico")
CSV_COLUMNS = ("materia", "topico", "subtopico", "paginas", "minutos_estimados")
SYNC_SOURCES = ("text", "csv")
DEFAULT_SUBJECT_TITLE = "Geral"


class ImportFailure(ValidationFailed):
    """Falha de processamento com código estável (vira `error_code` do job ou 422 no caminho síncrono)."""


@dataclass
class Line:
    text: str
    page: int | None = None


# --- Heurística de texto ---------------------------------------------------------

RE_NUM3 = re.compile(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})[.)]?\s+")
RE_NUM2 = re.compile(r"^(\d{1,3})\.(\d{1,3})[.)]?\s+")
RE_NUM1 = re.compile(r"^(\d{1,3})[.)]\s+")
RE_ROMAN = re.compile(r"^([IVXLC]{1,7})[.)]\s+")
RE_HASH = re.compile(r"^(#{1,6})\s+")
RE_BULLET = re.compile(r"^([-•*–—▪◦·])\s+")
RE_LETTER = re.compile(r"^([a-z])[.)]\s+")
RE_PAGE_REF = re.compile(
    r"(?:\s*\.{2,}\s*|\s+\(?(?:p|pg|pág|pag)\.?\s*|\s+[-–]\s+p\.?\s*)(\d{1,5})\)?\.?\s*$",
    re.IGNORECASE,
)
RE_ONLY_NOISE = re.compile(r"^[\W\d_]+$")


def _looks_like_heading(s: str) -> bool:
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 2 or len(s) > 90:
        return False
    if s.endswith((".", ",", ";", ":")):
        return False
    return s[:1].isupper() or s.isupper()


def _classify(raw: str, *, strict: bool, has_subject: bool) -> tuple[int, str, int | None] | None:
    """Classifica uma linha em (nível 0/1/2, título, página referenciada) ou None para ignorar.

    Nível 0 = matéria; 1 = tópico; 2 = subtópico. Determinístico, sem IA.
    `strict` (PDF): ignora linhas que parecem texto corrido.
    """
    expanded = raw.replace("\t", "    ")
    stripped = expanded.strip()
    if len(stripped) < 2 or RE_ONLY_NOISE.match(stripped):
        return None
    indent = len(expanded) - len(expanded.lstrip(" "))
    ind_level = 0 if indent == 0 else (1 if indent < 6 else 2)

    page_ref: int | None = None
    m = RE_PAGE_REF.search(stripped)
    if m and m.start() > 0:
        page_ref = int(m.group(1))
        stripped = stripped[: m.start()].rstrip()
        if not stripped:
            return None

    if m := RE_NUM3.match(stripped):
        return 2, stripped[m.end() :], page_ref
    if m := RE_NUM2.match(stripped):
        return 1, stripped[m.end() :], page_ref
    if m := RE_NUM1.match(stripped):
        return ind_level, stripped[m.end() :], page_ref
    if m := RE_ROMAN.match(stripped):
        return min(ind_level, 1), stripped[m.end() :], page_ref
    if m := RE_HASH.match(stripped):
        return min(len(m.group(1)) - 1, 2), stripped[m.end() :], page_ref
    if (m := RE_BULLET.match(stripped)) or (m := RE_LETTER.match(stripped)):
        return min(2, max(1, ind_level)), stripped[m.end() :], page_ref

    # linha sem marcador
    if not strict:
        return ind_level, stripped, page_ref
    if stripped.isupper() and _looks_like_heading(stripped):
        return 0, stripped, page_ref
    if page_ref is not None:
        return (1 if has_subject else 0), stripped, page_ref
    if _looks_like_heading(stripped):
        return (max(1, ind_level) if has_subject else 0), stripped, page_ref
    return None


def _empty_stats(source: str) -> dict:
    return {
        "source": source,
        "lines": 0,
        "skipped": 0,
        "subjects": 0,
        "topics": 0,
        "subtopics": 0,
        "truncated": False,
    }


def build_proposal(lines: list[Line], *, source: str = "text", strict: bool = False) -> dict:
    subjects: list[dict] = []
    cur_subject: dict | None = None
    cur_topic: dict | None = None
    stats = _empty_stats(source)
    n_topics = 0
    for ln in lines:
        if stats["lines"] >= MAX_LINES:
            stats["truncated"] = True
            break
        stats["lines"] += 1
        c = _classify(ln.text, strict=strict, has_subject=cur_subject is not None)
        if c is None:
            stats["skipped"] += 1
            continue
        level, title, page_ref = c
        title = clean_title(title)
        if not title:
            stats["skipped"] += 1
            continue
        page = page_ref if page_ref is not None else ln.page
        if level == 0:
            if len(subjects) >= MAX_SUBJECTS:
                stats["truncated"] = True
                break
            cur_subject = {"title": title, "topics": []}
            subjects.append(cur_subject)
            cur_topic = None
            continue
        if n_topics >= MAX_TOPICS:
            stats["truncated"] = True
            break
        if cur_subject is None:
            cur_subject = {"title": DEFAULT_SUBJECT_TITLE, "topics": []}
            subjects.append(cur_subject)
        if level == 1 or cur_topic is None:
            cur_topic = {"title": title, "page": page, "children": []}
            cur_subject["topics"].append(cur_topic)
        else:
            cur_topic["children"].append({"title": title, "page": page})
        n_topics += 1
    stats["subjects"] = len(subjects)
    stats["topics"] = sum(len(s["topics"]) for s in subjects)
    stats["subtopics"] = sum(len(t["children"]) for s in subjects for t in s["topics"])
    return {"subjects": subjects, "stats": stats}


def parse_text(content: str) -> dict:
    return build_proposal([Line(t) for t in content.splitlines()], source="text")


# --- CSV -------------------------------------------------------------------------


def _norm_col(name: str) -> str:
    s = unicodedata.normalize("NFKD", name.strip().lower().lstrip("﻿"))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[\s\-]+", "_", s)


def _parse_pages(raw: str) -> tuple[int | None, int | None]:
    nums = [int(n) for n in re.findall(r"\d{1,5}", raw or "")]
    if not nums:
        return None, None
    first = nums[0]
    last = nums[1] if len(nums) > 1 and nums[1] >= first else None
    return (first or None), last


def _parse_minutes(raw: str) -> int | None:
    m = re.search(r"\d{1,5}", raw or "")
    if not m:
        return None
    v = int(m.group(0))
    return v if 1 <= v <= 6000 else None


def parse_csv(content: str) -> dict:
    content = content.lstrip("﻿")
    first = next((ln for ln in content.splitlines() if ln.strip()), "")
    if not first:
        raise ImportFailure("O CSV está vazio.", code="csv_empty")
    delimiter = ";" if first.count(";") >= first.count(",") else ","
    rows = list(csv.reader(io.StringIO(content), delimiter=delimiter))
    header = [_norm_col(c) for c in rows[0]] if rows else []
    if not all(c in header for c in CSV_REQUIRED):
        raise ImportFailure(
            "Cabeçalho obrigatório não encontrado. Use as colunas "
            "materia;topico;subtopico;paginas;minutos_estimados (baixe o modelo em /imports/template.csv).",
            code="csv_header",
            details={"expected": list(CSV_COLUMNS), "found": header},
        )
    idx = {c: i for i, c in enumerate(header)}

    def cell(row: list[str], col: str) -> str:
        i = idx.get(col)
        return row[i].strip() if i is not None and i < len(row) else ""

    subjects: dict[str, dict] = {}
    order: list[dict] = []
    stats = _empty_stats("csv")
    last_subject: dict | None = None
    last_topic: dict | None = None
    n_topics = 0
    for row in rows[1:]:
        if stats["lines"] >= MAX_LINES:
            stats["truncated"] = True
            break
        stats["lines"] += 1
        if not any(c.strip() for c in row):
            stats["skipped"] += 1
            continue
        materia = clean_title(cell(row, "materia"))
        topico = clean_title(cell(row, "topico"))
        sub = clean_title(cell(row, "subtopico"))
        page, page_to = _parse_pages(cell(row, "paginas"))
        minutes = _parse_minutes(cell(row, "minutos_estimados"))
        if materia:
            subject = subjects.get(materia.casefold())
            if subject is None:
                if len(order) >= MAX_SUBJECTS:
                    stats["truncated"] = True
                    break
                subject = {"title": materia, "topics": []}
                subjects[materia.casefold()] = subject
                order.append(subject)
            if subject is not last_subject:
                last_topic = None
            last_subject = subject
        if last_subject is None:
            last_subject = {"title": DEFAULT_SUBJECT_TITLE, "topics": []}
            subjects[DEFAULT_SUBJECT_TITLE.casefold()] = last_subject
            order.append(last_subject)
        if not topico and not sub:
            continue  # linha só com matéria: cria a matéria vazia
        if n_topics >= MAX_TOPICS:
            stats["truncated"] = True
            break
        if topico:
            existing = next(
                (t for t in last_subject["topics"] if t["title"].casefold() == topico.casefold()),
                None,
            )
            if existing is None:
                existing = {
                    "title": topico,
                    "page": None,
                    "page_to": None,
                    "estimated_minutes": None,
                    "children": [],
                }
                last_subject["topics"].append(existing)
                n_topics += 1
            last_topic = existing
            if not sub:
                if page is not None:
                    existing["page"], existing["page_to"] = page, page_to
                if minutes is not None:
                    existing["estimated_minutes"] = minutes
                continue
        if sub:
            if last_topic is None:
                last_topic = {
                    "title": sub,
                    "page": page,
                    "page_to": page_to,
                    "estimated_minutes": minutes,
                    "children": [],
                }
                last_subject["topics"].append(last_topic)
                n_topics += 1
                continue
            last_topic["children"].append(
                {"title": sub, "page": page, "page_to": page_to, "estimated_minutes": minutes}
            )
            n_topics += 1
    stats["subjects"] = len(order)
    stats["topics"] = sum(len(s["topics"]) for s in order)
    stats["subtopics"] = sum(len(t["children"]) for s in order for t in s["topics"])
    return {"subjects": order, "stats": stats}


# --- PDF -------------------------------------------------------------------------


def extract_pdf_pages(data: bytes) -> tuple[list[tuple[int, str]], int]:
    """Extrai texto por página com limites de páginas e de tempo. Retorna ([(página, texto)], total)."""
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception as exc:  # noqa: BLE001
                raise ImportFailure(
                    "O PDF está protegido por senha. Remova a senha e envie novamente.",
                    code="pdf_encrypted",
                ) from exc
        total = len(reader.pages)
    except ImportFailure:
        raise
    except Exception as exc:  # noqa: BLE001
        raise ImportFailure(
            "Não foi possível ler o PDF. O arquivo pode estar corrompido.", code="pdf_unreadable"
        ) from exc
    if total > settings.MAX_PDF_PAGES:
        raise ImportFailure(
            f"O PDF tem {total} páginas; o limite é {settings.MAX_PDF_PAGES}. "
            "Envie só as páginas do sumário ou divida o arquivo.",
            code="too_many_pages",
        )
    started = time.monotonic()
    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        if time.monotonic() - started > settings.PDF_EXTRACTION_TIMEOUT_SECONDS:
            raise ImportFailure(
                f"A extração passou de {settings.PDF_EXTRACTION_TIMEOUT_SECONDS} s na página {i} de {total}. "
                "Envie um PDF menor ou só as páginas do sumário.",
                code="pdf_timeout",
            )
        try:
            text = page.extract_text() or ""
        except Exception:  # noqa: BLE001
            text = ""
        pages.append((i, text))
    return pages, total


def has_text_layer(pages: list[tuple[int, str]]) -> bool:
    if not pages:
        return False
    empty = sum(1 for _, t in pages if len(t.strip()) < MIN_CHARS_TEXT_LAYER)
    return (empty / len(pages)) < NO_TEXT_LAYER_RATIO


def _try_ocr(data: bytes) -> tuple[list[tuple[int, str]] | None, str]:
    """OCR opcional: só se OCR_ENABLED e `pytesseract` estiver instalado. Nunca finge sucesso."""
    if not settings.OCR_ENABLED:
        return None, (
            "O reconhecimento de texto em imagens (OCR) não está disponível. Gere uma versão "
            "com texto (por exemplo, 'PDF pesquisável' no scanner ou exportação do editor original) "
            "ou cole o sumário como texto."
        )
    try:
        import pytesseract  # type: ignore[import-not-found]
        from pypdf import PdfReader
    except ImportError:
        return None, (
            "O OCR está habilitado na configuração, mas o componente de reconhecimento não está "
            "instalado neste servidor. Envie uma versão do PDF com texto ou cole o sumário."
        )
    out: list[tuple[int, str]] = []
    started = time.monotonic()
    try:
        reader = PdfReader(io.BytesIO(data))
        for i, page in enumerate(reader.pages, start=1):
            if time.monotonic() - started > settings.PDF_EXTRACTION_TIMEOUT_SECONDS:
                break
            text = ""
            try:
                for img in page.images:
                    text += pytesseract.image_to_string(img.image, lang="por+eng") + "\n"
            except Exception:  # noqa: BLE001
                pass
            out.append((i, text))
    except Exception:  # noqa: BLE001
        return None, "O OCR falhou ao ler o arquivo. Envie uma versão do PDF com texto."
    if not has_text_layer(out):
        return None, "O OCR não reconheceu texto suficiente. Envie uma versão do PDF com texto."
    return out, ""


def pdf_lines(pages: list[tuple[int, str]]) -> list[Line]:
    lines: list[Line] = []
    for page_no, text in pages:
        for raw in text.splitlines():
            lines.append(Line(raw, page_no))
    return lines


def _process_pdf(job: ImportJob) -> dict:
    if not job.file_key:
        raise ImportFailure("Arquivo da importação não encontrado.", code="missing_file")
    try:
        data = get_storage().get(job.file_key)
    except Exception as exc:  # noqa: BLE001
        raise ImportFailure(
            "Arquivo da importação não encontrado no armazenamento.", code="missing_file"
        ) from exc
    if not materials_service.sniff_pdf(data):
        raise ImportFailure("O arquivo não é um PDF válido.", code="not_pdf")
    pages, total = extract_pdf_pages(data)
    job.pages_total = total
    if has_text_layer(pages):
        job.has_text_layer = True
    else:
        job.has_text_layer = False
        ocr_pages, why = _try_ocr(data)
        if ocr_pages is None:
            raise ImportFailure(
                f"O PDF não tem camada de texto (parece digitalizado como imagem). {why}",
                code="no_text_layer",
            )
        pages = ocr_pages
    job.raw_text = "\f".join(t for _, t in pages)[:MAX_RAW_TEXT_CHARS]
    proposal = build_proposal(pdf_lines(pages), source="pdf", strict=True)
    proposal["stats"]["pages_total"] = total
    proposal["stats"]["ocr"] = not job.has_text_layer
    return proposal


# --- Casos de uso -------------------------------------------------------------------


def get_import(db: Session, user: User, import_id: uuid.UUID) -> ImportJob:
    job = db.get(ImportJob, import_id)
    if job is None or job.user_id != user.id:
        raise NotFound("Importação não encontrada.")
    return job


def list_imports(db: Session, user: User, activity_id: uuid.UUID | None = None) -> list[ImportJob]:
    q = select(ImportJob).where(ImportJob.user_id == user.id)
    if activity_id:
        q = q.where(ImportJob.activity_id == activity_id)
    return list(db.execute(q.order_by(ImportJob.created_at.desc()).limit(100)).scalars())


def _check_text_size(content: str) -> None:
    if len(content) > MAX_TEXT_CHARS:
        raise ValidationFailed(
            f"O texto tem {len(content)} caracteres; o limite é {MAX_TEXT_CHARS}. "
            "Divida em partes menores.",
            code="text_too_long",
        )


def create_from_content(
    db: Session, user: User, act: Activity, *, source: str, content: str
) -> ImportJob:
    """Texto/CSV pequenos são processados **no mesmo request** (determinístico e rápido)."""
    if source not in SYNC_SOURCES:
        raise ValidationFailed("Origem inválida.", code="bad_source")
    _check_text_size(content)
    now = utcnow()
    proposal = parse_text(content) if source == "text" else parse_csv(content)
    job = ImportJob(
        user_id=user.id,
        activity_id=act.id,
        source=source,
        status="needs_review",
        raw_text=content,
        size_bytes=len(content.encode("utf-8")),
        has_text_layer=True,
        proposal=proposal,
        started_at=now,
        finished_at=now,
    )
    db.add(job)
    db.flush()
    return job


def _decode_text(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def create_from_file(
    db: Session,
    user: User,
    act: Activity,
    *,
    file_name: str,
    data: bytes,
    source: str | None,
    create_material: bool = False,
) -> ImportJob:
    """PDF: guarda o arquivo e cria o job em fila (processamento assíncrono).
    CSV enviado como arquivo: processado de forma síncrona como `csv`."""
    if not data:
        raise ValidationFailed("Arquivo vazio.", code="empty_file")
    if materials_service.sniff_pdf(data):
        if source not in (None, "", "pdf"):
            raise ValidationFailed(
                "O arquivo é um PDF, mas a origem informada é outra.", code="bad_source"
            )
        return _create_pdf(
            db, user, act, file_name=file_name, data=data, create_material=create_material
        )
    lower = (file_name or "").lower()
    if source == "csv" or lower.endswith((".csv", ".txt")) or source == "text":
        if len(data) > MAX_TEXT_CHARS * 4:
            raise ValidationFailed(
                f"O arquivo é grande demais para importação como texto (limite {MAX_TEXT_CHARS} caracteres).",
                code="text_too_long",
            )
        return create_from_content(
            db, user, act, source=("text" if source == "text" else "csv"), content=_decode_text(data)
        )
    raise ValidationFailed(
        "Formato não reconhecido. Envie um PDF com texto, um CSV no modelo ou cole o conteúdo como texto.",
        code="unsupported_file",
    )


def _create_pdf(
    db: Session, user: User, act: Activity, *, file_name: str, data: bytes, create_material: bool
) -> ImportJob:
    size = len(data)
    if size > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise ValidationFailed(
            f"O arquivo tem {size / 1024 / 1024:.0f} MB; o limite é {settings.MAX_UPLOAD_MB} MB. Nada foi alterado.",
            code="file_too_large",
        )
    material: Material | None = None
    if create_material:
        material = materials_service.create_pdf(
            db,
            user,
            activity_id=act.id,
            title=None,
            file_name=file_name,
            data=data,
            declared_type="application/pdf",
        )
        key = material.file_key
    else:
        key = f"users/{user.id}/imports/{uuid.uuid4()}.pdf"
        get_storage().put(key, data, "application/pdf")
    job = ImportJob(
        user_id=user.id,
        activity_id=act.id,
        source="pdf",
        status="queued",
        file_key=key,
        file_name=(file_name or "documento.pdf")[:255],
        size_bytes=size,
        pages_total=material.pages_total if material else None,
        material_id=material.id if material else None,
    )
    db.add(job)
    db.flush()
    return job


def process(db: Session, import_id: uuid.UUID) -> ImportJob:
    """Processa o job (chamado pela tarefa `process_import` ou diretamente em testes).

    Marca `processing` e **faz commit** desse estado (visível ao usuário enquanto um PDF
    é lido); o resultado final é só `flush()` — quem chama faz o commit.
    """
    job = db.get(ImportJob, import_id)
    if job is None:
        raise NotFound("Importação não encontrada.")
    if job.status in ("confirmed", "cancelled", "needs_review"):
        return job
    job.status = "processing"
    job.started_at = utcnow()
    job.error_code = None
    job.error_message = None
    db.flush()
    db.commit()
    try:
        if job.source == "text":
            proposal = parse_text(job.raw_text or "")
        elif job.source == "csv":
            proposal = parse_csv(job.raw_text or "")
        elif job.source == "pdf":
            proposal = _process_pdf(job)
        else:
            raise ImportFailure("Origem inválida.", code="bad_source")
        job.proposal = proposal
        job.status = "needs_review"
    except ImportFailure as exc:
        job.status = "failed"
        job.error_code = exc.code
        job.error_message = exc.message[:500]
    job.finished_at = utcnow()
    db.flush()
    return job


def mark_failed(db: Session, import_id: uuid.UUID, code: str, message: str) -> None:
    job = db.get(ImportJob, import_id)
    if job is None or job.status in ("confirmed", "cancelled"):
        return
    job.status = "failed"
    job.error_code = code
    job.error_message = message[:500]
    job.finished_at = utcnow()
    db.flush()


def update_proposal(db: Session, job: ImportJob, proposal: ProposalIn) -> ImportJob:
    if job.status != "needs_review":
        raise Conflict(
            "A proposta só pode ser editada enquanto aguarda revisão.", code="bad_state"
        )
    data = proposal.as_dict()
    stats = (job.proposal or {}).get("stats") or _empty_stats(job.source)
    stats = {**stats, "edited": True}
    stats["subjects"] = len(data["subjects"])
    stats["topics"] = sum(len(s["topics"]) for s in data["subjects"])
    stats["subtopics"] = sum(len(t["children"]) for s in data["subjects"] for t in s["topics"])
    data["stats"] = stats
    job.proposal = data
    db.flush()
    return job


def _discard_own_file(job: ImportJob) -> None:
    """Remove a cópia própria do PDF (não a do material) após confirmar/cancelar."""
    if job.file_key and "/imports/" in job.file_key:
        try:
            get_storage().delete(job.file_key)
        except Exception:  # noqa: BLE001
            pass
        job.file_key = None


def confirm(
    db: Session, user: User, job: ImportJob, proposal: ProposalIn | None = None
) -> tuple[ImportJob, dict]:
    """Cria Subject/Topic a partir da proposta (a enviada agora ou a salva) e vincula ao material."""
    if job.status != "needs_review":
        raise Conflict(
            "Esta importação não está pronta para confirmação.",
            code="bad_state",
            details={"status": job.status},
        )
    data = proposal if proposal is not None else ProposalIn.model_validate(job.proposal or {})
    if not data.subjects:
        raise ValidationFailed("A proposta está vazia: nada a importar.", code="empty_proposal")
    act = db.get(Activity, job.activity_id)
    if act is None or act.user_id != user.id:
        raise NotFound("Objetivo não encontrado.")
    material = None
    if job.material_id:
        material = db.get(Material, job.material_id)
        if material is not None and material.user_id != user.id:
            material = None
    base_order = int(
        db.execute(
            select(func.count()).select_from(Subject).where(Subject.activity_id == act.id)
        ).scalar_one()
    )
    created_subjects = created_topics = linked = 0
    import_ref = str(job.id)
    for si, s in enumerate(data.subjects):
        subject = Subject(
            user_id=user.id, activity_id=act.id, title=s.title, sort_order=base_order + si
        )
        db.add(subject)
        db.flush()
        created_subjects += 1
        for ti, t in enumerate(s.topics):
            topic = Topic(
                user_id=user.id,
                subject_id=subject.id,
                title=t.title,
                sort_order=ti,
                estimated_minutes=t.estimated_minutes,
                source_ref={"import_id": import_ref, "page": t.page},
            )
            db.add(topic)
            db.flush()
            created_topics += 1
            if material is not None and t.page is not None:
                db.add(
                    MaterialTopic(
                        material_id=material.id,
                        topic_id=topic.id,
                        page_from=t.page,
                        page_to=t.page_to or t.page,
                        created_at=utcnow(),
                    )
                )
                linked += 1
            for ci, c in enumerate(t.children):
                child = Topic(
                    user_id=user.id,
                    subject_id=subject.id,
                    parent_id=topic.id,
                    title=c.title,
                    sort_order=ci,
                    estimated_minutes=c.estimated_minutes,
                    source_ref={"import_id": import_ref, "page": c.page},
                )
                db.add(child)
                db.flush()
                created_topics += 1
                if material is not None and c.page is not None:
                    db.add(
                        MaterialTopic(
                            material_id=material.id,
                            topic_id=child.id,
                            page_from=c.page,
                            page_to=c.page_to or c.page,
                            created_at=utcnow(),
                        )
                    )
                    linked += 1
    job.proposal = data.as_dict()
    job.status = "confirmed"
    job.confirmed_at = utcnow()
    _discard_own_file(job)
    db.flush()
    return job, {
        "created_subjects": created_subjects,
        "created_topics": created_topics,
        "linked_topics": linked,
    }


def cancel(db: Session, job: ImportJob) -> ImportJob:
    if job.status == "confirmed":
        raise Conflict("Esta importação já foi confirmada.", code="bad_state")
    if job.status == "cancelled":
        return job
    job.status = "cancelled"
    job.finished_at = job.finished_at or utcnow()
    _discard_own_file(job)
    db.flush()
    return job
