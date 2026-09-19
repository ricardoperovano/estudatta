import type { TourDef } from "@/components/tour/types";

/** Lista de objetivos: cartões, criar novo e pausar/arquivar. */
export const objetivosTour: TourDef = {
  key: "objetivos",
  title: "Objetivos",
  steps: [
    {
      title: "Seus objetivos",
      body: "Um objetivo é o que você quer acompanhar: um idioma, um concurso, um instrumento. Cada um tem a própria meta e os próprios dias.",
      mood: "wave",
    },
    {
      target: "objetivos-lista",
      title: "Um cartão por objetivo",
      body: "Mostra o tempo da semana contra a meta e se há algo a recuperar. Toque no cartão para ver matérias, materiais e configurações.",
      optional: true,
    },
    {
      target: "objetivos-novo",
      title: "Criar objetivo",
      body: "Leva menos de um minuto: nome, meta por dia e dias da semana. Dá para ajustar tudo depois.",
    },
    {
      target: "objetivos-gerenciar",
      title: "Pausar ou arquivar",
      body: "Vai viajar ou mudou de prioridade? Um objetivo pausado não gera pendência nem lembretes. Arquivar guarda o histórico nos relatórios.",
      mood: "love",
      optional: true,
    },
  ],
};
