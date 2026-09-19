#!/usr/bin/env bash
# Worker de tarefas (filas: default, imports, notifications). Uso: backend/scripts/worker.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# .env sem expandir "$" (chaves do Asaas começam com $aact_)
. ../infra/scripts/load-env.sh
load_env ../.env
export PYTHONUNBUFFERED=1
exec .venv/bin/celery -A app.jobs.celery_app:celery_app worker \
  -Q "${CELERY_QUEUES:-default,imports,notifications}" \
  -l "${CELERY_LOG_LEVEL:-info}" \
  --concurrency "${CELERY_CONCURRENCY:-2}"
