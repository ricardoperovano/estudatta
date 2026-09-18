/** Conteúdo do objetivo: matérias, tópicos, progresso de conteúdo e materiais. */
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
export type Subject = S["SubjectOut"];
export type Topic = S["TopicOut"];
export type SubjectCreate = S["SubjectCreate"];
export type SubjectUpdate = S["SubjectUpdate"];
export type TopicCreate = S["TopicCreate"];
export type TopicUpdate = S["TopicUpdate"];
export type ContentProgress = S["ContentProgressOut"];
export type Material = S["MaterialOut"];
export type MaterialDetail = S["MaterialDetailOut"];
export type MaterialTopicLinkIn = S["MaterialTopicLinkIn"];
export type MaterialBrief = S["MaterialBriefOut"];

export const contentKeys = {
  subjects: (activityId: string) => ["activities", activityId, "subjects"] as const,
  progress: (activityId: string) => ["activities", activityId, "content-progress"] as const,
  materials: (activityId?: string | null) => ["materials", activityId ?? "all"] as const,
  material: (id: string) => ["materials", "one", id] as const,
};

export function useSubjects(activityId: string | undefined) {
  return useQuery({
    queryKey: contentKeys.subjects(activityId || ""),
    enabled: !!activityId,
    queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}/subjects", { params: { path: { activity_id: activityId! } } })) as Subject[],
  });
}

export function useContentProgress(activityId: string | undefined) {
  return useQuery({
    queryKey: contentKeys.progress(activityId || ""),
    enabled: !!activityId,
    queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}/content-progress", { params: { path: { activity_id: activityId! } } })) as ContentProgress,
  });
}

/** Progresso de conteúdo de vários objetivos (lista de objetivos). */
export function useContentProgressMany(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: contentKeys.progress(id),
      queryFn: async () => unwrap(await api.GET("/api/v1/activities/{activity_id}/content-progress", { params: { path: { activity_id: id } } })) as ContentProgress,
      staleTime: 60_000,
    })),
  });
}

function useInvalidateContent(activityId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: contentKeys.subjects(activityId) });
    qc.invalidateQueries({ queryKey: contentKeys.progress(activityId) });
    qc.invalidateQueries({ queryKey: ["reports"] });
  };
}

export function useCreateSubject(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async (body: SubjectCreate) =>
      unwrap(await api.POST("/api/v1/activities/{activity_id}/subjects", { params: { path: { activity_id: activityId } }, body })) as Subject,
    onSuccess: invalidate,
  });
}

export function useUpdateSubject(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: SubjectUpdate }) =>
      unwrap(await api.PATCH("/api/v1/subjects/{subject_id}", { params: { path: { subject_id: id } }, body })) as Subject,
    onSuccess: invalidate,
  });
}

export function useDeleteSubject(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/subjects/{subject_id}", { params: { path: { subject_id: id } } })),
    onSuccess: invalidate,
  });
}

export function useReorderSubjects(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async (orderedIds: string[]) => unwrap(await api.POST("/api/v1/subjects/reorder", { body: { activity_id: activityId, ordered_ids: orderedIds } })) as Subject[],
    onSuccess: invalidate,
  });
}

export function useCreateTopic(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async ({ subjectId, body }: { subjectId: string; body: TopicCreate }) =>
      unwrap(await api.POST("/api/v1/subjects/{subject_id}/topics", { params: { path: { subject_id: subjectId } }, body })) as Topic,
    onSuccess: invalidate,
  });
}

/** Concluir um tópico não lança minutos: só muda o estado do conteúdo. */
export function useUpdateTopic(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: TopicUpdate }) =>
      unwrap(await api.PATCH("/api/v1/topics/{topic_id}", { params: { path: { topic_id: id } }, body })) as Topic,
    onSuccess: invalidate,
  });
}

export function useDeleteTopic(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/topics/{topic_id}", { params: { path: { topic_id: id } } })),
    onSuccess: invalidate,
  });
}

export function useReorderTopics(activityId: string) {
  const invalidate = useInvalidateContent(activityId);
  return useMutation({
    mutationFn: async ({ subjectId, parentId, orderedIds }: { subjectId: string; parentId?: string | null; orderedIds: string[] }) =>
      unwrap(await api.POST("/api/v1/topics/reorder", { body: { subject_id: subjectId, parent_id: parentId ?? null, ordered_ids: orderedIds } })) as Topic[],
    onSuccess: invalidate,
  });
}

export function useMaterials(activityId?: string | null, enabled = true) {
  return useQuery({
    queryKey: contentKeys.materials(activityId),
    enabled,
    queryFn: async () => unwrap(await api.GET("/api/v1/materials", { params: { query: { activity_id: activityId ?? null } } })) as Material[],
  });
}

/** Detalhe com URL assinada de download (expira). */
export async function fetchMaterialDetail(id: string): Promise<MaterialDetail> {
  return unwrap(await api.GET("/api/v1/materials/{material_id}", { params: { path: { material_id: id } } })) as MaterialDetail;
}

function useInvalidateMaterials(activityId?: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["materials"] });
    if (activityId) {
      qc.invalidateQueries({ queryKey: contentKeys.subjects(activityId) });
    }
  };
}

export function useLinkMaterialTopic(activityId?: string | null) {
  const invalidate = useInvalidateMaterials(activityId);
  return useMutation({
    mutationFn: async ({ materialId, body }: { materialId: string; body: MaterialTopicLinkIn }) =>
      unwrap(await api.POST("/api/v1/materials/{material_id}/topics", { params: { path: { material_id: materialId } }, body })) as MaterialDetail,
    onSuccess: invalidate,
  });
}

export function useUnlinkMaterialTopic(activityId?: string | null) {
  const invalidate = useInvalidateMaterials(activityId);
  return useMutation({
    mutationFn: async ({ materialId, topicId }: { materialId: string; topicId: string }) =>
      unwrap(await api.DELETE("/api/v1/materials/{material_id}/topics/{topic_id}", { params: { path: { material_id: materialId, topic_id: topicId } } })) as MaterialDetail,
    onSuccess: invalidate,
  });
}

export function useCreateLinkMaterial(activityId?: string | null) {
  const invalidate = useInvalidateMaterials(activityId);
  return useMutation({
    mutationFn: async (body: S["MaterialLinkIn"]) => unwrap(await api.POST("/api/v1/materials/link", { body })) as MaterialDetail,
    onSuccess: invalidate,
  });
}

export function useCreatePhysicalMaterial(activityId?: string | null) {
  const invalidate = useInvalidateMaterials(activityId);
  return useMutation({
    mutationFn: async (body: S["MaterialPhysicalIn"]) => unwrap(await api.POST("/api/v1/materials/physical", { body })) as MaterialDetail,
    onSuccess: invalidate,
  });
}

/** Percorre a árvore de tópicos (inclui subtópicos) em ordem de exibição. */
export function flattenTopics(topics: Topic[] | undefined, depth = 0): { topic: Topic; depth: number }[] {
  const out: { topic: Topic; depth: number }[] = [];
  for (const t of topics ?? []) {
    out.push({ topic: t, depth });
    out.push(...flattenTopics(t.topics, depth + 1));
  }
  return out;
}
