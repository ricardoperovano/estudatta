# Cobrança

## Gestão pelo painel (assinaturas, cupons, campanhas)

Rotas em `app/api/v1/admin_growth.py`, serviço em `app/services/growth.py`, testes em `tests/api/test_growth.py`.

| Recurso | Como funciona |
|---|---|
| Assinaturas | `GET /admin/subscriptions` (filtros e busca) e `/metrics` (ativos, MRR, novas e canceladas em 30 dias, promo). Cancelar renovação: `POST /admin/users/{id}/subscription/cancel`. |
| Acesso grátis | `POST /admin/users/{id}/promo` com `days` (período) ou sem `days` (vitalício). |
| Cupons | `percent` (desconto no valor recorrente, todos os ciclos) ou `trial` (dias grátis de um plano). A pessoa aplica em Planos ou por link `/app/planos?cupom=CODIGO`. |
| Campanhas | Segmentos calculados dos dados; e-mail com `{nome}`/`{cupom}`; teste para o admin; respeita o opt-out de e-mails de retorno. |

O backend aceita dois provedores de assinatura, escolhidos por `BILLING_PROVIDER`:

- **`asaas` (produção atual):** checkout hospedado do Asaas, recorrente no cartão. Seção abaixo.
- **`mercadopago`:** assinaturas `preapproval`. Documentação original a partir de "Mercado Pago".

Os dois usam a mesma regra: o estado local nunca é decidido pelo conteúdo de um evento; todo
webhook dispara uma consulta ao provedor, aplicada de forma idempotente (`apply_provider_state`),
e a reconciliação a cada 6 h corrige o que um webhook perdido deixou para trás.

## Asaas

Mesmo desenho do ai-runner. Código: `app/integrations/asaas.py` (cliente `AsaasClient`),
`app/services/billing.py` (`handle_asaas_webhook`), rota `POST /api/v1/billing/webhooks/asaas`,
testes em `tests/api/test_billing_asaas.py` (servidor Asaas simulado).

**Fluxo**
1. `POST /billing/checkout` cria a assinatura local `pending` e um checkout no Asaas
   (`POST /v3/checkouts`, `chargeTypes=RECURRENT`, `billingTypes=CREDIT_CARD`, ciclo `MONTHLY` ou
   `YEARLY`, `externalReference` aleatória). A pessoa informa nome, CPF e cartão na página do
   Asaas; o Estudatta não recebe esses dados. Voltar do checkout não libera nada.
2. O Asaas cria a assinatura e a cobrança. O webhook (`PAYMENT_*`, `SUBSCRIPTION_*`) chega com o
   cabeçalho `asaas-access-token`, comparado em tempo constante com `ASAAS_WEBHOOK_TOKEN`.
3. O evento só serve para achar a assinatura local (id da assinatura no Asaas, `externalReference`
   ou id do checkout). O estado vem de `GET /v3/subscriptions/{id}` e `GET /v3/subscriptions/{id}/payments`:
   - removida, `INACTIVE` ou `EXPIRED` → cancelada (acesso até o fim do período pago);
   - `ACTIVE` sem cobrança paga → continua pendente;
   - `ACTIVE` com cobrança paga (`CONFIRMED`/`RECEIVED`) → ativa; o período vai até o vencimento
     da cobrança em aberto mais antiga (fim do dia, horário de Brasília) ou até o `nextDueDate`.
4. Cobrança vencida e não paga: a reconciliação marca `past_due` depois de 3 dias e encerra o
   acesso no fim do período. Nada é apagado; objetivos acima do limite do plano gratuito são pausados.
5. Cancelar no app remove a assinatura no Asaas (`DELETE /v3/subscriptions/{id}`); o acesso segue
   até o fim do período já pago.

**Idempotência:** eventos gravados em `billing_events` por `(provider, id do evento)`; repetição
responde `duplicate`. Falha ao consultar o Asaas responde 503 e o evento fica `failed` até o
reenvio. Eventos de cobranças que não são do Estudatta (a mesma conta Asaas pode atender outros
sistemas, como o ai-runner) respondem 200 `ignored`.

**Configuração**

```
BILLING_PROVIDER=asaas
BILLING_MODE=test                 # test com chave de sandbox; production com chave de produção
ASAAS_API_KEY=$aact_...           # "hmlg" no prefixo = sandbox (ASAAS_ENVIRONMENT=auto)
ASAAS_WEBHOOK_TOKEN=...           # 32+ caracteres (openssl rand -hex 32)
```

Cadastrar o webhook no Asaas (na raiz do repositório, no servidor):

```
bash infra/scripts/dc.sh exec api python -m app.cli asaas-webhook create https://api.estudatta.com.br voce@exemplo.com
bash infra/scripts/dc.sh exec api python -m app.cli asaas-webhook list
```

**O que não foi validado contra o Asaas real:** os testes usam um servidor Asaas simulado com o
formato da API v3. Antes de abrir a cobrança, faça uma assinatura de ponta a ponta no sandbox
(cartão de teste do Asaas) e confira o webhook com `asaas-webhook list` (sem falhas e com token).

---

# Mercado Pago (assinaturas / `preapproval`)

Este documento descreve **como a cobrança foi implementada no backend**, como ligá-la com
credenciais de teste e de produção, como o webhook é configurado e validado, o que a
reconciliação periódica faz, o que acontece quando o plano de um usuário cai, e — de forma
explícita — **o que ainda não foi validado contra o provedor real**, porque não há credenciais
do Mercado Pago neste ambiente.

Código envolvido (tudo em `backend/`):

| Arquivo | Papel |
| --- | --- |
| `app/integrations/mercadopago.py` | Interface `BillingProvider`, cliente HTTP `MercadoPagoClient`, validação de `x-signature`, injeção do provedor |
| `app/services/billing.py` | Catálogo, checkout, transições de estado, webhook idempotente, reconciliação, rebaixamento |
| `app/api/v1/billing.py` | `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/cancel`, `POST /billing/sync`, `POST /billing/webhooks/mercadopago` |
| `app/jobs/tasks_billing.py` | Tarefa Celery `app.jobs.tasks_billing.reconcile_subscriptions` (beat a cada 6 h) |
| `app/models/billing.py` | `plans`, `plan_prices`, `subscriptions`, `billing_events`, `promo_grants` |
| `app/services/plans.py` | `get_entitlements`: direitos calculados no servidor (assinatura > promo > gratuito) |
| `tests/api/test_billing.py` | Cenários com um provedor falso em memória (`FakeProvider`) |

Princípio central (docstring de `app/services/billing.py`): **o estado local nunca é decidido
pelo conteúdo de um evento nem pelo retorno da URL de sucesso**. Toda transição parte de uma
consulta ao estado atual no provedor (`GET /preapproval/{id}`) e é aplicada de forma
idempotente por `apply_provider_state`.

## 1. O adaptador

### Interface `BillingProvider`

`app/integrations/mercadopago.py` define a interface mínima que o serviço usa, para que testes
(e um eventual segundo provedor) troquem a implementação sem tocar em `services/billing.py`:

- `create_preapproval(reason, external_reference, payer_email, amount, currency, frequency, frequency_type, back_url)`
- `get_preapproval(preapproval_id)`
- `cancel_preapproval(preapproval_id)`
- `search_preapproval_by_external_reference(external_reference)`
- `get_authorized_payment(payment_id)` — opcional; a implementação padrão devolve `None`

Todas devolvem `ProviderSubscription`, uma visão normalizada da assinatura (`id`, `status`,
`external_reference`, `init_point`, `next_payment_date`, `payer_id`, `payer_email`,
`auto_recurring`, `date_created`, `last_modified`, `reason`, `raw`). `normalize_status` aceita
`canceled` e `cancelled` (as duas grafias aparecem na documentação) e `parse_provider_datetime`
converte qualquer data para UTC ciente de fuso.

### `MercadoPagoClient`

Cliente HTTP **síncrono** (`httpx`) sobre `MERCADOPAGO_API_BASE` (padrão
`https://api.mercadopago.com`), com `Authorization: Bearer <access token>`, timeout de 10 s e
`X-Idempotency-Key` na criação (`preapproval-{external_reference}`). Endpoints usados:

| Chamada | Uso |
| --- | --- |
| `POST /preapproval` | cria a assinatura com `status=pending` e sem `card_token_id`; o pagador conclui no `init_point` devolvido |
| `GET /preapproval/{id}` | estado atual (`pending`, `authorized`, `paused`, `cancelled`) — única fonte de verdade |
| `PUT /preapproval/{id}` com `{"status": "cancelled"}` | cancela a cobrança recorrente |
| `GET /preapproval/search?external_reference=…` | recupera a assinatura quando só temos a nossa referência (prefere a `authorized`; senão a mais recente) |
| `GET /authorized_payments/{id}` | cobrança recorrente → `preapproval_id` (eventos `subscription_authorized_payment`) |

Falhas viram `ProviderError(message, status_code, payload)`: erro de rede/timeout, resposta
`>= 400` (o `status_code` é preservado — um `404` é tratado como "recurso inexistente", não como
falha transitória) e JSON inválido. **Credenciais nunca aparecem em mensagens nem em logs.**

### Modo "sem credencial" honesto

`get_provider()` (dependência FastAPI e fábrica para jobs) levanta `ServiceUnavailable` com o
código `billing_disabled` quando `settings.billing_enabled` é falso. O checkout responde 503
com a mensagem "Cobrança ainda não está configurada; o plano gratuito continua disponível.", o
webhook responde 503, e `GET /billing/subscription`, `GET /public/plans` e `GET /auth/session`
informam `billing_mode = "disabled"`. Cancelar **nunca** depende do provedor estar configurado.

Testes injetam um provedor falso com `set_provider_override(provider)` (ou
`app.dependency_overrides[get_provider]`).

## 2. Fluxo de assinatura

1. `POST /api/v1/billing/checkout` `{plan_code, interval}` (`month` ou `year`).
   `start_checkout` valida plano ativo e não gratuito, preço definido e maior que zero
   (`price_not_set` → 409), ausência de assinatura `active`/`past_due` (`already_subscribed`),
   e reaproveita um checkout `pending` do mesmo preço criado há menos de 1 h (idempotência entre
   cliques). Cria a linha local `subscriptions` com `status=pending`, `external_reference`
   (20 hex) e `metadata` (`interval`, `amount_cents`, `currency`, `billing_mode`), e só então
   chama `POST /preapproval` com `back_url = {APP_URL}/app/planos?retorno=checkout`.
   Devolve `checkout_url` (`init_point`). Se o provedor falhar, nada fica gravado (503
   `provider_unavailable`).
2. O usuário paga no Mercado Pago e volta para a URL de sucesso. **Voltar não libera nada**:
   a assinatura continua `pending` e o plano continua gratuito até o provedor confirmar
   `authorized` por webhook, por `POST /billing/sync` (manual, limitado a 10 por 10 min) ou
   pela reconciliação.
3. Estados do provedor → estado local (`STATUS_MAP`): `authorized → active`,
   `paused → paused`, `cancelled → cancelled`, `pending → pending`. Estados locais adicionais:
   `past_due` (período vencido há mais de 3 dias sem renovação confirmada) e `expired`
   (fim de acesso). `apply_provider_state` calcula `current_period_end` a partir de
   `next_payment_date` ou, na falta dele, projeta por `auto_recurring`
   (`frequency`/`frequency_type`/`start_date`/`end_date`).
4. Cada mudança de status gera auditoria `billing.status` e uma notificação in-app
   (`billing_active`, `billing_cancelled`, `billing_paused`, `billing_past_due`,
   `billing_expired`) e passa por `apply_entitlement_changes` (ver seção 6).
5. `POST /api/v1/billing/cancel` cancela a renovação no provedor (`PUT /preapproval/{id}`)
   e **mantém o acesso até `current_period_end`**. Se o provedor estiver fora do ar, a intenção
   fica registrada em `metadata.cancel_pending` com a mensagem "Cancelamento registrado…", e a
   reconciliação reenvia o cancelamento depois.

## 3. Credenciais e modos (`BILLING_MODE`)

Variáveis (também comentadas em `.env.example`):

| Variável | Significado |
| --- | --- |
| `BILLING_PROVIDER` | `mercadopago` (padrão) ou `none` |
| `BILLING_MODE` | `disabled` (padrão), `test` ou `production` |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token da aplicação (teste ou produção, conforme o modo) |
| `MERCADOPAGO_PUBLIC_KEY` | Public Key (reservada ao frontend; o backend não a usa hoje) |
| `MERCADOPAGO_WEBHOOK_SECRET` | "assinatura secreta" gerada no painel de Webhooks |
| `MERCADOPAGO_API_BASE` | base da API (padrão `https://api.mercadopago.com`; útil para apontar a um mock) |

`settings.billing_enabled` só é verdadeiro quando `BILLING_MODE != disabled` **e** há
`MERCADOPAGO_ACCESS_TOKEN`. Não existe "modo simulado": sem credencial o produto diz que a
cobrança não está configurada.

### Obtendo credenciais de teste

Conforme o fluxo do painel do Mercado Pago (não executado neste ambiente — ver seção 7):

1. Entre no portal de desenvolvedores (`https://www.mercadopago.com.br/developers`) com a
   conta da empresa e crie uma **aplicação** ("Suas integrações"), escolhendo o produto de
   assinaturas / pagamentos on-line.
2. Em **Credenciais de teste** copie o *Access Token* (começa com `TEST-`) para
   `MERCADOPAGO_ACCESS_TOKEN` e defina `BILLING_MODE=test`.
3. Crie **contas de teste** (uma vendedora, uma compradora) no mesmo painel para percorrer o
   checkout do `init_point` sem dinheiro real. O `payer_email` enviado no `POST /preapproval` é
   o e-mail do usuário do Estudatta; no checkout de teste use a conta compradora de teste.
4. Para produção: use as **Credenciais de produção** (Access Token `APP_USR-…`) da mesma
   aplicação, `BILLING_MODE=production`, `APP_ENV=production`, HTTPS e `COOKIE_SECURE=true`.

### `test` × `production`

| | `test` | `production` |
| --- | --- | --- |
| Credencial | `TEST-…` | `APP_USR-…` |
| API | mesma base (`https://api.mercadopago.com`); o próprio token define o ambiente | idem |
| Dinheiro | nenhum; pagador é conta de teste | cobranças reais |
| Eventos | `live_mode=false` no corpo do webhook | `live_mode=true` |
| Registro local | `subscriptions.metadata.billing_mode = "test"` — dá para distinguir assinaturas feitas em teste se o modo mudar depois | `"production"` |
| Exposição | `billing_mode` aparece em `/public/plans`, `/auth/session` e `/billing/subscription`, para o frontend sinalizar "ambiente de teste" | idem |

Nada no código muda de comportamento entre `test` e `production` além do que está na tabela;
a diferença está na credencial usada. Antes de virar `production`, apague ou expire as
assinaturas de teste (o campo `metadata.billing_mode` identifica cada uma).

## 4. Webhook

### URL e pré-requisitos

- Endpoint: `POST {API_URL}/api/v1/billing/webhooks/mercadopago` — **sem** autenticação de
  sessão e **sem** CSRF (a origem é o provedor). Precisa ser **pública e HTTPS** (o painel do
  Mercado Pago só aceita URLs `https://`). Em produção a API fica atrás do Nginx na mesma
  origem do site (`API_URL`), então a URL é `https://<dominio>/api/v1/billing/webhooks/mercadopago`.
- Responde 503 `billing_disabled` enquanto `billing_enabled` for falso **ou**
  `MERCADOPAGO_WEBHOOK_SECRET` estiver vazio: sem segredo não há como validar a origem, e um
  webhook sem validação seria aceitar qualquer POST como verdade.
- No painel (aplicação → Webhooks): cadastre a URL para o ambiente correspondente (teste e
  produção têm cadastros separados), marque os tópicos de assinaturas — o código trata
  `subscription_preapproval` (a assinatura em si) e `subscription_authorized_payment`
  (cada cobrança recorrente) — e copie a **assinatura secreta** gerada para
  `MERCADOPAGO_WEBHOOK_SECRET`.
- Em desenvolvimento local não há URL pública: use um túnel HTTPS (ngrok, cloudflared) ou
  simule o evento assinando-o com o mesmo segredo (abaixo).

### Validação `x-signature`

Implementada em `verify_webhook_signature`, seguindo a documentação "Webhooks › Validar origem
da notificação":

1. Cabeçalho `x-signature: ts=<ms>,v1=<hex>` e cabeçalho `x-request-id`.
2. `data.id` vem **da query string** (`?data.id=…`), com fallback para `body.data.id`.
3. Manifesto: `id:{data.id};request-id:{x-request-id};ts:{ts};` — partes ausentes são omitidas
   e `data.id` alfanumérico vai em minúsculas (`build_webhook_manifest`).
4. `v1` deve ser igual ao HMAC-SHA256 hexadecimal do manifesto com
   `MERCADOPAGO_WEBHOOK_SECRET` (comparação em tempo constante).

Assinatura inválida → 401 `invalid_signature`. O evento é gravado em `billing_events` com
`signature_valid=false` e `status=ignored`, **sem** "envenenar" o `event_id`: se o evento
legítimo com o mesmo id chegar depois, ele é processado normalmente.

Para simular localmente (mesmo procedimento dos testes):

```python
from app.integrations.mercadopago import build_webhook_manifest, sign_webhook_manifest
ts = "1700000000"; data_id = "<preapproval_id>"; request_id = "req-local-1"
v1 = sign_webhook_manifest(SECRET, build_webhook_manifest(data_id=data_id, x_request_id=request_id, ts=ts))
# POST /api/v1/billing/webhooks/mercadopago?data.id=<preapproval_id>&type=subscription_preapproval
# headers: x-signature: ts=<ts>,v1=<v1>   x-request-id: req-local-1
# body: {"id": "<event id>", "type": "subscription_preapproval", "action": "updated", "data": {"id": "<preapproval_id>"}}
```

### Processamento (`handle_webhook`)

| Situação | `billing_events.status` | Resposta |
| --- | --- | --- |
| Assinatura inválida | `ignored` (`error=invalid_signature`) | 401 |
| Mesmo `event_id` já processado com assinatura válida | (linha existente) | 200 `duplicate` — nada é reprocessado |
| Tópico não tratado (`payment`, `merchant_order`, …) | `ignored` (`subscription_not_found`) | 200 `ignored` |
| Recurso não existe no provedor (404) ou não corresponde a nenhuma assinatura local | `ignored` | 200 `ignored` |
| Assinatura localizada e sincronizada | `processed` | 200 `processed` |
| Provedor fora do ar / resposta inesperada | `failed` (`error` guarda a mensagem) | 503 `provider_unavailable` — o provedor reenvia e o evento é reprocessado |

Localização da assinatura (`locate_subscription`): por `provider_ref` (id da preapproval);
para `subscription_authorized_payment`, primeiro `GET /authorized_payments/{id}` para obter o
`preapproval_id`; se ainda não houver linha local com aquele id, consulta
`GET /preapproval/{id}` e casa pelo `external_reference` que enviamos no checkout. Encontrada a
assinatura, `sync_subscription` consulta o estado atual e aplica — **o `status` que vier no
corpo do evento é ignorado**, o que torna eventos fora de ordem inofensivos (um `cancelled`
antigo chegando depois de um `authorized` não rebaixa ninguém).

Eventos ficam visíveis no painel administrativo (`GET /api/v1/admin/billing/events`, filtro
por status) para diagnóstico.

## 5. Reconciliação periódica

- Celery beat: `billing-reconcile` → `app.jobs.tasks_billing.reconcile_subscriptions`, a cada
  6 h (minuto 15). Também pode ser disparada por um admin em
  `POST /api/v1/admin/billing/reconcile` (auditado, sem depender de fila) ou chamada
  diretamente (`run_reconciliation(db)`).
- Idempotente e sem provedor é inofensiva: devolve `provider_available=false` e não altera nada.
- Regras (`reconcile_subscriptions`), aplicadas a todas as assinaturas com status
  `pending`, `active`, `past_due`, `paused` ou `cancelled`:
  - `pending` há mais de 1 h → consulta o provedor (o webhook pode ter se perdido) e aplica;
    `pending` há mais de 7 dias → `expired` (`expired_reason=pending_timeout`) **sem** consultar
    o provedor.
  - `cancelled`/`past_due` com `current_period_end` vencido → `expired`
    (`expired_reason=period_ended`) antes de qualquer chamada externa.
  - `cancel_pending` (cancelamento pedido com o provedor fora do ar) → reenvia
    `PUT /preapproval/{id}` `cancelled`.
  - **Toda assinatura aberta com `provider_ref` é consultada** (`GET /preapproval/{id}`) e o
    estado real é aplicado: pausa, cancelamento ou renovação cujo webhook se perdeu nunca
    ficam invisíveis por mais de um ciclo.
  - `active` com período vencido há mais de 3 dias sem renovação confirmada → `past_due`
    (acesso continua até a reconciliação seguinte expirar, ou a renovação chegar).
  - Acessos promocionais encerrados ou revogados nos últimos 2 dias → passa o usuário pelo
    rebaixamento (garante o efeito mesmo se ninguém acessou a conta).
- Sumário devolvido/logado: `checked`, `synced`, `expired`, `past_due`, `cancel_retried`,
  `errors`, `downgraded_users`, `provider_available`. Falhas do provedor em uma assinatura
  contam em `errors` e não interrompem as demais.

## 6. Direitos e rebaixamento

`get_entitlements(db, user_id)` decide, no servidor, o plano vigente: assinatura `active`
(ou `cancelled`/`past_due` com período ainda válido) → acesso promocional ativo
(`promo_grants`, concedido por admin com prazo e motivo) → plano gratuito. `source` diz de onde
vem (`subscription`, `promo`, `free`). O frontend não decide direitos.

Quando os direitos caem (assinatura `expired`/`paused`, promo revogado por admin ou vencido),
`apply_entitlement_changes` aplica o **rebaixamento sem perda**:

- lê `max_active_activities` do plano vigente (gratuito: 1; `null` = ilimitado);
- se houver mais objetivos `active` do que o limite, mantém ativos os mais recentes — ordem
  `updated_at` desc, `created_at` desc e, para empate determinístico, `sort_order` desc e `id`
  — e marca os demais como `paused`;
- **nada é apagado**: objetivos, metas, sessões, materiais, tarefas e histórico permanecem;
- cada objetivo pausado gera auditoria `plan.downgrade_pause` (com o que foi mantido) e o
  usuário recebe uma notificação in-app `plan_downgrade` ("… Nada foi apagado: você pode
  reativar quando quiser ou ampliar o plano.");
- é idempotente (reexecutar sem excesso devolve lista vazia). Reativar outro objetivo dentro
  do gratuito exige pausar o atual (`PlanLimit`, 402).

Onde roda: em toda transição de status de assinatura (`_on_transition`), ao revogar um promo
(`revoke_promo`) e na reconciliação (promos encerrados nos últimos 2 dias).

## 7. O que NÃO foi validado contra o provedor real

Não há credenciais do Mercado Pago neste ambiente. **Nenhuma chamada real à API foi feita**:
`MercadoPagoClient` foi escrito a partir da documentação e exercitado apenas pela interface,
com o `FakeProvider` em memória de `tests/api/test_billing.py`. Antes de ligar
`BILLING_MODE=test` com credenciais reais, confirme:

1. **Contratos das respostas** de `POST /preapproval`, `GET /preapproval/{id}`,
   `GET /preapproval/search` (campo `results`) e `GET /authorized_payments/{id}`: nomes e
   formatos de `id`, `status`, `init_point`, `external_reference`, `next_payment_date`,
   `payer_id`, `auto_recurring` (`frequency`, `frequency_type`, `start_date`, `end_date`),
   `date_created`, `last_modified`, `preapproval_id`; fuso das datas.
2. **Criação com `status=pending` e sem `card_token_id`** (checkout concluído pelo pagador no
   `init_point`), aceitação do `back_url` e do `X-Idempotency-Key` nesse endpoint, e se o
   `payer_email` precisa coincidir com a conta que paga.
3. **Valores de `status`** realmente devolvidos (`pending`, `authorized`, `paused`,
   `cancelled`/`canceled`) e se existe algum outro; um status desconhecido hoje é apenas logado
   (`billing.unknown_provider_status`) sem alterar o estado local.
4. **Webhook**: tópicos entregues para assinaturas (`subscription_preapproval`,
   `subscription_authorized_payment`) e seus `action`; o `id` do evento como chave de
   idempotência; o template do manifesto e o uso de `data.id` da query string; cadência e
   duração dos reenvios após 503 (o código conta com eles para reprocessar `failed`).
5. **Renovação**: se `next_payment_date` avança a cada cobrança (é a base de
   `current_period_end`), como o provedor sinaliza falha de pagamento (pausa automática?) e o
   que acontece com `paused` → `authorized` (o código já aceita a volta).
6. **Cancelamento** via `PUT /preapproval/{id}` `{"status": "cancelled"}` e o corpo devolvido
   (o cliente completa o `id` se ele não vier).
7. **Sandbox**: assume-se a mesma base `https://api.mercadopago.com` com credenciais `TEST-`
   e contas de teste; não foi verificado se há base ou fluxo diferente para o checkout de
   assinaturas em teste.
8. **Documentação oficial**: o código cita as seções "Assinaturas" (referência de
   `preapproval`) e "Webhooks › Validar origem da notificação", mas **nenhuma URL foi
   registrada nos comentários**; confirme as páginas atuais no portal de desenvolvedores
   (`https://www.mercadopago.com.br/developers`) — a documentação muda com frequência.

Roteiro sugerido para a validação com credenciais de teste: (1) `BILLING_MODE=test` + token
`TEST-` + túnel HTTPS + segredo do webhook; (2) definir um preço no painel admin
(`amount_cents`); (3) checkout, pagar com a conta compradora de teste e observar
`billing_events` (`processed`) e a assinatura virar `active`; (4) cancelar e verificar acesso
até `current_period_end`; (5) rodar `POST /admin/billing/reconcile` e conferir o sumário;
(6) registrar em `docs/decisoes.md` qualquer diferença de contrato encontrada.
