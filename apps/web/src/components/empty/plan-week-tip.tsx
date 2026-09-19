/** Plano com objetivo mas semana ainda sem tarefas nem registros: dica curta e acolhedora. */
import { CalendarPlus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { EmptyArt } from "./empty-hero";

export function PlanWeekTip({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="semana-livre"
      className={cn(
        "tip-soft rise-in flex items-start gap-3 rounded-[20px] p-4 shadow-sm desktop:max-w-[760px]",
        className,
      )}
    >
      <EmptyArt mood="idle" icon={CalendarPlus} className="w-[52px]" />
      <div className="min-w-0 flex-1">
        <h2 id="semana-livre" className="text-[15px] font-medium leading-[1.25]">
          Semana pronta para planejar
        </h2>
        <p className="mt-1 text-[13px] leading-[1.45] text-neutral-300">
          A meta de cada objetivo já está nos dias escolhidos. Quer mais roteiro? Marque horários com{" "}
          <span className="font-medium">+ Nova tarefa</span> ou direto em um dia da semana. Estudar sem
          horário marcado também vale.
        </p>
      </div>
    </section>
  );
}
