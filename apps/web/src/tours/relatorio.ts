import type { TourDef } from "@/components/tour/types";

/** Relatório de constância: números do período, leitura, tempo por dia/tipo, histórico e exportação. */
export const relatorioTour: TourDef = {
  key: "relatorio",
  title: "Relatório",
  steps: [
    {
      target: "relatorio-numeros",
      title: "Sua constância",
      body: "Aqui você vê quanto registrou, em quantos dias e o que ficou para recuperar. Sem registros ainda, tudo começa em zero.",
      mood: "wave",
    },
    {
      target: "relatorio-periodo",
      title: "Semana, mês ou trimestre",
      body: "Troque o período aqui. As setas logo abaixo voltam para períodos anteriores. Mês e trimestre podem depender do seu plano.",
    },
    {
      target: "relatorio-dias",
      title: "Tempo por dia",
      body: "Cada barra é um dia: o que você registrou e as metas que ficaram sem registro. Junto do gráfico, o tempo por objetivo.",
    },
    {
      target: "relatorio-leitura",
      title: "Leitura do período",
      body: "Um resumo em palavras do que os números mostram. Daqui você também exporta seus registros em CSV.",
    },
    {
      target: "relatorio-tipos",
      title: "Tipo de estudo e acertos",
      body: "Quanto da semana foi teoria, questões ou revisão. Logo depois, seus acertos por matéria, quando você registra questões.",
      optional: true,
    },
    {
      target: "relatorio-historico",
      title: "Histórico de sessões",
      body: "Todas as sessões do período. Dá para corrigir duração, data ou tipo; cada alteração fica guardada com o motivo.",
      mood: "cheer",
    },
  ],
};
