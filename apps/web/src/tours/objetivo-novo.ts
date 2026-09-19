import type { TourDef } from "@/components/tour/types";

/** Formulário de novo objetivo. */
export const objetivoNovoTour: TourDef = {
  key: "objetivo-novo",
  title: "Novo objetivo",
  steps: [
    {
      title: "Criar um objetivo",
      body: "Com poucos campos o plano da semana já se monta sozinho. Tudo aqui pode ser alterado depois.",
      mood: "wave",
    },
    {
      target: "objetivo-novo-nome",
      title: "Nome e categoria",
      body: "Dê um nome curto e escolha a categoria. Em Idioma, você escolhe entre mais de 90 idiomas, incluindo Libras.",
    },
    {
      target: "objetivo-novo-modo",
      title: "Como acompanhar",
      body: "Tempo usa uma meta diária em minutos. Checklist é só uma lista de tarefas. Misto junta os dois.",
    },
    {
      target: "objetivo-novo-meta",
      title: "Meta e dias",
      body: "Quanto estudar por dia e em quais dias. Prefira uma meta que caiba numa semana cheia; dá para aumentar depois.",
      optional: true,
    },
    {
      target: "objetivo-novo-recuperacao",
      title: "Se um dia ficar para trás",
      body: "Escolha se o tempo que faltou vira pendência para recuperar ou se cada dia começa do zero. Sem culpa em nenhum caso.",
      mood: "love",
      optional: true,
    },
  ],
};
