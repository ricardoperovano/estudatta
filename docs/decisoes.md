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

## 2026-09-18 — Cobrança, planejamento e relatórios (ajustes de comportamento)

- **Reconciliação consulta toda assinatura aberta** (`active`, `past_due`, `paused`, `cancelled` com `provider_ref`), não só as com período prestes a vencer: um webhook perdido de pausa, cancelamento ou renovação nunca deixa o estado local defasado por semanas. Pendentes com mais de 7 dias expiram sem consultar o provedor. Ver `docs/billing.md`.
- **Webhook cujo recurso não existe no provedor (404)** é registrado como `ignored` e respondido com 200, não como `failed`/503: 503 pede reenvio, e reenviar um evento de recurso inexistente nunca resolveria nada.
- **Rebaixamento de plano com desempate determinístico:** mantém o objetivo atualizado mais recentemente (`updated_at`, depois `created_at`), e, em empate (SQLite grava o `server_default` com resolução de segundo), `sort_order` decrescente e `id`. Nada é apagado; os demais ficam `paused`.
- **Auto-plano com `task_ids`:** a distribuição é sempre calculada sobre todas as tarefas móveis do período; `task_ids` só restringe quais tarefas são movidas/reportadas. Assim, aplicar parte da prévia leva cada tarefa escolhida à mesma data que a prévia completa mostrou (as tarefas não escolhidas não viram blocos fixos; fixados, séries e tempo registrado continuam ocupando o dia).
- **Histórico de sessões (`/reports/sessions`)** ordenado pelo dia local em que a sessão contou (`max(local_date)` das alocações — vale para cronômetro e lançamento por duração), depois `started_at`, `created_at` e `id`; ordem total e estável entre páginas mesmo com `created_at` idêntico.

## 2026-09-18 — Integração final

- **Formatação de minutos:** valores do dia usam minutos até 119 ("60 min", "90 min") e horas a partir de 2h, igual aos mockups; totais semanais usam horas ("3h40").
- **Capacidade de recuperação:** capacidade extra = limite confortável − max(meta, tarefas planejadas, tempo registrado). A duração estimada das tarefas ocupa a meta e não é descontada duas vezes.
- **Transferência de sessão entre aparelhos:** uma sessão ativa do mesmo aparelho é retomada sozinha; de outro aparelho, só com "Continuar neste aparelho". Nunca se inicia outra sessão em silêncio.
- **Rampas no tema claro:** `neutral-*` e `accent-*` se invertem no tema claro para manter a função (texto, trilha, tinta), conforme o D3.
- **Cronômetro em tela cheia:** sem navegação inferior, como a tela 04.
- **Erros 422:** não ecoam mais o corpo da requisição (`input`), para não devolver senhas em mensagens de validação.
- **Banco de testes:** um arquivo SQLite por processo, o que permite rodar suítes em paralelo.
- **Usuário de demonstração:** `demo@estudatta.com.br`, porque o validador de e-mail recusa `.local`. A senha é gerada no `seed-demo` ou informada com `--password`.

## 2026-09-18 — Site público separado

- **Pedido do responsável:** o site público sai deste repositório e vira um projeto próprio em HTML, sem React (`../estudatta-site`, com Git próprio e sem remoto; o responsável cria o repositório remoto).
- **Domínios:** site em `estudatta.com.br`; app e API em `app.estudatta.com.br`, na mesma origem (cookies da sessão continuam `SameSite=Lax`, sem CORS para o app). Os links antigos do app no domínio principal são redirecionados pelo Nginx do servidor.
- **Integração:** o site usa só `GET /api/v1/public/plans`, `POST /api/v1/public/waitlist` e `POST /api/v1/public/contact`, sem cookie. A API libera a origem do site em `CORS_ORIGINS`, que agora aceita lista separada por vírgula no `.env`.
- **Site sem JavaScript:** conteúdo, preço "Valor a definir" e links para o app funcionam sem JS; o JS só troca o catálogo pelo real e envia os formulários. Nenhum preço fica escrito no HTML.
- **Textos jurídicos:** privacidade e termos foram extraídos do HTML gerado pelas páginas anteriores, com o mesmo texto palavra por palavra.
- **App:** removidos a pré-renderização, as páginas públicas e a imagem de compartilhamento; `/` redireciona para Hoje (ou para a entrada); o app inteiro é `noindex`; termos e privacidade apontam para o site (`VITE_SITE_URL`, padrão `https://estudatta.com.br`; em dev `http://localhost:5190`).
- **CSP do site:** estilos inline foram trocados por classes para a política `style-src 'self'` do Nginx do site.

## 2026-09-18 — Planos, preços e nova logo

- **Catálogo sugerido e aplicado:** Gratuito (R$ 0), Essencial (R$ 9,90/mês ou R$ 94,80/ano, recomendado) e Completo (R$ 19,90/mês ou R$ 190,80/ano). A IA para organizar está em todos os planos pagos, com teto mensal e diário (60/10 e 200/30 ações). Racional, custos e onde cada limite é aplicado: `docs/planos-e-precos.md`.
- **Limites que antes eram só texto agora são aplicados no servidor:** relatório do mês e do trimestre (`reports`), distribuição automática das tarefas (`auto_planning`), lembretes completos (`reminders`) e cota mensal de IA (`ai_monthly_actions`).
- **Recuperação da pendência, histórico e exportação ficam em todos os planos:** fazem parte da promessa central do produto e não viram recurso pago.
- **Código interno:** o Completo manteve o código `pro`, para não afetar assinaturas nem integrações; o novo plano é `essencial`.
- **Nova logo do responsável:** ícone de cronômetro com livro e barras, em versão escura e clara, com fundo sólido. Ela substitui o símbolo "Trilho" do material de design original no site, no app e nos ícones de instalação. Os tamanhos web são gerados por `estudatta-site/scripts/gerar-logos.sh` a partir dos PNGs originais. O glifo tracejado dos estados vazios do app ainda usa as formas do símbolo antigo.

## Pendências que dependem exclusivamente do responsável

- **[pendente do responsável]** Validar os preços sugeridos (R$ 9,90 e R$ 19,90) e os tetos de IA após o primeiro mês com dados reais de uso.
- **[pendente do responsável]** Credenciais do Mercado Pago (teste e produção), Google OAuth, chaves VAPID de produção, SMTP, bucket S3, chave de IA.
- **[pendente do responsável]** Domínio, TLS e publicação; razão social/CNPJ, endereço, encarregado (DPO) e foro, marcados nas páginas de termos e privacidade; revisão jurídica dos textos.
- **[pendente do responsável]** Versão vetorial (SVG) da nova logo, se houver, para substituir os PNGs e ter nitidez em qualquer tamanho.
- **[pendente do responsável]** Teste manual de push e instalação em iPhone/Android com o domínio HTTPS.
