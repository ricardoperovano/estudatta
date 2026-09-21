/** Utilitários de semana, regras de meta e textos de duração usados por plano, objetivos e recuperação. */
import { t as tx } from "@/i18n";
import { addDays, parseISO } from "date-fns";
import { isoDate, minutesOf, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/format";
import type { GoalRule } from "@/api/types";

/** Índice segunda=0 … domingo=6 (mesma convenção do backend e do DayPicker). */
export function weekdayMon(iso: string): number {
  return (parseISO(iso).getDay() + 6) % 7;
}

/** Primeiro dia da semana que contém `iso`, respeitando a preferência (0 = segunda). */
export function startOfWeekIso(iso: string, weekStartsOn = 0): string {
  const diff = (weekdayMon(iso) - weekStartsOn + 7) % 7;
  return isoDate(addDays(parseISO(iso), -diff));
}

export function shiftIso(iso: string, days: number): string {
  return isoDate(addDays(parseISO(iso), days));
}

export function weekDates(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => shiftIso(startIso, i));
}

/** "1 hora", "40 minutos", "1h20" — para frases. */
export function fmtLongDuration(seconds: number): string {
  const m = minutesOf(seconds);
  if (m === 0) return tx("0 min");
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return tx("{{v0}} minuto{{v1}}", { v0: m, v1: m === 1 ? "" : "s" });
  if (r === 0) return tx("{{v0}} hora{{v1}}", { v0: h, v1: h === 1 ? "" : "s" });
  return `${h}h${String(r).padStart(2, "0")}`;
}

/** "qui, sex e sáb" */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return tx("{{v0}} e {{v1}}", { v0: names.slice(0, -1).join(", "), v1: names[names.length - 1] });
}

export function ruleMinutes(rule: GoalRule | null | undefined): number[] {
  if (!rule) return [0, 0, 0, 0, 0, 0, 0];
  return [0, 1, 2, 3, 4, 5, 6].map((d) => Number(rule.minutes_by_weekday[String(d)] ?? 0));
}

export function activeDaysCount(rule: GoalRule | null | undefined): number {
  return ruleMinutes(rule).filter((m) => m > 0).length;
}

export function weekTargetSeconds(rule: GoalRule | null | undefined): number {
  return ruleMinutes(rule).reduce((a, b) => a + b, 0) * 60;
}

/** "seg a sex", "todos os dias", "seg, qua, sex" */
export function summarizeDays(rule: GoalRule | null | undefined): string {
  const on = ruleMinutes(rule)
    .map((m, i) => (m > 0 ? i : -1))
    .filter((i) => i >= 0);
  if (on.length === 7) return tx("todos os dias");
  if (on.length === 0) return tx("nenhum dia");
  if (on.join() === "0,1,2,3,4") return tx("seg a sex");
  return on.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** Minutos diários mais comuns da regra (meta base). */
export function typicalDailyMinutes(rule: GoalRule | null | undefined): number {
  const on = ruleMinutes(rule).filter((m) => m > 0);
  if (on.length === 0) return 0;
  const counts = new Map<number, number>();
  for (const m of on) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[weekdayMon(iso)];
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "p. 40–46" → [40, 46] */
export function parsePages(text: string): [number | null, number | null] {
  const nums = text
    .replace(/[^\d–-]/g, "")
    .split(/[–-]/)
    .filter(Boolean)
    .map(Number);
  return [nums[0] ?? null, nums[1] ?? nums[0] ?? null];
}

export function fmtPages(from: number | null | undefined, to: number | null | undefined): string | null {
  if (from == null && to == null) return null;
  if (from != null && to != null && from !== to) return `p. ${from}–${to}`;
  return `p. ${from ?? to}`;
}

export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

/** "America/Sao_Paulo" → "São Paulo (America)" */
export function tzLabel(tz: string): string {
  const [region, ...rest] = tz.split("/");
  const city = rest.join("/").replace(/_/g, " ").replace("Sao Paulo", "São Paulo");
  return city ? `${city} (${region})` : tz;
}

export const MATERIAL_KIND_LABEL: Record<string, string> = { pdf: "PDF", link: "Link", physical: "Livro" };

export function materialKindLabel(kind: string, url?: string | null): string {
  if (kind === "link" && url && /youtube|youtu\.be|vimeo/.test(url)) return tx("Vídeo");
  return MATERIAL_KIND_LABEL[kind] ?? kind;
}

export function hhmmToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}
