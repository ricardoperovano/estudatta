# Regras de saldo (motor de metas e recuperação)

Implementação: `backend/app/domain/balance.py` (lógica pura), `backend/app/services/balance.py` (carga de dados), `backend/app/services/recovery.py` (planos e perdão). Testes: `backend/tests/domain/test_balance.py`, `backend/tests/api/test_slice.py`.

## Grandezas por objetivo e dia civil (fuso do objetivo)

Tudo em **segundos inteiros**; minutos só na apresentação.

| Símbolo | Nome no código | Definição |
|---|---|---|
| `M_d` | `target` | meta base do dia (regra vigente); 0 em descanso, pausa ou fora do período ativo |
| `S_d` | `logged` | tempo válido registrado no dia (sessões encerradas, sem pausas, sem contagem duplicada, sem sessões em revisão) |
| `B_anterior` | `carry_in` | pendência ao final do dia anterior |
| `F_d` | `missing_today` | `max(0, M_d − S_d)` — "falta hoje" (não é atraso vencido) |
| `P_d` | `pending_prior` | `max(0, B_anterior − max(0, S_d − M_d))` — pendência anterior que resta após o excedente de hoje |
| `R_d` | `remaining_total` | `F_d + P_d` — para cumprir hoje e zerar a pendência |
| `B_d` | `carry_out` | `max(0, B_anterior + M_d − S_d)` no modo acumulativo, menos perdão explícito do dia |
| — | `recovered` | parte do excedente de hoje que quitou pendência anterior (dias mais antigos primeiro) |
| — | `extra` | excedente após quitar tudo; **não cria crédito** para dias futuros (v1) |

Ordem de atendimento do tempo de hoje: primeiro a meta de hoje, depois a pendência anterior, do dia mais antigo para o mais novo (fila FIFO; `recovered_from` lista de quais dias veio a recuperação).

## Políticas de recuperação

- `accumulate` — pendência acumula e fica visível; o usuário decide quando recuperar.
- `accumulate_suggest` (padrão) — igual, e sem plano aplicado o sistema mostra uma **sugestão automática** (distribuir em até 3 dias ativos), não aplicada.
- `none` — o déficit aparece no histórico do dia, mas não é transferido (`carry_out = 0`).

## Distinções que a interface respeita

- Antes do fechamento do dia, `F_d` é "falta hoje". Pendência anterior, meta base e recuperação sugerida são números diferentes.
- "Mais 20 minutos de recuperação hoje" é uma **alocação** da pendência existente; não aumenta a dívida.
- Estudar em dia de descanso pode reduzir pendência anterior; descanso não gera nova obrigação.
- Não há metas antes da data de início nem depois do fim do objetivo; a pendência criada dentro do período continua visível.
- Sem registro → "sem estudo registrado" e oferta de lançamento retroativo (nunca "você não estudou").

## Exemplo dos mockups

Meta 60, registrado 40, pendência anterior 60, recuperação sugerida 20 → "Mais 40 min hoje: 20 da meta + 20 de recuperação. Depois disso, ficam 40 min a recuperar."

## Casos verificados por teste

| Situação | Resultado |
|---|---|
| Meta 60; segunda com 0 | fecha com 60 pendentes |
| Terça: meta 60 + pendência 60 | total para zerar 120 |
| Terça registra 90 | meta cumprida, recupera 30, restam 30 |
| Quarta: meta 60, pendência 30, registra 90 | pendência 0 |
| Sem pendência, registra 90 | extra 30, sem crédito |
| Descanso, pendência 30, registra 20 | pendência 10, meta 0 |
| 120 pendentes em 4 dias | +30/dia, sem nova obrigação |
| Inglês e violão | extra de um não quita o outro |

## Mudanças e histórico

- Nova meta vale a partir de uma data explícita (padrão: amanhã); o passado não é reescrito (`goal_rules` versionadas).
- Pausas/férias (`activity_pauses`) zeram novas metas nas datas escolhidas e preservam a pendência anterior.
- Perdão: `balance_adjustments` (tipo `forgive`), com prévia, confirmação e auditoria; aplicado ao fechamento do dia anterior ao pedido. Nunca cria sessão fictícia.
- Edição/exclusão de sessão recalcula a partir da primeira data afetada (o saldo é sempre recomputado a partir de regras + sessões + ajustes; o `daily_ledger` é uma materialização idempotente por objetivo/data, atualizada pelo job `close_days`).
- Reconciliação na leitura: a tela Hoje e o relatório recomputam o saldo; a falta de execução de um job não oculta dias pendentes.
- Sessão atravessando a meia-noite: os intervalos de foco são divididos no instante exato da meia-noite local (respeitando horário de verão), sem duplicar segundos.
- Fuso: mudança versionada com vigência futura (`activity_timezones`); o histórico mantém o fuso em que foi registrado.

## Sequência de dias

Conta dias planejados com meta cumprida; descanso e pausa não aumentam nem interrompem; dia planejado encerrado sem cumprir interrompe; o dia atual em aberto não interrompe; registro retroativo aceito recalcula. Recuperar depois não transforma um dia passado em dia com estudo realizado.
