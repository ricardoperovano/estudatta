import { useQuery } from "@tanstack/react-query";
import { rawJson } from "./client";
import { useUser } from "./session";

export function useUnreadCount(): number {
  const user = useUser();
  const q = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => rawJson<{ count: number }>("/api/v1/notifications/unread-count").catch(() => ({ count: 0 })),
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  return q.data?.count ?? 0;
}
