/** Formatação pt-BR de tempo e datas. Internamente tudo é em segundos inteiros. */
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  return `${m} min`;
}

/** Valores do dia: "60 min", "90 min"; horas só a partir de 2h ("2h10"). Mesma regra do backend. */
export function fmtMinutesShort(seconds: number): string {
  const m = minutesOf(seconds);
  if (m >= 120) return fmtMinutes(seconds);
  return `${m} min`;
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
  return format(parseDate(d), "EEEE, d MMM", { locale: ptBR }).replace("-feira", "").replace(".", "");
}

/** "quinta, 17 de setembro" */
export function fmtDayLong(d: string | Date): string {
  return format(parseDate(d), "EEEE, d 'de' MMMM", { locale: ptBR }).replace("-feira", "");
}

/** "Qui 17" */
export function fmtDayTiny(d: string | Date): string {
  const s = format(parseDate(d), "EEEEEE d", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "seg" */
export function fmtWeekdayMin(d: string | Date): string {
  return format(parseDate(d), "EEEEEE", { locale: ptBR }).toLowerCase();
}

/** "14 – 20 set" */
export function fmtRange(start: string | Date, end: string | Date): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const sameMonth = a.getMonth() === b.getMonth();
  if (sameMonth) return `${format(a, "d")} – ${format(b, "d MMM", { locale: ptBR }).replace(".", "")}`;
  return `${format(a, "d MMM", { locale: ptBR }).replace(".", "")} – ${format(b, "d MMM", { locale: ptBR }).replace(".", "")}`;
}

export function fmtTime(d: string | Date): string {
  return format(parseDate(d), "HH:mm");
}

export function fmtDateTimeShort(d: string | Date): string {
  return format(parseDate(d), "d MMM, HH:mm", { locale: ptBR }).replace(".", "");
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
  if (cents == null) return "Valor a definir";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export const WEEKDAY_LABELS = ["S", "T", "Q", "Q", "S", "S", "D"]; // segunda … domingo
export const WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
export const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
