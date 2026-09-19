#!/usr/bin/env bash
# Agendador de tarefas periódicas (beat). Uso: backend/scripts/beat.sh
set -euo pipefail
cd "$(dirname "$0")/.."
# .env sem expandir "$" (chaves do Asaas começam com $aact_)
. ../infra/scripts/load-env.sh
load_env ../.env
export PYTHONUNBUFFERED=1
exec .venv/bin/celery -A app.jobs.celery_app:celery_app beat \
  -l "${CELERY_LOG_LEVEL:-info}" \
  --schedule "${CELERY_BEAT_SCHEDULE:-var/celerybeat-schedule}"
