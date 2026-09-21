import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Revisões espaçadas: como nascem, os contadores, as ações e onde mudar os intervalos. */
export const revisoesTour: TourDef = {
  key: "revisoes",
  title: t("Revisões"),
  steps: [
    {
      title: t("Revisões espaçadas"),
      body: t(
        "Você não precisa criar revisões. Ao registrar teoria, aula, leitura ou prática com a matéria escolhida, eu agendo as revisões desse conteúdo.",
      ),
      mood: "wave",
    },
    {
      target: "revisoes-contadores",
      title: t("O que está na fila"),
      body: t("Quantas revisões estão atrasadas, quantas vencem hoje e quantas vêm nos próximos 7 dias."),
    },
    {
      target: "revisao-acoes",
      title: t("Revisar, concluir ou adiar"),
      body: t(
        "“Revisar agora” abre o cronômetro já no tipo Revisão. Se já revisou, conclua. Sem tempo? Reagende ou pule, sem culpa.",
      ),
      optional: true,
    },
    {
      target: "revisoes-abas",
      title: t("Pendentes e concluídas"),
      body: t("As concluídas ficam guardadas com a data, para você ver o que já revisou."),
    },
    {
      target: "revisoes-intervalos",
      title: t("Seus intervalos"),
      body: t(
        "Por padrão, as revisões vêm 1, 7 e 30 dias depois do estudo. Você pode mudar isso nas Preferências.",
      ),
      mood: "cheer",
      optional: true,
    },
  ],
};
