#!/usr/bin/env bash
# Agendador de tarefas periódicas (beat). Uso: backend/scripts/beat.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f ../.env ]; then
  set -a
  # shellcheck disable=SC1091
  source ../.env
  set +a
fi
export PYTHONUNBUFFERED=1
exec .venv/bin/celery -A app.jobs.celery_app:celery_app beat \
  -l "${CELERY_LOG_LEVEL:-info}" \
  --schedule "${CELERY_BEAT_SCHEDULE:-var/celerybeat-schedule}"
