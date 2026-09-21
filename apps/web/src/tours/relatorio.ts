import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Relatório de constância: números do período, leitura, tempo por dia/tipo, histórico e exportação. */
export const relatorioTour: TourDef = {
  key: "relatorio",
  title: t("Relatório"),
  steps: [
    {
      target: "relatorio-numeros",
      title: t("Sua constância"),
      body: t(
        "Aqui você vê quanto registrou, em quantos dias e o que ficou para recuperar. Sem registros ainda, tudo começa em zero.",
      ),
      mood: "wave",
    },
    {
      target: "relatorio-periodo",
      title: t("Semana, mês ou trimestre"),
      body: t(
        "Troque o período aqui. As setas logo abaixo voltam para períodos anteriores. Mês e trimestre podem depender do seu plano.",
      ),
    },
    {
      target: "relatorio-dias",
      title: t("Tempo por dia"),
      body: t(
        "Cada barra é um dia: o que você registrou e as metas que ficaram sem registro. Junto do gráfico, o tempo por objetivo.",
      ),
    },
    {
      target: "relatorio-leitura",
      title: t("Leitura do período"),
      body: t(
        "Um resumo em palavras do que os números mostram. Daqui você também exporta seus registros em CSV.",
      ),
    },
    {
      target: "relatorio-tipos",
      title: t("Tipo de estudo e acertos"),
      body: t(
        "Quanto da semana foi teoria, questões ou revisão. Logo depois, seus acertos por matéria, quando você registra questões.",
      ),
      optional: true,
    },
    {
      target: "relatorio-historico",
      title: t("Histórico de sessões"),
      body: t(
        "Todas as sessões do período. Dá para corrigir duração, data ou tipo; cada alteração fica guardada com o motivo.",
      ),
      mood: "cheer",
    },
  ],
};
