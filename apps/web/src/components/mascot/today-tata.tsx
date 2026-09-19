/** Faixa do Tatá na tela Hoje: saudação/estado do dia e atalho para Conquistas (nível atual). */
import { Link } from "react-router";
import { CaretRight, Trophy } from "@phosphor-icons/react";
import { useGamification } from "@/api/study";
import type { TodayCard } from "@/api/types";
import { TataCompanion } from "./TataCompanion";
import { todaySituation } from "./today-situation";
import { useTataPrefs } from "./use-tata";

export function TodayTata({ cards, inSession, hour }: { cards: TodayCard[]; inSession: boolean; hour: number }) {
  const { enabled } = useTataPrefs();
  const g = useGamification();
  const level = g.data?.level;
  const unseen = g.data?.unseen.length ?? 0;
  const chip = (
    <Link
      to="/app/conquistas"
      data-tour="conquistas-atalho"
      className="flex shrink-0 items-center gap-2 rounded-full border border-divider px-3 py-1.5 text-[13px] text-neutral-300 no-underline hover:text-primary"
      aria-label={level ? `Conquistas: nível ${level.number}, ${level.title}${unseen ? `, ${unseen} nova(s)` : ""}` : "Conquistas"}
    >
      <Trophy size={16} weight="fill" className="text-accent" aria-hidden />
      {level ? <span className="tnum">Nível {level.number}</span> : <span>Conquistas</span>}
      {unseen ? <span className="h-2 w-2 rounded-full bg-pending" aria-hidden /> : null}
      <CaretRight size={12} aria-hidden />
    </Link>
  );
  if (!enabled) return <div className="flex justify-end">{chip}</div>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3" data-tour="tata">
      <TataCompanion size={72} scene={{ kind: "today", situation: todaySituation(cards, inSession, hour) }} className="min-w-0 flex-1" />
      {chip}
    </div>
  );
}
