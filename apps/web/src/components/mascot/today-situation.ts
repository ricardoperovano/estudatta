/** Situação do dia para a fala do Tatá na tela Hoje. */
import type { TodayCard } from "@/api/types";
import { greetingSituation, type TataSituation } from "./tata-messages";

export function todaySituation(cards: TodayCard[], inSession: boolean, hour: number): TataSituation {
  if (cards.length === 0) return "today_no_goal";
  if (inSession) return "today_in_session";
  const withGoal = cards.map((c) => c.summary).filter((s): s is NonNullable<typeof s> => !!s && s.in_range && !s.is_paused);
  const due = withGoal.filter((s) => s.target > 0);
  if (withGoal.length > 0 && due.length === 0) return "today_rest";
  if (due.length > 0 && due.every((s) => s.goal_met)) return "today_all_done";
  if (withGoal.some((s) => s.pending_prior > 0)) return "today_pending";
  return greetingSituation(hour);
}
