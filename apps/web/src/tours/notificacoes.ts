import type { TourDef } from "@/components/tour/types";

/** Central de notificações: lembretes e avisos, ler todas, adiar e onde ajustar os lembretes. */
export const notificacoesTour: TourDef = {
  key: "notificacoes",
  title: "Notificações",
  steps: [
    {
      title: "Seus avisos em um lugar",
      body: "Aqui ficam os lembretes de estudo e os avisos da sua conta, mesmo os que você não viu na hora.",
      mood: "wave",
    },
    {
      target: "notificacoes-item",
      title: "Cada aviso",
      body: "“Abrir” leva direto à página do aviso e o marca como lido. Novos avisos aparecem no topo.",
      optional: true,
    },
    {
      target: "notificacoes-filtro",
      title: "Todas ou não lidas",
      body: "Filtre para ver só o que ainda não leu.",
    },
    {
      target: "notificacoes-acoes",
      title: "Adiar e ler todas",
      body: "Precisa de silêncio? “Adiar 1h” pausa os lembretes por uma hora. “Ler todas” limpa a lista de não lidas.",
    },
    {
      title: "Horário e tom",
      body: "Quando e como os lembretes chegam fica em Preferências. Dá para desligá-los quando quiser.",
      mood: "cheer",
    },
  ],
};
