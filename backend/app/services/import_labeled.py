"""Conteúdo programático em parágrafos rotulados: "LÍNGUA PORTUGUESA: Ortografia. Crase. …".

É o desenho mais comum de anexo de edital (FCC, FGV, Cebraspe): a matéria em maiúsculas, dois
pontos, e o conteúdo em texto corrido, frase a frase. O leitor genérico ignorava quase tudo (as
linhas são frases longas, não itens de sumário) e a sugestão da IA resumia.

Aqui nada é resumido nem reescrito:

- cada rótulo em maiúsculas seguido de dois pontos abre uma **matéria**;
- cada **frase** do parágrafo vira um **tópico**, com a redação do documento;
- as linhas de seção ("CONHECIMENTOS GERAIS – Para todos os cargos", "TB – TÉCNICO BANCÁRIO")
  não viram matéria, mas acompanham o título dela quando o documento tem mais de uma seção, para
  a pessoa saber o que é do cargo dela;
- uma seção sem rótulos, só com itens numerados ("TT04 – TÉCNICO…" seguido de "1.", "1.1."),
  vira uma matéria com os itens lidos pelo leitor de numeração;
- o que vem antes do primeiro rótulo (observações) e depois do anexo seguinte (cronograma) fica
  de fora.

Determinístico, sem IA. `labeled_proposal` devolve None quando o documento não tem esse desenho.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.schemas.imports import MAX_SUBJECTS, MAX_TOPICS, clean_title
from app.services import import_numbered as numbered

MIN_SUBJECTS = 3
SUBJECT_TITLE_MAX = 160  # Subject.title
TITLE_MAX = 200  # Topic.title
MIN_NUMBERED_ITEMS = 3

# "RÓTULO EM MAIÚSCULAS: texto" (o rótulo vai até os primeiros dois pontos da linha)
RE_LABEL = re.compile(r"^([^:]{3,100}):\s*(.*)$")
RE_NEXT_ANNEX = re.compile(r"^ANEXO\b", re.IGNORECASE)
RE_LEADING_NUMBER = re.compile(r"^\d{1,3}(?:\.\d{1,3}){0,2}[.)]?\s+(?=\S)")
# avisos em maiúsculas que não são matéria
NOT_SUBJECTS = frozenset(
    {"OBS", "OBS.", "OBSERVAÇÃO", "OBSERVAÇÕES", "NOTA", "NOTAS", "ATENÇÃO", "IMPORTANTE", "AVISO"}
)


@dataclass
class _Block:
    title: str
    section: str
    page: int | None
    labeled: bool
    lines: list[str] = field(default_factory=list)
    raw: list = field(default_factory=list)  # linhas originais, para o leitor de numeração


def _upper_ratio(s: str) -> float:
    letters = [c for c in s if c.isalpha()]
    return sum(c.isupper() for c in letters) / len(letters) if letters else 0.0


def _label(text: str) -> tuple[str, str] | None:
    """(rótulo, resto da linha) quando a linha abre uma matéria."""
    m = RE_LABEL.match(text)
    if m is None:
        return None
    label = " ".join(m.group(1).split())
    if sum(c.isalpha() for c in label) < 3 or label != label.upper() or not label[0].isalpha():
        return None  # "(LGPD): fundamentos…" no meio de um parágrafo não é matéria
    if label.rstrip(".") in NOT_SUBJECTS or len(label.split()) > 14:
        return None
    return label, m.group(2).strip()


def _is_section(text: str) -> bool:
    """Linha de seção: curta, sem ponto final, quase toda em maiúsculas, ou em maiúsculas até o
    travessão ("CONHECIMENTOS GERAIS – Para todos os cargos")."""
    if len(text) > 120 or text.endswith((".", ",", ";", ":")) or text[:1].isdigit():
        return False
    if sum(c.isalpha() for c in text) < 3:
        return False
    if _upper_ratio(text) >= 0.6:
        return True
    head = re.split(r"\s[–—-]\s", text, maxsplit=1)[0]
    return head != text and sum(c.isalpha() for c in head) >= 3 and head == head.upper()


def _with_section(label: str, section: str) -> str:
    """ "MATEMÁTICA FINANCEIRA · TB – TÉCNICO BANCÁRIO", cabendo no título da matéria."""
    room = SUBJECT_TITLE_MAX - len(label) - 3
    sec = " ".join(section.split())
    if room < 12:
        return label
    if len(sec) > room:
        sec = sec[: room - 1].rstrip() + "…"
    return f"{label} · {sec}"


def _pack(parts: list[str], sep: str) -> list[str]:
    """Junta pedaços vizinhos enquanto couberem num título."""
    out: list[str] = []
    for part in parts:
        if out and len(out[-1]) + len(sep) + len(part) <= TITLE_MAX:
            out[-1] = out[-1] + sep + part
        else:
            out.append(part)
    return out


def _fit(sentence: str) -> tuple[str, list[str]]:
    """Frase que não cabe num título não é cortada: a primeira parte vira o tópico e o resto,
    subtópicos, quebrando em ponto e vírgula, depois nos dois pontos, depois nas vírgulas."""
    full = " ".join(sentence.split()).rstrip(".")
    if len(full) <= TITLE_MAX:
        return full, []
    parts = [x.strip() for x in full.split("; ") if x.strip()]
    if len(parts) > 1 and len(parts[0]) <= TITLE_MAX:
        rest: list[str] = []
        for x in parts[1:]:
            rest += _pack(x.split(", "), ", ") if len(x) > TITLE_MAX else [x]
        return parts[0], rest
    head, colon, tail = full.partition(": ")
    if colon and len(head) <= TITLE_MAX:
        return head, _pack(tail.split(", "), ", ")
    chunks = _pack(full.split(", "), ", ")
    return chunks[0], chunks[1:]


def _sentence_topics(text: str, page: int | None) -> list[dict]:
    sentences = numbered.split_sentences(text)
    # "1 Compreensão de textos. 2 Tipologia textual." — a numeração corrida sai do título
    if sentences and sum(bool(RE_LEADING_NUMBER.match(s)) for s in sentences) * 2 >= len(sentences):
        sentences = [RE_LEADING_NUMBER.sub("", s) for s in sentences]
    out = []
    for s in sentences:
        head, rest = _fit(s)
        title = numbered._title(head)
        if title and any(c.isalnum() for c in title):
            children = [{"title": c, "page": page} for c in map(numbered._title, rest) if c]
            out.append({"title": title, "page": page, "children": children})
    return out


def _block_topics(block: _Block) -> list[dict]:
    if not block.labeled:
        # seção sem rótulos: se tem itens numerados, quem lê é o leitor de numeração
        toks = numbered._tokens(block.raw)
        marks = numbered._mark_numbers(toks)
        if len(marks) >= MIN_NUMBERED_ITEMS:
            items = [it for s in numbered._top_items(toks, marks) for it in s.items]
            topics = numbered._subject_topics(items)
            if topics:
                return topics
    return _sentence_topics(numbered.join_lines(block.lines), block.page)


def labeled_proposal(lines: list, *, source: str = "pdf") -> dict | None:
    """Proposta para um documento em parágrafos rotulados, ou None quando ele não tem esse
    desenho. `lines` são `imports.Line` (texto e página)."""
    toks = numbered._tokens(lines)
    lengths = sorted(len(t.text) for t in toks)
    full_width = lengths[len(lengths) * 3 // 4] if lengths else 0  # linha cheia de parágrafo
    blocks: list[_Block] = []
    section = ""
    current: _Block | None = None
    started = False  # já passou pelo primeiro rótulo
    prev = ""  # linha anterior do mesmo parágrafo ("" no começo de um)
    for t in toks:
        found = _label(t.text)
        # Rótulo no meio de um parágrafo ("LGPD: noções gerais…" depois de uma quebra de linha)
        # não abre matéria: a linha de cima teria terminado a frase ou ficado curta.
        mid_paragraph = (
            bool(prev) and not numbered._ends_sentence(prev) and (len(prev) >= 0.7 * full_width)
        )
        prev = t.text
        if found is not None and mid_paragraph:
            found = None
        if found is not None:
            label, rest = found
            current = _Block(title=label, section=section, page=t.page, labeled=True)
            if rest:
                current.lines.append(rest)
            blocks.append(current)
            started = True
            continue
        if _is_section(t.text):
            if started and RE_NEXT_ANNEX.match(t.text):
                break  # o conteúdo programático acabou: daqui em diante é outro anexo
            # duas linhas de seção seguidas: vale a mais específica, a de baixo
            section = t.text
            current = None
            prev = ""
            if started:
                current = _Block(title=t.text, section="", page=t.page, labeled=False)
                blocks.append(current)
            continue
        if current is not None:
            current.lines.append(t.text)
            current.raw.append(t)

    if sum(b.labeled for b in blocks) < MIN_SUBJECTS:
        return None
    sections = {b.section for b in blocks if b.labeled}
    subjects: list[dict] = []
    for b in blocks:
        if not b.lines:
            continue  # seção só com rótulos embaixo: é contexto, não matéria
        topics = _block_topics(b)
        if not topics:
            continue
        title = b.title
        if b.labeled and len(sections) > 1 and b.section:
            title = _with_section(title, b.section)
        subjects.append({"title": clean_title(title)[:SUBJECT_TITLE_MAX], "topics": topics})
    if len(subjects) < MIN_SUBJECTS:
        return None

    truncated = len(subjects) > MAX_SUBJECTS
    subjects = subjects[:MAX_SUBJECTS]
    room = MAX_TOPICS
    for s in subjects:
        if len(s["topics"]) > room:
            truncated = True
        s["topics"] = s["topics"][:room]
        room -= len(s["topics"]) + sum(len(t["children"]) for t in s["topics"])
        room = max(room, 0)
    subjects = [s for s in subjects if s["topics"]]
    n_topics = sum(len(s["topics"]) for s in subjects)
    return {
        "subjects": subjects,
        "stats": {
            "source": source,
            "layout": "labeled",
            "lines": len(lines),
            "skipped": 0,
            "subjects": len(subjects),
            "topics": n_topics,
            "subtopics": sum(len(t["children"]) for s in subjects for t in s["topics"]),
            "truncated": truncated,
        },
    }
