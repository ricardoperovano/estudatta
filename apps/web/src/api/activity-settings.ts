/** Configurações do objetivo: regras de meta, pausas, fuso, status, perdão de pendência e planos de recuperação. */
import { languageShortName } from "@/lib/languages";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { keys, useInvalidateAll } from "./queries";
import type { components } from "./schema";
import type { ActivityDetail, Balance, GoalRule, RecoveryPlan } from "./types";

type S = components["schemas"];
export type GoalRuleIn = S["GoalRuleIn"];
export type PauseIn = S["app__schemas__activities__PauseIn"];
export type PauseOut = S["PauseOut"];
export type TimezoneChange = S["TimezoneChange"];
export type TimezoneOut = S["TimezoneOut"];
export type ActivityUpdate = S["ActivityUpdate"];
export type ForgivePreview = S["ForgivePreviewOut"];
export type ForgiveIn = S["ForgiveIn"];
export type Summary = S["SummaryOut"];

export const settingsKeys = {
  goalRules: (id: string) => ["activities", id, "goal-rules"] as const,
  summary: (period: string, date: string | null, activityId: string | null) => ["reports", "summary", period, date, activityId] as const,
};

function useInvalidateActivity(activityId: string) {
  const qc = useQueryClient();
  const all = useInvalidateAll();
  return () => {
    all();
    qc.invalidateQueries({ queryKey: keys.activity(activityId) });
    qc.invalidateQueries({ queryKey: keys.balance(activityId) });
    qc.invalidateQueries({ queryKey: settingsKeys.goalRules(activityId) });
    qc.invalidateQueries({ queryKey: keys.recoveryPlans(activityId) });
  };
}

export function useGoalRules(activityId: string | undefined) {
  return useQuery({
    queryKey: settingsKeys.goalRules(activityId || ""),
    enabled: !!activityId,
    queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}/goal-rules", { params: { path: { activity_id: activityId! } } })) as GoalRule[],
  });
}

/** Nova regra de meta; por padrão vale a partir de amanhã (o saldo de hoje não muda). */
export function useAddGoalRule(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (body: GoalRuleIn) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/goal-rules", { params: { path: { activity_id: activityId } }, body })) as GoalRule,
    onSuccess: invalidate,
  });
}

export function useAddPause(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (body: PauseIn) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/pauses", { params: { path: { activity_id: activityId } }, body })) as PauseOut,
    onSuccess: invalidate,
  });
}

export function useDeletePause(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (pauseId: string) =>
      unwrap(await api.DELETE("/api/v1/activities/{activity_id}/pauses/{pause_id}", { params: { path: { activity_id: activityId, pause_id: pauseId } } })),
    onSuccess: invalidate,
  });
}

export function useChangeTimezone(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (body: TimezoneChange) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/timezone", { params: { path: { activity_id: activityId } }, body })) as TimezoneOut,
    onSuccess: invalidate,
  });
}

export function useChangeStatus(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (status: "active" | "paused" | "archived") =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/status", { params: { path: { activity_id: activityId } }, body: { status } })) as ActivityDetail,
    onSuccess: invalidate,
  });
}

/** Mudança de status para qualquer objetivo (lista). */
export function useChangeAnyStatus() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" | "archived" }) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/status", { params: { path: { activity_id: id } }, body: { status } })) as ActivityDetail,
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/activities/{activity_id}", { params: { path: { activity_id: id } } })),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (body: ActivityUpdate) =>
      unwrap(await api.PATCH("/api/v1/activities/{activity_id}", { params: { path: { activity_id: activityId } }, body })) as ActivityDetail,
    onSuccess: invalidate,
  });
}

export function useForgivePreview(activityId: string) {
  return useMutation({
    mutationFn: async (body: ForgiveIn) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/forgive/preview", { params: { path: { activity_id: activityId } }, body })) as ForgivePreview,
  });
}

export function useForgive(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async (body: ForgiveIn) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/forgive", { params: { path: { activity_id: activityId } }, body })) as Balance,
    onSuccess: invalidate,
  });
}

export function useRecoveryPlans(activityId: string | undefined) {
  return useQuery({
    queryKey: keys.recoveryPlans(activityId || ""),
    enabled: !!activityId,
    queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}/recovery-plans", { params: { path: { activity_id: activityId! } } })) as RecoveryPlan[],
  });
}

/** Estratégia "deixar como está": cancela o plano de recuperação vigente. */
export function useCancelRecovery(activityId: string) {
  const invalidate = useInvalidateActivity(activityId);
  return useMutation({
    mutationFn: async () => unwrap(await api.DELETE("/api/v1/activities/{activity_id}/recovery-plans/current", { params: { path: { activity_id: activityId } } })),
    onSuccess: invalidate,
  });
}

export function useSummary(period: "day" | "week" | "month", date: string | null, activityId: string | null, enabled = true) {
  return useQuery({
    queryKey: settingsKeys.summary(period, date, activityId),
    enabled,
    queryFn: async () => unwrap(await api.GET("/api/v1/reports/summary", { params: { query: { period, date, activity_id: activityId } } })) as Summary,
    staleTime: 30_000,
  });
}

export const CATEGORY_LABELS: Record<string, string> = {
  ingles: "idioma", // legado: o servidor grava como idioma + inglês
  idioma: "idioma",
  concurso: "concurso",
  faculdade: "faculdade",
  certificacao: "certificação",
  curso: "curso",
  outro_estudo: "outro estudo",
  leitura: "leitura",
  pratica: "prática",
  rotina: "rotina",
  personalizado: "personalizado",
};

export const CATEGORY_OPTIONS: { value: ActivityUpdate["category"] & string; label: string }[] = [
  { value: "idioma", label: "Idiomas" },
  { value: "concurso", label: "Concurso" },
  { value: "faculdade", label: "Faculdade" },
  { value: "certificacao", label: "Certificação" },
  { value: "curso", label: "Curso" },
  { value: "outro_estudo", label: "Outro estudo" },
  { value: "leitura", label: "Leitura" },
  { value: "pratica", label: "Prática (instrumento, esporte…)" },
  { value: "rotina", label: "Rotina" },
  { value: "personalizado", label: "Personalizado" },
];

export const TIMEZONE_OPTIONS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
  "America/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "America/New_York",
  "America/Toronto",
  "Asia/Tokyo",
];

export function categoryLabel(category: string, language?: string | null): string {
  const base = CATEGORY_LABELS[category] ?? category;
  const lang = category === "idioma" || category === "ingles" ? languageShortName(language ?? "en") : null;
  return lang ? `${base} · ${lang.toLocaleLowerCase("pt-BR")}` : base;
}
