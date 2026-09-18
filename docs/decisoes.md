# Decisões e suposições — Estudatta

Registro vivo das decisões tomadas durante a implementação. Cada item indica a data (UTC), o contexto e a razão. Itens marcados com **[pendente do responsável]** dependem de decisão comercial, credencial ou publicação.

## 2026-09-18 — Estrutura e ambiente

- **Raiz do repositório:** `estudatta.com.br/` ao lado da pasta de design `Identidade visual e design system PWA Estudatta/`, que permanece intocada. Assets necessários (marca, ícones PWA, capa Open Graph, tokens JSON) foram copiados para dentro do repositório; o build não depende da pasta externa.
- **Portas locais:** as portas padrão (5432, 6379, 1025, 8025, 8000, 5173, 8080) já estavam ocupadas por outros projetos na máquina do responsável. O Estudatta usa 5450 (Postgres), 6400 (Redis), 1050/8050 (Mailpit), 8020 (API), 5180 (Vite) e 8090 (web). Tudo é configurável em `.env`.
- **Python 3.12 via uv** (o sistema tem 3.14, ainda sem rodas estáveis para algumas dependências). `redis` fixado em `>=5.0.3,<6.5` por exigência do `kombu` 5.6.
- **SQLAlchemy 2 síncrono com psycopg 3.** Um único modo de acesso ao banco simplifica jobs Celery e testes; o FastAPI executa endpoints síncronos em threadpool.
- **Testes de API em SQLite** (rápidos, sem infraestrutura) e migrações verificadas em Postgres vazio. Os modelos evitam tipos exclusivos do Postgres (`JSON` com variante `JSONB`, `Uuid` portátil, índices parciais com `postgresql_where`/`sqlite_where`). `UTCDateTime` garante datetimes cientes de fuso em qualquer banco.

## 2026-09-18 — Design

- **`tokens/tokens.css` está corrompido** no material recebido (valores hexadecimais quebrados como `#292b-31`, durações em `px`). A fonte adotada é `tokens/design-tokens.json` + `design-system.md`, que são consistentes entre si e com os documentos `.dc.html`. As variáveis CSS do frontend são geradas a partir do JSON (`apps/web/src/design/tokens/`).
- **Os documentos `.dc.html`** são mockups renderizados com React via CDN (`support.js` + Nocturne `styles.css`); não são a arquitetura do produto. Suas classes (`.btn`, `.card`, `.seg`, `.tag`) foram traduzidas para componentes React/Tailwind com os mesmos valores.
- **Inter empacotada localmente** (`@fontsource/inter`), em vez do `@import` do Google Fonts usado pelos mockups, para que o build não dependa de recursos externos.
- **Nome e identidade:** "Estudatta" e a marca fornecida são definitivos (o `design-system.md` diz "provisório", mas o pedido fixa o nome).

## 2026-09-18 — Domínio

- **Segundos inteiros** em todo o motor; conversão para minutos só na apresentação. Intervalos são truncados ao segundo ao persistir, de modo que a divisão por dia local nunca duplica nem perde segundos.
- **Mudança de fuso com vigência futura:** um novo período `effective_from = D` passa a valer a partir da meia-noite local de D **no fuso anterior**; o histórico nunca é movido de dia.
- **Perdão de pendência** é um `balance_adjustment` aplicado ao fechamento do dia anterior ao pedido, reduzindo a pendência que entra hoje sem tocar no dia em aberto nem criar sessão fictícia. A prévia mostra antes/depois e a ação fica auditada.
- **Política `accumulate_suggest` sem plano aplicado** gera uma sugestão automática (distribuir a pendência em até 3 dias ativos), exibida como "recuperação sugerida" mas não aplicada; `accumulate` só mostra a pendência; `none` mostra o déficit no histórico e não transfere.
- **Sessão com intervalo de foco ≥ 4 h** entra em revisão (`needs_review`) e não conta no saldo até o usuário confirmar a duração; nada é apagado ou reduzido silenciosamente.
- **Edição da duração de uma sessão cronometrada** a converte em registro por duração (data local + segundos), porque os intervalos originais deixam de representar a verdade; a trilha guarda o estado anterior.
- **Sobreposição** é verificada apenas entre sessões com horário. Registros só por duração validam plausibilidade (≤ 16 h por registro, ≤ 24 h por dia somando todos os objetivos).
- **Uma sessão ativa por usuário:** índice único parcial em `study_sessions(user_id) WHERE status IN ('active','paused')`; `client_uuid` torna o início idempotente entre abas/reenvios.

## Pendências que dependem exclusivamente do responsável

- **[pendente do responsável]** Preço dos planos (catálogo mostra "Valor a definir" até ser editado no painel).
- **[pendente do responsável]** Credenciais do Mercado Pago (teste e produção), Google OAuth, chaves VAPID de produção, SMTP, bucket S3, chave de IA.
- **[pendente do responsável]** Domínio, TLS e publicação; razão social/CNPJ e revisão jurídica dos textos de termos e privacidade.
