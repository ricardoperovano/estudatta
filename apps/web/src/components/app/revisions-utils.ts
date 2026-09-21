/** Utilitários de revisões e sessões (sem componentes). */
import { t, intlLocale } from "@/i18n";
import type { Revision } from "@/api/study";
import { fmtDayShort, parseDate } from "@/lib/format";

/** Link para o cronômetro já com objetivo, matéria, tópico e tipo de sessão. */
export function sessionHref({
  activityId,
  subjectId,
  topicId,
  type,
}: {
  activityId: string;
  subjectId?: string | null;
  topicId?: string | null;
  type?: string;
}): string {
  const p = new URLSearchParams({ objetivo: activityId });
  if (subjectId) p.set("materia", subjectId);
  if (topicId) p.set("topico", topicId);
  if (type) p.set("tipo", type);
  return `/app/sessao?${p.toString()}`;
}

/** Diferença em dias de calendário entre duas datas ISO (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b.slice(0, 10)).getTime() - parseDate(a.slice(0, 10)).getTime()) / 86_400_000);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1ª revisão · 1 dia depois" */
export function revisionStepLabel(r: Pick<Revision, "step" | "interval_days">): string {
  return t("{{v0}}ª revisão · {{v1}} depois", { v0: r.step, v1: plural(r.interval_days, "dia", "dias") });
}

/** "atrasada há 2 dias", "para hoje", "amanhã", "em 5 dias · terça, 23 set" */
export function revisionDueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff < 0) return t("atrasada há {{v0}}", { v0: plural(-diff, "dia", "dias") });
  if (diff === 0) return t("para hoje");
  if (diff === 1) return t("amanhã");
  return t("em {{v0}} dias · {{v1}}", { v0: diff, v1: fmtDayShort(due) });
}

/** "72,5%" */
export function fmtPct(v: number): string {
  return `${v.toLocaleString(intlLocale, { maximumFractionDigits: 1 })}%`;
}
