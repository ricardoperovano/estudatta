/** Revisões espaçadas, simulados, análise do estudo e gamificação (conquistas, XP, desafios). */
import { t as tx } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { useUser } from "./session";
import type { components } from "./schema";

type S = components["schemas"];
export type Revision = S["RevisionOut"];
export type RevisionSummary = S["RevisionSummaryOut"];
export type MockExam = S["MockExamOut"];
export type MockExamIn = S["MockExamIn"];
export type MockOverview = S["MockOverviewOut"];
export type Insights = S["InsightsOut"];
export type Gamification = S["GamificationOut"];
export type Achievement = S["AchievementOut"];
export type Challenge = S["ChallengeOut"];

export const studyKeys = {
  revisions: (f: Record<string, unknown> = {}) => ["revisions", f] as const,
  revisionSummary: ["revisions", "summary"] as const,
  mocks: (activityId: string) => ["mock-exams", activityId] as const,
  insights: (activityId: string) => ["insights", activityId] as const,
  gamification: ["gamification"] as const,
};

/** Tipos de sessão (mesma lista do servidor: `STUDY_TYPES`). */
export const STUDY_TYPES = [
  { value: "teoria", label: tx("Teoria") },
  { value: "questoes", label: tx("Questões") },
  { value: "revisao", label: tx("Revisão") },
  { value: "leitura", label: tx("Leitura") },
  { value: "aula", label: tx("Aula") },
  { value: "simulado", label: tx("Simulado") },
  { value: "pratica", label: tx("Prática") },
  { value: "devocional", label: tx("Devocional") },
  { value: "outro", label: tx("Outro") },
] as const;
export type StudyType = (typeof STUDY_TYPES)[number]["value"];
export const studyTypeLabel = (v: string | null | undefined) =>
  STUDY_TYPES.find((t) => t.value === v)?.label ?? tx("Teoria");
/** Tipos em que faz sentido perguntar questões feitas/acertos. */
export const QUESTION_TYPES: readonly string[] = ["questoes", "simulado", "revisao", "pratica"];

export const DIFFICULTIES = [
  { value: "facil", label: tx("Fácil") },
  { value: "media", label: tx("Média") },
  { value: "dificil", label: tx("Difícil") },
] as const;

/** Tudo que muda saldo/estudo também pode mudar revisões, análise e conquistas. */
export function useInvalidateStudy() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["revisions"] });
    qc.invalidateQueries({ queryKey: ["insights"] });
    qc.invalidateQueries({ queryKey: ["mock-exams"] });
    qc.invalidateQueries({ queryKey: studyKeys.gamification });
  };
}

// ---------------------------------------------------------------- revisões
export function useRevisions(
  params: { status?: "pending" | "done" | "skipped"; activity_id?: string; until?: string } = {},
) {
  const user = useUser();
  return useQuery({
    queryKey: studyKeys.revisions(params),
    enabled: !!user,
    queryFn: async () =>
      unwrap(await api.GET("/api/v1/revisions", { params: { query: params } })) as Revision[],
    staleTime: 30_000,
  });
}

export function useRevisionSummary() {
  const user = useUser();
  return useQuery({
    queryKey: studyKeys.revisionSummary,
    enabled: !!user,
    queryFn: async () => unwrap(await api.GET("/api/v1/revisions/summary")) as RevisionSummary,
    staleTime: 30_000,
  });
}

export function useRevisionAction() {
  const invalidate = useInvalidateStudy();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      due_date,
    }: {
      id: string;
      action: "done" | "skip" | "reschedule";
      due_date?: string;
    }) => {
      const path = { revision_id: id };
      if (action === "done")
        return unwrap(await api.POST("/api/v1/revisions/{revision_id}/done", { params: { path } }));
      if (action === "skip")
        return unwrap(await api.POST("/api/v1/revisions/{revision_id}/skip", { params: { path } }));
      return unwrap(
        await api.POST("/api/v1/revisions/{revision_id}/reschedule", {
          params: { path },
          body: { due_date: due_date! },
        }),
      );
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- simulados
export function useMockExams(activityId: string | undefined) {
  return useQuery({
    queryKey: studyKeys.mocks(activityId || ""),
    enabled: !!activityId,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/activities/{activity_id}/mock-exams", {
          params: { path: { activity_id: activityId! } },
        }),
      ) as MockOverview,
  });
}

export function useSaveMockExam(activityId: string) {
  const invalidate = useInvalidateStudy();
  return useMutation({
    mutationFn: async ({ id, body }: { id?: string; body: MockExamIn }) =>
      id
        ? (unwrap(
            await api.PATCH("/api/v1/mock-exams/{exam_id}", { params: { path: { exam_id: id } }, body }),
          ) as MockExam)
        : (unwrap(
            await api.POST("/api/v1/activities/{activity_id}/mock-exams", {
              params: { path: { activity_id: activityId } },
              body,
            }),
          ) as MockExam),
    onSuccess: invalidate,
  });
}

export function useDeleteMockExam() {
  const invalidate = useInvalidateStudy();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/api/v1/mock-exams/{exam_id}", { params: { path: { exam_id: id } } })),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------- análise
export function useInsights(activityId: string | undefined) {
  return useQuery({
    queryKey: studyKeys.insights(activityId || ""),
    enabled: !!activityId,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/activities/{activity_id}/insights", {
          params: { path: { activity_id: activityId! } },
        }),
      ) as Insights,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------- gamificação
export function useGamification() {
  const user = useUser();
  return useQuery({
    queryKey: studyKeys.gamification,
    enabled: !!user,
    queryFn: async () => unwrap(await api.GET("/api/v1/gamification")) as Gamification,
    staleTime: 20_000,
  });
}

export function useMarkAchievementsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (codes?: string[]) =>
      unwrap(await api.POST("/api/v1/gamification/seen", { body: { codes: codes ?? null } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: studyKeys.gamification }),
  });
}
