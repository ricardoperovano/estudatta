import type { TourDef } from "@/components/tour/types";

/** Plano da semana: a grade dos dias, como ver outras semanas e as ações do rodapé. */
export const planoTour: TourDef = {
  key: "plano",
  title: "Plano da semana",
  steps: [
    {
      title: "Sua semana de estudo",
      body: "O plano nasce da meta e dos dias de cada objetivo. Aqui você vê o que está previsto, o que já registrou e onde encaixar mais estudo.",
      mood: "wave",
    },
    {
      target: "plano-semana",
      title: "Os sete dias",
      body: "Cada dia mostra a meta e o tempo registrado; as listras marcam recuperação sugerida. Toque em um dia ou em uma tarefa para ver e editar.",
      optional: true,
    },
    {
      target: "plano-visao",
      title: "Agenda, lista e semanas",
      body: "Troque entre a agenda por horário e a lista por dia. As setas levam para a semana anterior ou a próxima.",
    },
    {
      target: "plano-nova-tarefa",
      title: "Tarefas e sessões",
      body: "Crie uma sessão com horário ou uma tarefa para marcar como feita. Dá para repetir nos dias que você escolher.",
      optional: true,
    },
    {
      target: "plano-distribuir",
      title: "Distribuir tarefas",
      body: "Espalha as tarefas pela semana respeitando o limite de cada dia. Recurso dos planos pagos; no Gratuito você planeja à mão.",
      optional: true,
    },
    {
      target: "plano-imprimir",
      title: "Semana no papel",
      body: "Gera uma versão para imprimir e deixar à vista na mesa de estudo.",
      mood: "cheer",
      optional: true,
    },
  ],
};
