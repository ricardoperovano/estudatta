import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Planos: plano atual, o que cada plano inclui (com os limites de IA), cancelamento e avisos de cobrança. */
export const planosTour: TourDef = {
  key: "planos",
  title: t("Planos"),
  steps: [
    {
      title: t("Planos e assinatura"),
      body: t(
        "O Gratuito cobre um objetivo por inteiro. Aqui você compara os planos e acompanha sua assinatura, se tiver uma.",
      ),
      mood: "wave",
    },
    {
      target: "planos-atual",
      title: t("Seu plano atual"),
      body: t(
        "Mostra o plano que você usa e a situação da assinatura. Se assinar, é aqui que você cancela a renovação quando quiser.",
      ),
      optional: true,
    },
    {
      target: "planos-periodicidade",
      title: t("Mensal ou anual"),
      body: t("Troque para ver os valores de cada periodicidade."),
    },
    {
      target: "planos-plano",
      title: t("O que cada plano inclui"),
      body: t(
        "Cada cartão lista quantos objetivos, relatórios, materiais e ações de IA por mês estão incluídos.",
      ),
      optional: true,
    },
    {
      target: "planos-aviso",
      title: t("Sobre a cobrança"),
      body: t(
        "Avisos sobre preços e pagamentos aparecem aqui. O plano só muda depois que o pagamento é confirmado.",
      ),
      mood: "cheer",
      optional: true,
    },
  ],
};
