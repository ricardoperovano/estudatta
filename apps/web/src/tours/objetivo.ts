import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Página de um objetivo: números, análise, atalhos e abas. */
export const objetivoTour: TourDef = {
  key: "objetivo",
  title: t("Objetivo"),
  steps: [
    {
      title: t("Tudo sobre este objetivo"),
      body: t("Aqui ficam o andamento da semana, o conteúdo, os materiais e os ajustes deste objetivo."),
      mood: "wave",
    },
    {
      target: "objetivo-numeros",
      title: t("Os números da semana"),
      body: t(
        "Tempo registrado na semana contra a meta, sessões no mês e o que há para recuperar de dias anteriores.",
      ),
    },
    {
      target: "objetivo-livro-atual",
      title: t("O livro que você está lendo"),
      body: t(
        "Diga qual livro é e em que página está. Ao registrar uma sessão, informe quantas páginas leu e o marcador avança sozinho.",
      ),
      optional: true,
    },
    {
      target: "seu-estudo",
      title: t("Seu estudo"),
      body: t(
        "Sugere a próxima matéria e mostra quanto do conteúdo você já cobriu. Quando você registrar sessões com matéria, fica mais preciso.",
      ),
      optional: true,
    },
    {
      target: "objetivo-atalhos",
      title: t("Simulados e revisões"),
      body: t(
        "Anote o resultado dos simulados para ver a evolução, e acompanhe as revisões agendadas deste objetivo.",
      ),
      optional: true,
    },
    {
      target: "objetivo-abas",
      title: t("Matérias, materiais e mais"),
      body: t(
        "Organize matérias e tópicos, guarde PDFs e links, veja as tarefas e mude meta, dias e pausas em Configurações.",
      ),
      mood: "cheer",
    },
  ],
};
