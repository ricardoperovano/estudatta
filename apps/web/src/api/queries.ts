/** Consultas e mutações centrais (Hoje, objetivos, saldo, sessões). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, rawJson } from "./client";
import type { Activity, ActivityDetail, Balance, TodayOut, StudySession, RecoveryPreview, RecoveryPlan } from "./types";
import { loadSnapshot, saveSnapshot } from "@/offline/db";
import { useUser } from "./session";
import { useSyncStore } from "@/offline/sync";
import type { components } from "./schema";

export const keys = {
  today: ["today"] as const,
  activities: ["activities"] as const,
  activity: (id: string) => ["activities", id] as const,
  balance: (id: string) => ["activities", id, "balance"] as const,
  activeSession: ["sessions", "active"] as const,
  sessions: (f: Record<string, unknown>) => ["sessions", f] as const,
  recoveryPlans: (id: string) => ["activities", id, "recovery-plans"] as const,
};

export function useToday() {
  const user = useUser();
  return useQuery({
    queryKey: keys.today,
    enabled: !!user,
    queryFn: async () => {
      try {
        const data = unwrap(await api.GET("/api/v1/dashboard/today"));
        if (user) void saveSnapshot(user.id, "today", data);
        useSyncStore.getState().set({ lastSyncAt: new Date().toISOString() });
        return { data, offline: false, savedAt: null as string | null };
      } catch (e) {
        if (user) {
          const snap = await loadSnapshot<TodayOut>(user.id, "today");
          if (snap) return { data: snap.data, offline: true, savedAt: snap.saved_at };
        }
        throw e;
      }
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useActivities(includeArchived = false) {
  return useQuery({
    queryKey: [...keys.activities, includeArchived],
    queryFn: async () => unwrap(await api.GET("/api/v1/activities", { params: { query: { include_archived: includeArchived } } })) as Activity[],
  });
}

export function useActivity(id: string | undefined) {
  return useQuery({
    queryKey: keys.activity(id || ""),
    enabled: !!id,
    queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}", { params: { path: { activity_id: id! } } })) as ActivityDetail,
  });
}

export function useBalance(id: string | undefined, days = 60) {
  return useQuery({
    queryKey: [...keys.balance(id || ""), days],
    enabled: !!id,
    queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}/balance", { params: { path: { activity_id: id! }, query: { days } } })) as Balance,
  });
}

export function useActiveSession() {
  const user = useUser();
  return useQuery({
    queryKey: keys.activeSession,
    enabled: !!user,
    queryFn: async () => (unwrap(await api.GET("/api/v1/sessions/active")) as StudySession | null) ?? null,
    staleTime: 10_000,
  });
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: keys.today });
    qc.invalidateQueries({ queryKey: keys.activities });
    qc.invalidateQueries({ queryKey: keys.activeSession });
    qc.invalidateQueries({ queryKey: ["sessions"] });
    qc.invalidateQueries({ queryKey: ["calendar"] });
    qc.invalidateQueries({ queryKey: ["reports"] });
  };
}

export type ManualBody = components["schemas"]["SessionManual"];
export function useManualSession() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (body: ManualBody) => unwrap(await api.POST("/api/v1/sessions/manual", { body })) as StudySession,
    onSuccess: invalidate,
  });
}

export function useCreateActivity() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async (body: components["schemas"]["ActivityCreate"]) => unwrap(await api.POST("/api/v1/activities", { body })) as ActivityDetail,
    onSuccess: invalidate,
  });
}

export function useRecoveryPreview(activityId: string) {
  return useMutation({
    mutationFn: async (body: components["schemas"]["RecoveryPreviewIn"]) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/recovery-plans/preview", { params: { path: { activity_id: activityId } }, body })) as RecoveryPreview,
  });
}

export function useApplyRecovery(activityId: string) {
  const invalidate = useInvalidateAll();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: components["schemas"]["RecoveryPreviewIn"]) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/recovery-plans", { params: { path: { activity_id: activityId } }, body })) as RecoveryPlan,
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: keys.recoveryPlans(activityId) });
    },
  });
}

export function useCompleteOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/me/onboarding", { body: { completed: true } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "session"] }),
  });
}

/** Marca tarefa como concluída/desfeita (endpoint do módulo de planejamento). */
export function useToggleTask() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => rawJson(`/api/v1/tasks/${id}/${done ? "complete" : "uncomplete"}`, { method: "POST" }),
    onSuccess: invalidate,
  });
}
