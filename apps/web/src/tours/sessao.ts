import { t } from "@/i18n";
import type { TourDef } from "@/components/tour/types";

export const sessaoInicioTour: TourDef = {
  key: "sessao-inicio",
  title: t("Começar sessão"),
  steps: [
    {
      target: "sessao-objetivo",
      title: t("Qual objetivo?"),
      body: t("Escolha o objetivo desta sessão. O tempo vai para o saldo dele."),
    },
    {
      target: "sessao-tipo",
      title: t("Tipo de estudo"),
      body: t(
        "Teoria, questões, revisão, leitura… O relatório separa o tempo por tipo. Teoria, aula, leitura e prática com matéria agendam revisões.",
      ),
    },
    {
      target: "sessao-comecar",
      title: t("Tudo pronto"),
      body: t("Comece quando quiser. Esqueceu de ligar o cronômetro? Use “Registrar manualmente”."),
      mood: "focus",
    },
  ],
};

export const sessaoFocoTour: TourDef = {
  key: "sessao-foco",
  title: t("Durante a sessão"),
  steps: [
    {
      target: "sessao-tata",
      title: t("Estudo junto com você"),
      body: t(
        "Eu reajo à sessão: comemoro a meta e cada 25 minutos, tomo um café na pausa. Toque em mim para um carinho, ou silencie minhas falas.",
      ),
      mood: "focus",
    },
    {
      target: "sessao-relogio",
      title: t("O tempo de foco"),
      body: t(
        "Só o tempo de foco conta. Pode bloquear a tela ou fechar o app: o cronômetro continua certo quando você voltar.",
      ),
    },
    {
      target: "sessao-controles",
      title: t("Pausar e encerrar"),
      body: t(
        "Pause para descansar. Ao encerrar, informe questões e acertos, se quiser, e o tempo entra no saldo do dia.",
      ),
      mood: "cheer",
    },
  ],
};
