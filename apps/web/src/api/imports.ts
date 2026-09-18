/** Importação de conteúdo programático (texto, CSV, PDF): jobs, proposta editável, confirmação e IA opcional. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, rawFetch, rawJson, ApiError } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
export type ImportOut = S["ImportOut"];
export type ImportConfirmOut = S["ImportConfirmOut"];
export type AiStatus = S["AiStatusOut"];
export type SuggestStructureOut = S["SuggestStructureOut"];

export type ImportStatus = "queued" | "processing" | "needs_review" | "failed" | "confirmed" | "cancelled";
export type ImportSource = "text" | "csv" | "pdf";

/** Proposta com campos obrigatórios (o schema gerado deixa tudo opcional). */
export interface ProposalSubtopic {
  title: string;
  page?: number | null;
  page_to?: number | null;
  estimated_minutes?: number | null;
}
export interface ProposalTopic extends ProposalSubtopic {
  children: ProposalSubtopic[];
}
export interface ProposalSubject {
  title: string;
  topics: ProposalTopic[];
}
export interface Proposal {
  subjects: ProposalSubject[];
  stats?: Record<string, unknown> | null;
}

export const MAX_PROPOSAL_SUBJECTS = 200;
export const MAX_PROPOSAL_TOPICS = 3000;
export const MAX_TITLE_CHARS = 400;
export const MAX_TEXT_CHARS = 400_000;

export const importKeys = {
  all: ["imports"] as const,
  lists: () => ["imports", "list"] as const,
  list: (activityId?: string | null) => ["imports", "list", activityId ?? "all"] as const,
  one: (id: string) => ["imports", "one", id] as const,
  aiStatus: ["ai", "status"] as const,
};

export function isImportInProgress(status: string | undefined | null): boolean {
  return status === "queued" || status === "processing";
}

export const SOURCE_LABELS: Record<string, string> = { text: "Texto", csv: "CSV", pdf: "PDF" };

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** "2,4 MB" / "830 KB" */
export function fmtFileSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// --- Proposta: normalização e contagem ----------------------------------------------

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asPage(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : null;
}

function asMinutes(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 6000 ? n : null;
}

function normalizeSubtopic(raw: unknown): ProposalSubtopic | null {
  const r = asRecord(raw);
  if (!r) return null;
  const title = typeof r.title === "string" ? r.title : "";
  return { title, page: asPage(r.page), page_to: asPage(r.page_to), estimated_minutes: asMinutes(r.estimated_minutes) };
}

/** Converte o `proposal` bruto do job (dicionário sem tipo) em uma proposta segura para edição. */
export function normalizeProposal(raw: unknown): Proposal {
  const r = asRecord(raw);
  const subjectsRaw = Array.isArray(r?.subjects) ? r.subjects : [];
  const subjects: ProposalSubject[] = [];
  for (const s of subjectsRaw) {
    const sr = asRecord(s);
    if (!sr) continue;
    const topics: ProposalTopic[] = [];
    for (const t of Array.isArray(sr.topics) ? sr.topics : []) {
      const base = normalizeSubtopic(t);
      if (!base) continue;
      const tr = asRecord(t)!;
      const children: ProposalSubtopic[] = [];
      for (const c of Array.isArray(tr.children) ? tr.children : []) {
        const child = normalizeSubtopic(c);
        if (child) children.push(child);
      }
      topics.push({ ...base, children });
    }
    subjects.push({ title: typeof sr.title === "string" ? sr.title : "", topics });
  }
  const stats = asRecord(r?.stats);
  return { subjects, stats };
}

/** Matérias e tópicos (incluindo subtópicos) de uma proposta. */
export function countProposal(p: Proposal | null | undefined): { subjects: number; topics: number } {
  if (!p) return { subjects: 0, topics: 0 };
  let topics = 0;
  for (const s of p.subjects) for (const t of s.topics) topics += 1 + t.children.length;
  return { subjects: p.subjects.length, topics };
}

/** "12–30" → {page: 12, page_to: 30}; "" → nulos. */
export function parsePages(text: string): { page: number | null; page_to: number | null } {
  const nums = (text.match(/\d{1,6}/g) ?? []).map(Number);
  const page = nums.length ? asPage(nums[0]) : null;
  if (page == null) return { page: null, page_to: null };
  const to = nums.length > 1 ? asPage(nums[1]) : null;
  return { page, page_to: to != null && to >= page ? to : null };
}

export function fmtPages(page: number | null | undefined, pageTo: number | null | undefined): string {
  if (page == null) return "";
  return pageTo != null && pageTo !== page ? `${page}–${pageTo}` : String(page);
}

// --- Consultas --------------------------------------------------------------------

export function useImports(activityId?: string | null, enabled = true) {
  return useQuery({
    queryKey: importKeys.list(activityId),
    enabled,
    queryFn: async () => unwrap(await api.GET("/api/v1/imports", { params: { query: { activity_id: activityId ?? null } } })) as ImportOut[],
    staleTime: 10_000,
  });
}

/** Um job; faz polling a cada 2 s enquanto está na fila ou em processamento. */
export function useImport(id: string | null | undefined) {
  return useQuery({
    queryKey: importKeys.one(id || ""),
    enabled: !!id,
    queryFn: async () => unwrap(await api.GET("/api/v1/imports/{import_id}", { params: { path: { import_id: id! } } })) as ImportOut,
    refetchInterval: (q) => (isImportInProgress(q.state.data?.status) ? 2000 : false),
    refetchOnWindowFocus: (q) => isImportInProgress(q.state.data?.status) || q.state.data?.status === "needs_review",
  });
}

export function useAiStatus(enabled = true) {
  return useQuery({
    queryKey: importKeys.aiStatus,
    enabled,
    queryFn: async () => unwrap(await api.GET("/api/v1/ai/status")) as AiStatus,
    staleTime: 60_000,
    retry: false,
  });
}

// --- Mutações -----------------------------------------------------------------------

export type CreateImportInput =
  | { kind: "text"; activity_id: string; content: string }
  | { kind: "file"; activity_id: string; file: File; source: "csv" | "pdf"; create_material?: boolean };

function useInvalidateImports() {
  const qc = useQueryClient();
  return (job?: ImportOut | null) => {
    qc.invalidateQueries({ queryKey: importKeys.all });
    if (job) qc.setQueryData(importKeys.one(job.id), job);
  };
}

export function useCreateImport() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async (input: CreateImportInput): Promise<ImportOut> => {
      if (input.kind === "text") {
        return rawJson<ImportOut>("/api/v1/imports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_id: input.activity_id, source: "text", content: input.content }),
        });
      }
      const fd = new FormData();
      fd.append("file", input.file, input.file.name);
      fd.append("activity_id", input.activity_id);
      fd.append("source", input.source);
      if (input.create_material) fd.append("create_material", "true");
      return rawJson<ImportOut>("/api/v1/imports", { method: "POST", body: fd });
    },
    onSuccess: (job) => invalidate(job),
  });
}

export function useUpdateImport() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async ({ id, proposal }: { id: string; proposal: Proposal }) =>
      unwrap(await api.PATCH("/api/v1/imports/{import_id}", { params: { path: { import_id: id } }, body: { proposal } })) as ImportOut,
    onSuccess: (job) => invalidate(job),
  });
}

export function useConfirmImport() {
  const qc = useQueryClient();
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async ({ id, proposal }: { id: string; proposal: Proposal }) =>
      unwrap(await api.POST("/api/v1/imports/{import_id}/confirm", { params: { path: { import_id: id } }, body: { proposal } })) as ImportConfirmOut,
    onSuccess: (out) => {
      invalidate(out.import);
      // matérias/tópicos novos aparecem no objetivo, no progresso de conteúdo e nos relatórios
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useCancelImport() {
  const invalidate = useInvalidateImports();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.POST("/api/v1/imports/{import_id}/cancel", { params: { path: { import_id: id } } })) as ImportOut,
    onSuccess: (job) => invalidate(job),
  });
}

/** Prévia de estrutura por IA: só preenche a revisão; nada é criado até confirmar. */
export function useSuggestStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { import_id: string } | { text: string }) =>
      unwrap(await api.POST("/api/v1/ai/suggest-structure", { body })) as SuggestStructureOut,
    onSettled: () => qc.invalidateQueries({ queryKey: importKeys.aiStatus }),
  });
}

export function isAiDisabledError(e: unknown): boolean {
  return e instanceof ApiError && (e.code === "ai_disabled" || e.status === 503);
}

/** Baixa o modelo de CSV pelo cliente autenticado e dispara o download no navegador. */
export async function downloadImportTemplate(): Promise<void> {
  const res = await rawFetch("/api/v1/imports/template.csv");
  if (!res.ok) throw new ApiError(res.status, "http_error", "Não foi possível baixar o modelo agora. Tente de novo.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-conteudo.csv";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// --- Mensagens de erro ------------------------------------------------------------

const PLAN_UNCHANGED = "Nada do seu plano foi alterado.";

/** Garante que a mensagem termine com "Nada do seu plano foi alterado." (padrão do design). */
export function withPlanUnchanged(message: string | null | undefined, fallback = "Não foi possível processar o conteúdo."): string {
  const base = (message || fallback).trim();
  if (base.toLowerCase().includes(PLAN_UNCHANGED.toLowerCase())) return base;
  return `${base.replace(/\s+$/, "")}${/[.!?]$/.test(base) ? "" : "."} ${PLAN_UNCHANGED}`;
}

export const OCR_EXPLANATION =
  "Este PDF parece ser só imagem, sem texto selecionável. O reconhecimento de texto (OCR) não está habilitado. Envie uma versão com texto pesquisável ou cole o sumário como texto.";

/** Explicação extra por código de erro (além da mensagem do servidor). */
export function importErrorHelp(code: string | null | undefined): string | null {
  switch (code) {
    case "no_text_layer":
      return OCR_EXPLANATION;
    case "csv_header":
      return "Baixe o modelo de CSV para conferir os nomes das colunas.";
    case "queue_unavailable":
      return "Enquanto isso, você pode colar o sumário como texto: esse caminho não depende da fila.";
    default:
      return null;
  }
}

export const AI_UNAVAILABLE_NOTE = "Sugestão automática de estrutura não está disponível neste ambiente.";

export function aiReasonLabel(reason: string | null | undefined): string | null {
  switch (reason) {
    case null:
    case undefined:
    case "":
    case "ai_disabled":
      return null;
    case "ai_plan":
      return "Seu plano atual não inclui sugestões automáticas.";
    case "ai_quota":
      return "Você usou todas as sugestões de hoje.";
    case "ai_budget":
      return "O limite geral de uso foi atingido por hoje.";
    default:
      return `Motivo: ${reason}.`;
  }
}

// --- Estado do editor de proposta (chaves locais estáveis para a árvore) ------------------

export interface EditorSubtopic {
  key: string;
  title: string;
  /** Texto do campo de páginas ("12" ou "12–30"); convertido ao salvar. */
  pages: string;
  estimated_minutes: number | null;
}
export interface EditorTopic extends EditorSubtopic {
  children: EditorSubtopic[];
}
export interface EditorSubject {
  key: string;
  title: string;
  topics: EditorTopic[];
}

let keySeq = 0;
export function editorKey(): string {
  keySeq += 1;
  return `k${keySeq}`;
}

export function newEditorSubtopic(title = ""): EditorSubtopic {
  return { key: editorKey(), title, pages: "", estimated_minutes: null };
}
export function newEditorTopic(title = ""): EditorTopic {
  return { ...newEditorSubtopic(title), children: [] };
}
export function newEditorSubject(title = ""): EditorSubject {
  return { key: editorKey(), title, topics: [] };
}

export function toEditor(p: Proposal): EditorSubject[] {
  return p.subjects.map((s) => ({
    key: editorKey(),
    title: s.title,
    topics: s.topics.map((t) => ({
      key: editorKey(),
      title: t.title,
      pages: fmtPages(t.page, t.page_to),
      estimated_minutes: t.estimated_minutes ?? null,
      children: t.children.map((c) => ({ key: editorKey(), title: c.title, pages: fmtPages(c.page, c.page_to), estimated_minutes: c.estimated_minutes ?? null })),
    })),
  }));
}

function fromEditorSubtopic(s: EditorSubtopic): ProposalSubtopic {
  const { page, page_to } = parsePages(s.pages);
  return { title: s.title.trim(), page, page_to, estimated_minutes: s.estimated_minutes ?? null };
}

export function fromEditor(subjects: EditorSubject[], stats?: Record<string, unknown> | null): Proposal {
  return {
    subjects: subjects.map((s) => ({
      title: s.title.trim(),
      topics: s.topics.map((t) => ({ ...fromEditorSubtopic(t), children: t.children.map(fromEditorSubtopic) })),
    })),
    stats: stats ?? null,
  };
}

export function countEditor(subjects: EditorSubject[]): { subjects: number; topics: number } {
  let topics = 0;
  for (const s of subjects) for (const t of s.topics) topics += 1 + t.children.length;
  return { subjects: subjects.length, topics };
}

/** Problemas que impedem salvar/confirmar (mensagem em pt-BR) ou null. */
export function editorProblem(subjects: EditorSubject[]): string | null {
  if (subjects.length === 0) return "A proposta está vazia. Adicione ao menos uma matéria antes de confirmar.";
  const { subjects: ns, topics } = countEditor(subjects);
  if (ns > MAX_PROPOSAL_SUBJECTS) return `A proposta tem ${ns} matérias; o limite é ${MAX_PROPOSAL_SUBJECTS}.`;
  if (topics > MAX_PROPOSAL_TOPICS) return `A proposta tem ${topics} tópicos; o limite é ${MAX_PROPOSAL_TOPICS}.`;
  for (const s of subjects) {
    if (!s.title.trim()) return "Há uma matéria sem título. Preencha ou remova a linha.";
    for (const t of s.topics) {
      if (!t.title.trim()) return `Há um tópico sem título em "${s.title.trim()}". Preencha ou remova a linha.`;
      for (const c of t.children) if (!c.title.trim()) return `Há um subtópico sem título em "${t.title.trim()}". Preencha ou remova a linha.`;
    }
  }
  return null;
}
