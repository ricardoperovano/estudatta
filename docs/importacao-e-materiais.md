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

## Edital em itens numerados
Editais verticalizados e tabelas de edital têm leitor próprio
(`backend/app/services/import_numbered.py`), usado antes da heurística acima em PDF e em texto
colado. Nesses documentos o item ocupa várias linhas, a matéria vem como "Direito
Constitucional" (não em maiúsculas) e o número do item fica sozinho numa linha, então a
heurística linha a linha devolvia uma matéria só com centenas de pedaços de frase.

- O item começa num número (`7`, `7 Texto`, `7. Texto`, `1.2`, `1.2.1`) que **continua a
  sequência**; página, ano e número de lei ficam de fora. Vale também para o anexo oficial em
  texto corrido ("DIREITO CIVIL" e, abaixo, "1. Texto do item…"): o parágrafo sem número logo
  depois do título vira o primeiro item, e subitens numerados dentro do parágrafo ("1.1.",
  "1.2") perdem o número e viram subtópicos.
- A numeração que **volta para 1** abre uma matéria; o título é a linha curta, sem ponto final,
  logo acima (pode quebrar em até três linhas).
- Saem as linhas repetidas de página em página (cabeçalho, rodapé, cabeçalho da tabela) e as
  caixas de marcação.
- O texto do item é remontado: a **primeira frase vira o tópico** e as demais, subtópicos.
  Grupo com subitens curtos (`1 TÍTULO`, `1.1 …`) vira um tópico com os subitens dentro; com
  subitens em parágrafo, cada subitem vira um tópico com o nome do grupo na frente.
- Dois desenhos de tabela: número antes do texto, ou número centralizado na célula (ele sai no
  meio das linhas do item, e a divisão é conferida pelo ponto final).
- Um número que a leitura perdeu (acontece no OCR) não derruba a sequência: ela segue no
  seguinte, e o texto do item sem número fica junto do anterior.
- Precisa de ao menos 8 itens numerados; senão, segue a heurística geral. A proposta marca
  `stats.layout = "numbered"`, e a revisão no app troca o aviso de "muita coisa" e a sugestão
  de IA por uma nota de que os itens do edital foram reconhecidos.

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
- `OCR_ENABLED=true`: lê as páginas por OCR (`backend/app/services/ocr.py`). Se faltar um
  componente ou nada for reconhecido, a falha é a mesma, com o motivo na mensagem.

Como a leitura funciona:
- cada página é renderizada pelo pdfium (`OCR_DPI`, padrão 200) e lida pelo Tesseract em
  português (`OCR_LANGS=por`), os dois já instalados na imagem do backend;
- antes da leitura, as **linhas de tabela são apagadas** da imagem; depois dela, uma **segunda
  leitura só da faixa dos números** recupera os números de item que o Tesseract perde quando
  estão sozinhos na célula;
- o texto é **remontado pela posição das palavras** (linha a linha, da esquerda para a direita;
  em página de duas colunas, uma coluna inteira antes da outra), e segue para os mesmos leitores
  do PDF com texto.

Travas, porque o servidor é compartilhado:
- **um arquivo por vez** na máquina (trava de arquivo). Quem chega com outro em leitura volta
  para a fila e tenta de novo a cada 20 s, por até 15 min; depois disso falha com `ocr_busy`;
- o Tesseract usa **um núcleo** (`OMP_THREAD_LIMIT=1`);
- `OCR_MAX_PAGES` (60) e `OCR_TIMEOUT_SECONDS` (300): passou disso, o que foi lido vira proposta
  parcial, com `stats.truncated`.

A proposta registra `stats.ocr` e `stats.pages_total`; com `stats.ocr`, a revisão avisa que o
texto veio de imagem e pode ter erros de leitura. Para conferir a leitura real numa máquina sem
Tesseract em português: `docker build -t estudatta-backend backend` e rode `ocr.ocr_pdf` dentro
da imagem.

## Materiais
- Tipos: **link** (`POST /materials/link`, só `https://`; caminhos locais como `C:\` ou
  `file:` são recusados com `local_path`), **físico** (`/materials/physical`: livro/apostila com
  páginas) e **PDF** (`/materials/upload`).
- Páginas: `page_to < page_from` → 422 (`bad_pages` no serviço; `validation_failed` no schema).
- Cotas por plano (`get_entitlements`): Free 20 materiais e 50 MB; Pro sem limite de itens e
  2.048 MB. Estouro → 402 `materials_limit` / `storage_quota`.
- Vínculo material ↔ tópico com intervalo de páginas (`POST /materials/{id}/topics`).

### Marcador de página (livro atual)
- `materials.current_page` é o marcador; `activities.current_material_id` aponta o material "em
  andamento" do objetivo (`PATCH /activities/{id}` com `current_material_id` ou
  `clear_current_material`; `ActivityOut.current_material` traz título, página, total e `percent`).
- Ao registrar/encerrar/editar uma sessão, `pages_read` ("li 8 páginas") gera `page_from/page_to`
  a partir do marcador e o move (X → X+8); um `page_to` explícito também move. Sessão sem
  `material_id` herda o material atual do objetivo. O marcador nunca passa de `pages_total`;
  `last_position` vira "p. N". Só sessões `finished` sem `needs_review` mexem no marcador.
- `PATCH /materials/{id}`: `current_page` (0..pages_total) ou `clear_current_page`.
- No app: cartão "Lendo agora" no objetivo de leitura (aba Materiais nas outras categorias),
  campo "Quantas páginas você leu?" ao registrar tempo e ao encerrar o cronômetro; nas demais
  categorias, chips de sugestão para o conteúdo e tipo de estudo padrão pela categoria
  (`session-progress.tsx`).

## Segurança
- Tipo do arquivo verificado pelo conteúdo (`%PDF-`), não pela extensão nem pelo
  `Content-Type` declarado.
- Arquivos ficam em `users/{user_id}/...` no storage; download só por URL assinada com validade
  `SIGNED_URL_TTL_SECONDS`.
- Toda consulta filtra por `user_id`; importação/material de outro usuário → 404.
- Criação e confirmação são auditadas (`import.create`, …) apenas com metadados.
- Erros de validação (422) não devolvem o corpo enviado nem objetos internos.
