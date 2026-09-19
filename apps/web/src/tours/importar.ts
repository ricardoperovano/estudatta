import type { TourDef } from "@/components/tour/types";

/** Importar conteúdo: origem, revisão antes de criar e importações recentes. */
export const importarTour: TourDef = {
  key: "importar",
  title: "Importar conteúdo",
  steps: [
    {
      title: "Traga o conteúdo pronto",
      body: "Em vez de digitar matéria por matéria, importe o edital, o sumário ou a sua lista. Nada entra no plano antes de você confirmar.",
      mood: "wave",
    },
    {
      target: "importar-objetivo",
      title: "Para qual objetivo",
      body: "O conteúdo vira matérias e tópicos dentro do objetivo escolhido.",
      optional: true,
    },
    {
      target: "importar-origem",
      title: "Texto, CSV ou PDF",
      body: "Cole o texto com uma linha por item, use o modelo de CSV ou envie um PDF com texto selecionável. Depois você revisa a proposta.",
      optional: true,
    },
    {
      target: "importar-revisao",
      title: "Revise antes de criar",
      body: "Edite títulos, páginas e minutos, remova o que não serve e só então confirme.",
      optional: true,
    },
    {
      target: "importar-ia",
      title: "Sugerir estrutura",
      body: "A IA pode reorganizar a proposta em matérias e tópicos. Ela só preenche a revisão; quem confirma é você.",
      optional: true,
    },
    {
      target: "importar-recentes",
      title: "Importações recentes",
      body: "Cada envio aparece aqui com o andamento. Quando você importar algo, pode voltar para revisar depois.",
      mood: "cheer",
      optional: true,
    },
  ],
};
