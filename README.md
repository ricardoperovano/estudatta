# Estudatta

Planejador de estudo e prática: mostra o que fazer hoje, registra o tempo (cronômetro ou lançamento manual), transforma o que faltou em **tempo a recuperar** e ajuda a retomar o plano — sem culpa. PWA (React + TypeScript + Vite), API (FastAPI + PostgreSQL + Redis + Celery), site público pré-renderizado.

- Identidade visual e design: `../Identidade visual e design system PWA Estudatta/` (referência; os assets usados estão copiados em `apps/web/src/assets` e `apps/web/public`). Mapeamento em `docs/design-implementation.md`.
- Regras de saldo: `docs/regras-de-saldo.md`. Decisões e suposições: `docs/decisoes.md`.
- Publicação: `docs/deploy.md`. Cobrança: `docs/billing.md`. Importação/materiais: `docs/importacao-e-materiais.md`. IA: `docs/ia.md`.

## Estrutura

```
apps/web/      PWA, site público, pré-renderização (Vite)
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
make seed       # catálogo de planos + dados de demonstração (usuário demo@estudatta.com.br / senha no terminal)
make dev-api    # API em http://localhost:8020 (docs em /api/docs)
make dev-web    # PWA e site em http://localhost:5180 (proxy /api → 8020)
```

Outros: `make admin` (cria administrador com senha pedida no prompt), `make worker` / `make beat` (jobs), `make test` (pytest + typecheck/lint/vitest), `make e2e` (Playwright com Chrome instalado), `make build` (build do frontend com pré-renderização), `make vapid` (chaves para push). As portas padrão foram escolhidas para não colidir com outros projetos na máquina; ajuste em `.env`.

Os scripts que dependem de Bash estão em arquivos com shebang (`backend/scripts/*.sh`, `infra/scripts/*.sh`); execute com `bash <arquivo>` — não é preciso colar nada no Fish.

## Produção

`make prod-build && make prod-up` sobe `db`, `redis`, `api`, `worker`, `scheduler` e `web` (Nginx com o build estático + proxy `/api`). TLS, domínio, backup e rollback: `docs/deploy.md`.

## Ambientes de teste × produção

- E-mail: `EMAIL_BACKEND=console|smtp`; em dev o Mailpit captura tudo.
- Cobrança: `BILLING_MODE=disabled|test|production` + credenciais do Mercado Pago (`docs/billing.md`). Sem credenciais, a cobrança fica desabilitada e o plano gratuito segue disponível.
- Push: exige `VAPID_*`; sem elas o app informa que lembretes só aparecem com ele aberto.
- IA: `AI_ENABLED=true` + `AI_API_KEY`; sem isso, os recursos ficam ocultos/honestos.
- Demonstração: `DEMO_MODE=true` habilita `seed-demo` (dados fictícios só em demonstração explícita).
