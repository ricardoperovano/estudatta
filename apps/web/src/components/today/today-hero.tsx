/**
 * Topo da tela Hoje: saudação com o nome, data, Tatá com a fala do dia, nível (Conquistas),
 * situação da sincronização e — quando há objetivo — o resumo do dia (anel + semana).
 */
import type { ReactNode } from "react";
import { Moon, Sparkle } from "@phosphor-icons/react";
import type { TodayCard } from "@/api/types";
import { fmtMinutesShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LevelChip, TodayTata } from "@/components/mascot/today-tata";
import { dayTotals, firstName, greetingFor } from "@/components/mascot/today-situation";
import { DayRing } from "./day-ring";

interface Props {
  cards: TodayCard[];
  inSession: boolean;
  hour: number;
  userName?: string | null;
  dateShort: string;
  dateLong: string;
  /** situação da sincronização (só no celular) */
  status?: ReactNode;
  /** botões de ação (desktop) */
  actions?: ReactNode;
  /** bolinhas da semana */
  week?: ReactNode;
}

export function TodayHero({ cards, inSession, hour, userName, dateShort, dateLong, status, actions, week }: Props) {
  const name = firstName(userName);
  const hello = `${greetingFor(hour)}${name ? `, ${name}` : ""}!`;
  const totals = dayTotals(cards);
  return (
    <section aria-labelledby="hoje-titulo" className="hero-soft rise-in relative overflow-hidden rounded-[22px] p-4 shadow-sm desktop:p-7">
      <Deco />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-neutral-400">
            <span className="font-medium text-accent">Hoje</span>
            <span aria-hidden> · </span>
            <span className="desktop:hidden">{dateShort}</span>
            <span className="hidden desktop:inline">{dateLong}</span>
          </p>
          <h1 id="hoje-titulo" className="mt-1 text-[26px] leading-[1.12] desktop:text-[34px]">
            <span className="sr-only">Hoje: </span>
            {hello}
          </h1>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <LevelChip />
          {status ? <span className="desktop:hidden">{status}</span> : null}
        </div>
      </div>

      <div className={cn("relative mt-3 flex flex-col gap-4", (totals.hasTimeGoal || actions) && "desktop:flex-row desktop:items-end desktop:justify-between desktop:gap-8")}>
        <TodayTata cards={cards} inSession={inSession} hour={hour} className="desktop:max-w-[460px] desktop:flex-1" />
        {totals.hasTimeGoal || actions ? (
          <div className="flex flex-col gap-3 desktop:items-end">
            {totals.hasTimeGoal ? <DaySummary cards={cards} week={week} /> : null}
            {actions ? <div className="hidden gap-2 desktop:flex">{actions}</div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Resumo do dia: anel com o registrado/meta somados e a semana do objetivo principal. */
function DaySummary({ cards, week }: { cards: TodayCard[]; week?: ReactNode }) {
  const t = dayTotals(cards);
  const pct = t.target > 0 ? t.logged / t.target : t.rest ? 1 : 0;
  const tone = t.rest ? "rest" : t.allDone ? "success" : "accent";
  return (
    <div className="flex items-center gap-3 rounded-[16px] bg-surface px-3 py-2.5 shadow-sm">
      <DayRing value={pct} tone={tone} size={48} stroke={6}>
        {t.rest ? (
          <Moon size={16} weight="fill" className="text-info" />
        ) : t.allDone ? (
          <Sparkle size={16} weight="fill" className="text-success" />
        ) : (
          <span className="tnum text-[11px] font-semibold text-neutral-200">{Math.min(100, Math.round(pct * 100))}%</span>
        )}
      </DayRing>
      <div className="min-w-0 flex-1 leading-tight">
        {t.rest ? (
          <>
            <span className="block text-[15px] font-medium">Dia de descanso</span>
            <span className="text-[12px] text-neutral-400">{t.logged > 0 ? `${fmtMinutesShort(t.logged)} registrados hoje` : "Sem meta de tempo hoje"}</span>
          </>
        ) : (
          <>
            <span className="tnum block text-[15px] font-medium">
              {fmtMinutesShort(t.logged)} <span className="font-normal text-neutral-400">de {fmtMinutesShort(t.target)}</span>
            </span>
            <span className="text-[12px] text-neutral-400">{t.allDone ? "Meta de hoje cumprida" : "da meta de hoje"}</span>
          </>
        )}
      </div>
      {week ? <div className="border-l border-divider pl-3">{week}</div> : null}
    </div>
  );
}

/** Enfeites do cartão: estrelinhas e bolinhas bem suaves (decorativos). */
function Deco() {
  return (
    <svg className="pointer-events-none absolute right-10 top-6 hidden h-24 w-40 text-accent opacity-30 desktop:block" viewBox="0 0 160 96" fill="currentColor" aria-hidden>
      <path d="M130 10 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" />
      <path d="M40 58 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" />
      <circle cx="150" cy="60" r="3" />
      <circle cx="88" cy="20" r="2" />
      <circle cx="104" cy="84" r="2.5" />
    </svg>
  );
}
