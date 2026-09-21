/** Relatório de constância: resumo por período, histórico editável de sessões, progresso de conteúdo e exportação CSV. */
import { t } from "@/i18n";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rawFetch, unwrap, ApiError } from "./client";
import type { components } from "./schema";
import { addDaysIso, isoDate, parseDate } from "@/lib/format";

export type SummaryOut = components["schemas"]["SummaryOut"];
export type ReportDayRow = components["schemas"]["ReportDayRow"];
export type ReportActivityRow = components["schemas"]["ReportActivityRow"];
export type ReportSubjectRow = components["schemas"]["ReportSubjectRow"];
export type ReportSessionOut = components["schemas"]["ReportSessionOut"];
export type ContentReportOut = components["schemas"]["ContentReportOut"];
export type SessionRevisionOut = components["schemas"]["SessionRevisionOut"];
export type SessionUpdate = components["schemas"]["SessionUpdate"];

export type ReportPeriod = "week" | "month" | "quarter";

export const reportKeys = {
  all: ["reports"] as const,
  summary: (period: string, date: string, activityId: string | null) =>
    ["reports", "summary", period, date, activityId] as const,
  sessions: (f: Record<string, unknown>) => ["reports", "sessions", f] as const,
  content: (activityId: string) => ["reports", "content", activityId] as const,
  revisions: (sessionId: string) => ["sessions", sessionId, "revisions"] as const,
};

async function fetchSummary(
  period: "week" | "month",
  date: string,
  activityId: string | null,
): Promise<SummaryOut> {
  return unwrap(
    await api.GET("/api/v1/reports/summary", {
      params: { query: { period, date, activity_id: activityId ?? undefined } },
    }),
  );
}

/** Primeiro dia do mês que contém `iso`, deslocado `offset` meses. */
export function monthStart(iso: string, offset = 0): string {
  const d = parseDate(iso);
  return isoDate(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}

/** Data de referência para o período anterior/seguinte. */
export function shiftPeriodDate(period: ReportPeriod, date: string, dir: -1 | 1): string {
  if (period === "week") return addDaysIso(date, 7 * dir);
  if (period === "month") return monthStart(date, dir);
  return monthStart(date, 3 * dir);
}

/** Início do trimestre civil (jan, abr, jul, out) do mês de `iso`. */
export function quarterStart(iso: string): string {
  const d = parseDate(iso);
  const m = Math.floor(d.getMonth() / 3) * 3;
  return isoDate(new Date(d.getFullYear(), m, 1));
}

/** Soma três resumos mensais em um único resumo trimestral (o backend não tem esse período). */
export function mergeSummaries(parts: SummaryOut[]): SummaryOut {
  const first = parts[0];
  const last = parts[parts.length - 1];
  const byAct = new Map<string, ReportActivityRow>();
  const bySub = new Map<string, ReportSubjectRow>();
  for (const p of parts) {
    for (const r of p.by_activity) {
      const cur = byAct.get(r.activity_id);
      if (cur) {
        cur.logged += r.logged;
        cur.target += r.target;
      } else byAct.set(r.activity_id, { ...r });
    }
    for (const r of p.by_subject) {
      const k = r.subject_id ?? r.title;
      const cur = bySub.get(k);
      if (cur) cur.logged += r.logged;
      else bySub.set(k, { ...r });
    }
  }
  for (const r of byAct.values()) r.percent = r.target > 0 ? Math.round((r.logged / r.target) * 100) : null;
  const sessions = parts.reduce((a, p) => a + p.sessions_count, 0);
  const totalDuration = parts.reduce((a, p) => a + p.avg_session_seconds * p.sessions_count, 0);
  return {
    period: "month",
    start: first.start,
    end: last.end,
    planned_seconds: parts.reduce((a, p) => a + p.planned_seconds, 0),
    logged_seconds: parts.reduce((a, p) => a + p.logged_seconds, 0),
    goal_days_planned: parts.reduce((a, p) => a + p.goal_days_planned, 0),
    goal_days_met: parts.reduce((a, p) => a + p.goal_days_met, 0),
    days_with_log: parts.reduce((a, p) => a + p.days_with_log, 0),
    pending_open_seconds: last.pending_open_seconds,
    recovered_seconds: parts.reduce((a, p) => a + p.recovered_seconds, 0),
    extra_seconds: parts.reduce((a, p) => a + p.extra_seconds, 0),
    streak_current: last.streak_current,
    streak_best: Math.max(...parts.map((p) => p.streak_best)),
    by_activity: [...byAct.values()],
    by_subject: [...bySub.values()],
    per_day: parts.flatMap((p) => p.per_day),
    sessions_count: sessions,
    avg_session_seconds: sessions ? Math.round(totalDuration / sessions) : 0,
    reading: parts
      .map((p) => p.reading)
      .filter(Boolean)
      .join(" "),
  };
}

/** Resumo do período. Trimestre = três meses agregados no cliente. */
export function useReportSummary(period: ReportPeriod, date: string, activityId: string | null) {
  const monthly = useQuery({
    queryKey: reportKeys.summary(period, date, activityId),
    enabled: period !== "quarter",
    queryFn: () => fetchSummary(period === "quarter" ? "month" : period, date, activityId),
    staleTime: 30_000,
  });
  const q0 = quarterStart(date);
  const quarter = useQueries({
    queries: [0, 1, 2].map((i) => ({
      queryKey: reportKeys.summary("month", monthStart(q0, i), activityId),
      enabled: period === "quarter",
      queryFn: () => fetchSummary("month", monthStart(q0, i), activityId),
      staleTime: 30_000,
    })),
  });
  if (period !== "quarter") return monthly;
  const isPending = quarter.some((q) => q.isPending);
  const isError = quarter.some((q) => q.isError);
  const error = quarter.find((q) => q.error)?.error ?? null;
  const data = !isPending && !isError ? mergeSummaries(quarter.map((q) => q.data as SummaryOut)) : undefined;
  return {
    data,
    isPending,
    isError,
    error,
    refetch: () => Promise.all(quarter.map((q) => q.refetch())),
  } as const;
}

export function useReportSessions(f: {
  start: string;
  end: string;
  activity_id: string | null;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: reportKeys.sessions(f),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/reports/sessions", {
          params: {
            query: {
              start: f.start,
              end: f.end,
              activity_id: f.activity_id ?? undefined,
              limit: f.limit ?? 50,
              offset: f.offset ?? 0,
            },
          },
        }),
      ) as ReportSessionOut[],
    staleTime: 30_000,
  });
}

export function useContentReports(activityIds: string[]) {
  return useQueries({
    queries: activityIds.map((id) => ({
      queryKey: reportKeys.content(id),
      queryFn: async () =>
        unwrap(
          await api.GET("/api/v1/reports/content", { params: { query: { activity_id: id } } }),
        ) as ContentReportOut,
      staleTime: 60_000,
    })),
  });
}

export function useSessionRevisions(sessionId: string | null) {
  return useQuery({
    queryKey: reportKeys.revisions(sessionId || ""),
    enabled: !!sessionId,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/sessions/{session_id}/revisions", {
          params: { path: { session_id: sessionId! } },
        }),
      ) as SessionRevisionOut[],
  });
}

function useInvalidateReports() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: reportKeys.all });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["today"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
  };
}

export function useUpdateSession() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SessionUpdate }) =>
      unwrap(
        await api.PATCH("/api/v1/sessions/{session_id}", { params: { path: { session_id: id } }, body }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteSession() {
  const invalidate = useInvalidateReports();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string | null }) =>
      unwrap(
        await api.DELETE("/api/v1/sessions/{session_id}", {
          params: { path: { session_id: id }, query: { reason: reason || undefined } },
        }),
      ),
    onSuccess: invalidate,
  });
}

/** Baixa um arquivo autenticado e dispara o download no navegador. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await rawFetch(path);
  if (!res.ok) {
    let msg = t("Erro {{v0}}", { v0: res.status });
    let code = "http_error";
    try {
      const body = (await res.json()) as { error?: { message?: string; code?: string } };
      msg = body.error?.message || msg;
      code = body.error?.code || code;
    } catch {
      /* corpo vazio */
    }
    throw new ApiError(res.status, code, msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function exportReportCsv(start: string, end: string, activityId: string | null) {
  const q = new URLSearchParams({ start, end });
  if (activityId) q.set("activity_id", activityId);
  return downloadFile(`/api/v1/reports/export.csv?${q.toString()}`, `estudatta-${start}-${end}.csv`);
}
