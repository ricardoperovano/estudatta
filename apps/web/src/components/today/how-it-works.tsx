/** Para quem ainda não tem objetivo: como o Estudatta funciona, em três passos. */
import { ArrowsClockwise, Target, Timer, type Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const STEPS: { icon: Icon; title: string; body: string; tint: string }[] = [
  { icon: Target, title: "Defina a meta", body: "Escolha os dias e quantos minutos por dia. Pode ser pouquinho.", tint: "bg-accent-900 text-accent" },
  { icon: Timer, title: "Estude com o Tatá", body: "Use o cronômetro ou registre depois o tempo que já estudou.", tint: "bg-info-tint text-info" },
  { icon: ArrowsClockwise, title: "Siga no seu ritmo", body: "Atrasou? O plano mostra como recuperar aos poucos, sem culpa.", tint: "bg-success-tint text-success" },
];

export function HowItWorks({ className }: { className?: string }) {
  return (
    <section aria-labelledby="como-funciona" className={cn("rise-in flex flex-col gap-3 rounded-[20px] bg-surface p-4 shadow-sm desktop:p-5", className)}>
      <h2 id="como-funciona" className="text-[15px] font-medium">
        Como funciona
      </h2>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {STEPS.map((s, i) => {
          const I = s.icon;
          return (
            <li key={s.title} className="flex items-start gap-3">
              <span className={cn("relative grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", s.tint)} aria-hidden>
                <I size={20} weight="duotone" />
                <span className="tnum absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-surface text-[10px] font-semibold text-neutral-300 shadow-sm">{i + 1}</span>
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[14px] font-medium">{s.title}</span>
                <span className="mt-0.5 block text-[13px] text-neutral-400">{s.body}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
