/**
 * Falas do Tatá. Curtas, sem culpa e sem promessa de resultado: o Tatá comenta o que
 * aconteceu (tempo registrado, pausa, meta) e nunca inventa números. Três tons, iguais aos
 * dos lembretes: acolhedor (padrão), direto e firme.
 */
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
    acolhedor: ["Bora! Eu fico aqui quietinho estudando com você.", "Começamos. Um passo de cada vez.", "Tô com meu livrinho aberto também."],
    direto: ["Sessão iniciada. Foco.", "Valendo. Eu aviso quando bater a meta."],
    firme: ["Começou. Celular longe, cabeça aqui.", "Agora é com você. Eu seguro o tempo."],
  },
  timer_focus: {
    acolhedor: ["Tudo certo por aqui. Continua no seu ritmo.", "Se precisar de uma pausa, tudo bem. O tempo pausado não conta, mas também não some nada."],
    direto: ["Seguimos.", "Mais um bloco."],
    firme: ["Mantém o ritmo.", "Não para agora."],
  },
  timer_milestone: {
    acolhedor: ["{min} de foco! Que tal esticar as costas rapidinho?", "Olha só: {min} já. Bebe uma água?"],
    direto: ["{min} de foco.", "{min}. Bom bloco."],
    firme: ["{min}. Segue firme.", "{min} feitos. Próximo bloco."],
  },
  timer_goal: {
    acolhedor: ["Meta de hoje alcançada! Tô pulando aqui de alegria.", "Você fez a meta de hoje. Daqui em diante é bônus."],
    direto: ["Meta do dia cumprida.", "Meta feita. O resto é extra."],
    firme: ["Meta batida. Se tiver gás, o extra vira folga amanhã.", "Cumprida. Quer fechar ou aproveitar o embalo?"],
  },
  timer_paused: {
    acolhedor: ["Pausa merecida. Vou tomar um cafezinho também.", "Respira. Quando quiser, é só retomar."],
    direto: ["Pausado. O tempo parou de contar.", "Pausa. Retome quando estiver pronto."],
    firme: ["Pausa curta, combinado?", "Pausado. Não esquece de voltar."],
  },
  timer_paused_long: {
    acolhedor: ["Tirei um cochilo aqui. Se já terminou, dá para encerrar e registrar.", "Zzz… Quando voltar, retomamos de onde parou."],
    direto: ["Pausa longa. Retomar ou encerrar?", "Ainda está aí? Dá para encerrar e registrar o que foi feito."],
    firme: ["Pausa já passou do ponto. Retoma ou encerra.", "Hora de decidir: volta ou fecha a sessão."],
  },
  timer_resumed: {
    acolhedor: ["De volta! Senti sua falta.", "Retomamos. Tô aqui."],
    direto: ["Retomado.", "Valendo de novo."],
    firme: ["Voltou. Agora vai até o fim do bloco.", "Retomado. Foco."],
  },
  today_morning: {
    acolhedor: ["Bom dia! Que tal começar com um bloco pequeno?", "Bom dia! Já separei meu livrinho."],
    direto: ["Bom dia. Sua meta de hoje está logo abaixo.", "Bom dia. Começa quando puder."],
    firme: ["Bom dia. Cedo é o melhor horário para tirar a meta do caminho.", "Bom dia. Primeiro bloco antes das distrações?"],
  },
  today_afternoon: {
    acolhedor: ["Boa tarde! Um pouquinho agora já conta.", "Boa tarde! Tô por aqui se quiser companhia."],
    direto: ["Boa tarde. A meta de hoje segue aberta.", "Boa tarde. Um bloco agora?"],
    firme: ["Boa tarde. Ainda dá tempo de fazer a meta com calma.", "Boa tarde. Bora encaixar um bloco?"],
  },
  today_evening: {
    acolhedor: ["Boa noite! Se der, um bloquinho curto. Se não der, amanhã a gente ajusta.", "Boa noite! Qualquer tempo registrado hoje conta."],
    direto: ["Boa noite. Ainda dá para registrar hoje.", "Boa noite. O que faltar vira pendência, sem drama."],
    firme: ["Boa noite. Um bloco curto antes de dormir?", "Boa noite. Fecha o dia com pelo menos uns minutos."],
  },
  today_all_done: {
    acolhedor: ["Metas de hoje feitas! Pode descansar tranquilo.", "Tudo cumprido hoje. Tô muito orgulhoso!"],
    direto: ["Metas de hoje cumpridas.", "Dia fechado. Bom trabalho."],
    firme: ["Metas cumpridas. Amanhã tem mais.", "Feito. Descansa para voltar amanhã."],
  },
  today_in_session: {
    acolhedor: ["Tem uma sessão rolando. Tô cuidando do tempo para você.", "Sessão em andamento. Volta pro cronômetro quando quiser."],
    direto: ["Sessão em andamento.", "Cronômetro ligado."],
    firme: ["Sessão em andamento. Volta para ela.", "O cronômetro está correndo. Foco."],
  },
  today_rest: {
    acolhedor: ["Hoje é dia de descanso. Aproveita!", "Folga hoje. Eu também vou tirar um cochilo."],
    direto: ["Dia de descanso.", "Sem meta hoje."],
    firme: ["Descanso também faz parte. Volta amanhã.", "Folga hoje. Amanhã, foco."],
  },
  today_pending: {
    acolhedor: ["Ficou algo de outros dias? Sem culpa: dá para recuperar aos poucos.", "Tem pendência, e tudo bem. Um pouquinho por dia resolve."],
    direto: ["Há pendência de dias anteriores. Veja o plano de recuperação.", "Pendência aberta. Dá para dividir nos próximos dias."],
    firme: ["Tem pendência. Que tal um bloco extra hoje?", "Pendência aberta. Um plano de recuperação resolve."],
  },
  today_no_goal: {
    acolhedor: ["Oi! Eu sou o Tatá. Crie um objetivo e eu te acompanho nas sessões.", "Oi! Vamos montar seu primeiro objetivo?"],
    direto: ["Crie um objetivo para começar.", "Sem objetivo ainda."],
    firme: ["Primeiro passo: criar um objetivo.", "Define um objetivo e começamos."],
  },
  poke: {
    acolhedor: ["Hihi, cócegas!", "Oi! Tô aqui.", "Você consegue. Eu acredito em você.", "Ei, bebe água!", "Um passo de cada vez."],
    direto: ["Oi.", "Tô aqui.", "Foco."],
    firme: ["Oi! Voltando ao trabalho?", "Tô de olho no tempo.", "Sem distração, hein."],
  },
  wake: {
    acolhedor: ["Ah, oi! Tava cochilando.", "Acordei! Bora?"],
    direto: ["Oi de novo.", "Voltei."],
    firme: ["Acordado. Vamos?", "De pé. Próximo bloco?"],
  },
};

/** Escolhe uma fala da situação. `n` percorre as opções (determinístico, sem Math.random). */
export function tataSay(situation: TataSituation, tone: TataTone = "acolhedor", n = 0, vars: Record<string, string> = {}): string {
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
