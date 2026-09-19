#!/usr/bin/env bash
# Carrega um .env SEM interpretar o conteúdo pelo shell. Com `source`, "$aact_..." (chaves do
# Asaas) viraria uma variável vazia — ou quebraria com `set -u`. Aqui cada linha CHAVE=VALOR é
# exportada literalmente: aspas simples/duplas em volta são removidas e comentários no fim de
# valores sem aspas (" # ...") são ignorados, como no python-dotenv e no docker compose.
# Uso: . infra/scripts/load-env.sh; load_env caminho/.env
load_env() {
  local file="$1" line key val
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[2]}"
    val="${BASH_REMATCH[3]}"
    if [[ "$val" =~ ^\"(.*)\"[[:space:]]*(#.*)?$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
      val="${BASH_REMATCH[1]}"
    else
      val="${val%%[[:space:]]#*}"
      val="${val%"${val##*[![:space:]]}"}"
    fi
    export "$key=$val"
  done < "$file"
}
