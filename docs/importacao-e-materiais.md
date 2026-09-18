# Importação de conteúdo e materiais

Código: `backend/app/services/imports.py`, `backend/app/services/materials.py`,
`backend/app/api/v1/{imports,materials}.py`, `backend/app/jobs/tasks_imports.py`.

## Princípios
- O conteúdo do documento é **dado não confiável**: só passa por heurísticas determinísticas e
  sanitização de títulos (`clean_title`); nada é executado nem interpretado.
- **Nada é criado sem confirmação.** Toda importação vira uma *proposta* editável
  (`status = needs_review`); matérias e tópicos só nascem no `confirm`.
- Falhas são honestas: PDF sem texto falha com `no_text_layer`; nunca fingimos sucesso.

## Fluxo
1. `POST /api/v1/imports`
   - JSON `{activity_id, source: "text" | "csv", content}` — processado no próprio request,
     já volta `needs_review` com a proposta;
   - multipart (`file`, `activity_id`, `source?`, `create_material?`) — **PDF** volta `queued`
     e é processado pelo worker (fila `imports`, tarefa `process_import`); **CSV/TXT enviado
     como arquivo** é processado na hora e guarda o `file_name`.
2. `GET /api/v1/imports/{id}` — acompanha `queued → processing → needs_review | failed`
   (`error_code` + `error_message` quando falha).
3. `PATCH /api/v1/imports/{id}` — salva a proposta revisada (só em `needs_review`).
4. `POST /api/v1/imports/{id}/confirm` — cria matérias/tópicos (a proposta pode vir no corpo);
   cada tópico guarda `source_ref` (`import_id`, página). Com `create_material=true` o PDF vira
   material e os tópicos são vinculados às páginas.
5. `POST /api/v1/imports/{id}/cancel` — descarta; o arquivo enviado só para importação é apagado.

Se a fila estiver indisponível ao enviar um PDF, o job fica `failed` com `queue_unavailable`
(nada fica "preso" em `queued`). Erro de infraestrutura no worker tenta mais uma vez e depois
marca `internal`.

## Heurística de texto
Numeração (`1.`, `1.1`, `1.1.1`), romanos, `#`, marcadores e letras definem o nível; a
**numeração é removida do título** ("1.1 Present simple" → "Present simple"). Referências de
página no fim da linha ("..... 12") viram `page`. No máximo dois níveis abaixo da matéria
(tópico → subtópico). Sem matéria identificável, usa-se "Geral". Em PDF a leitura é mais
estrita (só linhas com cara de sumário).

## Modelo CSV
`GET /api/v1/imports/template.csv` (arquivo `backend/app/templates/import-modelo-conteudo.csv`):

```
materia;topico;subtopico;paginas;minutos_estimados
Gramática;Present simple;;12-20;30
Gramática;Present simple;Verbos regulares;12-15;10
Listening;Podcasts curtos;;;25
```

- Obrigatórias: `materia` e `topico`. Opcionais: `subtopico`, `paginas` (`12` ou `12-20`),
  `minutos_estimados`.
- Separador `;` ou `,` (detectado); cabeçalho com ou sem acento; BOM aceito.
- Cabeçalho errado → `csv_header` (com colunas esperadas e encontradas); vazio → `csv_empty`.

## Limites
| Item | Limite | Código de erro |
|---|---|---|
| Texto/CSV colado ou enviado | 400.000 caracteres, 20.000 linhas | `text_too_long` |
| Upload de PDF | `MAX_UPLOAD_MB` (padrão 25 MB) | `file_too_large` |
| Páginas do PDF | `MAX_PDF_PAGES` (padrão 800) | `too_many_pages` |
| Tempo de extração | `PDF_EXTRACTION_TIMEOUT_SECONDS` (padrão 120 s) | `pdf_timeout` |
| Proposta | 200 matérias, 3.000 tópicos, títulos até 400 caracteres | 422 |
| PDF com senha / corrompido | — | `pdf_encrypted` / `pdf_unreadable` |
| Formato desconhecido | — | `unsupported_file` / `not_pdf` |

## OCR
Um PDF é considerado "sem camada de texto" quando ≥ 90% das páginas têm menos de 20
caracteres. Nesse caso:
- `OCR_ENABLED=false` (padrão): falha com `no_text_layer` e orientação para gerar um PDF com texto;
- `OCR_ENABLED=true`: tenta `pytesseract` (`por+eng`). Se o componente não estiver instalado ou
  não reconhecer texto suficiente, a falha é a mesma — com o motivo na mensagem.
A proposta registra `stats.ocr` e `stats.pages_total`.

## Materiais
- Tipos: **link** (`POST /materials/link`, só `https://`; caminhos locais como `C:\` ou
  `file:` são recusados com `local_path`), **físico** (`/materials/physical`: livro/apostila com
  páginas) e **PDF** (`/materials/upload`).
- Páginas: `page_to < page_from` → 422 (`bad_pages` no serviço; `validation_failed` no schema).
- Cotas por plano (`get_entitlements`): Free 20 materiais e 50 MB; Pro sem limite de itens e
  2.048 MB. Estouro → 402 `materials_limit` / `storage_quota`.
- Vínculo material ↔ tópico com intervalo de páginas (`POST /materials/{id}/topics`).

## Segurança
- Tipo do arquivo verificado pelo conteúdo (`%PDF-`), não pela extensão nem pelo
  `Content-Type` declarado.
- Arquivos ficam em `users/{user_id}/...` no storage; download só por URL assinada com validade
  `SIGNED_URL_TTL_SECONDS`.
- Toda consulta filtra por `user_id`; importação/material de outro usuário → 404.
- Criação e confirmação são auditadas (`import.create`, …) apenas com metadados.
- Erros de validação (422) não devolvem o corpo enviado nem objetos internos.
