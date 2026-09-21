import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Primeiro tour depois do cadastro: apresenta o Tatá, o dia e como pedir ajuda. */
export const hojeTour: TourDef = {
  key: "hoje",
  title: t("Boas-vindas"),
  steps: [
    {
      title: t("Oi! Eu sou o Tatá."),
      body: t(
        "Vou te mostrar o Estudatta em um minuto. Esta é a tela Hoje: ela diz o que fazer agora para manter o plano em dia.",
      ),
      mood: "wave",
    },
    {
      target: "hoje-objetivos",
      title: t("Seu objetivo de hoje"),
      body: t(
        "A barra mostra o que você já registrou, o que falta da meta e, se houver, a recuperação sugerida de dias anteriores.",
      ),
    },
    {
      target: "proximo-passo",
      title: t("O próximo passo"),
      body: t(
        "Aqui aparece, em uma frase, quanto estudar hoje. Se algum dia ficou para trás, a recuperação já entra na conta, sem culpa.",
      ),
      optional: true,
    },
    {
      target: "comecar",
      title: t("Começar uma sessão"),
      body: t(
        "Abre o cronômetro. Eu fico com você durante o estudo, e o tempo entra no saldo quando você encerrar.",
      ),
      mood: "focus",
    },
    {
      target: "registrar",
      title: t("Estudou sem o cronômetro?"),
      body: t("Registre depois, com a duração e o tipo de estudo. Vale para ontem também."),
    },
    {
      target: "revisoes-hoje",
      title: t("Revisões do dia"),
      body: t(
        "Depois de estudar um conteúdo, as revisões são agendadas sozinhas. As que vencem hoje aparecem aqui.",
      ),
      optional: true,
    },
    {
      target: "seu-estudo",
      title: t("Seu estudo"),
      body: t("A próxima matéria sugerida, quanto do conteúdo você já cobriu e as metas da semana."),
      optional: true,
    },
    {
      target: "conquistas-atalho",
      title: t("Conquistas"),
      body: t("Estudar rende XP, níveis e medalhas. Nada disso é perdido se a sequência quebrar."),
      mood: "cheer",
      optional: true,
    },
    {
      target: "nav",
      title: t("Navegação"),
      body: t(
        "Plano da semana, objetivos e relatório ficam aqui. Cada página tem um tour curto como este na primeira visita.",
      ),
    },
    {
      target: "ajuda",
      title: t("Precisa de ajuda?"),
      body: t("Toque no ? a qualquer momento para rever o tour da página em que você está."),
      mood: "love",
    },
  ],
};
