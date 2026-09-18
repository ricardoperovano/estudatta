#!/usr/bin/env bash
# Restaura um backup. Uso: bash infra/scripts/restore.sh infra/backups/db-<stamp>.sql.gz [infra/backups/storage-<stamp>.tar.gz]
# ATENÇÃO: substitui o banco atual. Pare api/worker/scheduler antes.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a
DB_FILE="${1:?informe o arquivo .sql.gz}"
STORAGE_FILE="${2:-}"
COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"
$COMPOSE stop api worker scheduler || true
echo "→ recriando banco"
$COMPOSE exec -T db psql -U "${POSTGRES_USER:-estudatta}" -d postgres -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB:-estudatta}\";" -c "CREATE DATABASE \"${POSTGRES_DB:-estudatta}\";"
gunzip -c "$DB_FILE" | $COMPOSE exec -T db psql -U "${POSTGRES_USER:-estudatta}" -d "${POSTGRES_DB:-estudatta}" -q
if [ -n "$STORAGE_FILE" ]; then
  echo "→ materiais"
  $COMPOSE run --rm -T --no-deps -v "$(pwd)/$(dirname "$STORAGE_FILE"):/backup" api sh -c "rm -rf /data/storage && tar xzf /backup/$(basename "$STORAGE_FILE") -C /data"
fi
$COMPOSE up -d api worker scheduler
$COMPOSE exec api alembic upgrade head
echo "ok"
