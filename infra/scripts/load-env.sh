#!/usr/bin/env bash
# Carrega um .env SEM interpretar o conteúdo pelo shell. Com `source`, "$aact_..." (chaves do
# Asaas) viraria uma variável vazia — ou quebraria com `set -u`. Aqui cada linha CHAVE=VALOR é
# exportada literalmente: aspas simples/duplas em volta são removidas e comentários no fim de
# valores sem aspas (" # ...") são ignorados, como no python-dotenv e no docker compose.
# Uso: . infra/scripts/load-env.sh; load_env caminho/.env
# O docker compose v2 lê o .env sozinho (env_file) e EXPANDE "$" em valores sem aspas ou entre
# aspas duplas: "$aact_..." (chave do Asaas) chega VAZIA no contêiner, sem erro na subida, e a
# cobrança se desliga (webhook 503 billing_disabled). Entre aspas simples o valor é literal.
_env_warn_dollar() {
  echo "AVISO: $1 contém \$ fora de aspas simples; o docker compose v2 vai expandir e o valor chega vazio no contêiner. Use $1='...'" >&2
}

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
      [[ "$val" == *'$'* ]] && _env_warn_dollar "$key"
    elif [[ "$val" =~ ^\'(.*)\'[[:space:]]*(#.*)?$ ]]; then
      val="${BASH_REMATCH[1]}"
    else
      val="${val%%[[:space:]]#*}"
      val="${val%"${val##*[![:space:]]}"}"
      [[ "$val" == *'$'* ]] && _env_warn_dollar "$key"
    fi
    export "$key=$val"
  done < "$file"
}
