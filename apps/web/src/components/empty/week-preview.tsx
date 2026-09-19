/**
 * Prévia (exemplo) de uma semana no Plano: sete colunas com blocos de um objetivo de idioma
 * e de leitura, dois dias feitos e um pouco de recuperação. Não usa dados da pessoa.
 */
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ExamplePreview } from "./example-preview";

type Block = { obj: "a" | "b"; min: number; done?: boolean; recovery?: boolean };

const NAMES = { a: "Inglês", b: "Leitura" } as const;

const DAYS: { name: string; blocks: Block[]; today?: boolean }[] = [
  { name: "seg", blocks: [{ obj: "a", min: 30, done: true }] },
  {
    name: "ter",
    blocks: [
      { obj: "a", min: 30, done: true },
      { obj: "b", min: 20, done: true },
    ],
  },
  { name: "qua", today: true, blocks: [{ obj: "a", min: 30 }] },
  {
    name: "qui",
    blocks: [
      { obj: "a", min: 30 },
      { obj: "b", min: 20 },
    ],
  },
  {
    name: "sex",
    blocks: [
      { obj: "a", min: 30 },
      { obj: "a", min: 10, recovery: true },
    ],
  },
  { name: "sáb", blocks: [{ obj: "b", min: 20 }] },
  { name: "dom", blocks: [] },
];

export function WeekPreview({ className }: { className?: string }) {
  return (
    <ExamplePreview
      className={className}
      title="Assim fica a sua semana"
      summary="uma semana com Inglês 30 minutos de segunda a sexta, Leitura 20 minutos em alguns dias, dois dias já feitos, uma recuperação de 10 minutos na sexta e o domingo livre."
      note="Cada objetivo vira blocos nos dias escolhidos. Depois você adiciona tarefas e horários e marca o que fez."
    >
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] desktop:gap-2 desktop:text-[12px]">
        {DAYS.map((d) => (
          <div key={d.name} className="flex min-w-0 flex-col gap-1">
            <span className={cn("text-neutral-400", d.today && "font-medium text-accent")}>{d.name}</span>
            <div
              className={cn(
                "flex min-h-[124px] flex-col gap-1 rounded-[10px] bg-surface p-1 shadow-sm desktop:min-h-[168px] desktop:gap-1.5 desktop:p-1.5",
                d.today && "shadow-inset-accent",
              )}
            >
              {d.blocks.map((b, i) => (
                <span
                  key={i}
                  style={{ minHeight: `${Math.round(b.min * 1.3)}px` }}
                  className={cn(
                    "flex flex-col items-start justify-between rounded-[6px] border-l-[3px] px-1 py-1 text-left leading-tight desktop:px-1.5",
                    b.recovery
                      ? "recovery-stripes border-pending"
                      : b.obj === "a"
                        ? "border-accent"
                        : "border-info",
                    !b.recovery &&
                      (b.done ? (b.obj === "a" ? "bg-accent-800" : "bg-info-tint") : "bg-canvas"),
                  )}
                >
                  <span
                    className={cn(
                      "hidden w-full truncate desktop:block",
                      b.recovery && "w-auto rounded-[3px] bg-canvas px-0.5",
                    )}
                  >
                    {b.recovery ? "Recuperação" : NAMES[b.obj]}
                  </span>
                  <span
                    className={cn(
                      "tnum inline-flex items-center gap-0.5 text-[10px] font-medium desktop:text-[11px]",
                      b.recovery ? "rounded-[3px] bg-canvas px-0.5 text-pending" : "text-neutral-300",
                    )}
                  >
                    {b.recovery ? "+" : ""}
                    {b.min}
                    {b.done ? <Check size={9} weight="bold" className="text-accent" /> : null}
                  </span>
                </span>
              ))}
              {d.blocks.length === 0 ? (
                <span className="m-auto text-[10px] text-neutral-500 desktop:text-[11px]">livre</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" /> Inglês
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-info" /> Leitura
        </span>
        <span className="inline-flex items-center gap-1">
          <Check size={11} weight="bold" className="text-accent" /> feito
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="recovery-stripes inline-block h-2.5 w-2.5 rounded-[2px]" /> recuperação
        </span>
      </div>
    </ExamplePreview>
  );
}
