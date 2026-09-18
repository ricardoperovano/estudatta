# Operação do backend

Tudo roda a partir de `backend/`, com o ambiente em `backend/.venv` e o `.env` da **raiz** do
repositório (os scripts fazem `source ../.env`). Deploy: ver `docs/deploy.md`.

## Scripts (`backend/scripts/`)
| Script | O que faz |
|---|---|
| `dev.sh` | `alembic upgrade head`, `ensure-plans` e `uvicorn --reload` em `API_HOST:API_PORT` (padrão `0.0.0.0:8020`) |
| `worker.sh` | worker de tarefas nas filas `default,imports,notifications` (`CELERY_QUEUES`, `CELERY_CONCURRENCY`=2, `CELERY_LOG_LEVEL`) |
| `beat.sh` | agendador periódico; estado em `var/celerybeat-schedule` (`CELERY_BEAT_SCHEDULE`). **Rode uma única instância.** |
| `e2e-api.sh [porta]` | recria o banco `estudatta_e2e`, migra e sobe a API (padrão 8022) com `APP_ENV=test`, sem rate limit, e-mail no console |

Atalhos equivalentes no `Makefile` da raiz: `make dev-api`, `make worker`, `make beat`,
`make migrate`, `make seed`, `make admin`, `make vapid`, `make test-backend`, `make lint`.

## CLI (`.venv/bin/python -m app.cli <comando>`)
| Comando | Uso |
|---|---|
| `ensure-plans` | garante o catálogo inicial de planos (Free/Pro). Idempotente. |
| `create-admin --email E [--password S] [--name N]` | cria um administrador; sem `--password`, a senha é pedida sem eco |
| `promote --email E` | promove um usuário existente a administrador (idempotente) |
| `seed-demo [--force] [--password S]` | cenário de demonstração (ver abaixo). Exige `DEMO_MODE=true` ou `--force` |
| `vapid` | gera o par de chaves de Web Push e imprime as linhas para o `.env` |

Códigos de saída: `0` ok, `1` erro de operação, `2` uso incorreto/recusado.

### Cenário de demonstração
Usuário `demo@estudatta.com.br` (um usuário antigo `demo@estudatta.local` é **renomeado**, nunca
duplicado), objetivo "Inglês" de 60 min seg–sex iniciado há 10 dias. Reproduz a tela Hoje do
mockup: 40 min registrados às 07:00 em "Listening · unidade 4" (tarefa concluída) e a tarefa
"Vocabulário · lista 12" planejada para as 19:30 (20 min); ontem sem registro, dias anteriores
completos; tarefas de 60 min nos 4 próximos dias ativos. Reexecutar não duplica nada; a senha
gerada só aparece na primeira execução.

## Tarefas periódicas (beat)
| Tarefa | Frequência | Função |
|---|---|---|
| `schedule_reminders` | 5 min | projeta as ocorrências das próximas 24 h na outbox (chave única por ocorrência) |
| `dispatch_outbox` | 1 min | envia o que venceu, reconferindo relevância, silêncio e limite diário |
| `weekly_summaries` | de hora em hora | na segunda-feira local, enfileira o resumo da semana |
| `close_days` | 30 min | fechamento diário idempotente do saldo |
| `reconcile_subscriptions` | a cada 6 h | reconcilia assinaturas com o provedor de pagamento |
| `cleanup` | 03:30 | limpeza de dados expirados |

Sob demanda: `process_import` (fila `imports`) para PDFs.

Todas são idempotentes; a outbox usa lock por linha (`locked_at/locked_by`, abandonado após
5 min) e novas tentativas com espera de 1, 5, 15 e 60 min.

## Notificações push
1. `python -m app.cli vapid` e cole `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` no `.env`
   (a privada é segredo). Reinicie API e worker.
2. Sem as chaves o sistema continua funcionando: `GET /api/v1/notifications/push/vapid-public-key`
   responde 404 `push_disabled`, o envio registra `push: skipped (push_disabled)` e a central
   dentro do app recebe normalmente.
3. Assinatura que o navegador cancelou (resposta 404/410) é removida automaticamente; após 8
   falhas seguidas a assinatura é marcada como expirada.

Payload entregue ao service worker:
```json
{"title": "...", "body": "...", "url": "/app", "tag": "<kind>:<activity_id|geral>",
 "data": {"kind": "...", "outbox_id": "...", "activity_id": "...", "local_date": "AAAA-MM-DD"}}
```

## Verificações
- Saúde: `GET /api/v1/health/live` e `GET /api/v1/health/ready`.
- Testes e lint: `.venv/bin/python -m pytest tests -q`, `.venv/bin/ruff check app tests`,
  `.venv/bin/ruff format --check app tests`. Os testes usam um SQLite por processo em
  `backend/var/` e não dependem do `.env`.
- Contrato: `backend/openapi.json` é regenerado a partir de `app.main:app`.
