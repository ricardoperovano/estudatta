#!/usr/bin/env bash
# Backup do banco (pg_dump) e dos materiais (volume local). Uso: bash infra/scripts/backup.sh [destino]
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; source .env; set +a
DEST="${1:-infra/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"
echo "→ banco"
$COMPOSE exec -T db pg_dump -U "${POSTGRES_USER:-estudatta}" -d "${POSTGRES_DB:-estudatta}" --no-owner | gzip > "$DEST/db-$STAMP.sql.gz"
echo "→ materiais"
$COMPOSE run --rm -T --no-deps -v "$(pwd)/$DEST:/backup" api tar czf "/backup/storage-$STAMP.tar.gz" -C /data storage 2>/dev/null || echo "(sem volume de materiais local — em produção com S3 use o versionamento do bucket)"
# retenção configurável (dias)
RET="${BACKUP_RETENTION_DAYS:-14}"
find "$DEST" -name 'db-*.sql.gz' -mtime +"$RET" -delete
find "$DEST" -name 'storage-*.tar.gz' -mtime +"$RET" -delete
echo "ok: $DEST/db-$STAMP.sql.gz"
