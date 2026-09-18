# Estudatta — comandos de desenvolvimento e operação (portáveis; funcionam a partir de qualquer shell)
COMPOSE ?= docker compose -f infra/docker-compose.yml --env-file .env
PY := backend/.venv/bin/python

.PHONY: help setup up down logs migrate seed admin test test-backend test-web e2e build lint vapid backup restore prod-up prod-build

help:
	@echo "make setup       instala dependências (uv + npm) e cria .env se não existir"
	@echo "make up          sobe Postgres, Redis e Mailpit (dev)"
	@echo "make migrate     aplica migrações no banco"
	@echo "make seed        catálogo de planos + dados de demonstração (DEMO_MODE)"
	@echo "make admin       cria usuário administrador (pede e-mail/senha)"
	@echo "make dev-api     API com reload em :8020 (backend/scripts/dev.sh)"
	@echo "make dev-web     PWA/site em :5180"
	@echo "make worker      Celery worker · make beat   scheduler"
	@echo "make test        testes backend + frontend · make e2e  Playwright"
	@echo "make build       build de produção do app"
	@echo "make vapid       gera par de chaves VAPID para .env"
	@echo "make backup      dump do banco + materiais em infra/backups/"
	@echo "make prod-build  constrói imagens · make prod-up  sobe tudo (api, worker, scheduler, web)"

setup:
	@[ -f .env ] || cp .env.example .env
	cd backend && uv sync --python 3.12
	cd apps/web && npm ci --no-audit --no-fund

up:
	$(COMPOSE) --profile dev up -d db redis mailpit

down:
	$(COMPOSE) --profile dev down

logs:
	$(COMPOSE) logs -f --tail=100

migrate:
	cd backend && set -a && . ../.env && set +a && .venv/bin/alembic upgrade head

seed: migrate
	cd backend && set -a && . ../.env && set +a && .venv/bin/python -m app.cli ensure-plans && DEMO_MODE=true .venv/bin/python -m app.cli seed-demo

admin:
	cd backend && set -a && . ../.env && set +a && .venv/bin/python -m app.cli create-admin

dev-api:
	bash backend/scripts/dev.sh

dev-web:
	cd apps/web && npm run dev

worker:
	bash backend/scripts/worker.sh

beat:
	bash backend/scripts/beat.sh

test: test-backend test-web

test-backend:
	cd backend && .venv/bin/python -m pytest tests -q

test-web:
	cd apps/web && npm run typecheck && npm run lint && npm run test

e2e:
	cd apps/web && npm run test:e2e

build:
	cd apps/web && npm run build

lint:
	cd backend && .venv/bin/ruff check app tests && .venv/bin/ruff format --check app tests
	cd apps/web && npm run lint

vapid:
	cd backend && .venv/bin/python -m app.cli vapid

backup:
	bash infra/scripts/backup.sh

restore:
	@echo "uso: bash infra/scripts/restore.sh <arquivo.sql.gz> [materiais.tar.gz]"

prod-build:
	$(COMPOSE) build

prod-up:
	$(COMPOSE) up -d db redis api worker scheduler web
	$(COMPOSE) exec api alembic upgrade head
	$(COMPOSE) exec api python -m app.cli ensure-plans
