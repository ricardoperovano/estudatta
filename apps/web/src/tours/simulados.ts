import type { TourDef } from "@/components/tour/types";

/** Simulados de um objetivo. */
export const simuladosTour: TourDef = {
  key: "simulados",
  title: "Simulados",
  steps: [
    {
      title: "Seus simulados",
      body: "Anote o resultado de cada simulado para acompanhar a evolução e descobrir quais matérias pedem mais atenção.",
      mood: "wave",
    },
    {
      target: "simulados-novo",
      title: "Registrar um simulado",
      body: "Informe o total de questões e os acertos, ou separe por matéria para ver onde estão os pontos fracos.",
    },
    {
      target: "simulados-numeros",
      title: "Último, melhor e variação",
      body: "O percentual do último simulado, o melhor até agora e a diferença para o anterior.",
      optional: true,
    },
    {
      target: "simulados-evolucao",
      title: "Evolução",
      body: "O gráfico aparece a partir do segundo simulado, do mais antigo ao mais recente.",
      optional: true,
    },
    {
      target: "simulados-materias",
      title: "Matérias mais fracas",
      body: "Quando você registra por matéria, as de menor acerto aparecem primeiro. Bom ponto de partida para revisar.",
      optional: true,
    },
    {
      target: "simulados-historico",
      title: "Histórico",
      body: "Todos os simulados, do mais recente ao mais antigo. Use o lápis para corrigir e a lixeira para excluir.",
      mood: "cheer",
      optional: true,
    },
  ],
};
