"""Leitor de conteúdo programático em itens numerados (editais verticalizados, tabelas).

Os documentos aqui são inventados, mas reproduzem o desenho que a extração de um PDF real
devolve: item em várias linhas, matéria em "Título de Matéria" (não em maiúsculas), número do
item sozinho na linha ou centralizado no meio do item, cabeçalho repetido em toda página, caixas
de marcação, subitens 1.1 e 1.1.1, item sem número e propaganda no fim do arquivo.
"""

from __future__ import annotations

from app.services.import_numbered import (
    join_lines,
    looks_like_heading,
    numbered_proposal,
    split_sentences,
)
from app.services.imports import Line, build_proposal, parse_text

BOX = "☐ ☐ ☐"
HEADER = "CURSO EXEMPLO · Reta final  {}"
TABLE = "Nº Conteúdo Teoria Revisão Questões"

TOP_PAGES = [
    [
        "EDITAL VERTICALIZADO",
        "Concurso Exemplo",
        "COMO USAR",
        "Marque cada item quando estudar.",
        "Matéria Itens Objetiva",
        "História Geral 3 Sim",
        "Geografia do Brasil e da América Latina 7 Sim",
    ],
    [
        HEADER.format(2),
        "História Geral",
        "Onde cai: Prova objetiva · Prova oral",
        TABLE,
        "1 ",
        "Antiguidade. Grécia e Roma. Formação das ",
        "cidades-Estado. ",
        BOX,
        f"2 Idade Média. Feudalismo.  {BOX}",
        "3 ",
        "Idade Moderna. Renascimento e reforma. Lei n. 10.639, de 9 de janeiro de 2003. ",
        "1 de janeiro não é item: a numeração não recomeça aqui. ",
        BOX,
    ],
    [
        HEADER.format(3),
        "Geografia do Brasil e ",
        "da América Latina ",
        "Onde cai: Prova objetiva",
        TABLE,
        "— ",
        "Conceitos fundamentais. Espaço e território. ",
        BOX,
        "1 RELEVO. ",
        f"1.1 Planaltos. {BOX}",
        f"1.2 Planícies. {BOX}",
        f"1.2 Depressões. {BOX}",
        f"1.2.1 Depressão periférica. {BOX}",
        "2 CLIMA. ",
        "2.1 ",
        "Massas de ar. Frentes frias. Atuação no ",
        "inverno e seus efeitos sócio -econômicos. ",
        BOX,
        f"2.2 Tipos de clima. Classificação. {BOX}",
    ],
    [
        HEADER.format(4),
        TABLE,
        f"3 Hidrografia. {BOX}",
        "Este material ajuda você a estudar.",
        "Conheça o curso clicando abaixo",
        "CLIQUE AQUI!",
    ],
]


def as_lines(pages: list[list[str]]) -> list[Line]:
    return [Line(text, n) for n, page in enumerate(pages, start=1) for text in page]


def flat(topic: dict) -> list[str]:
    return [topic["title"], *(c["title"] for c in topic["children"])]


def test_table_with_number_before_the_item():
    p = numbered_proposal(as_lines(TOP_PAGES))
    assert p is not None
    assert [s["title"] for s in p["subjects"]] == [
        "História Geral",
        "Geografia do Brasil e da América Latina",  # título quebrado em duas linhas
    ]
    historia, geografia = (s["topics"] for s in p["subjects"])
    # o item ocupa várias linhas: a primeira frase é o tópico, as outras, subtópicos
    assert [flat(t) for t in historia] == [
        ["Antiguidade", "Grécia e Roma", "Formação das cidades-Estado"],
        ["Idade Média", "Feudalismo"],
        [
            "Idade Moderna",
            "Renascimento e reforma",
            "Lei n. 10.639, de 9 de janeiro de 2003",  # "n." não encerra frase
            "1 de janeiro não é item: a numeração não recomeça aqui",
        ],
    ]
    assert [flat(t) for t in geografia] == [
        ["Conceitos fundamentais", "Espaço e território"],  # item sem número, antes do 1
        # grupo com subitens curtos: o grupo é o tópico; 1.2 repetido e 1.2.1 entram também
        ["RELEVO", "Planaltos", "Planícies", "Depressões", "Depressão periférica"],
        # grupo com subitem em parágrafo: cada subitem vira tópico, com o grupo na frente
        [
            "CLIMA: Massas de ar",
            "Frentes frias",
            "Atuação no inverno e seus efeitos sócio-econômicos",
        ],
        ["CLIMA: Tipos de clima", "Classificação"],
        ["Hidrografia"],  # propaganda depois do último item fica de fora
    ]
    assert historia[0]["page"] == 2 and geografia[-1]["page"] == 4
    stats = p["stats"]
    assert stats["layout"] == "numbered" and stats["source"] == "pdf"
    assert (stats["subjects"], stats["topics"], stats["truncated"]) == (2, 8, False)
    assert stats["subtopics"] == sum(len(t["children"]) for t in historia + geografia)


def test_generic_reader_made_one_subject_out_of_this():
    """O que acontecia antes: capa e chamadas viravam matéria e cada linha, um tópico."""
    old = build_proposal(as_lines(TOP_PAGES), source="pdf", strict=True)
    titles = [s["title"] for s in old["subjects"]]
    assert "História Geral" not in titles and "EDITAL VERTICALIZADO" in titles
    assert "CLIQUE AQUI!" not in titles  # ao menos a linha em maiúsculas sem itens saiu


# --- número centralizado na célula ------------------------------------------------------


def centered(number: str, lines: list[str]) -> list[str]:
    """Como a extração devolve uma linha de tabela com o número centralizado na vertical:
    altura ímpar, o número divide a linha do meio; altura par, ele sai sozinho."""
    n = len(lines)
    if n % 2:
        mid = n // 2
        return [*lines[:mid], f"{number} {lines[mid]}", *lines[mid + 1 :]]
    at = max(0, n // 2 - 1)
    return [*lines[:at], number, *lines[at:]]


MATEMATICA = [
    [
        "Conjuntos numéricos. Operações com",
        "naturais e inteiros. Divisibilidade e",
        "números primos.",
    ],
    [
        "Razão e proporção. Regra de três",
        "simples e composta. Porcentagem e",
        "juros. Problemas com grandezas",
        "direta e inversamente proporcionais.",
    ],
    ["Equações do primeiro grau."],
    ["Funções. Domínio e imagem de uma", "função real."],
    [
        "Geometria plana. Polígonos e",
        "circunferência. Áreas e perímetros.",
        "Semelhança de triângulos e o teorema",
        "de Tales. Relações métricas no",
        "triângulo retângulo. Trigonometria no",
        "triângulo qualquer.",
    ],
]
PORTUGUES_INTRO = [
    "Leitura e interpretação de textos de",
    "gêneros variados. Informações implícitas",
    "e explícitas no texto.",
]
PORTUGUES = [
    [
        "Fonologia. Encontros vocálicos e",
        "consonantais. Divisão silábica e",
        "acentuação gráfica das palavras.",
        "Ortografia oficial. Emprego do hífen e",
        "das iniciais maiúsculas.",
    ],
    ["Morfologia. Classes de palavras."],
    ["Sintaxe. Termos da oração."],
]


def centered_pages() -> list[list[str]]:
    header = "Apostila Exemplo — conteúdo programático"
    mat = [ln for n, item in enumerate(MATEMATICA, start=1) for ln in centered(str(n), item)]
    por = [ln for n, item in enumerate(PORTUGUES, start=1) for ln in centered(str(n), item)]
    return [
        [header, "1", "Apostila Exemplo — sumário simplificado", "Texto organizado por matéria."],
        [header, "2", "Matemática", *mat[:9]],
        [header, "3", *mat[9:]],
        # item sem número antes do 1, e o 1 no meio de uma frase ("1 acentuação gráfica…")
        [header, "4", "Língua Portuguesa", *PORTUGUES_INTRO, *por],
    ]


def test_table_with_number_centered_in_the_cell():
    pages = centered_pages()
    assert any(ln.startswith("1 acentuação") for page in pages for ln in page)
    p = numbered_proposal(as_lines(pages))
    assert p is not None
    assert [s["title"] for s in p["subjects"]] == ["Matemática", "Língua Portuguesa"]
    mat, por = (s["topics"] for s in p["subjects"])
    for topics, items in ((mat, MATEMATICA), (por, [PORTUGUES_INTRO, *PORTUGUES])):
        assert len(topics) == len(items)
        for topic, item in zip(topics, items, strict=True):
            # cada item volta inteiro, com as frases na ordem
            assert flat(topic) == [s.rstrip(".") for s in split_sentences(join_lines(item))]
    assert flat(mat[1])[:2] == ["Razão e proporção", "Regra de três simples e composta"]
    assert mat[0]["page"] == 2 and mat[4]["page"] == 3  # cabeçalho e nº da página saíram


# --- o que não é esse formato ------------------------------------------------------------


def test_other_documents_are_left_to_the_generic_reader():
    summary = ["GRAMATICA", "1.1 Present simple", "1.2 Past simple", "LISTENING", "2.1 Podcasts"]
    assert numbered_proposal([Line(t, 1) for t in summary]) is None
    prose = [
        "O edital foi publicado em 9 de outubro.",
        "1 de janeiro é feriado nacional.",
        "2026 é o ano da prova.",
        "As inscrições vão até o dia",
        "30 de novembro.",
    ]
    assert numbered_proposal([Line(t, 1) for t in prose]) is None
    # poucos itens numerados: não é uma tabela de edital
    short = ["Matemática", "1", "Conjuntos.", "2", "Funções."]
    assert numbered_proposal([Line(t, 1) for t in short]) is None


def test_pasted_text_uses_the_same_reader():
    text = "\n".join(line for page in TOP_PAGES for line in page)
    p = parse_text(text)
    assert p["stats"]["layout"] == "numbered" and p["stats"]["source"] == "text"
    assert [s["title"] for s in p["subjects"]] == [
        "História Geral",
        "Geografia do Brasil e da América Latina",
    ]
    # texto comum continua no leitor de sempre
    plain = parse_text("Gramática\n  Present simple\n  Past simple\n")
    assert "layout" not in plain["stats"] and plain["subjects"][0]["title"] == "Gramática"


def test_sentences_and_line_joining():
    assert split_sentences("Lei n. 13.105/2015. Registros (Lei n. 6.015/1973). Art. 5º da CF.") == [
        "Lei n. 13.105/2015.",
        "Registros (Lei n. 6.015/1973).",
        "Art. 5º da CF.",
    ]
    assert split_sentences("SILVA, J. Teoria geral. 3. ed. São Paulo: Atlas, 2020.") == [
        "SILVA, J. Teoria geral.",
        "3. ed. São Paulo: Atlas, 2020.",
    ]
    assert split_sentences("Vulneráveis. 100 Regras de Brasília.") == [
        "Vulneráveis.",
        "100 Regras de Brasília.",
    ]
    assert join_lines(["parceria público -", "privada e latino -americano."]) == (
        "parceria público-privada e latino-americano."
    )
    assert join_lines(["cidades-", "Estado"]) == "cidades- Estado"  # só desfaz hífen de quebra


def test_heading_shape():
    assert looks_like_heading("Direito Constitucional")
    assert looks_like_heading("Princípios e Atribuições Institucionais da Defensoria")
    for not_heading in (
        "Onde cai: Prova objetiva",  # rótulo: valor
        "Idade Média. Feudalismo",  # duas frases
        "conceito, origem e objeto",  # começa em minúscula
        "Evolução histórica das constituições.",  # termina frase
        "39 Registros Públicos",
    ):
        assert not looks_like_heading(not_heading), not_heading


def test_long_items_keep_within_title_size_and_limits():
    long_sentence = "Tema " + "muito extenso " * 30
    lines = ["Matéria Única"]
    for n in range(1, 11):
        lines += [str(n), f"{long_sentence}. Segunda frase do item {n}.", BOX]
    p = numbered_proposal([Line(t, 1) for t in lines])
    assert p is not None and len(p["subjects"][0]["topics"]) == 10
    first = p["subjects"][0]["topics"][0]
    assert len(first["title"]) <= 200 and first["title"].endswith("…")
    assert first["children"] == [{"title": "Segunda frase do item 1", "page": 1}]


# --- edital oficial em texto corrido ("1. Texto…") -----------------------------------------

OFFICIAL = [
    "ANEXO II",
    "Obs: Considerar-se-á a legislação vigente até a data da publicação do Edital.",
    "HISTÓRIA GERAL",
    "1. Antiguidade. Grécia e Roma. Formação das cidades-Estado e a expansão do",
    "império romano.",
    "2. Idade Média. Feudalismo.",
    "3. Idade Moderna. Lei Federal nº 3.850 de 1990. Renascimento.",
    "4. Revolução Industrial.",
    "GEOGRAFIA DO BRASIL",
    "Conceitos fundamentais da geografia. Espaço, território e",
    "paisagem.",
    "1. RELEVO. 1.1. Planaltos e planícies. 1.2 Depressões. Classificações do",
    "relevo brasileiro.",
    "2. Clima. Massas de ar.",
    "3. Hidrografia: 3.1. Bacias hidrográficas. 3.2. Aquíferos.",
    "4. Vegetação.",
    "5. População.",
]


def test_official_syllabus_in_running_text():
    """Anexo de edital como sai no Diário Oficial (e do OCR de um digitalizado): matéria em
    maiúsculas, itens "1. Texto" em parágrafo, subitens numerados dentro do próprio parágrafo
    e, às vezes, um parágrafo de abertura sem número."""
    p = numbered_proposal([Line(t, 1) for t in OFFICIAL])
    assert p is not None
    assert [s["title"] for s in p["subjects"]] == ["HISTÓRIA GERAL", "GEOGRAFIA DO BRASIL"]
    historia, geografia = (s["topics"] for s in p["subjects"])
    assert [flat(t) for t in historia] == [
        [
            "Antiguidade",
            "Grécia e Roma",
            "Formação das cidades-Estado e a expansão do império romano",
        ],
        ["Idade Média", "Feudalismo"],
        # "3.850" é número de lei, não o subitem 3.850 do item 3
        ["Idade Moderna", "Lei Federal nº 3.850 de 1990", "Renascimento"],
        ["Revolução Industrial"],
    ]
    assert [flat(t) for t in geografia] == [
        ["Conceitos fundamentais da geografia", "Espaço, território e paisagem"],
        ["RELEVO", "Planaltos e planícies", "Depressões", "Classificações do relevo brasileiro"],
        ["Clima", "Massas de ar"],
        ["Hidrografia: Bacias hidrográficas", "Aquíferos"],
        ["Vegetação"],
        ["População"],
    ]
