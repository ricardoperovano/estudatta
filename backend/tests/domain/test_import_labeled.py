"""Leitor de conteúdo programático em parágrafos rotulados ("MATÉRIA: frase. frase.").

O documento é inventado, no desenho de um anexo de edital com mais de um cargo: seções, matérias
em maiúsculas com dois pontos, parágrafos que quebram no meio de uma sigla com dois pontos, uma
seção só com itens numerados e, depois, outro anexo com um cronograma numerado.
"""

from __future__ import annotations

from app.services.import_labeled import _fit, labeled_proposal
from app.services.imports import (
    Line,
    build_proposal,
    edital_proposal,
    parse_text,
    syllabus_region,
)

LONG = (
    "Estrutura lógica de relações entre pessoas, lugares e eventos; dedução de novas informações "
    "a partir das relações fornecidas e avaliação das condições usadas para estabelecer a "
    "estrutura daquelas relações; compreensão e elaboração da lógica das situações por meio de "
    "raciocínio verbal, raciocínio matemático e raciocínio sequencial."
)
DOC = [
    "31",
    "ANEXO IV",
    "CONTEÚDO PROGRAMÁTICO",
    "Observação: Considerar-se-á a legislação vigente até a data da publicação do Edital. Todos",
    "os temas englobam também a legislação que lhes é pertinente.",
    "CONHECIMENTOS GERAIS – Para todos os cargos",
    "LÍNGUA PORTUGUESA: Ortografia e acentuação. Emprego do sinal indicativo de crase. Redação",
    "(confronto de frases corretas e incorretas; organização de períodos). Lei n. 9.394/1996.",
    "NOÇÕES DE INFORMÁTICA: Segurança digital. Noções da Lei Geral de Proteção de Dados Pessoais",
    "LGPD: fundamentos, princípios e bases legais. Planilhas eletrônicas.",
    "CONHECIMENTOS ESPECÍFICOS – Ensino Médio",
    "TB – TÉCNICO BANCÁRIO",
    f"RACIOCÍNIO LÓGICO: {LONG}",
    "MATEMÁTICA FINANCEIRA: 1 Juros simples. 2 Juros compostos. 3 Taxas de juros.",
    "TS – TÉCNICO EM SEGURANÇA",
    "1. Saúde e segurança do trabalho.",
    "2. Prevenção e combate a incêndios. Sistemas de alarme.",
    "3. Ergonomia.",
    "34",
    "ANEXO V",
    "CRONOGRAMA DAS PROVAS",
    "Itens Atividades Datas Previstas",
    *[f"{n} Etapa número {n} do concurso 0{n}/11/2026" for n in range(1, 9)],
]


def lines(doc: list[str]) -> list[Line]:
    return [Line(t, 1) for t in doc]


def test_each_subject_and_each_sentence_comes_through():
    p = labeled_proposal(lines(DOC))
    assert p is not None and p["stats"]["layout"] == "labeled"
    subjects = {s["title"]: s["topics"] for s in p["subjects"]}
    # com mais de uma seção, a seção acompanha a matéria: dá para saber o que é de cada cargo
    assert list(subjects) == [
        "LÍNGUA PORTUGUESA · CONHECIMENTOS GERAIS – Para todos os cargos",
        "NOÇÕES DE INFORMÁTICA · CONHECIMENTOS GERAIS – Para todos os cargos",
        "RACIOCÍNIO LÓGICO · TB – TÉCNICO BANCÁRIO",
        "MATEMÁTICA FINANCEIRA · TB – TÉCNICO BANCÁRIO",
        "TS – TÉCNICO EM SEGURANÇA",
    ]
    portugues, informatica, logica, financeira, seguranca = subjects.values()
    # uma frase, um tópico, com a redação do documento; "n." não encerra frase
    assert [t["title"] for t in portugues] == [
        "Ortografia e acentuação",
        "Emprego do sinal indicativo de crase",
        "Redação (confronto de frases corretas e incorretas; organização de períodos)",
        "Lei n. 9.394/1996",
    ]
    # "LGPD:" no começo de uma linha que continua o parágrafo não abre matéria
    assert [t["title"] for t in informatica] == [
        "Segurança digital",
        "Noções da Lei Geral de Proteção de Dados Pessoais LGPD: fundamentos, princípios e bases legais",
        "Planilhas eletrônicas",
    ]
    # frase longa demais para um título não é cortada: o resto vira subtópicos
    (longo,) = logica
    assert longo["title"] == "Estrutura lógica de relações entre pessoas, lugares e eventos"
    assert len(longo["children"]) == 2 and not any("…" in c["title"] for c in longo["children"])
    rebuilt = "; ".join([longo["title"], *(c["title"] for c in longo["children"])])
    assert rebuilt == LONG.rstrip(".")
    # numeração corrida dentro do parágrafo sai do título
    assert [t["title"] for t in financeira] == [
        "Juros simples",
        "Juros compostos",
        "Taxas de juros",
    ]
    # seção sem rótulos, só com itens numerados: uma matéria, lida pelo leitor de numeração
    assert [[t["title"], *(c["title"] for c in t["children"])] for t in seguranca] == [
        ["Saúde e segurança do trabalho"],
        ["Prevenção e combate a incêndios", "Sistemas de alarme"],
        ["Ergonomia"],
    ]
    # observações do começo e o cronograma do anexo seguinte ficam de fora
    everything = " ".join(t["title"] for topics in subjects.values() for t in topics)
    assert "legislação vigente" not in everything and "Etapa número" not in everything


def test_edital_reader_keeps_the_one_that_uses_more_of_the_document():
    """O cronograma numerado do fim bastaria para o leitor de itens numerados; quem cobre o
    conteúdo programático é o leitor de parágrafos."""
    p = edital_proposal(lines(DOC), source="pdf")
    assert p is not None and p["stats"]["layout"] == "labeled" and p["stats"]["subjects"] == 5
    old = build_proposal(lines(DOC), source="pdf", strict=True)
    assert old["stats"]["topics"] < p["stats"]["topics"]  # o leitor genérico perdia quase tudo
    pasted = parse_text("\n".join(DOC))
    assert pasted["stats"]["layout"] == "labeled" and pasted["stats"]["source"] == "text"


def test_single_section_keeps_plain_subject_titles_and_other_documents_are_left_alone():
    doc = [
        "PORTUGUÊS: Ortografia. Crase.",
        "MATEMÁTICA: Frações. Porcentagem.",
        "HISTÓRIA: Brasil Colônia. Brasil Império.",
    ]
    p = labeled_proposal(lines(doc))
    assert [s["title"] for s in p["subjects"]] == ["PORTUGUÊS", "MATEMÁTICA", "HISTÓRIA"]
    assert labeled_proposal(lines(doc[:2])) is None  # duas matérias só: não é esse desenho
    notes = ["OBS: leia com atenção.", "ATENÇÃO: prova no domingo.", "NOTA: sem consulta."]
    assert labeled_proposal(lines(notes)) is None
    summary = ["GRAMATICA", "1.1 Present simple", "1.2 Past simple", "LISTENING", "2.1 Podcasts"]
    assert (
        labeled_proposal(lines(summary)) is None
        and edital_proposal(lines(summary), source="pdf") is None
    )


def test_long_sentence_is_split_not_cut():
    title, rest = _fit("Curto.")
    assert (title, rest) == ("Curto", [])
    title, rest = _fit(
        "Tema: " + ", ".join(f"assunto número {n} da lista" for n in range(1, 20)) + "."
    )
    assert title == "Tema" and all(len(x) <= 200 for x in rest)
    assert ", ".join(rest) == ", ".join(f"assunto número {n} da lista" for n in range(1, 20))


def test_full_notice_is_narrowed_to_the_syllabus_annex():
    """Edital inteiro: as cláusulas numeradas (inscrição, provas, recursos) não são matéria.
    Só vale o trecho entre o título "CONTEÚDO PROGRAMÁTICO" e o anexo seguinte."""
    rules = ["EDITAL DE ABERTURA", "INSTRUÇÕES ESPECIAIS"]
    for n in range(1, 13):
        rules += [
            f"{n}. DAS INSCRIÇÕES E DAS PROVAS, CLÁUSULA {n}",
            f"{n}.1. O candidato deverá ler o Anexo IV.",
        ]
    rules += ["O conteúdo programático consta do Anexo IV deste Edital."]  # menção, não título
    full = [*rules, *DOC]
    region = syllabus_region(lines(full))
    assert region[0].text.startswith("Observação") and region[-1].text == "34"
    p = edital_proposal(lines(full), source="pdf")
    assert p["stats"]["layout"] == "labeled" and p["stats"]["subjects"] == 5
    assert not any("CLÁUSULA" in t["title"] for s in p["subjects"] for t in s["topics"])
    # documento que já é só o conteúdo, ou sem esse título, volta inteiro
    plain = lines(["HISTÓRIA", "1. Antiguidade.", "2. Idade Média."])
    assert syllabus_region(plain) == plain
