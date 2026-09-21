/**
 * Falas do Tatá. Curtas, sem culpa e sem promessa de resultado: o Tatá comenta o que
 * aconteceu (tempo registrado, pausa, meta) e nunca inventa números. Três tons, iguais aos
 * dos lembretes: acolhedor (padrão), direto e firme.
 */
import { t } from "@/i18n";
export type TataTone = "acolhedor" | "direto" | "firme";

export type TataSituation =
  | "timer_start"
  | "timer_focus"
  | "timer_milestone"
  | "timer_goal"
  | "timer_paused"
  | "timer_paused_long"
  | "timer_resumed"
  | "today_morning"
  | "today_afternoon"
  | "today_evening"
  | "today_all_done"
  | "today_in_session"
  | "today_rest"
  | "today_pending"
  | "today_no_goal"
  | "poke"
  | "wake";

type Bank = Record<TataSituation, Record<TataTone, readonly string[]>>;

const BANK: Bank = {
  timer_start: {
    acolhedor: [
      t("Bora! Eu fico aqui quietinho estudando com você."),
      t("Começamos. Um passo de cada vez."),
      t("Tô com meu livrinho aberto também."),
    ],
    direto: [t("Sessão iniciada. Foco."), t("Valendo. Eu aviso quando bater a meta.")],
    firme: [t("Começou. Celular longe, cabeça aqui."), t("Agora é com você. Eu seguro o tempo.")],
  },
  timer_focus: {
    acolhedor: [
      t("Tudo certo por aqui. Continua no seu ritmo."),
      t("Se precisar de uma pausa, tudo bem. O tempo pausado não conta, mas também não some nada."),
    ],
    direto: [t("Seguimos."), t("Mais um bloco.")],
    firme: [t("Mantém o ritmo."), t("Não para agora.")],
  },
  timer_milestone: {
    acolhedor: [
      t("{min} de foco! Que tal esticar as costas rapidinho?"),
      t("Olha só: {min} já. Bebe uma água?"),
    ],
    direto: [t("{min} de foco."), t("{min}. Bom bloco.")],
    firme: [t("{min}. Segue firme."), t("{min} feitos. Próximo bloco.")],
  },
  timer_goal: {
    acolhedor: [
      t("Meta de hoje alcançada! Tô pulando aqui de alegria."),
      t("Você fez a meta de hoje. Daqui em diante é bônus."),
    ],
    direto: [t("Meta do dia cumprida."), t("Meta feita. O resto é extra.")],
    firme: [
      t("Meta batida. Se tiver gás, o extra vira folga amanhã."),
      t("Cumprida. Quer fechar ou aproveitar o embalo?"),
    ],
  },
  timer_paused: {
    acolhedor: [
      t("Pausa merecida. Vou tomar um cafezinho também."),
      t("Respira. Quando quiser, é só retomar."),
    ],
    direto: [t("Pausado. O tempo parou de contar."), t("Pausa. Retome quando estiver pronto.")],
    firme: [t("Pausa curta, combinado?"), t("Pausado. Não esquece de voltar.")],
  },
  timer_paused_long: {
    acolhedor: [
      t("Tirei um cochilo aqui. Se já terminou, dá para encerrar e registrar."),
      t("Zzz… Quando voltar, retomamos de onde parou."),
    ],
    direto: [
      t("Pausa longa. Retomar ou encerrar?"),
      t("Ainda está aí? Dá para encerrar e registrar o que foi feito."),
    ],
    firme: [
      t("Pausa já passou do ponto. Retoma ou encerra."),
      t("Hora de decidir: volta ou fecha a sessão."),
    ],
  },
  timer_resumed: {
    acolhedor: [t("De volta! Senti sua falta."), t("Retomamos. Tô aqui.")],
    direto: [t("Retomado."), t("Valendo de novo.")],
    firme: [t("Voltou. Agora vai até o fim do bloco."), t("Retomado. Foco.")],
  },
  today_morning: {
    acolhedor: [t("Bom dia! Que tal começar com um bloco pequeno?"), t("Bom dia! Já separei meu livrinho.")],
    direto: [t("Bom dia. Sua meta de hoje está logo abaixo."), t("Bom dia. Começa quando puder.")],
    firme: [
      t("Bom dia. Cedo é o melhor horário para tirar a meta do caminho."),
      t("Bom dia. Primeiro bloco antes das distrações?"),
    ],
  },
  today_afternoon: {
    acolhedor: [
      t("Boa tarde! Um pouquinho agora já conta."),
      t("Boa tarde! Tô por aqui se quiser companhia."),
    ],
    direto: [t("Boa tarde. A meta de hoje segue aberta."), t("Boa tarde. Um bloco agora?")],
    firme: [
      t("Boa tarde. Ainda dá tempo de fazer a meta com calma."),
      t("Boa tarde. Bora encaixar um bloco?"),
    ],
  },
  today_evening: {
    acolhedor: [
      t("Boa noite! Se der, um bloquinho curto. Se não der, amanhã a gente ajusta."),
      t("Boa noite! Qualquer tempo registrado hoje conta."),
    ],
    direto: [
      t("Boa noite. Ainda dá para registrar hoje."),
      t("Boa noite. O que faltar vira pendência, sem drama."),
    ],
    firme: [
      t("Boa noite. Um bloco curto antes de dormir?"),
      t("Boa noite. Fecha o dia com pelo menos uns minutos."),
    ],
  },
  today_all_done: {
    acolhedor: [
      t("Metas de hoje feitas! Pode descansar tranquilo."),
      t("Tudo cumprido hoje. Tô muito orgulhoso!"),
    ],
    direto: [t("Metas de hoje cumpridas."), t("Dia fechado. Bom trabalho.")],
    firme: [t("Metas cumpridas. Amanhã tem mais."), t("Feito. Descansa para voltar amanhã.")],
  },
  today_in_session: {
    acolhedor: [
      t("Tem uma sessão rolando. Tô cuidando do tempo para você."),
      t("Sessão em andamento. Volta pro cronômetro quando quiser."),
    ],
    direto: [t("Sessão em andamento."), t("Cronômetro ligado.")],
    firme: [t("Sessão em andamento. Volta para ela."), t("O cronômetro está correndo. Foco.")],
  },
  today_rest: {
    acolhedor: [t("Hoje é dia de descanso. Aproveita!"), t("Folga hoje. Eu também vou tirar um cochilo.")],
    direto: [t("Dia de descanso."), t("Sem meta hoje.")],
    firme: [t("Descanso também faz parte. Volta amanhã."), t("Folga hoje. Amanhã, foco.")],
  },
  today_pending: {
    acolhedor: [
      t("Ficou algo de outros dias? Sem culpa: dá para recuperar aos poucos."),
      t("Tem pendência, e tudo bem. Um pouquinho por dia resolve."),
    ],
    direto: [
      t("Há pendência de dias anteriores. Veja o plano de recuperação."),
      t("Pendência aberta. Dá para dividir nos próximos dias."),
    ],
    firme: [
      t("Tem pendência. Que tal um bloco extra hoje?"),
      t("Pendência aberta. Um plano de recuperação resolve."),
    ],
  },
  today_no_goal: {
    acolhedor: [
      t("Oi! Eu sou o Tatá. Crie um objetivo e eu te acompanho nas sessões."),
      t("Oi! Vamos montar seu primeiro objetivo?"),
    ],
    direto: [t("Crie um objetivo para começar."), t("Sem objetivo ainda.")],
    firme: [t("Primeiro passo: criar um objetivo."), t("Define um objetivo e começamos.")],
  },
  poke: {
    acolhedor: [
      t("Hihi, cócegas!"),
      t("Oi! Tô aqui."),
      t("Você consegue. Eu acredito em você."),
      t("Ei, bebe água!"),
      t("Um passo de cada vez."),
    ],
    direto: [t("Oi."), t("Tô aqui."), t("Foco.")],
    firme: [t("Oi! Voltando ao trabalho?"), t("Tô de olho no tempo."), t("Sem distração, hein.")],
  },
  wake: {
    acolhedor: [t("Ah, oi! Tava cochilando."), t("Acordei! Bora?")],
    direto: [t("Oi de novo."), t("Voltei.")],
    firme: [t("Acordado. Vamos?"), t("De pé. Próximo bloco?")],
  },
};

/** Escolhe uma fala da situação. `n` percorre as opções (determinístico, sem Math.random). */
export function tataSay(
  situation: TataSituation,
  tone: TataTone = "acolhedor",
  n = 0,
  vars: Record<string, string> = {},
): string {
  const list = BANK[situation][tone] ?? BANK[situation].acolhedor;
  const text = list[((n % list.length) + list.length) % list.length];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/** Saudação pelo horário local. */
export function greetingSituation(hour: number): TataSituation {
  if (hour < 12) return "today_morning";
  if (hour < 18) return "today_afternoon";
  return "today_evening";
}

export const TATA_SITUATIONS = Object.keys(BANK) as TataSituation[];
export const TATA_TONES: TataTone[] = ["acolhedor", "direto", "firme"];
