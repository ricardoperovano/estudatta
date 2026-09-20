/** Tatá: situação das cotas (conversa e voz), conversa com IA e voz natural (MP3). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rawFetch, unwrap, ApiError } from "./client";
import type { components } from "./schema";

type S = components["schemas"];
export type TataStatus = S["TataStatusOut"];
export type TataChatOut = S["ChatOut"];
export type TataHistoryItem = S["HistoryItem"];
export type TataChatReason = "ai_disabled" | "ai_plan" | "ai_quota" | "ai_monthly_quota" | "ai_budget";

export const tataKeys = {
  status: ["tata", "status"] as const,
};

export function useTataStatus(enabled = true) {
  return useQuery({
    queryKey: tataKeys.status,
    queryFn: async () => unwrap(await api.GET("/api/v1/tata/status")) as TataStatus,
    staleTime: 60_000,
    enabled,
  });
}

/** Uma mensagem para o Tatá (conta uma ação de IA). A resposta já traz as cotas atualizadas. */
export function useTataChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { message: string; history: TataHistoryItem[] }) => unwrap(await api.POST("/api/v1/tata/chat", { body })) as TataChatOut,
    onSuccess: (data) => qc.setQueryData(tataKeys.status, data.status),
    onError: () => qc.invalidateQueries({ queryKey: tataKeys.status }),
  });
}

/** Códigos em que a voz natural não veio e o app usa o sintetizador do aparelho, em silêncio. */
export const VOICE_FALLBACK_CODES: readonly string[] = ["voice_plan", "voice_quota", "voice_budget", "voice_disabled", "voice_unavailable"];

/** MP3 da fala pela ElevenLabs. Lança ApiError com o código do servidor quando não há voz natural. */
export async function fetchTataVoice(text: string): Promise<Blob> {
  const res = await rawFetch("/api/v1/tata/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    let code = "http_error";
    let msg = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code || code;
      msg = body.error?.message || msg;
    } catch {
      /* corpo vazio */
    }
    throw new ApiError(res.status, code, msg);
  }
  return res.blob();
}

/** Texto honesto para o motivo de a conversa estar indisponível. */
export function tataChatReasonText(reason: string | null | undefined): string | null {
  switch (reason) {
    case "ai_disabled":
      return "A conversa com o Tatá ainda não está disponível neste ambiente.";
    case "ai_plan":
      return "A conversa com o Tatá faz parte dos planos Essencial e Completo.";
    case "ai_quota":
      return "Você usou as conversas de hoje. Amanhã a cota renova.";
    case "ai_monthly_quota":
      return "Você usou as conversas deste mês. A cota renova no dia 1º.";
    case "ai_budget":
      return "O limite geral de uso foi atingido por hoje. Amanhã tentamos de novo.";
    default:
      return reason ? "A conversa com o Tatá não está disponível agora." : null;
  }
}
