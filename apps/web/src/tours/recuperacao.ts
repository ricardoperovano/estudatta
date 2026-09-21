import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Recuperar pendência: opções, prévia e aplicar. */
export const recuperacaoTour: TourDef = {
  key: "recuperacao",
  title: t("Recuperar pendência"),
  steps: [
    {
      title: t("Recuperar sem pressa"),
      body: t(
        "Quando dias anteriores ficam abaixo da meta, o tempo que faltou pode ser espalhado pelos próximos dias. Nada se perde, só muda de lugar.",
      ),
      mood: "love",
    },
    {
      target: "recuperacao-opcoes",
      title: t("Escolha como retomar"),
      body: t(
        "Distribuir em alguns dias é o mais leve. Também dá para recuperar tudo hoje ou deixar a pendência como está.",
      ),
      optional: true,
    },
    {
      target: "recuperacao-horizonte",
      title: t("Em quantos dias"),
      body: t("Escolha 3, 5 ou 7 dias e se os dias de descanso podem receber um pouco."),
      optional: true,
    },
    {
      target: "recuperacao-previa",
      title: t("Antes e depois"),
      body: t(
        "A prévia mostra o plano de cada dia antes e depois da mudança. O limite diário é respeitado; o que não couber continua como pendência.",
      ),
      optional: true,
    },
    {
      target: "recuperacao-aplicar",
      title: t("Aplicar"),
      body: t("Só muda o plano quando você aplicar. Prefere ajustar à mão? Use “Editar dia a dia”."),
      mood: "cheer",
      optional: true,
    },
  ],
};
