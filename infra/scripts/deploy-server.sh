#!/usr/bin/env bash
# Deploy do backend no servidor compartilhado (docker-compose.server.yml).
# Uso, na raiz do repositório (/opt/estudatta): bash infra/scripts/deploy-server.sh [--no-pull]
# Passos: git pull → build → backup do banco (se já existir) → migrações → catálogo → sobe → saúde.
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -f .env ] || { echo "Falta o .env de produção na raiz do repositório." >&2; exit 1; }
. infra/scripts/load-env.sh; load_env .env   # sem expandir "$" (chaves do Asaas)
API_PORT="${API_PORT:-18120}"

DC=(bash infra/scripts/dc.sh)   # carrega o .env e escolhe docker compose v2 ou docker-compose 1.x

if [ "${1:-}" != "--no-pull" ]; then git pull --ff-only; fi
echo "Versão: $(git log --oneline -1)"

"${DC[@]}" build api
"${DC[@]}" up -d db redis

# backup antes de migrar, se o banco já tem dados
mkdir -p infra/backups
if "${DC[@]}" exec -T db psql -U "${POSTGRES_USER:-estudatta}" -d "${POSTGRES_DB:-estudatta}" -Atc "select 1 from alembic_version" >/dev/null 2>&1; then
  f="infra/backups/estudatta-$(date +%Y%m%d-%H%M%S).sql.gz"
  "${DC[@]}" exec -T db pg_dump -U "${POSTGRES_USER:-estudatta}" -d "${POSTGRES_DB:-estudatta}" | gzip > "$f"
  echo "Backup: $f"
  ls -1t infra/backups/estudatta-*.sql.gz | tail -n +15 | xargs -r rm --   # guarda os 14 mais recentes
fi

"${DC[@]}" run --rm --no-deps api alembic upgrade head
"${DC[@]}" run --rm --no-deps api python -m app.cli ensure-plans
"${DC[@]}" up -d api worker scheduler

for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/api/v1/health/ready" >/dev/null 2>&1; then
    echo "API no ar em 127.0.0.1:${API_PORT}."
    curl -sS "http://127.0.0.1:${API_PORT}/api/v1/health/ready"; echo
    exit 0
  fi
  sleep 3
done
echo "A API não respondeu. Logs:" >&2
"${DC[@]}" logs --tail 80 api >&2
exit 1
