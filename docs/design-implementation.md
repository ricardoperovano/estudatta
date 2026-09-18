# Mapeamento do design implementado

Referência: `../Identidade visual e design system PWA Estudatta/` (preservada, não editada). Este documento liga cada material de referência aos assets reutilizados, tokens e componentes implementados em `apps/web`, registra adaptações e o resultado da verificação visual. Nenhuma "aprovação" é declarada aqui: as capturas em `docs/visual-comparison/` permitem a comparação pelo responsável.

## Arquivos de referência → implementação

| Referência | Papel confirmado pelo conteúdo | Implementação |
|---|---|---|
| `design-system.md` | Decisões de identidade, cores, tipografia, espaço, componentes, telas | Base de `apps/web/src/design/tokens.css`, `tailwind.config.ts`, `src/index.css` e dos componentes |
| `tokens/design-tokens.json` | Tokens semânticos (claro/escuro, fonte, espaço, raio, sombra, movimento, layout) | Copiado em `src/design/tokens/design-tokens.json`; valores transcritos para variáveis CSS |
| `tokens/tokens.css` | Variáveis CSS — **arquivo corrompido** (hex quebrados, `120px` de duração) | Não usado; substituído por `src/design/tokens.css` gerado do JSON (registrado em `docs/decisoes.md`) |
| `00 Entrega.dc.html` | Índice da entrega | — |
| `01 Conceito e Marca.dc.html` | Conceito "Retomada", símbolo Trilho, composições, uso correto/incorreto, posicionamento, tons | `src/design/brand.ts` (nome, assinaturas, campanhas, tons), `src/components/app/brand.tsx` (`Symbol`, `Logo` em Inter 500 tracking −0,015em) |
| `02 Cores Tipografia Tokens.dc.html` | Paletas com contraste, escala Inter, números tabulares, espaçamento 0,7×, raios/elevação | Tokens; classe `.tnum`; escala `text-xs…4xl`, `timer` 64/96; sombras `sm/md/lg` |
| `03 Componentes.dc.html` | Botões (primário em contorno), campos, dias/duração, chips/abas, cartão "Seu plano de hoje", cartão de objetivo, cronômetro, registro manual, agenda/tarefas, árvore, gráfico, lembretes/tom, diálogo antes/depois, estados, planos, navegação | `src/components/ui/*` (`Button`, `Input/Field`, `DayPicker`, `DurationStepper`, `Seg`, `Tag`, `Tabs`, `Card*`, `GoalBar`, `Bar`, `Legend`, `Dialog`, `Banner`, `EmptyState`, `Toaster`), `src/components/app/nav.tsx` |
| `04 Telas Mobile.dc.html` (390 px, 15 telas) | Boas-vindas, onboarding, Hoje, cronômetro, registro manual, objetivo, plano (agenda/lista), recuperação, relatório, preferências, planos, dia concluído, pausa, erros/offline | `src/app/onboarding/page.tsx`, `src/app/today/page.tsx` + `manual-entry.tsx`, `src/app/timer/page.tsx`, `src/app/activities/*`, `src/app/plan/*`, `src/app/recovery/page.tsx`, `src/app/reports/page.tsx`, `src/app/settings/page.tsx`, `src/app/billing/page.tsx`, `src/app/materials/page.tsx` |
| `05 Telas Desktop.dc.html` (1440 px) | Hoje, plano da semana + diálogo de replanejamento, relatório (tema claro), planos | Mesmas páginas com layout `desktop:` (lateral 240 px em `nav.tsx`, grade 7/5 em Hoje, cartões 4 colunas) |
| `06 Landing.dc.html` | Site público | `src/site/layout.tsx`, `src/site/pages/home.tsx`, `src/site/sections/*` |
| `07 Divulgacao.dc.html` + `divulgacao/` | Peças e mensagens de campanha | Capa OG copiada para `public/divulgacao/`; mensagens em `brand.campaigns` (páginas /ingles, /concursos) |
| `marca/` (16 SVG + PNG) | Logos, símbolo, ícones PWA, favicon, avatar | `src/assets/marca/*.svg` (todos), `public/marca/` (favicon SVG/PNG 16/32, icon 192/512, maskable 192/512, apple-touch 180) usados no `manifest` e `index.html` |
| `_ds/nocturne…/styles.css`, `support.js`, `_ds_bundle.js` | Runtime dos mockups (React via CDN + classes Nocturne) — **não é a arquitetura do produto** | Classes `.btn/.card/.seg/.tag/.dialog` traduzidas para componentes React com os mesmos valores (padding 5,6/10 px, raio 8, tag 11 px, seg 13 px etc.) |

## Tokens → Tailwind

`bg-canvas`, `bg-surface`, `bg-surface-raised`, `text-primary/secondary/tertiary/disabled`, `border-divider/border/border-strong`, `text-accent`/`bg-accent-900`/`accent-100…900`, `neutral-100…900`, `text-pending`, `success/warning/error/info` (+ `-tint`), `bg-track`, `recovery-stripes`, `rounded-sm/md/lg/phone`, `shadow-sm/md/lg/accent-ring/inset-accent`, `duration-fast/base/slow`, `ease-standard`, `max-w-content/reading`, `ds-1…ds-16` (espaçamento 0,7×). shadcn: `--background`=canvas, `--card`=surface, `--primary`=action.primary, `--ring`=action.focus, `--destructive`=status.error, raio 8.

Tema: escuro em `:root` (padrão), claro via `[data-theme="light"]` ou `prefers-color-scheme: light` (sem `[data-theme="dark"]`); `prefers-reduced-motion` zera as durações. Fonte Inter empacotada localmente (`@fontsource/inter` 400/500/600) com `font-feature-settings: "tnum"` nos números.

## Navegação

Inferior 64 px no celular com 4 itens (Hoje · Plano · Objetivos · Relatório) e ícones Phosphor 24 px; lateral 240 px no desktop (72 px colapsada no tablet) com os mesmos itens + Notificações, Preferências, Planos e o estado de sincronização ("Sincronizado às 19:42"). A ação principal ("Começar sessão") fica no conteúdo, como o design determina.

## Adaptações registradas

- Botão `Button` em modo `asChild` não mostra spinner (limitação do `Slot`).
- Na landing, o CTA principal virou "Começar grátis"/"Criar conta" porque o cadastro já existe; a lista de e-mail ("Receber novidades") permanece como opção secundária (o mockup previa "Quero acesso inicial" por ser pré-lançamento).
- A tela Hoje mostra "Voltar à sessão" quando há cronômetro em andamento (estado não desenhado; derivado do cartão e da tag existentes).
- Registro manual usa `input type="date"/"time"` nativos em vez do texto "Hoje, 12:30" do mockup (acessibilidade e teclado).
- Tema claro derivado dos tokens claros para todas as telas (só o relatório desktop tinha referência).

## Verificação visual

Capturas: `docs/visual-comparison/reference/*.png` (mockups renderizados com o `support.js` original em Chrome headless) e `docs/visual-comparison/implemented/*.png` (geradas por `node apps/web/scripts/shots.mjs` com Chrome, 390×844 e 1440×900, usuário de demonstração). Telas verificadas e correções aplicadas estão listadas em `docs/visual-comparison/README.md`.

Limitações concretas da inspeção: os mockups usam Inter carregada do Google Fonts (a implementação usa a mesma fonte empacotada); os dados de demonstração reproduzem os números dos mockups, mas as datas seguem o dia real da captura.
