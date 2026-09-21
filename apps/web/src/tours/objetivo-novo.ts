import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Formulário de novo objetivo. */
export const objetivoNovoTour: TourDef = {
  key: "objetivo-novo",
  title: t("Novo objetivo"),
  steps: [
    {
      title: t("Criar um objetivo"),
      body: t("Com poucos campos o plano da semana já se monta sozinho. Tudo aqui pode ser alterado depois."),
      mood: "wave",
    },
    {
      target: "objetivo-novo-nome",
      title: t("Nome e categoria"),
      body: t(
        "Dê um nome curto e escolha a categoria. Em Idioma, você escolhe entre mais de 90 idiomas, incluindo Libras.",
      ),
    },
    {
      target: "objetivo-novo-modo",
      title: t("Como acompanhar"),
      body: t(
        "Tempo usa uma meta diária em minutos. Checklist é só uma lista de tarefas. Misto junta os dois.",
      ),
    },
    {
      target: "objetivo-novo-meta",
      title: t("Meta e dias"),
      body: t(
        "Quanto estudar por dia e em quais dias. Prefira uma meta que caiba numa semana cheia; dá para aumentar depois.",
      ),
      optional: true,
    },
    {
      target: "objetivo-novo-recuperacao",
      title: t("Se um dia ficar para trás"),
      body: t(
        "Escolha se o tempo que faltou vira pendência para recuperar ou se cada dia começa do zero. Sem culpa em nenhum caso.",
      ),
      mood: "love",
      optional: true,
    },
  ],
};
