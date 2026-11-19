"""Conteúdo programático em itens numerados: editais verticalizados e tabelas de edital.

O leitor genérico (`imports.build_proposal`) trata cada linha como um item e só reconhece matéria
escrita em MAIÚSCULAS. Num edital em tabela isso desmonta tudo: o item ocupa várias linhas, a
matéria vem como "Direito Constitucional" e o número do item fica sozinho numa linha. O resultado
era uma matéria só, com centenas de "tópicos" que eram pedaços de frase.

Este módulo reconhece esse formato pelo que ele tem de mais estável, a numeração:

- o item começa num número sem pontuação (`7`, `7 Texto…`, `1.2`, `1.2 Texto…`) que continua a
  sequência; números fora da sequência (página, ano, artigo de lei) são texto comum;
- a numeração que volta para 1 marca uma matéria nova, e o título dela é a linha curta, sem ponto
  final, que vem logo antes;
- linhas que se repetem em várias páginas (cabeçalho, rodapé, cabeçalho da tabela) e caixas de
  marcação saem;
- o texto do item é remontado e dividido em frases: a primeira vira o tópico, as demais viram
  subtópicos.

Dois desenhos de tabela aparecem na extração do PDF. No primeiro o número vem antes do texto do
item. No segundo a célula do número é centralizada na vertical, e ele sai no meio das linhas do
item (ver `_centered_items`). Tudo determinístico, sem IA; se o documento não tiver esse formato,
`numbered_proposal` devolve None e o leitor genérico segue como antes.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app.schemas.imports import MAX_SUBJECTS, MAX_TOPICS, clean_title

MIN_ITEMS = 8  # menos que isso não é uma tabela de itens: fica com o leitor genérico
TITLE_MAX = 200  # Topic.title
HEADING_MAX = 90
HEADING_MAX_WORDS = 14
MAX_CHILDREN = 60
RESTART_LOOKAHEAD = 400
RESTART_REACH = 10  # linhas acima do "1" em que o título da matéria pode estar
MAX_ITEM_LINES = 60  # item sem fim claro (último do documento) não engole o resto do arquivo

TABLE_HEADER_STARTS = frozenset({"Nº", "N°", "Nº.", "N.º", "No.", "Item", "Itens"})
RE_BOXES = re.compile(r"[☐☑☒□■▢▣❏❐❑❒✓✔✗✘]")
_NUM = r"(\d{1,3})(?:\.(\d{1,3}))?(?:\.(\d{1,3}))?"
RE_NUM_ALONE = re.compile(rf"^{_NUM}$")
RE_NUM_INLINE = re.compile(rf"^{_NUM}\s+(\S.*)$")
RE_DASH_MARK = re.compile(r"^[—–]\s+(?=[a-zà-ÿ])")
RE_EDGE_NUMBER = re.compile(r"^\d{1,4}\s+|\s+\d{1,4}$")
RE_SENTENCE_END = re.compile(r"[.!?]\s+")
TERMINAL = (".", "!", "?", ";")
# abreviações comuns em editais: o ponto delas não encerra frase
ABBREVIATIONS = frozenset(
    "n nº n° art arts inc etc p pp pág pag ex cf v vol ed cap dr dra sr sra prof profa obs fl fls "
    "núm num tel jr ltda cia op cit al ss seg segs trad org coord res ac min des rel".split()
)


@dataclass
class _Tok:
    text: str
    page: int | None
    boxed: bool = False  # a linha trazia caixas de marcação: é o fim de um item
    num: tuple[int, ...] | None = None  # número aceito como início de item: (7,), (1, 2)…
    rest: str = ""  # texto na mesma linha do número


@dataclass
class _Item:
    num: tuple[int, ...]
    page: int | None
    lines: list[str] = field(default_factory=list)


@dataclass
class _Subject:
    title: str
    items: list[_Item] = field(default_factory=list)


def _ends_sentence(s: str) -> bool:
    return s.rstrip("”\"')] ").endswith(TERMINAL)


def _title_shape(s: str) -> bool:
    """Linha curta que não é frase: não termina em pontuação nem tem cara de texto corrido
    ("rótulo: valor", duas frases)."""
    if not s or len(s) > HEADING_MAX or len(s.split()) > HEADING_MAX_WORDS:
        return False
    if not s[0].isalpha() or s.split()[0] in TABLE_HEADER_STARTS:
        return False  # "Nº Conteúdo Teoria…" é o cabeçalho da tabela, não o título da matéria
    if s.endswith((".", ",", ";", ":", "-", "–", "—", "(", "/")):
        return False
    if ". " in s or ": " in s or "; " in s:
        return False
    return sum(c.isalpha() for c in s) >= 3


def looks_like_heading(s: str) -> bool:
    """Pode ser o título de uma matéria: linha curta, sem ser frase, que começa com maiúscula."""
    return _title_shape(s) and s[0].isupper()


# --- Limpeza -------------------------------------------------------------------------


def _running_key(text: str) -> str:
    """Chave para achar cabeçalho/rodapé: o texto sem o número de página das pontas."""
    key = text
    for _i in range(2):
        key = RE_EDGE_NUMBER.sub("", key).strip()
    return " ".join(key.lower().split())


def _tokens(lines: list) -> list[_Tok]:
    """Linhas com conteúdo, sem caixas de marcação e sem o que se repete de página em página."""
    toks: list[_Tok] = []
    for ln in lines:
        raw = ln.text.replace("\t", " ")
        boxed = bool(RE_BOXES.search(raw))
        text = " ".join(RE_BOXES.sub(" ", raw).split())
        # travessão no lugar do número (item sem numeração), colado ao meio de uma frase
        text = RE_DASH_MARK.sub("", text)
        if not any(c.isalnum() for c in text):
            if boxed and toks:
                toks[-1].boxed = True  # linha só de caixas: encerra o item da linha anterior
            continue
        toks.append(_Tok(text=text, page=ln.page, boxed=boxed))

    pages = {t.page for t in toks if t.page is not None}
    seen: dict[str, list] = {}
    for t in toks:
        key = _running_key(t.text)
        if len(key) >= 6:
            seen.setdefault(key, []).append(t.page)
    if len(pages) >= 3:
        need = max(3, math.ceil(len(pages) * 0.3))
        running = {k for k, pgs in seen.items() if len(set(pgs)) >= need}
    else:
        # texto colado não tem páginas: vale a linha que aparece três vezes ou mais
        running = {k for k, pgs in seen.items() if len(pgs) >= 3}
    if not running:
        return toks
    kept: list[_Tok] = []
    dropped_prev = False
    for t in toks:
        if _running_key(t.text) in running:
            dropped_prev = True
            continue
        # número da página numa linha própria, logo depois do cabeçalho
        if dropped_prev and t.text.isdigit() and t.page is not None and int(t.text) == t.page:
            continue
        dropped_prev = False
        kept.append(t)
    return kept


# --- Numeração -----------------------------------------------------------------------


def _is_label(s: str) -> bool:
    """Linha de "rótulo: valor" que acompanha o título ("Onde cai: prova objetiva")."""
    return len(s) <= 140 and ": " in s[:32] and not _ends_sentence(s)


def _heading_before(toks: list[_Tok], start: int, end: int) -> tuple[int, int] | None:
    """Título de matéria em `toks[start:end]`: o último trecho de linhas com forma de título.
    Devolve o intervalo [i, j).

    Um título longo quebra em duas ou três linhas, e a continuação pode começar em minúscula
    ("Geografia do Brasil e" / "da América Latina"). O que separa isso de uma frase que quebrou
    é o que vem depois: a frase continua em texto corrido, o título não.
    """

    def cand(k: int) -> bool:
        t = toks[k]
        # linha logo abaixo de um número sozinho é o texto do item, não um título
        after_number = k > 0 and toks[k - 1].num is not None and not toks[k - 1].rest
        return t.num is None and not t.boxed and not after_number and _title_shape(t.text)

    j = end
    while j > start:
        if end - j > 40:  # título fica perto do primeiro item, não páginas antes
            return None
        if not cand(j - 1):
            j -= 1
            continue
        i = j - 1
        while i > start and j - i < 3 and cand(i - 1) and toks[i - 1].page == toks[i].page:
            upper, lower = toks[i - 1].text, toks[i].text
            if lower[0].isupper() and (
                len(upper) < len(toks[j - 1].text) or any(c.isdigit() for c in upper)
            ):
                break  # duas linhas independentes (índice, linha de tabela), não uma quebra
            i -= 1
        while i < j and not toks[i].text[0].isupper():
            i += 1  # o título começa numa maiúscula
        nxt = toks[j] if j < len(toks) else None
        continues = nxt is not None and nxt.num is None and nxt.text[:1].islower()
        if i < j and not continues:
            return i, j
        j -= 1
    return None


def _follows(toks: list[_Tok], i: int, want: int) -> bool:
    """O próximo número de item depois de `toks[i]` é `want`?"""
    for t in toks[i + 1 : i + 1 + RESTART_LOOKAHEAD]:
        m = RE_NUM_ALONE.match(t.text) or RE_NUM_INLINE.match(t.text)
        if m is not None and not m.group(2):
            return int(m.group(1)) == want
    return False


def _restart_confirmed(toks: list[_Tok], i: int, resume: int) -> bool:
    """Depois do "1" em `toks[i]`, o 2 e o 3 aparecem antes de `resume` (o número que
    continuaria a sequência antiga)?"""
    want = 2
    for t in toks[i + 1 : i + 1 + RESTART_LOOKAHEAD]:
        m = RE_NUM_ALONE.match(t.text) or RE_NUM_INLINE.match(t.text)
        if m is None or m.group(2):
            continue
        n = int(m.group(1))
        if n == want:
            want += 1
            if want > 3:
                return True
        elif n == 1 or (n == resume and resume > 3):
            return False  # outro "1" adiante: o 2 e o 3 seriam dele
    return False


def _mark_numbers(toks: list[_Tok]) -> list[int]:
    """Marca em `toks` os números que iniciam item e devolve os índices deles.

    Só vale o número que continua a sequência (n+1, ou n.m+1 dentro do item n) ou que a
    reinicia em 1. O reinício numa linha com texto ("1 Direito tributário. Conceito…") exige um
    título de matéria poucas linhas acima, para não confundir com frase que começa por "1".
    """
    marks: list[int] = []
    cur: tuple[int, ...] | None = None  # último número aceito
    last_idx = -1
    for i, t in enumerate(toks):
        m = RE_NUM_ALONE.match(t.text)
        rest = ""
        if m is None:
            m = RE_NUM_INLINE.match(t.text)
            if m is None:
                continue
            rest = m.group(4)
        num = tuple(int(g) for g in m.group(1, 2, 3) if g)
        accept = False
        if len(num) == 1:
            if cur is not None and num[0] == cur[0] + 1:
                accept = True
            elif cur is not None and num[0] == cur[0] + 2 and _follows(toks, i, num[0] + 1):
                # um número que a leitura perdeu (OCR): a sequência segue no seguinte, e o
                # texto do item sem número fica junto do anterior
                accept = True
            elif num[0] == 1:
                # A numeração recomeça de verdade quando há um título de matéria logo acima ou
                # quando o 2 e o 3 vêm em seguida. Um "1" solto (nota, "1 de janeiro de 2003")
                # não tem nem uma coisa nem outra.
                near = max(last_idx + 1, i - RESTART_REACH)
                accept = (
                    cur is None
                    or _heading_before(toks, near, i) is not None
                    or _restart_confirmed(toks, i, cur[0] + 1)
                )
        elif cur is not None and num[:-1] == cur[: len(num) - 1]:
            # subitem (1.2, 2.7.1): continua o anterior do mesmo nível. O mesmo número duas
            # vezes também vale: editais repetem numeração por engano.
            prev = cur[len(num) - 1] if len(cur) >= len(num) else 0
            accept = num[-1] >= 1 and num[-1] in (prev + 1, prev)
        if not accept:
            continue
        t.num, t.rest = num, rest
        cur = num
        last_idx = i
        marks.append(i)
    return marks


def _has_boxes(toks: list[_Tok], marks: list[int]) -> bool:
    return sum(t.boxed for t in toks) >= max(3, len(marks) * 0.2)


def _is_centered(toks: list[_Tok], marks: list[int]) -> bool:
    """A coluna do número é centralizada na vertical quando ele aparece no meio de frases:
    a linha anterior é texto do mesmo item, sem ponto final."""
    if _has_boxes(toks, marks):
        return False  # com caixas de marcação o fim de cada item é explícito
    evidence = 0
    for i in marks:
        if i == 0:
            continue
        prev = toks[i - 1]
        if prev.num is None and not _ends_sentence(prev.text) and not _title_shape(prev.text):
            evidence += 1
    return evidence >= max(3, math.ceil(len(marks) * 0.1))


# --- Montagem dos itens ----------------------------------------------------------------


def _top_items(toks: list[_Tok], marks: list[int]) -> list[_Subject]:
    """Número antes do texto: o item vai do número até o próximo número, a linha de caixas ou o
    título da matéria seguinte."""
    subjects: list[_Subject] = []
    boxes = _has_boxes(toks, marks)
    prev_end = 0
    for k, i in enumerate(marks):
        t = toks[i]
        nxt = marks[k + 1] if k + 1 < len(marks) else len(toks)
        if t.num == (1,):
            span = _heading_before(toks, prev_end, i)
            if span is not None or not subjects:
                title = " ".join(x.text for x in toks[span[0] : span[1]]) if span else ""
                subjects.append(_Subject(title=title))
                if span is not None and boxes:
                    # item sem número antes do 1: o texto entre o título e o 1 que termina
                    # numa linha de caixas
                    body = toks[span[1] : i]
                    while body and _is_label(body[0].text):
                        body = body[1:]
                    last = max((n for n, x in enumerate(body) if x.boxed), default=-1)
                    if last >= 0:
                        lead = body[: last + 1][-MAX_ITEM_LINES:]
                        subjects[-1].items.append(
                            _Item(num=(0,), page=lead[0].page, lines=[x.text for x in lead])
                        )
        elif not subjects:
            subjects.append(_Subject(title=""))
        item = _Item(num=t.num, page=t.page, lines=[t.rest] if t.rest else [])
        stop = nxt
        if nxt < len(toks) and toks[nxt].num == (1,):
            span = _heading_before(toks, i + 1, nxt)
            if span is not None:
                stop = span[0]
        end = i + 1
        if not t.boxed:
            while end < stop and len(item.lines) < MAX_ITEM_LINES:
                x = toks[end]
                if nxt == len(toks) and item.lines:
                    # Último item do documento: não há número seguinte para fechá-lo. Ele não
                    # atravessa a página nem segue por uma linha curta depois de um ponto final
                    # (o parágrafo do item quebra na largura da coluna; a chamada do rodapé, não).
                    short_after_end = _ends_sentence(item.lines[-1]) and len(x.text) < 40
                    if x.page != t.page or short_after_end:
                        break
                item.lines.append(x.text)
                end += 1
                if x.boxed:
                    break
        prev_end = end
        subjects[-1].items.append(item)
    return subjects


def _centered_items(
    toks: list[_Tok], marks: list[int], alone_extra: int = 2
) -> tuple[list[_Subject], int]:
    """Número centralizado na célula: ele sai no meio das linhas do item.

    Com `h` linhas do item antes do número, o item tem mais `h` linhas depois quando o número
    divide a linha com o texto (item de altura ímpar). Quando ele sai sozinho (altura par), são
    `h + alone_extra`: 2 na extração do texto de um PDF, 0 quando as linhas vêm da posição na
    página (OCR). A conta é conferida com a pontuação: o item termina numa linha com ponto
    final. Devolve também em quantos itens a conta fechou de primeira, para escolher a regra.
    """
    hits = 0
    subjects: list[_Subject] = []
    cursor = 0  # primeira linha ainda não atribuída a um item
    for k, i in enumerate(marks):
        t = toks[i]
        nxt = marks[k + 1] if k + 1 < len(marks) else len(toks)
        lo, new_subject = cursor, False
        if t.num == (1,):
            span = _heading_before(toks, cursor, i)
            if span is not None or not subjects:
                title = " ".join(x.text for x in toks[span[0] : span[1]]) if span else ""
                subjects.append(_Subject(title=title))
                lo, new_subject = (span[1] if span else i), True
                # entre o título e o primeiro item: "Onde cai: …" e o cabeçalho da tabela
                while lo < i and (
                    _is_label(toks[lo].text) or toks[lo].text.split()[0] in TABLE_HEADER_STARTS
                ):
                    lo += 1
        elif not subjects:
            subjects.append(_Subject(title=""))
            lo, new_subject = i, True
        limit = nxt - (i + 1)
        if nxt < len(toks) and toks[nxt].num == (1,):
            # a matéria seguinte começa aqui: o título dela e o que vem depois não são deste item
            span = _heading_before(toks, i + 1, nxt)
            if span is not None:
                limit = span[0] - (i + 1)
        if nxt == len(toks):
            limit = min(limit, MAX_ITEM_LINES)
        extra = 0 if t.rest else alone_extra

        def fits(tail: int, i: int = i, limit: int = limit) -> bool:
            return 0 <= tail <= limit and (tail == 0 or _ends_sentence(toks[i + tail].text))

        p, tail = lo, (i - lo) + extra
        if fits(tail):
            hits += 1
        else:
            found = False
            if tail <= limit + 2:  # a conta quase fecha: acerta pelo ponto final mais próximo
                for delta in (1, -1, 2, -2):
                    if fits(tail + delta) and tail + delta > 0:
                        tail, found = tail + delta, True
                        break
            if not found:
                # há linhas a mais antes do número (texto sem número, sobra do item anterior):
                # o item começa depois de um ponto final, onde a conta fechar
                for q in range(lo + 1, i + 1):
                    if _ends_sentence(toks[q - 1].text) and fits((i - q) + extra):
                        p, tail, found = q, (i - q) + extra, True
                        break
            if not found:
                tail = max(0, min(tail, limit))
        if p > lo:
            lead = [x.text for x in toks[lo:p]][-MAX_ITEM_LINES:]
            if new_subject:
                subjects[-1].items.append(_Item(num=(0,), page=toks[lo].page, lines=lead))
            elif subjects[-1].items:
                subjects[-1].items[-1].lines.extend(lead)
        lines = [
            *(x.text for x in toks[p:i]),
            *([t.rest] if t.rest else []),
            *(x.text for x in toks[i + 1 : i + 1 + tail]),
        ]
        subjects[-1].items.append(_Item(num=t.num, page=t.page, lines=lines))
        cursor = i + 1 + tail
    return subjects, hits


# --- Do item ao tópico ------------------------------------------------------------------


def join_lines(lines: list[str]) -> str:
    """Remonta o parágrafo: une as linhas e desfaz a hifenização da quebra e o espaço que a
    extração do PDF deixa antes do hífen ("latino -americano")."""
    out = ""
    for ln in lines:
        if not out:
            out = ln
        elif out.endswith("-") and ln[:1].islower():
            out += ln
        else:
            out += " " + ln
    out = re.sub(r"(?<=[a-zà-ÿ]) -(?=[a-zà-ÿ])", "-", out)
    return " ".join(out.split())


def split_sentences(text: str) -> list[str]:
    """Frases do item. O ponto de abreviação ("Lei n. 13.105", "art. 5º", iniciais de autor) e
    o de número ("6.015/1973") não encerram frase."""
    parts: list[str] = []
    start = 0
    for m in RE_SENTENCE_END.finditer(text):
        nxt = text[m.end() : m.end() + 1]
        if not nxt or not (nxt.isupper() or nxt.isdigit() or nxt in "“\"'(‘"):
            continue
        before = text[start : m.start()].rstrip()
        word = re.split(r"[\s(\[“\"]", before)[-1].lower().rstrip(".")
        if text[m.start()] == "." and (len(word) <= 1 or word in ABBREVIATIONS):
            continue
        parts.append(text[start : m.start() + 1])
        start = m.end()
    parts.append(text[start:])
    return [p.strip() for p in parts if p.strip()]


def _title(text: str) -> str:
    """Título de tópico: sem o ponto final e, se não couber, cortado com reticências."""
    t = clean_title(text)  # tira caracteres de controle e normaliza espaços
    full = " ".join("".join(ch for ch in text if ch.isprintable() or ch.isspace()).split())
    if not full.endswith("..."):
        full = full.rstrip(".").rstrip()
    if len(full) <= TITLE_MAX:
        return full if t else ""
    return full[: TITLE_MAX - 1].rstrip() + "…"


def _topic(text: str, page: int | None, *, prefix: str = "") -> dict | None:
    sentences = split_sentences(text)
    if not sentences:
        return None
    title = _title(sentences[0])
    if not title:
        return None
    if prefix and len(prefix) + 2 + len(title) <= TITLE_MAX:
        title = f"{prefix}: {title}"
    children = [{"title": c, "page": page} for c in map(_title, sentences[1:]) if c]
    return {"title": title, "page": page, "children": children[:MAX_CHILDREN]}


def _subject_topics(items: list[_Item]) -> list[dict]:
    """Itens da matéria → tópicos. Item com subitens (1, 1.1, 1.2, 1.2.1…) é um grupo: quando os
    subitens são curtos, o grupo vira o tópico e eles, os subtópicos; quando são parágrafos,
    cada subitem vira um tópico (com o nome do grupo na frente) para não cortar o texto."""
    topics: list[dict] = []
    i = 0
    while i < len(items):
        it = items[i]
        text = join_lines(it.lines)
        j = i + 1
        while j < len(items) and len(items[j].num) > 1:
            j += 1
        subs = [(s, join_lines(s.lines)) for s in items[i + 1 : j]] if len(it.num) == 1 else []
        subs = [(s, tx) for s, tx in subs if tx]
        if not subs:
            if text and (tp := _topic(text, it.page)):
                topics.append(tp)
        else:
            group = _title(text) if text else ""
            short = all(len(tx) <= TITLE_MAX and len(split_sentences(tx)) <= 1 for _s, tx in subs)
            if group and short and len(subs) <= MAX_CHILDREN:
                topics.append(
                    {
                        "title": group,
                        "page": it.page,
                        "children": [{"title": _title(tx), "page": s.page} for s, tx in subs],
                    }
                )
            else:
                for s, tx in subs:
                    if tp := _topic(tx, s.page, prefix=group):
                        topics.append(tp)
        i = max(j, i + 1)
    return topics


def numbered_proposal(lines: list, *, source: str = "pdf") -> dict | None:
    """Proposta de matérias e tópicos para um documento em itens numerados, ou None quando o
    documento não tem esse formato. `lines` são `imports.Line` (texto e página)."""
    toks = _tokens(lines)
    marks = _mark_numbers(toks)
    if len(marks) < MIN_ITEMS:
        return None
    if _is_centered(toks, marks):
        # a regra do número sozinho varia com a origem do texto: fica a que fecha mais itens
        raw_subjects, _hits = max(
            (_centered_items(toks, marks, extra) for extra in (2, 0, 1)), key=lambda r: r[1]
        )
    else:
        raw_subjects = _top_items(toks, marks)

    subjects: list[dict] = []
    for n, subj in enumerate(raw_subjects, start=1):
        topics = _subject_topics(subj.items)
        if not topics:
            continue
        title = clean_title(subj.title.rstrip(" .:")) or f"Matéria {n}"
        subjects.append({"title": title, "topics": topics})
    if not subjects:
        return None

    def total() -> int:
        return sum(
            len(s["topics"]) + sum(len(t["children"]) for t in s["topics"]) for s in subjects
        )

    truncated = False
    if len(subjects) > MAX_SUBJECTS:
        subjects, truncated = subjects[:MAX_SUBJECTS], True
    if total() > MAX_TOPICS:
        # não cabe com as frases separadas: fica um tópico por item, sem subtópicos
        truncated = True
        for s in subjects:
            for t in s["topics"]:
                t["children"] = []
        if total() > MAX_TOPICS:
            room = MAX_TOPICS
            for s in subjects:
                s["topics"] = s["topics"][:room]
                room -= len(s["topics"])
            subjects = [s for s in subjects if s["topics"]]
    n_topics = sum(len(s["topics"]) for s in subjects)
    return {
        "subjects": subjects,
        "stats": {
            "source": source,
            "layout": "numbered",
            "lines": len(lines),
            "skipped": 0,
            "subjects": len(subjects),
            "topics": n_topics,
            "subtopics": total() - n_topics,
            "truncated": truncated,
        },
    }
