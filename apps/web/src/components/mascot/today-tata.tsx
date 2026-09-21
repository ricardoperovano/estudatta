/** Tatá da tela Hoje (fala do estado do dia) e atalho para Conquistas com o nível atual. */
import { t } from "@/i18n";
import { Link } from "react-router";
import { CaretRight, Trophy } from "@phosphor-icons/react";
import { useGamification } from "@/api/study";
import type { TodayCard } from "@/api/types";
import { cn } from "@/lib/utils";
import { TataCompanion } from "./TataCompanion";
import { tataSay } from "./tata-messages";
import { todaySituation } from "./today-situation";
import { useTataPrefs } from "./use-tata";

/** Chip "Nível N" que leva a Conquistas (ponto damasco quando há conquista nova). */
export function LevelChip({ className }: { className?: string }) {
  const g = useGamification();
  const level = g.data?.level;
  const unseen = g.data?.unseen.length ?? 0;
  return (
    <Link
      to="/app/conquistas"
      data-tour="conquistas-atalho"
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium text-neutral-200 no-underline shadow-sm transition-colors duration-fast hover:text-primary",
        className,
      )}
      aria-label={
        level
          ? t("Conquistas: nível {{v0}}, {{v1}}{{v2}}", {
              v0: level.number,
              v1: level.title,
              v2: unseen ? t(", {{v0}} nova(s)", { v0: unseen }) : "",
            })
          : t("Conquistas")
      }
    >
      <Trophy size={16} weight="fill" className="text-warning" aria-hidden />
      {level ? (
        <span className="tnum">{t("Nível {{v0}}", { v0: level.number })}</span>
      ) : (
        <span>{t("Conquistas")}</span>
      )}
      {unseen ? <span className="h-2 w-2 rounded-full bg-pending" aria-hidden /> : null}
      <CaretRight size={12} aria-hidden />
    </Link>
  );
}

/**
 * Tatá com o balão do dia. Com o mascote desligado em Preferências, mostra só a frase do dia
 * (sem personagem), para o topo da página não ficar vazio.
 */
export function TodayTata({
  cards,
  inSession,
  hour,
  size = 84,
  className,
}: {
  cards: TodayCard[];
  inSession: boolean;
  hour: number;
  size?: number;
  className?: string;
}) {
  const { enabled, tone } = useTataPrefs();
  const situation = todaySituation(cards, inSession, hour);
  if (!enabled)
    return (
      <p className={cn("text-[14px] leading-[1.45] text-neutral-300", className)}>
        {tataSay(situation, tone, 0)}
      </p>
    );
  return (
    <TataCompanion
      size={size}
      chat
      scene={{ kind: "today", situation }}
      className={cn("min-w-0", className)}
      data-tour="tata"
    />
  );
}
