# Verificação visual

Comparação entre os mockups fornecidos e as telas implementadas, nas mesmas dimensões (390×844 mobile, 1440×900 desktop), feita com Chrome headless.

- `reference/` — renderizações dos documentos `.dc.html` originais (runtime `support.js` + Nocturne), capturadas da pasta de design.
- `implemented/` — telas do Estudatta rodando contra a API local, com o usuário de demonstração (`make seed`). Para regenerar: `node apps/web/scripts/shots.mjs http://localhost:5180 demo@estudatta.com.br <senha>`.

Os números do cenário de demonstração reproduzem os dos mockups: meta de 60 min, 40 min registrados hoje, 60 min pendentes e 20 min de recuperação sugerida. As datas seguem o dia da captura, não o 17 de setembro dos mockups.

## Telas verificadas

| Referência | Implementada | Resultado |
|---|---|---|
| Mobile 01 Boas-vindas | onboarding, etapa 0 | Mesma composição: brilho, símbolo de 40 px, título de 32 px e opções de 56 px. |
| Mobile 02 Onboarding | onboarding, etapas 1 a 3 | Progresso de 2 px, stepper com presets, chips de dias e rádios de recuperação. |
| Mobile 03 Hoje | `mobile-hoje.png` | Mesmos números e frase do próximo passo, barra segmentada, agenda e pontos da semana. |
| Mobile 04 Cronômetro | `mobile-sessao-ativa.png` | Brilho central, número de 72 px, "Faltam mm:ss para os N min de hoje" e Pausar/Encerrar. |
| Mobile 05 Registro manual | folha "Registrar tempo" (E2E) | Presets 15/30/45/60/Outro, quando, conteúdo, páginas e "Salvar N min". |
| Mobile 06 Objetivo | `mobile-objetivos.png`, detalhe | Cartão com tag "5×/sem", barra de 6 px, pendência em damasco e árvore de matérias. |
| Mobile 07/08 Plano | `mobile-plano.png` | Mini-barras por dia (cumprido, sem registro, hoje) e agenda do dia. |
| Mobile 09 Recuperação | rota `/app/objetivos/:id/recuperar` (E2E) | Três opções, tabela Antes/Depois e "Aplicar replanejamento". |
| Mobile 10 Relatório | `mobile-relatorio.png` | Três cartões, barras com contorno damasco em dia sem registro, tempo por objetivo e leitura. |
| Mobile 11 Preferências | `mobile-preferencias.png` | Interruptores de 44×26, tom com prévia, silêncio e estado das notificações. |
| Mobile 12 Planos | `mobile-planos.png` | "Valor a definir", contorno acento e tag "Recomendado". |
| Mobile 15 Materiais e estados | `mobile-materiais.png` | Cartões de material; o cartão de erro de importação segue o padrão do mockup. |
| Desktop D1 Hoje | `desktop-hoje.png` | Lateral de 240 px, grade 7/5, quatro números, legenda e cartões de objetivos. |
| Desktop D2 Plano | `desktop-plano.png` | Grade de 7 colunas com estado por dia e diálogo de replanejamento. |
| Desktop D3 Relatório (claro) | `desktop-relatorio-claro.png` | Mesma paleta clara, com item ativo #e7e5fe/#5d5294 e barras #5d5294. |
| Desktop D4 Planos | `desktop-planos.png` | Três elementos: plano atual, Gratuito e Completo, com a nota do preço configurável. |
| Landing | `desktop-landing.png`, `mobile-landing.png` | Hero, mockup do telefone, faixa índigo, Como funciona, Para quem, Planos, FAQ e cadastro. |

## Divergências encontradas e corrigidas

- **Valores acima de 60 min na tela Hoje:** apareciam "1h"; o mockup usa "60 min". Agora a formatação usa horas só a partir de 2h.
- **Lateral no desktop:** mostrava ícones. O D1 usa só texto; os ícones ficam apenas na lateral colapsada do tablet.
- **Tema claro:** as rampas neutra e de acento eram fixas do tema escuro, o que deixava o item ativo escuro e os rótulos com pouco contraste. Agora as rampas se invertem no tema claro, como no D3.
- **Cronômetro:** ganhou tela cheia, sem a navegação inferior, como na tela 04.
- **Pré-sessão:** o próximo passo não aparecia antes da escolha do objetivo. Agora aparece com o objetivo padrão.
- **Relatório:** a frase sobre constância aparecia duplicada, e o histórico mostrava "—" na data de sessões cronometradas. Os dois foram corrigidos.
- **Recuperação sugerida:** a capacidade extra descontava duas vezes a duração das tarefas e zerava a sugestão. Agora a tarefa ocupa a meta e só o excedente reduz a capacidade.

## Adaptações mantidas

Estão registradas em `docs/design-implementation.md`.

## Limitações da inspeção

- **Fonte:** os mockups carregam a Inter do Google Fonts e o app usa a mesma fonte empacotada. Pequenas diferenças de hinting são esperadas.
- **Contrastes:** foram verificados pelos tokens do design (valores WCAG calculados no material de marca), não por ferramenta automática neste ambiente.
- **Tablet:** a faixa de 768 a 1024 px não tem mockup. Foi verificada apenas pelas regras de layout: lateral de 72 px e cartões em 2 colunas.
- **Push e instalação:** não é possível verificar visualmente em iPhone/Android a partir deste ambiente. Ver `docs/deploy.md`.
