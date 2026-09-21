import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

/** Preferências: lembretes e tom, Tatá, intervalos de revisão, exportar dados e sincronização. */
export const preferenciasTour: TourDef = {
  key: "preferencias",
  title: t("Preferências"),
  steps: [
    {
      title: t("Do seu jeito"),
      body: t(
        "Aqui você ajusta lembretes, tema claro ou escuro, o Tatá, as revisões e sua conta. As mudanças são salvas na hora.",
      ),
      mood: "wave",
    },
    {
      target: "preferencias-lembretes",
      title: t("Lembretes"),
      body: t(
        "Escolha se quer ser lembrado, em que horário e em quais dias. Mais abaixo ficam o tom das mensagens e o horário de silêncio.",
      ),
    },
    {
      target: "preferencias-tata",
      title: t("Eu, o Tatá"),
      body: t("Prefere estudar sem mim? Pode me esconder ou só silenciar minhas falas. Sem ressentimentos."),
      mood: "love",
    },
    {
      target: "preferencias-revisoes",
      title: t("Intervalos de revisão"),
      body: t("Defina quantos dias depois do estudo cada revisão aparece, ou desligue as revisões."),
    },
    {
      target: "preferencias-dados",
      title: t("Seus dados são seus"),
      body: t("Exporte tudo o que registrou, em qualquer plano. A exclusão da conta também fica aqui."),
    },
    {
      target: "preferencias-sync",
      title: t("Sincronização"),
      body: t(
        "O que você registra sem internet fica salvo no aparelho e é enviado quando a conexão volta. Aqui você vê se falta algo.",
      ),
      mood: "cheer",
    },
  ],
};
