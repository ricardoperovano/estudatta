import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Importar conteúdo: origem, revisão antes de criar e importações recentes. */
export const importarTour: TourDef = {
  key: "importar",
  title: t("Importar conteúdo"),
  steps: [
    {
      title: t("Traga o conteúdo pronto"),
      body: t(
        "Em vez de digitar matéria por matéria, importe o edital, o sumário ou a sua lista. Nada entra no plano antes de você confirmar.",
      ),
      mood: "wave",
    },
    {
      target: "importar-objetivo",
      title: t("Para qual objetivo"),
      body: t("O conteúdo vira matérias e tópicos dentro do objetivo escolhido."),
      optional: true,
    },
    {
      target: "importar-origem",
      title: t("Texto, CSV ou PDF"),
      body: t(
        "Cole o texto com uma linha por item, use o modelo de CSV ou envie um PDF com texto selecionável. Depois você revisa a proposta.",
      ),
      optional: true,
    },
    {
      target: "importar-revisao",
      title: t("Revise antes de criar"),
      body: t("Edite títulos, páginas e minutos, remova o que não serve e só então confirme."),
      optional: true,
    },
    {
      target: "importar-ia",
      title: t("Sugerir estrutura"),
      body: t(
        "A IA pode reorganizar a proposta em matérias e tópicos. Ela só preenche a revisão; quem confirma é você.",
      ),
      optional: true,
    },
    {
      target: "importar-recentes",
      title: t("Importações recentes"),
      body: t(
        "Cada envio aparece aqui com o andamento. Quando você importar algo, pode voltar para revisar depois.",
      ),
      mood: "cheer",
      optional: true,
    },
  ],
};
