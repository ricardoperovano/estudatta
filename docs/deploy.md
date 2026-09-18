# Publicação em servidor Linux (Docker + Nginx)

Nada aqui foi executado em servidor público nesta entrega; é o procedimento preparado.

## Requisitos
- Linux com Docker Engine + Compose v2, Nginx (ou Caddy) para TLS.
- DNS apontando para o servidor: `estudatta.com.br` e `www` (site público, repositório `estudatta-site`) e `app.estudatta.com.br` (app + API, este repositório).
- Portas: o Compose publica apenas `web` (padrão `WEB_PORT=8090`) e `api` em `127.0.0.1:${API_PORT}`; Postgres/Redis não precisam ser publicados em produção (remova as linhas `ports` de `db`/`redis` ou restrinja a `127.0.0.1`).

## Passos
1. Clone o repositório e copie `.env.example` para `.env`. Preencha: `APP_ENV=production`, `APP_URL=https://app.estudatta.com.br`, `API_URL=https://app.estudatta.com.br`, `CORS_ORIGINS=https://estudatta.com.br` (o site chama só os endpoints públicos), `SECRET_KEY` (aleatório, ≥ 32 caracteres), `COOKIE_SECURE=true`, senhas do Postgres, SMTP real (`EMAIL_BACKEND=smtp`), `VAPID_*` (`make vapid`), storage (`STORAGE_BACKEND=s3` + credenciais, ou volume local com backup), `BILLING_MODE`/credenciais quando existirem, `AI_*` se desejar.
2. `docker compose -f infra/docker-compose.yml --env-file .env build`
3. `docker compose -f infra/docker-compose.yml --env-file .env up -d db redis api worker scheduler web`
4. Migrações e catálogo: `docker compose ... exec api alembic upgrade head` e `docker compose ... exec api python -m app.cli ensure-plans` (o `make prod-up` faz os dois).
5. Administrador: `docker compose ... exec api python -m app.cli create-admin --email voce@exemplo.com` (a senha é pedida no prompt; nunca há senha fixa).
6. Site público: no repositório `estudatta-site`, `docker build -t estudatta-site .` e `docker run -d --restart unless-stopped --name estudatta-site -p 127.0.0.1:8091:80 estudatta-site`.
7. TLS: instale `infra/nginx/estudatta.conf.example` em `/etc/nginx/sites-available/estudatta` (site em `estudatta.com.br` → 8091; app em `app.estudatta.com.br` → 8090), `certbot --nginx -d estudatta.com.br -d www.estudatta.com.br -d app.estudatta.com.br`, `nginx -t && systemctl reload nginx`. Links antigos do app no domínio principal (`/app`, `/entrar`…) são redirecionados para o subdomínio.
8. Verifique `https://app.estudatta.com.br/api/v1/health/ready` (deve responder `{"status":"ok"}`), o site em `https://estudatta.com.br` (planos carregados da API) e a instalação do PWA no celular (push exige HTTPS e, no iOS, o app na tela inicial).

## Atualização (rollout) e rollback
- Atualizar: `git pull`, `build`, `up -d` (recria só o que mudou), `exec api alembic upgrade head`. As migrações são versionadas e reversíveis (`alembic downgrade -1`).
- Rollback de código: `git checkout <tag-anterior>` + `build` + `up -d` (app e site têm versões e rollbacks independentes). Rollback de banco: `alembic downgrade <revisão>` antes de voltar o código, ou restauração de backup (abaixo). Faça `make backup` antes de cada atualização.
- O service worker aplica a nova versão só quando o usuário aceita ("Atualizar agora") e nunca durante uma sessão de cronômetro.

## Backup e restauração
- `bash infra/scripts/backup.sh` — `pg_dump` comprimido + tarball do volume de materiais em `infra/backups/`, com retenção `BACKUP_RETENTION_DAYS` (padrão 14). Agende no cron do servidor (ex.: diário 03:15) e copie para fora do servidor.
- `bash infra/scripts/restore.sh infra/backups/db-<stamp>.sql.gz [storage-<stamp>.tar.gz]` — para os serviços, recria o banco, restaura e sobe de novo.
- Com S3, use versionamento e ciclo de vida do bucket; o dump do banco continua necessário.

## Observabilidade
- Logs estruturados (JSON em produção) em `docker compose logs api worker scheduler`; cada resposta traz `X-Request-ID`.
- `GET /api/v1/health/live` (liveness) e `/ready` (readiness: banco e Redis).
- Painel admin (`/admin`): filas, falhas de importação/notificação, eventos de cobrança, consumo agregado de IA.

## Push em aparelho físico
- Precisa de contexto seguro (HTTPS com certificado válido). `localhost` no computador não equivale a acesso por IP no celular; para testar no celular use o domínio HTTPS (ou um túnel HTTPS) e, no iPhone/iPad, adicione o app à tela inicial antes de permitir notificações.
- Testes automatizados de navegador não comprovam entrega push em iOS; registre o teste manual (aparelho, versão do iOS, resultado).
