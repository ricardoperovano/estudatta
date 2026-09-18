/** Central de notificações: lista, marcar como lida, ler todas e adiar lembretes. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { settingsKeys } from "./settings";
import type { components } from "./schema";

type S = components["schemas"];
export type NotificationItem = S["NotificationOut"];
export type NotificationList = S["NotificationListOut"];

export const inboxKeys = {
  all: ["notifications"] as const,
  list: (unreadOnly: boolean, limit: number) => ["notifications", "list", unreadOnly, limit] as const,
};

export function useNotificationList(unreadOnly: boolean, limit: number) {
  return useQuery({
    queryKey: inboxKeys.list(unreadOnly, limit),
    queryFn: async () => unwrap(await api.GET("/api/v1/notifications", { params: { query: { limit, offset: 0, unread_only: unreadOnly } } })) as NotificationList,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.POST("/api/v1/notifications/{notification_id}/read", { params: { path: { notification_id: id } } })) as NotificationItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/notifications/read-all")),
    onSuccess: () => qc.invalidateQueries({ queryKey: inboxKeys.all }),
  });
}

/** Adia os próximos lembretes (não apaga nada da central). */
export function useSnoozeReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (minutes: number) => unwrap(await api.POST("/api/v1/notifications/snooze", { body: { minutes } })),
    onSuccess: (prefs) => qc.setQueryData(settingsKeys.notificationPrefs, prefs),
  });
}
