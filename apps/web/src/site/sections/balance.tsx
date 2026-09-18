import { GoalBar, Legend } from "@/components/ui";
import { Container } from "../layout";

/**
 * Demonstração de saldo e recuperação com os mesmos números dos mockups
 * (meta 60 · registrado 40 · pendência 60 · recuperação sugerida 20).
 * Explica, passo a passo, de onde sai "Mais 40 min hoje: 20 da meta + 20 de recuperação".
 */
const steps = [
  { label: "Meta de hoje", value: "60 min", text: "O compromisso que você definiu para este objetivo, nos dias que escolheu." },
  { label: "Registrado hoje", value: "40 min", text: "Duas sessões pelo cronômetro ou um registro manual. Faltam 20 min para a meta." },
  { label: "Pendência anterior", value: "60 min", text: "Ontem não teve registro. A meta do dia virou tempo a recuperar — sem juros, sem culpa.", pending: true },
  { label: "Recuperação sugerida", value: "20 min", text: "Com a regra “distribuir em 3 dias”, a pendência entra aos poucos: 20 min hoje, 20 amanhã, 20 depois.", pending: true },
];

export function BalanceDemo({ objective = "Inglês" }: { objective?: string }) {
  return (
    <section
      id="saldo"
      className="bg-section py-16"
      aria-labelledby="saldo-titulo"
      style={{ background: "radial-gradient(900px 420px at 85% -40%, color-mix(in srgb, var(--color-section-glow) 70%, transparent), transparent 64%), var(--color-section)" }}
    >
      <Container className="grid items-start gap-10 tablet:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <div className="flex flex-col gap-6">
          <span className="text-[13px] uppercase tracking-[0.06em] text-[color-mix(in_srgb,#e9e9ed_75%,transparent)]">Saldo e recuperação</span>
          <h2 id="saldo-titulo" className="max-w-[24ch] text-[clamp(24px,3vw,36px)] leading-[1.25] tracking-[-0.01em] text-[#e9e9ed]">
            De onde sai “mais 40 min hoje”
          </h2>
          <ol className="flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={s.label} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-1">
                <span className="tnum text-[14px] text-[color-mix(in_srgb,#e9e9ed_55%,transparent)]">0{i + 1}</span>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[16px] font-medium text-[#e9e9ed]">{s.label}</span>
                  <span className={"tnum text-[16px] font-medium " + (s.pending ? "text-[#d9a86a]" : "text-[#e9e9ed]")}>{s.value}</span>
                  <span className="w-full text-[15px] leading-[1.6] text-[color-mix(in_srgb,#e9e9ed_78%,transparent)]">{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="max-w-[52ch] text-[15px] leading-[1.6] text-[color-mix(in_srgb,#e9e9ed_78%,transparent)]">
            Resultado: <strong className="font-medium text-[#e9e9ed]">mais 40 min hoje — 20 da meta + 20 de recuperação</strong>. Prefere recuperar tudo de uma vez, ou só ser avisado? A regra é sua. Estudou e esqueceu de registrar? Registre depois: a pendência se ajusta.
          </p>
        </div>
        <div className="flex flex-col gap-3 rounded-md bg-surface p-4 text-primary shadow-lg" role="img" aria-label={`Exemplo do cartão de ${objective}: 40 de 60 minutos registrados, 20 minutos de recuperação sugerida`}>
          <div className="flex items-baseline justify-between">
            <span className="text-[16px] font-medium">{objective}</span>
            <span className="text-[12px] text-neutral-400">meta 60 min</span>
          </div>
          <GoalBar logged={2400} target={3600} recovery={1200} />
          <Legend items={[{ swatch: "accent", label: "Registrado" }, { swatch: "outline", label: "Falta da meta" }, { swatch: "recovery", label: "Recuperação" }]} />
          <div className="tnum grid grid-cols-2 gap-[10px]">
            <div><span className="block text-[18px] font-medium">40 min</span><span className="text-[11px] text-neutral-400">Registrado hoje</span></div>
            <div><span className="block text-[18px] font-medium">20 min</span><span className="text-[11px] text-neutral-400">Falta para a meta</span></div>
            <div><span className="block text-[18px] font-medium text-pending">60 min</span><span className="text-[11px] text-neutral-400">Pendência anterior</span></div>
            <div><span className="block text-[18px] font-medium text-pending">20 min</span><span className="text-[11px] text-neutral-400">Recuperação sugerida</span></div>
          </div>
          <p className="rounded-md bg-canvas px-3 py-[10px] text-[13px] leading-[1.45]">Mais 40 min hoje: 20 da meta + 20 de recuperação.</p>
        </div>
      </Container>
    </section>
  );
}
