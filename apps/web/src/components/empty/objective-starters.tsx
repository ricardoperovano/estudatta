/**
 * Modelos para o primeiro objetivo: um toque abre o formulário já preenchido
 * (nome, categoria, meta por dia, dias e modo), e a pessoa ajusta o que quiser.
 * Os modelos e os parâmetros da URL ficam em ./starters.
 */
import { Link } from "react-router";
import { CaretRight, Plus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { STARTERS, starterHref } from "./starters";

export function ObjectiveStarters({ className }: { className?: string }) {
  return (
    <section aria-labelledby="modelos-objetivo" className={cn("rise-in flex flex-col gap-3", className)}>
      <div>
        <h2 id="modelos-objetivo" className="text-[15px] font-medium">
          Comece por um modelo
        </h2>
        <p className="mt-0.5 text-[13px] text-neutral-400">
          Um toque abre o formulário já preenchido. Dá para mudar tudo antes de criar.
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 tablet:grid-cols-3 desktop:grid-cols-2">
        {STARTERS.map((s) => {
          const I = s.icon;
          return (
            <li key={s.key} className="grid">
              <Link
                to={starterHref(s)}
                className="group flex min-h-[64px] items-center gap-2.5 rounded-[16px] bg-surface p-2.5 text-primary no-underline shadow-sm transition-shadow duration-base hover:text-primary hover:shadow-md focus-visible:outline-offset-2 desktop:p-3"
                aria-label={`${s.title}: ${s.meta}. ${s.hint}`}
              >
                <span
                  className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", s.tint)}
                  aria-hidden
                >
                  <I size={20} weight="duotone" />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[14px] font-medium">{s.title}</span>
                  <span className="tnum mt-0.5 block text-[12px] text-accent">{s.meta}</span>
                  <span className="mt-0.5 hidden text-[12px] text-neutral-400 tablet:block">{s.hint}</span>
                </span>
                <CaretRight
                  size={14}
                  className="hidden shrink-0 text-neutral-500 transition-colors group-hover:text-accent tablet:block"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        to="/app/objetivos/novo"
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-stretch rounded-[16px] border border-dashed border-neutral-700 px-4 text-[14px] text-neutral-300 no-underline hover:border-accent hover:text-accent"
      >
        <Plus size={14} aria-hidden /> Outro assunto: começar do zero
      </Link>
    </section>
  );
}
