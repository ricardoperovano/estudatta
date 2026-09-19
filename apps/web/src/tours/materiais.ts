import type { TourDef } from "@/components/tour/types";

/** Materiais: PDFs, links e livros físicos. */
export const materiaisTour: TourDef = {
  key: "materiais",
  title: "Materiais",
  steps: [
    {
      title: "Seus materiais de estudo",
      body: "Guarde aqui os PDFs, links e livros que você usa, para abrir tudo de um lugar só.",
      mood: "wave",
    },
    {
      target: "materiais-adicionar",
      title: "Adicionar material",
      body: "Envie um PDF, cole um link ou cadastre um livro físico. Quando você adicionar o primeiro, ele aparece nesta lista.",
    },
    {
      target: "materiais-filtro",
      title: "Filtrar por objetivo",
      body: "Mostra só os materiais de um objetivo.",
      optional: true,
    },
    {
      target: "materiais-lista",
      title: "Abrir e vincular",
      body: "Toque em um material para ler, anotar onde parou e ligar aos tópicos com o intervalo de páginas.",
      mood: "cheer",
      optional: true,
    },
  ],
};
