# IA (opcional)

Código: `backend/app/services/ai.py`, `backend/app/integrations/ai.py`,
`backend/app/api/v1/ai.py`, `backend/app/schemas/ai.py`.

O produto funciona inteiro **sem IA**. Ela só existe quando `AI_ENABLED=true` **e**
`AI_API_KEY` está definida (`settings.ai_available`). Desligada, toda ação responde
`503 ai_disabled` — antes de qualquer outra validação — com a orientação de seguir manualmente.

## Ações
Todas devolvem **prévia**: nenhuma altera objetivos, planos ou tópicos; o frontend aplica pelas
rotas normais depois que o usuário revisa.

| Rota (`/api/v1/ai/...`) | Entrada | Saída |
|---|---|---|
| `GET status` | — | `enabled`, `remaining_today`, `plan_limit`, `global_budget_left`, `reason` |
| `POST suggest-structure` | `text` **ou** `import_id` | proposta de matérias/tópicos (mesmo schema da importação) |
| `POST suggest-plan` | `activity_id`, período (até 60 dias), `topic_ids?` (até 300) | itens `{local_date, topic_id, estimated_seconds}` + `rejected` |
| `POST weekly-summary` | `activity_id`, `week_start?` | texto curto (≤ 600 caracteres) + os `facts` usados |

- `suggest-structure` com `import_id` usa o texto extraído do job, marca `ai_used` e **não**
  mexe na proposta determinística já salva. Texto acima de `AI_MAX_INPUT_CHARS` é truncado
  (`truncated=true`) no caso de importação, ou recusado (`ai_input_too_long`) quando colado.
- `suggest-plan` valida item a item contra a capacidade real dos dias: o que não cabe vai para
  `rejected` com motivo (`fora_do_periodo`, `topico_desconhecido`, `repetido_no_dia`,
  `acima_da_capacidade`). Sem tópicos → `422 no_topics`.
- `weekly-summary` recebe só números calculados pelo backend. Texto com promessas ou cobrança
  ("aprovação garantida", "você não estudou"…) é rejeitado com `502 ai_bad_output`.

## Cotas
- Por usuário/dia: limite do plano (`ai_daily_actions`; padrão Free `AI_DAILY_ACTIONS_FREE=0`,
  Pro `AI_DAILY_ACTIONS_PRO=20`). Sem direito → `402 ai_plan`; cota usada → `429 ai_quota`.
- Global/dia: `AI_GLOBAL_DAILY_BUDGET_ACTIONS` (padrão 2000) → `429 ai_budget`.
- Contam na cota as chamadas reais (`ok` e `failed`); recusas por cota não contam. O dia vira à
  meia-noite UTC.

## Saída validada
A chamada pede `response_format=json_object` e a resposta é validada por schema Pydantic.
Inválida → `502 ai_bad_output` e nada muda. Timeout (`AI_TIMEOUT_SECONDS`, padrão 45 s) e erros
do provedor → `503` com código próprio (`ai_timeout`, …).

## Privacidade e segurança
- Todo texto do usuário ou de documento vai ao modelo entre `<documento>` e `</documento>`, com
  a instrução de tratá-lo como dado e **ignorar comandos contidos nele** (mitigação de injeção
  de prompt). O modelo também é instruído a nunca prometer aprovação ou fluência.
- `AiUsage` guarda **só metadados**: ação, status, modelo, nº de caracteres, tokens, latência e
  código de erro. Nenhum conteúdo enviado ou recebido é armazenado nem logado.
- A chave (`AI_API_KEY`) fica só no servidor; nunca vai ao frontend nem aparece em respostas.
- Isolamento: importação/objetivo de outro usuário → 404.

## Configuração
`AI_ENABLED`, `AI_BASE_URL` (API compatível com OpenAI), `AI_API_KEY`, `AI_MODEL`,
`AI_TIMEOUT_SECONDS`, `AI_MAX_INPUT_CHARS`, `AI_MAX_OUTPUT_TOKENS`, `AI_DAILY_ACTIONS_FREE`,
`AI_DAILY_ACTIONS_PRO`, `AI_GLOBAL_DAILY_BUDGET_ACTIONS` — ver `.env.example`.
