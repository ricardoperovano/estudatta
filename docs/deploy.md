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

## Servidor compartilhado + app na Vercel (produção atual)

O backend roda no servidor `api-v2` (Ubuntu 20.04, Docker 24, docker-compose 1.28, Nginx do sistema com vários outros sites). O app (PWA) é publicado na Vercel.

**Endereços**

| Parte | Onde |
|---|---|
| App (PWA) | Vercel, `https://app.estudatta.com.br` |
| API | `https://api.estudatta.com.br` (Cloudflare → Nginx do servidor → `127.0.0.1:18120`) |
| Código no servidor | `/opt/estudatta` (clone de `git@github.com:ricardoperovano/estudatta.git`) |

**Como o app fala com a API:** na Vercel, `VITE_API_URL=https://api.estudatta.com.br`. O app chama a API direto, com `credentials: "include"`. A API libera a origem do app em `CORS_ORIGINS`. Os cookies de sessão (`SameSite=Lax`, só do host da API) funcionam porque `app.` e `api.estudatta.com.br` são o mesmo site. Endereços de prévia da Vercel (`*.vercel.app`) são outro site: o login não funciona neles. O `apps/web/vercel.json` só faz o fallback do SPA e os cabeçalhos.

**Isolamento no servidor**
- Projeto Compose `estudatta` (`-p estudatta`): o nome `infra` já é usado por outro projeto do servidor.
- Postgres e Redis sem porta no host; só a API publica, e só em `127.0.0.1:18120`.
- Arquivo: `infra/docker-compose.server.yml`. Nginx: `infra/nginx/api.estudatta.com.br.conf.example`.

**Deploy e atualização:** `cd /opt/estudatta && bash infra/scripts/deploy-server.sh`. Outros comandos do Compose passam por `bash infra/scripts/dc.sh` (ex.: `dc.sh ps`, `dc.sh logs --tail 100 api`, `dc.sh up -d api worker` depois de mudar o `.env`, `dc.sh exec api python -m app.cli create-admin --email voce@exemplo.com`). O script faz `git pull`, build, backup do banco (guarda os 14 últimos em `infra/backups/`), migrações, catálogo de planos, sobe os serviços e confere `/api/v1/health/ready`.

**Certificado:** Certificado de Origem da Cloudflare para `api.estudatta.com.br` em `/etc/ssl/cloudflare/estudatta.com.br.pem` e `.key`, com SSL "Full (strict)" e proxy ligado no DNS. O site do Nginx só é ativado depois que os arquivos existem, porque um certificado ausente quebraria o `nginx -t` dos outros sites.

**Rollback:** `git checkout <commit>` e `bash infra/scripts/deploy-server.sh --no-pull`. Banco: `alembic downgrade <revisão>` ou restaurar o backup de `infra/backups/`.

**Arquivos (materiais, importações):** bucket privado `estudatta` no DigitalOcean Spaces (região `nyc3`), configurado no `.env` do servidor com `STORAGE_BACKEND=s3` e as variáveis `S3_*`. As chaves são as do Spaces já usadas pelos outros projetos; o acesso aos arquivos é por URL assinada de curta duração. A foto de perfil fica no banco (`user_avatars`, até 256 px), não no bucket.
