import type { TourDef } from "@/components/tour/types";

/** Instalar o app: por que instalar, o passo a passo do aparelho e onde ver os outros. */
export const instalarTour: TourDef = {
  key: "instalar",
  title: "Instalar o app",
  steps: [
    {
      target: "instalar-porque",
      title: "Me leva no bolso?",
      body: "Instalado, o Estudatta abre direto da tela inicial, em tela cheia, e pode te lembrar de estudar. No iPhone, os lembretes só funcionam assim.",
      mood: "wave",
    },
    {
      target: "instalar-passos",
      title: "O passo a passo do seu aparelho",
      body: "Já abri as instruções do seu celular e navegador. São poucos toques, com desenhos dos botões que você vai procurar.",
    },
    {
      target: "instalar-plataformas",
      title: "Outro aparelho?",
      body: "Troque aqui para ver como instalar no iPhone, no Android ou no computador.",
      mood: "cheer",
    },
  ],
};
