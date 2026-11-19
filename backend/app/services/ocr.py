"""OCR de PDF digitalizado: cada página vira imagem (pdfium) e é lida pelo Tesseract.

Feito para rodar num servidor apertado:

- **um arquivo por vez** em toda a máquina (trava de arquivo; quem chega com outro em andamento
  recebe `OcrBusy` e a tarefa volta para a fila);
- o Tesseract usa **um núcleo** (`OMP_THREAD_LIMIT=1`);
- limite de páginas e de tempo (`OCR_MAX_PAGES`, `OCR_TIMEOUT_SECONDS`): passou disso, o que foi
  lido até ali segue como proposta parcial, marcada como incompleta.

Edital digitalizado costuma ser tabela, e o Tesseract sozinho se sai mal nela. Três cuidados:

- as **linhas da tabela são apagadas** da imagem antes da leitura (`remove_rules`): com elas, o
  número do item, sozinho na célula, é tomado por ruído e some;
- uma **segunda leitura só da faixa dos números** (a margem esquerda de cada coluna de texto)
  recupera os que ainda escaparam; é uma faixa estreita, custa uma fração da página;
- o texto não sai na ordem que o Tesseract escolhe (ele separa a coluna dos números da coluna do
  conteúdo): `rows_from_words` remonta as linhas pela posição das palavras na página, que é o
  desenho que o leitor de itens numerados espera.

Nada aqui é chamado sem `OCR_ENABLED=true`. As bibliotecas são importadas só na hora do uso.
"""

from __future__ import annotations

import fcntl
import os
import re
import tempfile
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("ocr")

LOCK_PATH = os.path.join(tempfile.gettempdir(), "estudatta-ocr.lock")
MIN_CONFIDENCE = 25.0  # abaixo disso o Tesseract está chutando (ruído, borda de tabela)
# caixa de marcação lida como letra: "O", "D", "[]", "CJ"… sozinha, repetida no fim da linha
RE_BOX_TOKEN = re.compile(r"^(?:[O0DQoCU]|\[\]|\[J|CJ|LJ|L\]|\[_?\]|\(\)|□|☐|▢|O\]|\[O)$")
# as três caixas lidas como uma "palavra" só: "Doo", "OOO", "Dodo"
RE_BOX_WORD = re.compile(r"^[DOQo0d□☐▢\[\]]{3,6}$")
# ao lado de um número sozinho, as caixas também saem como "nono", "noo", "ono"
RE_LOOSE_BOX_WORD = re.compile(r"^[DOQo0dnNuUcC□☐▢\[\]]{3,6}$")
RULE_STUBS = frozenset({"|", "||", "¦", "_", "—", "="})
LEADING_STUBS = frozenset({"L", "I", "l", "[", "]", "-", "'", '"', "E", "F", "T", "r"})
RE_ITEM_NUMBER = re.compile(r"^\d{1,3}(?:\.\d{1,3}){0,2}\.?$")
NUMBER_STRIP = 0.13  # largura da faixa dos números, em fração da página


class OcrUnavailable(Exception):
    """O OCR está ligado na configuração, mas falta um componente no servidor."""


class OcrBusy(Exception):
    """Outro arquivo está sendo lido agora: tente de novo daqui a pouco."""


@dataclass
class OcrResult:
    pages: list[tuple[int, str]] = field(default_factory=list)  # (nº da página, texto)
    total: int = 0  # páginas do arquivo
    truncated: bool = False  # parou por limite de páginas ou de tempo
    seconds: float = 0.0


def check_engine() -> None:
    """Confere que o Tesseract e o idioma estão instalados. Lança `OcrUnavailable`."""
    try:
        import pypdfium2  # noqa: F401
        import pytesseract
    except ImportError as exc:
        raise OcrUnavailable("bibliotecas de OCR não instaladas") from exc
    try:
        langs = set(pytesseract.get_languages(config=""))
    except Exception as exc:  # noqa: BLE001  (binário ausente, erro ao executar)
        raise OcrUnavailable("tesseract não encontrado") from exc
    missing = [lang for lang in settings.OCR_LANGS.split("+") if lang and lang not in langs]
    if missing:
        raise OcrUnavailable(f"idioma do tesseract ausente: {', '.join(missing)}")


@contextmanager
def one_at_a_time(path: str = LOCK_PATH) -> Iterator[None]:
    """Trava exclusiva entre processos da mesma máquina. Não espera: se já há um OCR em
    andamento, lança `OcrBusy`."""
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise OcrBusy from exc
        try:
            yield
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


# --- Das palavras às linhas ------------------------------------------------------------


@dataclass
class _Seg:
    """Um trecho de linha do Tesseract: palavras vizinhas na mesma altura."""

    left: float
    top: float
    right: float
    bottom: float
    words: list[tuple[float, str]]

    @property
    def middle(self) -> float:
        return (self.top + self.bottom) / 2

    @property
    def height(self) -> float:
        return self.bottom - self.top


def _segments(data: dict) -> list[_Seg]:
    """Trechos de linha: palavras da mesma linha do Tesseract sem um vão largo entre elas. O vão
    largo separa colunas de texto e a célula do número da célula do conteúdo; quem está na mesma
    altura volta a se juntar em `_rows`."""
    lines: dict[tuple, list[tuple[float, float, float, float, str]]] = {}
    for k, raw in enumerate(data.get("text", [])):
        text = (raw or "").strip()
        if not text:
            continue
        try:
            conf = float(data["conf"][k])
        except (TypeError, ValueError):
            conf = -1.0
        if conf < MIN_CONFIDENCE:
            continue
        left, top = float(data["left"][k]), float(data["top"][k])
        right, bottom = left + float(data["width"][k]), top + float(data["height"][k])
        key = (data["block_num"][k], data["par_num"][k], data["line_num"][k])
        lines.setdefault(key, []).append((left, top, right, bottom, text))
    segs: list[_Seg] = []
    for words in lines.values():
        words.sort()
        height = sorted(w[3] - w[1] for w in words)[len(words) // 2]
        gap = max(2.0 * height, 40.0)
        cur: _Seg | None = None
        for left, top, right, bottom, text in words:
            if cur is None or left - cur.right > gap:
                cur = _Seg(left, top, right, bottom, [(left, text)])
                segs.append(cur)
            else:
                cur.top, cur.bottom = min(cur.top, top), max(cur.bottom, bottom)
                cur.right = max(cur.right, right)
                cur.words.append((left, text))
    return segs


def _gutter(segs: list[_Seg], width: float) -> float | None:
    """Página em duas colunas de texto: devolve o x do vão entre elas, ou None.

    Há vão quando uma faixa vertical perto do meio da página quase não é cruzada por nenhum
    trecho e há bastante texto dos dois lados. Numa tabela, as linhas do conteúdo cruzam o meio.
    """
    if len(segs) < 12 or width <= 0:
        return None
    bins = 100
    cover = [0] * bins
    for s in segs:
        a = max(0, min(bins - 1, int(s.left / width * bins)))
        b = max(0, min(bins - 1, int(s.right / width * bins)))
        for x in range(a, b + 1):
            cover[x] += 1
    allowed = max(1, len(segs) // 25)  # títulos que atravessam a página
    best: tuple[int, int] | None = None
    start = None
    for x in range(30, 71):
        free = cover[x] <= allowed
        if free and start is None:
            start = x
        if (not free or x == 70) and start is not None:
            end = x if free else x - 1
            if best is None or end - start > best[1] - best[0]:
                best = (start, end)
            start = None
    if best is None or best[1] - best[0] < 1:
        return None
    x = (best[0] + best[1] + 1) / 2 / bins * width
    left = sum(1 for s in segs if s.right <= x)
    right = sum(1 for s in segs if s.left >= x)
    return x if min(left, right) >= len(segs) * 0.25 else None


def _rows(segs: list[_Seg]) -> list[str]:
    """Junta numa linha os trechos que estão na mesma altura (o número e o texto do item, as
    caixas de marcação no fim) e ordena as linhas de cima para baixo."""
    rows: list[list[_Seg]] = []
    for s in sorted(segs, key=lambda s: s.middle):
        row = rows[-1] if rows else None
        if row is not None:
            top = min(x.top for x in row)
            bottom = max(x.bottom for x in row)
            overlap = min(bottom, s.bottom) - max(top, s.top)
            side_by_side = all(s.left >= x.right or s.right <= x.left for x in row)
            if side_by_side and overlap >= 0.5 * min(s.height, bottom - top):
                row.append(s)
                continue
        rows.append([s])
    out: list[str] = []
    for row in rows:
        words = sorted((w for s in row for w in s.words), key=lambda w: w[0])
        out.append(_clean_row(" ".join(t for _x, t in words)))
    return [r for r in out if r]


def _drop_boxes(line: str) -> str:
    """Caixas de marcação no fim da linha saem do OCR como letras soltas ("O O O", "Doo"). Elas
    ficam na altura do meio do item, não no fim dele, então não servem para dizer onde o item
    acaba: são descartadas."""
    tokens = line.split()
    while tokens and RE_BOX_WORD.match(tokens[-1]):
        tokens.pop()
    n = 0
    while n < len(tokens) and RE_BOX_TOKEN.match(tokens[-1 - n]):
        n += 1
    return " ".join(tokens if n < 2 else tokens[: len(tokens) - n])


def _clean_row(line: str) -> str:
    """Tira da linha o que é resto de tabela: caixas de marcação, tocos dos traços (lidos como
    "|", "L", "-") e os rabiscos curtos que sobram ao lado de um número sozinho na célula."""
    tokens = [t for t in _drop_boxes(line).split() if t not in RULE_STUBS]
    while tokens and not any(c.isalnum() for c in tokens[0]):
        tokens.pop(0)
    if len(tokens) >= 2 and tokens[0] in LEADING_STUBS and RE_ITEM_NUMBER.match(tokens[1]):
        tokens.pop(0)  # canto da tabela antes do número do item ("L 5 População")
    if tokens:
        tokens[0] = tokens[0].lstrip("\"'|“”‘’`´.,;:_=~-")  # toco de traço colado à 1ª palavra
    if not tokens or not tokens[0]:
        return ""
    numbered = bool(RE_ITEM_NUMBER.match(tokens[0]))
    if numbered and len(tokens) == 2 and RE_LOOSE_BOX_WORD.match(tokens[1]):
        return tokens[0]  # número sozinho na célula e as caixas da mesma altura ("5 nono")
    rest_is_scrap = all(len(t) <= 2 for t in tokens[1:])
    if numbered and rest_is_scrap:
        return tokens[0]  # número sozinho na célula, com rabiscos de uma ou duas letras ao lado
    if rest_is_scrap and len(tokens[0]) <= 2:
        return ""  # linha só de rabiscos
    return " ".join(tokens)


def rows_from_words(data: dict, width: float) -> str:
    """Texto da página a partir das palavras e posições que o Tesseract devolve.

    Linhas são montadas pela altura na página, da esquerda para a direita: numa tabela, o
    número do item fica na linha do texto com que divide a altura (ou sozinho, entre duas
    linhas), como na extração de um PDF com texto. Em página de duas colunas, cada coluna é
    lida inteira antes da outra.
    """
    segs = _segments(data)
    if not segs:
        return ""
    x = _gutter(segs, width)
    if x is None:
        return "\n".join(_rows(segs))
    left = [s for s in segs if (s.left + s.right) / 2 < x]
    right = [s for s in segs if (s.left + s.right) / 2 >= x]
    return "\n".join([*_rows(left), *_rows(right)])


# --- Imagem ---------------------------------------------------------------------------


def remove_rules(image):
    """Apaga da página os traços longos (linhas de tabela, molduras). Um traço é uma faixa
    escura contínua bem mais comprida que uma letra, na vertical ou na horizontal."""
    from PIL import Image, ImageChops, ImageFilter

    width, height = image.size
    k = max(40, width // 25)
    ink = image.point(lambda v: 255 if v < 128 else 0)
    # média em blocos de k pixels: bloco quase todo com tinta = pedaço de um traço
    vertical = ink.resize((width, max(1, height // k)), Image.Resampling.BOX)
    horizontal = ink.resize((max(1, width // k), height), Image.Resampling.BOX)
    mask = Image.new("L", (width, height), 0)
    for reduced in (vertical, horizontal):
        # Só o bloco quase todo coberto pelo traço. A ponta que sobra no bloco vizinho fica: apagar
        # o vizinho inteiro cortava o título que está logo acima da tabela ("Geografia" virava
        # "Geog"). O toco que resta sai como "|" ou "-" e é descartado em `_clean_row`.
        hit = reduced.point(lambda v: 255 if v > 215 else 0)
        mask = ImageChops.lighter(mask, hit.resize((width, height), Image.Resampling.NEAREST))
    mask = mask.filter(ImageFilter.MaxFilter(5))  # pega também a borda do traço
    out = image.copy()
    out.paste(255, mask=mask)
    return out


def _numbers_in_strips(image, data: dict, read) -> None:
    """Segunda leitura, só da faixa onde ficam os números dos itens (a margem esquerda de cada
    coluna de texto). Acrescenta a `data` os números que a leitura da página inteira perdeu."""
    width, height = image.size
    segs = _segments(data)
    if not segs:
        return
    x = _gutter(segs, width)
    columns = (
        [segs]
        if x is None
        else [
            [s for s in segs if (s.left + s.right) / 2 < x],
            [s for s in segs if (s.left + s.right) / 2 >= x],
        ]
    )
    known = [
        (
            float(data["left"][k]),
            float(data["top"][k]),
            float(data["width"][k]),
            float(data["height"][k]),
            k,
        )
        for k, t in enumerate(data["text"])
        if (t or "").strip()
    ]
    for n, column in enumerate(columns):
        if not column:
            continue
        x0 = max(0, int(min(s.left for s in column)) - 40)
        x1 = min(width, x0 + int(width * NUMBER_STRIP))
        found = read(image.crop((x0, 0, x1, height)))
        for k, raw in enumerate(found.get("text", [])):
            text = (raw or "").strip()
            if not RE_ITEM_NUMBER.match(text) or float(found["conf"][k]) < MIN_CONFIDENCE:
                continue
            left, top = x0 + float(found["left"][k]), float(found["top"][k])
            w, h = float(found["width"][k]), float(found["height"][k])
            middle = top + h / 2
            there = [
                kk
                for kl, kt, kw, kh, kk in known
                if kt <= middle <= kt + kh and kl < left + w and left < kl + kw
            ]
            if there:
                # A leitura da página já tinha algo neste lugar. Se era um número diferente,
                # vale o da faixa: sem o resto da página em volta, o dígito sai mais limpo.
                for kk in there:
                    if kk >= 0 and RE_ITEM_NUMBER.match((data["text"][kk] or "").strip()):
                        data["text"][kk] = text
                continue
            for key, value in (("text", text), ("conf", found["conf"][k]), ("left", left)):
                data[key].append(value)
            data["top"].append(top)
            data["width"].append(w)
            data["height"].append(h)
            data["block_num"].append(10_000 + n)  # bloco próprio: não se mistura às linhas lidas
            data["par_num"].append(0)
            data["line_num"].append(len(data["text"]))
            known.append((left, top, w, h, -1))


# --- Leitura do arquivo -----------------------------------------------------------------


def ocr_pdf(data: bytes) -> OcrResult:
    """Lê o PDF página a página. Lança `OcrUnavailable` (falta componente) ou `OcrBusy` (há
    outro arquivo em andamento); erro numa página isolada só deixa aquela página sem texto."""
    check_engine()
    import pypdfium2 as pdfium
    import pytesseract

    os.environ.setdefault("OMP_THREAD_LIMIT", "1")  # um núcleo: o servidor é compartilhado
    result = OcrResult()
    started = time.monotonic()
    with one_at_a_time():
        pdf = pdfium.PdfDocument(data)
        try:
            result.total = len(pdf)
            limit = min(result.total, settings.OCR_MAX_PAGES)
            result.truncated = result.total > limit
            for index in range(limit):
                left = settings.OCR_TIMEOUT_SECONDS - (time.monotonic() - started)
                if left <= 1:
                    result.truncated = True
                    break
                text = ""
                try:
                    page = pdf[index]
                    rendered = page.render(scale=settings.OCR_DPI / 72, grayscale=True).to_pil()
                    page.close()
                    image = remove_rules(rendered)
                    rendered.close()

                    def read(img, budget: float = left) -> dict:
                        return pytesseract.image_to_data(
                            img,
                            lang=settings.OCR_LANGS,
                            config=f"--psm {settings.OCR_PSM}",
                            output_type=pytesseract.Output.DICT,
                            timeout=budget,
                        )

                    words = read(image)
                    _numbers_in_strips(image, words, read)
                    text = rows_from_words(words, image.width)
                    image.close()
                except RuntimeError:  # tempo esgotado dentro do Tesseract
                    result.truncated = True
                    break
                except Exception as exc:  # noqa: BLE001
                    log.warning("ocr.page_failed", page=index + 1, error=type(exc).__name__)
                result.pages.append((index + 1, text))
        finally:
            pdf.close()
    result.seconds = round(time.monotonic() - started, 1)
    log.info(
        "ocr.done",
        pages=len(result.pages),
        total=result.total,
        truncated=result.truncated,
        seconds=result.seconds,
    )
    return result
