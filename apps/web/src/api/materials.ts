/** Materiais: envio de PDF (multipart), edição, exclusão e detalhe com link temporário de leitura. */
import { t } from "@/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, api, rawJson, unwrap } from "./client";
import { contentKeys, fetchMaterialDetail, type Material, type MaterialDetail } from "./content";
import type { components } from "./schema";

export type MaterialUpdate = components["schemas"]["MaterialUpdate"];
export type MaterialTopicLink = components["schemas"]["MaterialTopicOut"];

function useInvalidateAllMaterials() {
  const qc = useQueryClient();
  return (detail?: MaterialDetail) => {
    qc.invalidateQueries({ queryKey: ["materials"] });
    // tópicos exibem seus materiais: a árvore do objetivo também muda
    qc.invalidateQueries({ queryKey: ["activities"] });
    if (detail) qc.setQueryData(contentKeys.material(detail.id), detail);
  };
}

/** O link de leitura expira: sempre busca de novo ao abrir e nunca reaproveita cache antigo. */
export function useMaterialDetail(id: string | null) {
  return useQuery({
    queryKey: contentKeys.material(id || ""),
    enabled: !!id,
    queryFn: () => fetchMaterialDetail(id!),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useUploadMaterial() {
  const invalidate = useInvalidateAllMaterials();
  return useMutation({
    mutationFn: async ({
      file,
      title,
      activityId,
    }: {
      file: File;
      title?: string;
      activityId?: string | null;
    }) => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      if (activityId) fd.append("activity_id", activityId);
      if (title?.trim()) fd.append("title", title.trim());
      return rawJson<MaterialDetail>("/api/v1/materials/upload", { method: "POST", body: fd });
    },
    onSuccess: (d) => invalidate(d),
  });
}

export function useUpdateMaterial() {
  const invalidate = useInvalidateAllMaterials();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: MaterialUpdate }) =>
      unwrap(
        await api.PATCH("/api/v1/materials/{material_id}", { params: { path: { material_id: id } }, body }),
      ) as MaterialDetail,
    onSuccess: (d) => invalidate(d),
  });
}

export function useDeleteMaterial() {
  const invalidate = useInvalidateAllMaterials();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.DELETE("/api/v1/materials/{material_id}", { params: { path: { material_id: id } } })),
    onSuccess: () => invalidate(),
  });
}

/**
 * Quando o app fala com a API pela mesma origem (proxy), o link de leitura precisa usar essa
 * origem também, senão o navegador recusa exibir o PDF dentro da página.
 */
export function viewerUrl(downloadUrl: string | null | undefined): string | null {
  if (!downloadUrl) return null;
  try {
    const u = new URL(downloadUrl, window.location.origin);
    if (!API_BASE && u.origin !== window.location.origin && u.pathname.startsWith("/api/"))
      return `${u.pathname}${u.search}`;
    return u.toString();
  } catch {
    return null;
  }
}

const KIND_LABEL: Record<string, string> = { pdf: "PDF", link: "link", physical: t("físico") };

export function materialKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** "p. 1–380" / "380 páginas" / null */
export function materialPagesLabel(
  m: Pick<Material, "page_from" | "page_to" | "pages_total">,
): string | null {
  if (m.page_from != null && m.page_to != null)
    return m.page_from === m.page_to ? `p. ${m.page_from}` : `p. ${m.page_from}–${m.page_to}`;
  if (m.page_from != null) return t("a partir da p. {{v0}}", { v0: m.page_from });
  if (m.pages_total != null) return `${m.pages_total} ${m.pages_total === 1 ? t("página") : t("páginas")}`;
  return null;
}
