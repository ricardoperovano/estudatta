/** Formatação de tempo e datas no idioma da interface (pt-BR ou en). Internamente tudo é em segundos inteiros. */
import { t } from "@/i18n";
import { format, parseISO, isValid } from "date-fns";
import { enUS, ptBR } from "date-fns/locale";
import { intlLocale, locale as uiLocale } from "@/i18n";

/** Locale do date-fns conforme o idioma da interface. */
const dfLocale = uiLocale === "en" ? enUS : ptBR;
const EN = uiLocale === "en";

export function minutesOf(seconds: number): number {
  return Math.round(Math.max(0, seconds) / 60);
}

/** "40 min", "1h", "1h20" */
export function fmtMinutes(seconds: number): string {
  const m = minutesOf(seconds);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
  }
  return t("{{v0}} min", { v0: m });
}

/** Valores do dia: "60 min", "90 min"; horas só a partir de 2h ("2h10"). Mesma regra do backend. */
export function fmtMinutesShort(seconds: number): string {
  const m = minutesOf(seconds);
  if (m >= 120) return fmtMinutes(seconds);
  return t("{{v0}} min", { v0: m });
}

/** "40" (só o número em minutos) */
export function fmtMin(seconds: number): string {
  return String(minutesOf(seconds));
}

/** "27:41" ou "1:02:03" para o cronômetro */
export function fmtClock(seconds: number, forceHours = false): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  if (h > 0 || forceHours) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/** "12:19" (mm:ss) para "Faltam 12:19" */
export function fmtRemaining(seconds: number): string {
  return fmtClock(seconds);
}

export function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  const parsed = parseISO(d);
  return isValid(parsed) ? parsed : new Date(d);
}

/** "quinta, 17 set" */
export function fmtDayShort(d: string | Date): string {
  if (EN) return format(parseDate(d), "EEE, MMM d", { locale: dfLocale });
  return format(parseDate(d), "EEEE, d MMM", { locale: dfLocale }).replace("-feira", "").replace(".", "");
}

/** "quinta, 17 de setembro" */
export function fmtDayLong(d: string | Date): string {
  if (EN) return format(parseDate(d), "EEEE, MMMM d", { locale: dfLocale });
  return format(parseDate(d), "EEEE, d 'de' MMMM", { locale: dfLocale }).replace("-feira", "");
}

/** "Qui 17" */
export function fmtDayTiny(d: string | Date): string {
  const s = format(parseDate(d), "EEEEEE d", { locale: dfLocale });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "seg" */
export function fmtWeekdayMin(d: string | Date): string {
  return format(parseDate(d), "EEEEEE", { locale: dfLocale }).toLowerCase();
}

/** "14 – 20 set" */
export function fmtRange(start: string | Date, end: string | Date): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const sameMonth = a.getMonth() === b.getMonth();
  if (EN) {
    if (sameMonth) return `${format(a, "MMM d", { locale: dfLocale })} – ${format(b, "d")}`;
    return `${format(a, "MMM d", { locale: dfLocale })} – ${format(b, "MMM d", { locale: dfLocale })}`;
  }
  if (sameMonth) return `${format(a, "d")} – ${format(b, "d MMM", { locale: dfLocale }).replace(".", "")}`;
  return `${format(a, "d MMM", { locale: dfLocale }).replace(".", "")} – ${format(b, "d MMM", { locale: dfLocale }).replace(".", "")}`;
}

export function fmtTime(d: string | Date): string {
  return format(parseDate(d), "HH:mm");
}

export function fmtDateTimeShort(d: string | Date): string {
  if (EN) return format(parseDate(d), "MMM d, HH:mm", { locale: dfLocale });
  return format(parseDate(d), "d MMM, HH:mm", { locale: dfLocale }).replace(".", "");
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function fmtBRL(cents: number | null | undefined): string {
  if (cents == null) return t("Valor a definir");
  return new Intl.NumberFormat(intlLocale, { style: "currency", currency: "BRL" }).format(cents / 100);
}

// segunda … domingo
export const WEEKDAY_LABELS = EN ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "T", "Q", "Q", "S", "S", "D"];
export const WEEKDAY_NAMES = EN
  ? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
  : ["segunda", t("terça"), "quarta", "quinta", "sexta", t("sábado"), "domingo"];
export const WEEKDAY_SHORT = EN
  ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  : ["seg", "ter", "qua", "qui", "sex", t("sáb"), "dom"];
