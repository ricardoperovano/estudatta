import type { TourDef } from "@/components/tour/types";

/** Primeiro tour depois do cadastro: apresenta o Tatá, o dia e como pedir ajuda. */
export const hojeTour: TourDef = {
  key: "hoje",
  title: "Boas-vindas",
  steps: [
    {
      title: "Oi! Eu sou o Tatá.",
      body: "Vou te mostrar o Estudatta em um minuto. Esta é a tela Hoje: ela diz o que fazer agora para manter o plano em dia.",
      mood: "wave",
    },
    {
      target: "hoje-objetivos",
      title: "Seu objetivo de hoje",
      body: "A barra mostra o que você já registrou, o que falta da meta e, se houver, a recuperação sugerida de dias anteriores.",
    },
    {
      target: "proximo-passo",
      title: "O próximo passo",
      body: "Aqui aparece, em uma frase, quanto estudar hoje. Se algum dia ficou para trás, a recuperação já entra na conta, sem culpa.",
      optional: true,
    },
    {
      target: "comecar",
      title: "Começar uma sessão",
      body: "Abre o cronômetro. Eu fico com você durante o estudo, e o tempo entra no saldo quando você encerrar.",
      mood: "focus",
    },
    {
      target: "registrar",
      title: "Estudou sem o cronômetro?",
      body: "Registre depois, com a duração e o tipo de estudo. Vale para ontem também.",
    },
    {
      target: "revisoes-hoje",
      title: "Revisões do dia",
      body: "Depois de estudar um conteúdo, as revisões são agendadas sozinhas. As que vencem hoje aparecem aqui.",
      optional: true,
    },
    {
      target: "seu-estudo",
      title: "Seu estudo",
      body: "A próxima matéria sugerida, quanto do conteúdo você já cobriu e as metas da semana.",
      optional: true,
    },
    {
      target: "conquistas-atalho",
      title: "Conquistas",
      body: "Estudar rende XP, níveis e medalhas. Nada disso é perdido se a sequência quebrar.",
      mood: "cheer",
      optional: true,
    },
    {
      target: "nav",
      title: "Navegação",
      body: "Plano da semana, objetivos e relatório ficam aqui. Cada página tem um tour curto como este na primeira visita.",
    },
    {
      target: "ajuda",
      title: "Precisa de ajuda?",
      body: "Toque no ? a qualquer momento para rever o tour da página em que você está.",
      mood: "love",
    },
  ],
};
