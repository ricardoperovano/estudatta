#!/usr/bin/env bash
# Sobe a API para os testes E2E contra um banco Postgres dedicado (estudatta_e2e), recriado do zero.
# Uso: bash backend/scripts/e2e-api.sh [porta]
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-8022}"
. ../infra/scripts/load-env.sh; load_env ../.env
export APP_ENV=test
export RATE_LIMIT_ENABLED=false
export EMAIL_BACKEND=console
export APP_URL="http://localhost:5182"
export API_URL="http://localhost:${PORT}"
export STORAGE_LOCAL_PATH="var/e2e-storage"
BASE_URL="${DATABASE_URL:-postgresql+psycopg://estudatta:estudatta@localhost:5450/estudatta}"
export DATABASE_URL="${BASE_URL%/*}/estudatta_e2e"
ADMIN_URL="${BASE_URL%/*}/postgres"
.venv/bin/python - <<PY
import os
from sqlalchemy import create_engine, text
admin = create_engine(os.environ["DATABASE_URL"].rsplit("/",1)[0] + "/postgres", isolation_level="AUTOCOMMIT")
with admin.connect() as c:
    c.execute(text("DROP DATABASE IF EXISTS estudatta_e2e"))
    c.execute(text("CREATE DATABASE estudatta_e2e"))
print("e2e database recreated")
PY
.venv/bin/alembic upgrade head >/dev/null
.venv/bin/python -m app.cli ensure-plans >/dev/null 2>&1 || true
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${PORT}"
