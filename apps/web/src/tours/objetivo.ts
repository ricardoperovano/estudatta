import type { TourDef } from "@/components/tour/types";

/** Página de um objetivo: números, análise, atalhos e abas. */
export const objetivoTour: TourDef = {
  key: "objetivo",
  title: "Objetivo",
  steps: [
    {
      title: "Tudo sobre este objetivo",
      body: "Aqui ficam o andamento da semana, o conteúdo, os materiais e os ajustes deste objetivo.",
      mood: "wave",
    },
    {
      target: "objetivo-numeros",
      title: "Os números da semana",
      body: "Tempo registrado na semana contra a meta, sessões no mês e o que há para recuperar de dias anteriores.",
    },
    {
      target: "objetivo-livro-atual",
      title: "O livro que você está lendo",
      body: "Diga qual livro é e em que página está. Ao registrar uma sessão, informe quantas páginas leu e o marcador avança sozinho.",
      optional: true,
    },
    {
      target: "seu-estudo",
      title: "Seu estudo",
      body: "Sugere a próxima matéria e mostra quanto do conteúdo você já cobriu. Quando você registrar sessões com matéria, fica mais preciso.",
      optional: true,
    },
    {
      target: "objetivo-atalhos",
      title: "Simulados e revisões",
      body: "Anote o resultado dos simulados para ver a evolução, e acompanhe as revisões agendadas deste objetivo.",
      optional: true,
    },
    {
      target: "objetivo-abas",
      title: "Matérias, materiais e mais",
      body: "Organize matérias e tópicos, guarde PDFs e links, veja as tarefas e mude meta, dias e pausas em Configurações.",
      mood: "cheer",
    },
  ],
};
