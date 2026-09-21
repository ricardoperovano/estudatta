import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Materiais: PDFs, links e livros físicos. */
export const materiaisTour: TourDef = {
  key: "materiais",
  title: t("Materiais"),
  steps: [
    {
      title: t("Seus materiais de estudo"),
      body: t("Guarde aqui os PDFs, links e livros que você usa, para abrir tudo de um lugar só."),
      mood: "wave",
    },
    {
      target: "materiais-adicionar",
      title: t("Adicionar material"),
      body: t(
        "Envie um PDF, cole um link ou cadastre um livro físico. Quando você adicionar o primeiro, ele aparece nesta lista.",
      ),
    },
    {
      target: "materiais-filtro",
      title: t("Filtrar por objetivo"),
      body: t("Mostra só os materiais de um objetivo."),
      optional: true,
    },
    {
      target: "materiais-lista",
      title: t("Abrir e vincular"),
      body: t(
        "Toque em um material para ler, anotar onde parou e ligar aos tópicos com o intervalo de páginas.",
      ),
      mood: "cheer",
      optional: true,
    },
  ],
};
