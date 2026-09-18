#!/usr/bin/env bash
# Sobe a API em desenvolvimento: migrações, catálogo de planos e uvicorn com reload.
# Lê o .env da raiz do repositório. Uso: backend/scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f ../.env ]; then
  set -a
  # shellcheck disable=SC1091
  source ../.env
  set +a
fi
export PYTHONUNBUFFERED=1
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli ensure-plans
exec .venv/bin/uvicorn app.main:app --reload --host "${API_HOST:-0.0.0.0}" --port "${API_PORT:-8020}"
