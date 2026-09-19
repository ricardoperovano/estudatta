#!/usr/bin/env bash
# Atalho para o Compose do servidor (docker-compose.server.yml), com o .env da raiz carregado.
# Funciona com docker-compose 1.x (que resolve --env-file relativo à pasta infra/) e com v2.
# Exemplos, na raiz do repositório:
#   bash infra/scripts/dc.sh ps
#   bash infra/scripts/dc.sh up -d api worker
#   bash infra/scripts/dc.sh logs --tail 100 api
#   bash infra/scripts/dc.sh exec api python -m app.cli create-admin --email voce@exemplo.com
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || { echo "Falta o .env de produção na raiz do repositório." >&2; exit 1; }
. infra/scripts/load-env.sh; load_env .env   # sem expandir "$" (chaves do Asaas)
if docker compose version >/dev/null 2>&1; then DC=(docker compose); else DC=(docker-compose); fi
exec "${DC[@]}" -p estudatta -f infra/docker-compose.server.yml "$@"
