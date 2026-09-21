/** Sessões registradas no intervalo do plano (para mostrar "registrado" na agenda). */
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import type { StudySession } from "./types";

export function useRangeSessions(start: string, end: string, activityId?: string | null) {
  return useQuery({
    // prefixo "sessions": invalidado junto com os registros de tempo
    queryKey: ["sessions", "range", start, end, activityId ?? null] as const,
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/sessions", {
          params: { query: { start, end, activity_id: activityId ?? null, limit: 200 } },
        }),
      ) as StudySession[],
    staleTime: 15_000,
  });
}
