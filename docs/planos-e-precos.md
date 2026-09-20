# Planos e preços

Proposta aplicada em 18/09/2026, a pedido do responsável: IA para organizar o estudo em todos os planos pagos. Os valores ficam no catálogo, e o painel administrativo (`/admin`, Planos) edita preço, recursos e limites sem mudar código.

## Os três planos

| | Gratuito | Essencial (recomendado) | Completo |
|---|---|---|---|
| Mensal | R$ 0 | **R$ 9,90** | **R$ 19,90** |
| Anual | — | **R$ 94,80** (R$ 7,90/mês) | **R$ 190,80** (R$ 15,90/mês) |
| Objetivos ativos | 1 | 3 | sem limite |
| Cronômetro, registro, saldo e recuperação | sim | sim | sim |
| IA (organizar conteúdo, plano e conversar com o Tatá) | 10 ações/mês, até 3/dia | 60 ações/mês, até 10/dia | 200 ações/mês, até 30/dia |
| Tatá com voz natural (ElevenLabs) | 20 falas/mês | 300 falas/mês | 1.000 falas/mês |
| Lembretes | só o do horário planejado; resumo semanal no app | completos, com resumo por e-mail | completos |
| Relatórios | semana | semana, mês e trimestre | semana, mês e trimestre |
| Distribuição automática das tarefas | — | sim | sim |
| Materiais | 20 itens, 100 MB | 100 itens, 1 GB | sem limite de itens, 5 GB |
| Histórico e exportação | sempre | sempre | sempre |

Uma "ação de IA" é um pedido explícito: uma mensagem na conversa com o Tatá, sugerir a estrutura de matérias a partir de um texto ou PDF, sugerir a distribuição do plano, ou redigir o resumo da semana. Nada roda sozinho em segundo plano.

**Voz do Tatá (20/09/2026):** cada fala com voz natural conta uma vez por texto (frases repetidas vêm do cache no armazenamento, sem custo). Esgotada a cota, o app usa o sintetizador do aparelho, sem custo. Preços dos planos mantidos.

## Racional

- **Preço de entrada abaixo de R$ 10:** o Essencial fica na faixa de assinaturas de app que o público de estudante e concurseiro aceita. O Completo, pelo dobro, atende quem acompanha muitas frentes (concurso com várias matérias, idiomas e faculdade juntos).
- **Plano anual 20% mais barato:** R$ 94,80 contra R$ 118,80 em 12 mensalidades. Reduz cancelamento e custo de cobrança. Não há cupom nem preço promocional por tempo limitado.
- **O que fica no Gratuito:** tudo o que resolve o problema central de uma pessoa (um objetivo, saldo, recuperação, histórico e exportação). Os planos pagos cobram por mais objetivos, automação (IA, distribuição automática, lembretes extras) e relatórios de prazo maior. O registro nunca é bloqueado por estudar mais.
- **IA com teto mensal e diário:** o teto mensal controla o custo e o diário evita consumo concentrado. O orçamento global do serviço (`AI_GLOBAL_DAILY_BUDGET_ACTIONS`) continua valendo por cima dos dois.

## Custo estimado da IA

Estimativa, não medição: confira o preço vigente do provedor e do modelo configurado em `AI_MODEL`.

- **Ação mais cara:** estrutura a partir de um PDF longo, até 60 mil caracteres (cerca de 15 mil tokens de entrada e 2 mil de saída).
- **Com um modelo pequeno** (por exemplo, a linha "mini" de provedores compatíveis com a API da OpenAI), cada ação sai na casa de 1 a 3 centavos de real.
- **No pior caso,** com todas as ações do mês usadas e todas longas: cerca de R$ 1 a R$ 2 no Essencial e R$ 4 a R$ 6 no Completo. Isso fica bem abaixo do preço mesmo depois da tarifa do meio de pagamento.
- **Uso real:** tende a ser bem menor, porque a estrutura de um edital é sugerida uma vez e o resumo semanal usa pouco texto.

O consumo real fica em `ai_usage` (tokens de entrada e saída por ação) e aparece agregado no painel admin. Revise os tetos depois do primeiro mês com dados.

## Onde os limites são aplicados (servidor)

| Limite | Chave | Efeito quando o plano não inclui |
|---|---|---|
| Objetivos ativos | `max_active_activities` | 402 `activity_limit` ao criar ou reativar |
| Materiais e espaço | `max_materials`, `materials_storage_mb` | 402 `materials_limit` / `storage_quota` no envio |
| IA | `ai_monthly_actions`, `ai_daily_actions` | 402 `ai_plan`; 429 `ai_monthly_quota` / `ai_quota` |
| Voz do Tatá | `tata_voice_monthly` | 402 `voice_plan`; 429 `voice_quota`; 503 `voice_disabled` (o app cai para a voz do aparelho) |
| Relatório do mês e do trimestre | `reports` = `full` | 402 `plan_reports` (a semana continua liberada) |
| Distribuição automática das tarefas | `auto_planning` | 402 `plan_auto_planning` |
| Lembretes completos | `reminders` = `full` | o agendador só cria o lembrete do horário planejado; o resumo semanal não vai por e-mail |

O app mostra cada bloqueio com uma explicação e um link para os planos (componente `PlanUpsell`), e o servidor é quem decide o que cada plano libera.

## Mudar os valores

- **Pelo painel admin:** Planos → editar preço, recursos e limites. Vale na hora, para novas assinaturas.
- **Voltar ao catálogo sugerido:** `python -m app.cli apply-catalog` preenche só o que falta (plano, limite ou preço vazio). Com `--overwrite`, substitui também o que foi editado no painel, e a troca fica registrada na auditoria.
- **Banco novo:** recebe o catálogo sugerido automaticamente (`ensure-plans`).
- **Site público** (`estudatta-site`): os preços vêm da API. O HTML também traz os valores como reserva, para quem não tem JavaScript. Ao mudar um preço, atualize também os cartões e a tabela no HTML do site.

Assinaturas já existentes seguem o valor contratado. Mudar o preço no catálogo não altera a cobrança recorrente já criada no Mercado Pago.
