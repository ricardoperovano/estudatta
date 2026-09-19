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

Requisitos: Docker + Compose v2, Node ≥ 20, [uv](https://docs.astral.sh/uv/) (baixa o Python 3.12 sozinho).

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

`make prod-build && make prod-up` sobe `db`, `redis`, `api`, `worker`, `scheduler` e `web` (Nginx com o app + proxy `/api`). O site público é publicado à parte (container próprio). TLS, os dois domínios, backup e rollback: `docs/deploy.md`.

## Ambientes de teste × produção

- E-mail: `EMAIL_BACKEND=console|smtp`; em dev o Mailpit captura tudo.
- Cobrança: `BILLING_MODE=disabled|test|production` + credenciais do Mercado Pago (`docs/billing.md`). Sem credenciais, a cobrança fica desabilitada e o plano gratuito segue disponível.
- Push: exige `VAPID_*`; sem elas o app informa que lembretes só aparecem com ele aberto.
- IA: `AI_ENABLED=true` + `AI_API_KEY`; sem isso, os recursos ficam ocultos/honestos.
- Demonstração: `DEMO_MODE=true` habilita `seed-demo` (dados fictícios só em demonstração explícita).
