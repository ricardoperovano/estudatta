# Estudatta — app e API

Planejador de estudo e prática: mostra o que fazer hoje, registra o tempo (cronômetro ou lançamento manual), transforma o que faltou em **tempo a recuperar** e ajuda a retomar o plano — sem culpa. Também tem revisões espaçadas, simulados, análise por matéria, conquistas e o Tatá, um mascote que faz companhia nas sessões. PWA (React + TypeScript + Vite) e API (FastAPI + PostgreSQL + Redis + Celery), publicados em `app.estudatta.com.br`.

O **site público** (`estudatta.com.br`) é um projeto separado, em HTML/CSS/JS puros: repositório `estudatta-site`. Ele usa só os endpoints públicos desta API (`/api/v1/public/*`) e precisa estar em `CORS_ORIGINS`.

- Identidade visual e design: `../Identidade visual e design system PWA Estudatta/` (referência; os assets usados estão copiados em `apps/web/src/assets` e `apps/web/public`). Mapeamento em `docs/design-implementation.md`.
- Regras de saldo: `docs/regras-de-saldo.md`. Planos, preços e limites: `docs/planos-e-precos.md`. Decisões e suposições: `docs/decisoes.md`.
- Verificações executadas: `docs/verificacoes.md`. Verificação visual: `docs/visual-comparison/README.md`.
- Publicação: `docs/deploy.md`. Cobrança: `docs/billing.md`. Importação/materiais: `docs/importacao-e-materiais.md`. IA: `docs/ia.md`. Revisões, simulados, conquistas e o Tatá: `docs/estudo-e-gamificacao.md`.

## Estrutura

```
apps/web/      app (PWA), Vite
backend/       API FastAPI, domínio, persistência (SQLAlchemy 2 + Alembic), jobs (Celery)
infra/         Docker Compose, Dockerfiles, Nginx, backup/restauração
docs/          decisões, regras, mapeamento do design, verificação visual, operação
```

## Desenvolvimento (CachyOS/Fish ou qualquer shell)

Requisitos na sua máquina: Docker + Compose v2, Node ≥ 20, [uv](https://docs.astral.sh/uv/) (baixa o Python 3.12 sozinho).

```
make setup      # cria .env a partir de .env.example, instala backend (uv) e frontend (npm)
make up         # Postgres :5450, Redis :6400, Mailpit :8050 (UI) / :1050 (SMTP)
make migrate    # alembic upgrade head
make seed       # catálogo de planos + dados de demonstração (DEMO_MODE=true; usuário demo@estudatta.com.br, senha exibida no terminal)
make dev-api    # API em http://localhost:8020 (docs em /api/docs)
make dev-web    # app em http://localhost:5180 (proxy /api → 8020)
# site público: no repositório estudatta-site, python3 -m http.server 5190
```

Outros: `make admin` (cria administrador com senha pedida no prompt), `make worker` / `make beat` (jobs), `make test` (pytest + typecheck/lint/vitest), `make e2e` (Playwright com Chrome instalado), `make build` (build do app), `make vapid` (chaves para push). As portas padrão foram escolhidas para não colidir com outros projetos na máquina; ajuste em `.env`.

Os scripts que dependem de Bash estão em arquivos com shebang (`backend/scripts/*.sh`, `infra/scripts/*.sh`); execute com `bash <arquivo>` — não é preciso colar nada no Fish.

## Produção

| Parte | Onde | Como publicar |
|---|---|---|
| App (PWA) | Vercel, `https://app.estudatta.com.br` | Push na `main` (projeto da Vercel com pasta `apps/web`). Variável na Vercel: `VITE_API_URL=https://api.estudatta.com.br` (depois de mudar, faça um novo deploy). |
| API, worker, agendador, Postgres, Redis | Servidor `api-v2`, em `/opt/estudatta` | `bash infra/scripts/deploy-server.sh` |
| Site público | Repositório `estudatta-site` | À parte |

**Deploy e atualização do backend** (no servidor):

```
cd /opt/estudatta && bash infra/scripts/deploy-server.sh
```

Faz `git pull`, build, backup do banco (guarda os 14 últimos em `infra/backups/`), migrações, catálogo de planos, sobe API/worker/agendador e confere `/api/v1/health/ready`. Rollback: `git checkout <commit>` e `bash infra/scripts/deploy-server.sh --no-pull`.

Outros comandos passam pelo atalho `infra/scripts/dc.sh`, que carrega o `.env` e isola o projeto (`-p estudatta`); funciona com o `docker-compose` antigo do servidor e com o Compose v2:

```
bash infra/scripts/dc.sh ps
bash infra/scripts/dc.sh logs --tail 100 api
bash infra/scripts/dc.sh up -d api worker scheduler      # depois de mudar só o .env
bash infra/scripts/dc.sh exec api python -m app.cli create-admin --email voce@exemplo.com
```

O servidor usa `infra/docker-compose.server.yml`: só o backend, Postgres e Redis **sem porta no host** e a API só em `127.0.0.1:18120`, atrás do Nginx do servidor (Cloudflare → `api.estudatta.com.br`). **Não use `make prod-build`/`make prod-up` no servidor**: eles usam o compose completo, que sobe o front e publica as portas do banco e do Redis, em conflito com os outros serviços da máquina. Detalhes, certificado e Nginx: `docs/deploy.md`.

## Ambientes de teste × produção

- **E-mail:** `EMAIL_BACKEND=cloudflare|smtp|console`. Produção usa `cloudflare` (API REST do Cloudflare Email Sending: `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_EMAIL_API_TOKEN`, domínio do remetente cadastrado em Email Sending). Em desenvolvimento, `smtp` com o Mailpit captura tudo.
- **Cobrança:** `BILLING_PROVIDER=asaas|mercadopago` e `BILLING_MODE=disabled|test|production`. Com o Asaas: `ASAAS_API_KEY` (chave com `hmlg` = sandbox) e `ASAAS_WEBHOOK_TOKEN` (32+ caracteres); depois cadastre o webhook com `bash infra/scripts/dc.sh exec api python -m app.cli asaas-webhook create https://api.estudatta.com.br voce@exemplo.com` e confira com `asaas-webhook list`. Chaves que começam com `$` (as do Asaas) podem ficar sem aspas no `.env`: os scripts leem o arquivo sem interpretar `$`. Sem credenciais, a cobrança fica desabilitada e o plano gratuito segue disponível. Detalhes: `docs/billing.md`.
- **Push:** exige `VAPID_*` (`make vapid` gera o par); sem elas o app informa que lembretes só aparecem com ele aberto.
- **IA:** `AI_ENABLED=true` + `AI_API_KEY`; sem isso, os recursos ficam ocultos/honestos.
- **Demonstração:** `DEMO_MODE=true` habilita `seed-demo` (dados fictícios só em demonstração explícita).
