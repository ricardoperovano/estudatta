import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Conquistas: nível e XP, desafios da semana, recordes e medalhas. Sem ranking, nada é retirado. */
export const conquistasTour: TourDef = {
  key: "conquistas",
  title: t("Conquistas"),
  steps: [
    {
      title: t("Suas conquistas"),
      body: t(
        "Tudo aqui vem dos seus próprios registros. Não há ranking com outras pessoas, e nada do que você conquistou é retirado.",
      ),
      mood: "wave",
    },
    {
      target: "conquistas-nivel",
      title: t("Nível e XP"),
      body: t(
        "Minutos de foco, metas do dia, questões, revisões e simulados rendem XP. Toque em “De onde vem o XP” para ver a conta.",
      ),
    },
    {
      target: "conquistas-desafios",
      title: t("Desafios da semana"),
      body: t(
        "Mudam toda semana e se ajustam ao seu histórico. Cumprir dá XP extra; não cumprir não tira nada.",
      ),
      optional: true,
    },
    {
      target: "conquistas-recordes",
      title: t("Recordes pessoais"),
      body: t("Você comparado só com você mesmo. Enquanto não houver registros, eles aparecem com um traço."),
    },
    {
      target: "conquistas-medalhas",
      title: t("Medalhas"),
      body: t("Use o filtro para ver as que você já tem ou as que faltam, com o progresso de cada uma."),
      mood: "cheer",
    },
  ],
};
