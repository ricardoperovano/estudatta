import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Plano da semana: a grade dos dias, como ver outras semanas e as ações do rodapé. */
export const planoTour: TourDef = {
  key: "plano",
  title: t("Plano da semana"),
  steps: [
    {
      title: t("Sua semana de estudo"),
      body: t(
        "O plano nasce da meta e dos dias de cada objetivo. Aqui você vê o que está previsto, o que já registrou e onde encaixar mais estudo.",
      ),
      mood: "wave",
    },
    {
      target: "plano-semana",
      title: t("Os sete dias"),
      body: t(
        "Cada dia mostra a meta e o tempo registrado; as listras marcam recuperação sugerida. Toque em um dia ou em uma tarefa para ver e editar.",
      ),
      optional: true,
    },
    {
      target: "plano-visao",
      title: t("Agenda, lista e semanas"),
      body: t(
        "Troque entre a agenda por horário e a lista por dia. As setas levam para a semana anterior ou a próxima.",
      ),
    },
    {
      target: "plano-nova-tarefa",
      title: t("Tarefas e sessões"),
      body: t(
        "Crie uma sessão com horário ou uma tarefa para marcar como feita. Dá para repetir nos dias que você escolher.",
      ),
      optional: true,
    },
    {
      target: "plano-distribuir",
      title: t("Distribuir tarefas"),
      body: t(
        "Espalha as tarefas pela semana respeitando o limite de cada dia. Recurso dos planos pagos; no Gratuito você planeja à mão.",
      ),
      optional: true,
    },
    {
      target: "plano-imprimir",
      title: t("Semana no papel"),
      body: t("Gera uma versão para imprimir e deixar à vista na mesa de estudo."),
      mood: "cheer",
      optional: true,
    },
  ],
};
