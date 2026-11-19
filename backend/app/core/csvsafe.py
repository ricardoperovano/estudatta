"""Exportação CSV segura para planilhas.

Excel, LibreOffice e Google Planilhas tratam como fórmula a célula que começa com `=`, `+`,
`-`, `@` (ou tabulação/retorno de carro). Um título de tópico importado de um PDF de terceiros
com `=HYPERLINK(...)` viraria fórmula quando a pessoa abrisse o próprio histórico exportado.
O apóstrofo na frente faz a planilha mostrar o texto como texto.
"""

from __future__ import annotations

from typing import Any

FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    if isinstance(value, str) and value.startswith(FORMULA_STARTS):
        return "'" + value
    return value


def safe_row(row: list[Any]) -> list[Any]:
    return [safe_cell(v) for v in row]
