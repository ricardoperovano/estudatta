"""PDFs gerados em memória para os testes de materiais e importação.

- `make_text_pdf`: PDF mínimo montado à mão (fonte Helvetica padrão, um `Tj` por linha, uma
  página por lista). O `pypdf` extrai o texto linha a linha e por página — é o que a importação
  precisa para atribuir páginas aos itens. Só ASCII, para não depender de codificação de fonte.
- `make_image_only_pdf`: páginas em branco via `pypdf.PdfWriter.add_blank_page` — sem camada de
  texto, como um PDF digitalizado sem OCR.
- `make_encrypted_pdf`: PDF protegido por senha (depende de `cryptography`; devolve None se faltar).
"""

from __future__ import annotations

import io


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_text_pdf(pages: list[list[str]]) -> bytes:
    """`pages[i]` são as linhas da página i+1, impressas de cima para baixo."""
    if not pages:
        raise ValueError("informe ao menos uma página")
    page_ids = [4 + 2 * i for i in range(len(pages))]
    kids = " ".join(f"{pid} 0 R" for pid in page_ids)
    objects: list[tuple[int, bytes]] = [
        (1, b"<< /Type /Catalog /Pages 2 0 R >>"),
        (2, f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode()),
        (3, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
    ]
    for pid, lines in zip(page_ids, pages, strict=True):
        cid = pid + 1
        ops = ["BT", "/F1 12 Tf", "50 750 Td"]
        for j, line in enumerate(lines):
            if j:
                ops.append("0 -20 Td")
            ops.append(f"({_escape(line)}) Tj")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        objects.append(
            (
                pid,
                (
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                    f"/Resources << /Font << /F1 3 0 R >> >> /Contents {cid} 0 R >>"
                ).encode(),
            )
        )
        objects.append(
            (cid, f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")
        )
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets: dict[int, int] = {}
    for num, body in objects:
        offsets[num] = out.tell()
        out.write(f"{num} 0 obj\n".encode() + body + b"\nendobj\n")
    xref_at = out.tell()
    count = len(objects) + 1
    out.write(f"xref\n0 {count}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for num in sorted(offsets):
        out.write(f"{offsets[num]:010d} 00000 n \n".encode())
    out.write(f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode())
    return out.getvalue()


def make_image_only_pdf(n_pages: int = 2) -> bytes:
    """PDF válido cujas páginas não têm nenhum texto extraível."""
    from pypdf import PdfWriter

    writer = PdfWriter()
    for _ in range(n_pages):
        writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def make_encrypted_pdf(password: str) -> bytes | None:
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(make_text_pdf([["SUMARIO", "1.1 Item"]]))))
    try:
        writer.encrypt(password)
    except Exception:  # noqa: BLE001 - backend criptográfico ausente
        return None
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()
