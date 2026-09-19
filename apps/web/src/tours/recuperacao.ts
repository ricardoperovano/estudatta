import type { TourDef } from "@/components/tour/types";

/** Recuperar pendência: opções, prévia e aplicar. */
export const recuperacaoTour: TourDef = {
  key: "recuperacao",
  title: "Recuperar pendência",
  steps: [
    {
      title: "Recuperar sem pressa",
      body: "Quando dias anteriores ficam abaixo da meta, o tempo que faltou pode ser espalhado pelos próximos dias. Nada se perde, só muda de lugar.",
      mood: "love",
    },
    {
      target: "recuperacao-opcoes",
      title: "Escolha como retomar",
      body: "Distribuir em alguns dias é o mais leve. Também dá para recuperar tudo hoje ou deixar a pendência como está.",
      optional: true,
    },
    {
      target: "recuperacao-horizonte",
      title: "Em quantos dias",
      body: "Escolha 3, 5 ou 7 dias e se os dias de descanso podem receber um pouco.",
      optional: true,
    },
    {
      target: "recuperacao-previa",
      title: "Antes e depois",
      body: "A prévia mostra o plano de cada dia antes e depois da mudança. O limite diário é respeitado; o que não couber continua como pendência.",
      optional: true,
    },
    {
      target: "recuperacao-aplicar",
      title: "Aplicar",
      body: "Só muda o plano quando você aplicar. Prefere ajustar à mão? Use “Editar dia a dia”.",
      mood: "cheer",
      optional: true,
    },
  ],
};
