/** Planejamento: calendário semanal, tarefas, séries recorrentes, distribuição automática e impressão. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { useInvalidateAll } from "./queries";
import { useUser } from "./session";
import type { components } from "./schema";

type S = components["schemas"];
export type CalendarOut = S["CalendarOut"];
export type CalendarDay = S["CalendarDayOut"];
export type Task = S["TaskOut"];
export type TaskCreate = S["TaskCreate"];
export type TaskUpdate = S["TaskUpdate"];
export type RescheduleIn = S["RescheduleIn"];
export type OccurrenceIn = S["OccurrenceIn"];
export type Series = S["SeriesOut"];
export type SeriesCreate = S["SeriesCreate"];
export type SeriesUpdate = S["SeriesUpdate"];
export type AutoPlanOut = S["AutoPlanOut"];
export type AutoPlanIn = S["AutoPlanIn"];
export type WeekPrintOut = S["WeekPrintOut"];
export type Preferences = S["PreferencesOut"];

export const planningKeys = {
  calendar: (start: string, end: string, activityId?: string | null) =>
    ["calendar", start, end, activityId ?? null] as const,
  tasks: (start: string, end: string, activityId?: string | null) =>
    ["tasks", start, end, activityId ?? null] as const,
  series: (activityId?: string | null) => ["tasks", "series", activityId ?? null] as const,
  weekPrint: (start: string) => ["planning", "week-print", start] as const,
  preferences: ["me", "preferences"] as const,
};

export function useCalendar(start: string, end: string, activityId?: string | null) {
  return useQuery({
    queryKey: planningKeys.calendar(start, end, activityId),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/calendar", {
          params: { query: { start, end, activity_id: activityId ?? null } },
        }),
      ) as CalendarOut,
    staleTime: 15_000,
  });
}

export function useTasks(start: string, end: string, activityId?: string | null, enabled = true) {
  return useQuery({
    queryKey: planningKeys.tasks(start, end, activityId),
    enabled,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/tasks", {
          params: { query: { start, end, activity_id: activityId ?? null } },
        }),
      ) as Task[],
    staleTime: 15_000,
  });
}

export function useSeries(activityId?: string | null, enabled = true) {
  return useQuery({
    queryKey: planningKeys.series(activityId),
    enabled,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/tasks/series", { params: { query: { activity_id: activityId ?? null } } }),
      ) as Series[],
  });
}

export function usePreferences() {
  const user = useUser();
  return useQuery({
    queryKey: planningKeys.preferences,
    enabled: !!user,
    queryFn: async () => unwrap(await api.GET("/api/v1/me/preferences")) as Preferences,
    staleTime: 5 * 60_000,
  });
}

function useInvalidatePlanning() {
  const qc = useQueryClient();
  const all = useInvalidateAll();
  return () => {
    all();
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["planning"] });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async (body: TaskCreate) => unwrap(await api.POST("/api/v1/tasks", { body })) as Task,
    onSuccess: invalidate,
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: TaskUpdate }) =>
      unwrap(await api.PATCH("/api/v1/tasks/{task_id}", { params: { path: { task_id: id } }, body })) as Task,
    onSuccess: invalidate,
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/api/v1/tasks/{task_id}", { params: { path: { task_id: id } } })),
    onSuccess: invalidate,
  });
}

/** Reagendar mantém a mesma tarefa (id, histórico e vínculo com a série). */
export function useRescheduleTask() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: RescheduleIn }) =>
      unwrap(
        await api.POST("/api/v1/tasks/{task_id}/reschedule", { params: { path: { task_id: id } }, body }),
      ) as Task,
    onSuccess: invalidate,
  });
}

export function useSkipTask() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.POST("/api/v1/tasks/{task_id}/skip", { params: { path: { task_id: id } } })) as Task,
    onSuccess: invalidate,
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) =>
      done
        ? (unwrap(
            await api.POST("/api/v1/tasks/{task_id}/complete", { params: { path: { task_id: id } } }),
          ) as Task)
        : (unwrap(
            await api.POST("/api/v1/tasks/{task_id}/uncomplete", { params: { path: { task_id: id } } }),
          ) as Task),
    onSuccess: invalidate,
  });
}

/** Ocorrência virtual de série vira tarefa real ao ser editada/concluída. */
export function useMaterializeOccurrence() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async ({ seriesId, date, body }: { seriesId: string; date: string; body: OccurrenceIn }) =>
      unwrap(
        await api.POST("/api/v1/tasks/series/{series_id}/occurrences/{local_date}", {
          params: { path: { series_id: seriesId, local_date: date } },
          body,
        }),
      ) as Task,
    onSuccess: invalidate,
  });
}

export function useCreateSeries() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async (body: SeriesCreate) =>
      unwrap(await api.POST("/api/v1/tasks/series", { body })) as Series,
    onSuccess: invalidate,
  });
}

export function useUpdateSeries() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SeriesUpdate }) =>
      unwrap(
        await api.PATCH("/api/v1/tasks/series/{series_id}", { params: { path: { series_id: id } }, body }),
      ) as Series,
    onSuccess: invalidate,
  });
}

export function useDeleteSeries() {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/api/v1/tasks/series/{series_id}", { params: { path: { series_id: id } } })),
    onSuccess: invalidate,
  });
}

export function useAutoPlanPreview(activityId: string) {
  return useMutation({
    mutationFn: async (body: AutoPlanIn) =>
      unwrap(
        await api.POST("/api/v1/activities/{activity_id}/auto-plan/preview", {
          params: { path: { activity_id: activityId } },
          body,
        }),
      ) as AutoPlanOut,
  });
}

export function useAutoPlanApply(activityId: string) {
  const invalidate = useInvalidatePlanning();
  return useMutation({
    mutationFn: async (body: AutoPlanIn) =>
      unwrap(
        await api.POST("/api/v1/activities/{activity_id}/auto-plan", {
          params: { path: { activity_id: activityId } },
          body,
        }),
      ) as AutoPlanOut,
    onSuccess: invalidate,
  });
}

export function useWeekPrint(start: string, activityId?: string | null) {
  return useQuery({
    queryKey: [...planningKeys.weekPrint(start), activityId ?? null],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/planning/week-print", {
          params: { query: { start, activity_id: activityId ?? null } },
        }),
      ) as WeekPrintOut,
  });
}
