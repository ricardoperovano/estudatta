# Convenções do backend (para quem implementa módulos)

Raiz: `backend/`. Python 3.12 via `uv` (`.venv/bin/python`). Rode `uv sync` uma vez.

## Camadas
- `app/models/*.py` — ORM SQLAlchemy 2 (todos importados em `app/models/__init__.py`). UUID como PK (`UUIDPk`), `Timestamps`, `JSONType` portátil, `UTCDateTime` para datetimes. Não use tipos exclusivos do Postgres: os testes rodam em SQLite.
- `app/domain/` — lógica pura, sem banco (`balance.py`, `intervals.py`, `planner.py`, `messages.py`).
- `app/services/` — casos de uso com `Session` do SQLAlchemy. Funções recebem `db`, `user`, entidades; fazem `db.flush()`; **quem faz `db.commit()` é o router** (ou o job).
- `app/api/v1/<modulo>.py` — `router = APIRouter(prefix=..., tags=[...])`, já registrado em `app/api/v1/router.py`. Schemas Pydantic v2 em `app/schemas/` (ou no próprio router quando pequenos), com `ORMModel` (`from_attributes`).
- `app/integrations/` — adaptadores externos (e-mail, storage, push, Mercado Pago, IA). Sempre com modo "sem credencial" honesto (`ServiceUnavailable`, flags em `settings`).
- `app/jobs/tasks_*.py` — tarefas Celery registradas em `app/jobs/celery_app.py` (nomes fixos: ver `beat_schedule`). Use `SessionLocal()` como contexto; jobs curtos, idempotentes, com locks por linha (`locked_at/locked_by`) e `next_run_at`.

## Dependências e segurança
- `get_current_user` (cookie de sessão + CSRF em mutações), `get_admin_user`, `get_optional_user`, `rate_limit(scope, n, janela)`, `get_device_id` em `app/core/deps.py`.
- Erros: `ApiError`, `NotFound`, `Forbidden`, `Unauthorized`, `Conflict`, `ValidationFailed` (422), `PlanLimit` (402), `RateLimited`, `ServiceUnavailable` em `app/core/errors.py`. Formato `{"error": {"code", "message", "details"}}`.
- **Isolamento:** toda consulta filtra por `user_id`; validação cruzada de IDs (material/tópico/objetivo de outro usuário → `NotFound`/`ValidationFailed`).
- Auditoria: `audit(db, actor_id=..., action="modulo.acao", target_type=..., target_id=..., metadata=...)` em `app/core/audit.py`.
- Notificações: `app/services/outbox.py` → `enqueue(db, user_id=..., kind=..., dedupe_key=..., scheduled_for=..., payload=..., channels=[...], activity_id=..., proactive=True)`; `cancel_pending(...)`; `notify_inapp(...)`. A outbox é gravada na mesma transação do evento.
- Direitos de acesso: `get_entitlements(db, user_id)` em `app/services/plans.py` (`limits` do plano). Não decida direitos no frontend.
- Tempo: `app/core/timeutil.py` (`utcnow`, `today_in(tz)`, `local_date`, `local_datetime_to_utc`). Datas de planejamento são **datas locais** no fuso do objetivo (`activity.timezone`).
- Saldo: `app/services/balance.py` (`activity_balance`, `compute_activity_balances`, `project_targets`, `day_capacities`), `app/services/recovery.py`.
- Config: `settings` em `app/core/config.py`. Nunca exponha chaves. Adicione novas variáveis também em `.env.example` (raiz) com comentário.

## Testes
- `tests/conftest.py`: fixtures `client`, `user_client` (já cadastrado, com CSRF), helpers `signup(client, email=...)`, `make_activity(client, ...)`. `freezegun.freeze_time` para datas (`"2026-09-15 12:00:00"` = terça 09:00 em São Paulo; `2026-09-14` é segunda).
- E-mail em memória: `from app.integrations.email import MemoryBackend; MemoryBackend.sent`.
- Rode `.venv/bin/python -m pytest tests -q` e `.venv/bin/ruff check app tests` + `.venv/bin/ruff format app tests` antes de terminar.
- Migrações: após alterar modelos, gere `.venv/bin/alembic revision --autogenerate -m "..."` com `DATABASE_URL` do Postgres local (ver `.env`) e substitua `app.models.base.UTCDateTime(timezone=True)` por `sa.DateTime(timezone=True)` no arquivo gerado. Prefira **não** alterar modelos existentes; se precisar, documente em `docs/decisoes.md`.

## Português e produto
- Mensagens ao usuário em pt-BR, vocabulário: "tempo a recuperar", "pendência", "meta de hoje", "sessão", "retomar o plano". Nunca "você não estudou" quando só falta registro.
- Nada de nomes de tecnologia (Celery, Redis, VAPID) em textos para o usuário comum.
