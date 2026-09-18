# Verificações executadas

Executadas em 18/09/2026, na máquina de desenvolvimento (CachyOS, Docker 29, Node 26, Python 3.12 via uv, Chrome estável). Os resultados abaixo foram observados, não estimados.

## Backend

| Verificação | Comando | Resultado |
|---|---|---|
| Lint | `ruff check app tests` | sem problemas |
| Formatação | `ruff format --check app tests` | 123 arquivos ok |
| Testes (pytest, SQLite) | `pytest tests -q` | **169 passaram**, 0 falharam (inclui CORS para a origem do site) |
| Migrações em Postgres 16 vazio | `alembic upgrade head` + `alembic check` | aplicadas; modelos e migração sem divergência |
| Ida e volta de migração | `alembic downgrade base` + `upgrade head` | ok |
| API real | `GET /api/v1/health/ready` | `{"database":"ok","redis":"ok"}` |

Cobertura dos testes obrigatórios (seção 21 do escopo):

1. **Casos numéricos do saldo:** todos os da seção 7.3 e o exemplo dos mockups (`tests/domain/test_balance.py`).
2. **Metas e calendário:** meta por dia, descanso, pausa, início futuro e mudança de meta sem alterar o passado (`test_balance.py`, `test_slice.py`).
3. **Correções de histórico:** correção retroativa, exclusão de sessão e perdão explícito de pendência (`test_slice.py`).
4. **Fuso e horário de verão:** meia-noite, transição de horário de verão (America/Santiago) e mudança de fuso versionada (`tests/domain/test_intervals.py`).
5. **Jobs idempotentes:** reexecutar o agendamento de lembretes não duplica a outbox (`tests/jobs/`).
6. **Recuperação:** a distribuição não cria dívida nova e respeita a capacidade (`test_planner.py`, `test_slice.py`).
7. **Corrida entre abas:** duas abas iniciando sessão têm um único vencedor, com 409 e início idempotente por `client_uuid` (`test_slice.py`, E2E).
8. **Offline:** reenvio idempotente e conflito entre dois aparelhos sem duplicar tempo (`tests/api/test_sync.py`).
9. **Isolamento:** o usuário A não acessa dados, arquivos nem URL assinada do usuário B (vários arquivos).
10. **Notificações:** lembrete pulado ao se tornar irrelevante, limite diário e horário de silêncio (`tests/jobs/`).
11. **Webhook:** assinatura inválida, evento duplicado e fora de ordem; o retorno do checkout não libera acesso (`test_billing.py`).
12. **Sem IA e sem credenciais:** o app funciona; IA, cobrança e push respondem de forma honesta (`test_ai.py`, `test_billing.py`, `tests/jobs/`).
13. **Logout:** limpa o cache privado (E2E).

## Frontend

| Verificação | Comando | Resultado |
|---|---|---|
| Tipos | `tsc -b` | sem erros |
| Lint | `eslint .` | 0 erros; 8 avisos `react-refresh/only-export-components` em módulos que exportam constantes |
| Testes unitários | `vitest run` | 4 passaram |
| Build de produção | `npm run build` | ok; service worker com 95 arquivos no precache; `robots.txt` bloqueia indexação do app |
| Independência da pasta de design | busca por "Identidade visual" em `src/`, `vite.config.ts`, `index.html` | 0 ocorrências; os assets estão no repositório |

## Imagens de produção

| Verificação | Resultado |
|---|---|
| `docker compose -f infra/docker-compose.yml build api web` | as duas imagens constroem só com o conteúdo do repositório (`estudatta-web` 80 MB, `estudatta-api` 1,0 GB) |
| Imagem da API | importa a aplicação e expõe 126 rotas no OpenAPI |
| Imagem web | contém só o app: `index.html`, `assets/`, `sw.js`, manifest e `robots.txt` |
| `nginx -t` na imagem web | válido na rede do Compose, onde o upstream `api` existe; isolado falha só por não resolver `api` |

## Ponta a ponta (Playwright + Chrome, API real em Postgres dedicado)

Após a separação do site, `npx playwright test` teve **6 de 6 aprovados** nos projetos mobile (390×844) e desktop (1440×900).

- **Fluxo principal:**
  1. Cadastro e onboarding com Inglês a 60 min/dia, iniciado há 3 dias; a tela Hoje mostra meta de 60 min e 3h de pendência.
  2. Registro manual de 30 min; a frase muda para "Mais 90 min hoje: 30 min da meta + 60 min de recuperação".
  3. Criação de matéria e tópico.
  4. Aplicação do plano de recuperação.
  5. Material por link, vinculado ao objetivo e ao tópico com páginas.
  6. Consulta do relatório.
- **Cronômetro:** iniciar, abrir uma segunda aba sem criar outra sessão, pausar, retomar e encerrar.
- **Logout:** a rota privada volta a exigir login e o IndexedDB fica sem snapshots do usuário.

## Site público (repositório separado)

O site agora é o projeto `estudatta-site`, em HTML puro. Suas verificações (páginas, formulários, catálogo pela API, CORS, imagem Docker com URLs limpas e 404, fonte e política de segurança) estão em `estudatta-site/docs/verificacao-visual/README.md`.

## Verificação visual

Ver `docs/visual-comparison/README.md`. São 35 capturas implementadas contra as referências renderizadas, com as divergências corrigidas listadas lá.

## Não verificável neste ambiente

- **Entrega de Web Push em aparelho físico e instalação no iPhone:** exigem domínio HTTPS e aparelho. Procedimento em `docs/deploy.md`.
- **Cobrança real no Mercado Pago:** não há credenciais. O adaptador, a assinatura do webhook, a idempotência e a reconciliação foram testados com provedor falso (`docs/billing.md`).
- **IA com provedor real:** não há chave. Foi testada com cliente falso, cobrindo saída válida, saída inválida e cota.
- **OCR:** desligado por padrão. PDF sem camada de texto falha de forma honesta.
- **Implantação pública, TLS e DNS:** não foram executados, porque não foram solicitados.
