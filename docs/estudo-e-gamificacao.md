# Estudo, gamificação e o Tatá

Recursos adicionados em 2026-09-18, inspirados no estudei.com.br. Decisões e o que ficou de fora estão em `decisoes.md`.

## Sessões

| Campo | Regra |
|---|---|
| `study_type` | teoria, questoes, revisao, leitura, aula, simulado, pratica, outro. Padrão: teoria. |
| `questions_total`, `questions_correct` | Opcionais; acertos ≤ questões ≤ 5000. `clear_questions` apaga na edição. |

Os campos valem no cronômetro (início e fim), no registro manual, na edição e na sincronização offline. A lista de tipos fica em `app/services/sessions.py` (`STUDY_TYPES`); um teste garante que o esquema da API e os rótulos usam a mesma lista.

## Revisões espaçadas

- Uma sessão de teoria, aula, leitura ou prática com matéria agenda a 1ª revisão (padrão +1 dia). Se já há revisão pendente para o mesmo conteúdo, nada é duplicado.
- Uma sessão do tipo Revisão na mesma matéria ou tópico conclui a pendente e agenda a etapa seguinte (+7, depois +30).
- À mão: concluir, pular (encerra a cadeia daquele conteúdo) ou reagendar.
- Preferências: ligar ou desligar e escolher de 1 a 6 intervalos entre 1 e 365 dias.
- Telas: `/app/revisoes` e o cartão "Revisões de hoje" no Hoje.

## Simulados

Por objetivo, em `/app/objetivos/:id/simulados`. Cada simulado tem total e acertos, ou linhas por matéria (os totais saem da soma). A visão geral mostra último, melhor, variação em pontos percentuais, a evolução e as matérias mais fracas primeiro.

## Análise do objetivo

`GET /activities/{id}/insights` alimenta o cartão "Seu estudo" no Hoje e no objetivo:

- **Próxima matéria sugerida:** compara a fatia de tempo dos últimos 14 dias com a fatia esperada por peso (1–5) × dificuldade (fácil 0,8, média 1, difícil 1,3) e sugere o tópico ainda não concluído.
- **Edital coberto:** tópicos estudados e concluídos.
- **Semana:** questões, acertos, páginas, metas semanais e tempo por tipo.
- **Acertos por matéria:** desde o início.

## Gamificação

XP calculado dos dados:

| Origem | XP |
|---|---|
| Minuto de foco | 1 |
| Dia com meta cumprida | 20 |
| Questão / acerto | 1 / 1 |
| Revisão concluída | 15 |
| Simulado | 30 |
| Conquista desbloqueada (bônus) | 25 |
| Desafio semanal cumprido (bônus) | 50 |

- **Níveis:** o nível L começa em 50·L·(L+1) XP. Títulos de "Primeiros passos" a "Lenda do estudo".
- **Conquistas:** 43 medalhas em 11 categorias (`ACHIEVEMENTS` em `app/services/gamification.py`). São avaliadas a cada sessão registrada e ao abrir o perfil, geram notificação no app e nunca são retiradas.
- **Desafios da semana:** 3 por semana, escolhidos de forma determinística e ajustados ao histórico. A meta de tempo usa só semanas anteriores.
- **Recordes:** melhor semana, sequências, sessão mais longa, questões, simulado, totais.
- **Comemoração:** conquistas novas abrem um diálogo uma vez, fora do cronômetro e da página de Conquistas.

## Tatá

Componentes em `apps/web/src/components/mascot/`:

- `TataSvg`: o desenho, com poses por classe CSS (idle, focus, paused, sleep, cheer, wave, encourage, love, think).
- `TataCompanion`: escolhe a pose pelo estado e reage a transições: começar, pausar, voltar, bater a meta, marcos de 25 min e pausa longa (10 min, cochila). Também reage ao carinho (clique), cochila com a tela parada no Hoje e segue o ponteiro com os olhos.
- `tata-messages.ts`: falas por situação nos três tons dos lembretes (acolhedor, direto, firme), com teste.
- Aparece no cronômetro, no Hoje (com atalho para Conquistas), em Conquistas, na comemoração e em Preferências.
