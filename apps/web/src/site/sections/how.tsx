const steps = [
  { n: "01", title: "Defina o compromisso", text: "Objetivo, minutos por dia, dias da semana, data de início e horários preferidos. Matérias, tópicos, materiais e páginas ficam organizados no mesmo lugar." },
  { n: "02", title: "Registre a sessão", text: "Cronômetro para quem estuda com o app aberto; registro manual rápido para quem estudou e lembrou depois. Funciona sem internet e sincroniza quando voltar." },
  { n: "03", title: "Retome quando atrasar", text: "Um dia sem registro vira tempo a recuperar, pela regra que você escolheu. Recupere tudo hoje ou distribua nos próximos dias — o plano compara antes e depois." },
];

export function HowItWorks() {
  return (
    <section id="como" className="flex flex-col gap-2 pb-16 pt-24">
      <span className="mb-4 text-[13px] uppercase tracking-[0.06em] text-accent">Como funciona</span>
      {steps.map((s, i) => (
        <div key={s.n} className={"grid items-baseline gap-x-[clamp(24px,4vw,72px)] gap-y-6 py-8 tablet:grid-cols-[minmax(48px,120px)_minmax(0,380px)_minmax(0,1fr)]" + (i > 0 ? " border-t border-neutral-800" : "")}>
          <span className="tnum text-[15px] text-accent">{s.n}</span>
          <h2 className="text-[24px] leading-[1.2]">{s.title}</h2>
          <p className="max-w-[52ch] text-[15.5px] leading-[1.65] text-neutral-300">{s.text}</p>
        </div>
      ))}
    </section>
  );
}
