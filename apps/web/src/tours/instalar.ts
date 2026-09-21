import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Instalar o app: por que instalar, o passo a passo do aparelho e onde ver os outros. */
export const instalarTour: TourDef = {
  key: "instalar",
  title: t("Instalar o app"),
  steps: [
    {
      target: "instalar-porque",
      title: t("Me leva no bolso?"),
      body: t(
        "Instalado, o Estudatta abre direto da tela inicial, em tela cheia, e pode te lembrar de estudar. No iPhone, os lembretes só funcionam assim.",
      ),
      mood: "wave",
    },
    {
      target: "instalar-passos",
      title: t("O passo a passo do seu aparelho"),
      body: t(
        "Já abri as instruções do seu celular e navegador. São poucos toques, com desenhos dos botões que você vai procurar.",
      ),
    },
    {
      target: "instalar-plataformas",
      title: t("Outro aparelho?"),
      body: t("Troque aqui para ver como instalar no iPhone, no Android ou no computador."),
      mood: "cheer",
    },
  ],
};
