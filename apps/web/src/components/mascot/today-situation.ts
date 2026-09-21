/** Situação do dia para a fala do Tatá na tela Hoje (e resumo do dia para o topo da página). */
import { t } from "@/i18n";
import type { TodayCard } from "@/api/types";
import { greetingSituation, type TataSituation } from "./tata-messages";

export function todaySituation(cards: TodayCard[], inSession: boolean, hour: number): TataSituation {
  if (cards.length === 0) return "today_no_goal";
  if (inSession) return "today_in_session";
  const withGoal = cards
    .map((c) => c.summary)
    .filter((s): s is NonNullable<typeof s> => !!s && s.in_range && !s.is_paused);
  const due = withGoal.filter((s) => s.target > 0);
  if (withGoal.length > 0 && due.length === 0) return "today_rest";
  if (due.length > 0 && due.every((s) => s.goal_met)) return "today_all_done";
  if (withGoal.some((s) => s.pending_prior > 0)) return "today_pending";
  return greetingSituation(hour);
}

/** "Bom dia", "Boa tarde" ou "Boa noite" pelo horário local. */
export function greetingFor(hour: number): string {
  if (hour < 5) return t("Boa noite");
  if (hour < 12) return t("Bom dia");
  if (hour < 18) return t("Boa tarde");
  return t("Boa noite");
}

/** Primeiro nome para a saudação (vazio quando a pessoa não informou nome). */
export function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return n.length > 0 && n.length <= 24 ? n : "";
}

export interface DayTotals {
  /** segundos registrados hoje nos objetivos com meta de tempo */
  logged: number;
  /** soma das metas base de hoje */
  target: number;
  /** há objetivo com meta de tempo hoje (fora de pausa e dentro do período) */
  hasTimeGoal: boolean;
  /** todas as metas de hoje cumpridas */
  allDone: boolean;
  /** hoje é folga em todos os objetivos com meta de tempo */
  rest: boolean;
  /** maior sequência atual entre os objetivos */
  streak: number;
}

/** Totais do dia somando os objetivos de tempo (sem inventar números: tudo vem do plano de hoje). */
export function dayTotals(cards: TodayCard[]): DayTotals {
  const sums = cards
    .filter((c) => c.activity.tracking_mode !== "checklist" && !c.pause)
    .map((c) => c.summary)
    .filter((s): s is NonNullable<typeof s> => !!s && s.in_range && !s.is_paused);
  const due = sums.filter((s) => s.target > 0);
  return {
    logged: sums.reduce((a, s) => a + s.logged, 0),
    target: due.reduce((a, s) => a + s.target, 0),
    hasTimeGoal: sums.length > 0,
    allDone: due.length > 0 && due.every((s) => s.goal_met),
    rest: sums.length > 0 && due.length === 0,
    streak: cards.reduce((a, c) => Math.max(a, c.streak_current ?? 0), 0),
  };
}
