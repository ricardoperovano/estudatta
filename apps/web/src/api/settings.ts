/** Preferências, lembretes, conta, sessões ativas, push e dados do usuário. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, rawJson, unwrap, ApiError, API_BASE } from "./client";
import { sessionKey } from "./session";
import type { components } from "./schema";
import type { User } from "./types";
import { downloadFile } from "./reports";

export type Preferences = components["schemas"]["PreferencesOut"];
export type PreferencesUpdate = components["schemas"]["PreferencesUpdate"];
export type NotificationPrefs = components["schemas"]["NotificationPreferencesOut"];
export type NotificationPrefsUpdate = components["schemas"]["NotificationPreferencesUpdate"];
export type AuthSessionOut = components["schemas"]["AuthSessionOut"];
export type Tone = "acolhedor" | "direto" | "firme";
export type PreviewKind = components["schemas"]["PreviewIn"]["kind"];

export const settingsKeys = {
  preferences: ["me", "preferences"] as const,
  notificationPrefs: ["notifications", "preferences"] as const,
  preview: (tone: string, kind: string) => ["notifications", "preview", tone, kind] as const,
  authSessions: ["auth", "sessions"] as const,
};

export function usePreferences() {
  return useQuery({
    queryKey: settingsKeys.preferences,
    queryFn: async () => unwrap(await api.GET("/api/v1/me/preferences")) as Preferences,
    staleTime: 60_000,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: PreferencesUpdate) => unwrap(await api.PATCH("/api/v1/me/preferences", { body })) as Preferences,
    onSuccess: (data) => qc.setQueryData(settingsKeys.preferences, data),
  });
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: settingsKeys.notificationPrefs,
    queryFn: async () => unwrap(await api.GET("/api/v1/notifications/preferences")) as NotificationPrefs,
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: NotificationPrefsUpdate) => unwrap(await api.PATCH("/api/v1/notifications/preferences", { body })) as NotificationPrefs,
    onSuccess: (data) => qc.setQueryData(settingsKeys.notificationPrefs, data),
  });
}

export function useNotificationPreview(tone: Tone, kind: PreviewKind = "planned_start") {
  return useQuery({
    queryKey: settingsKeys.preview(tone, kind),
    queryFn: async () => unwrap(await api.POST("/api/v1/notifications/preview", { body: { tone, kind } })),
    staleTime: 10 * 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: components["schemas"]["ProfileUpdate"]) => unwrap(await api.PATCH("/api/v1/me", { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blob: Blob) => {
      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
      return rawJson<User>("/api/v1/me/avatar", { method: "PUT", body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}

export function useDeleteAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => rawJson<User>("/api/v1/me/avatar", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}

/** URL da foto da conta (muda a cada troca; o navegador guarda em cache). `null` sem foto. */
export function avatarUrl(user: { avatar_version?: number | null } | null | undefined): string | null {
  return user?.avatar_version ? `${API_BASE}/api/v1/me/avatar?v=${user.avatar_version}` : null;
}

export function useResendVerification() {
  return useMutation({ mutationFn: async () => unwrap(await api.POST("/api/v1/auth/resend-verification")) });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: components["schemas"]["ChangePasswordRequest"]) => unwrap(await api.POST("/api/v1/auth/change-password", { body })),
  });
}

export function useAuthSessions() {
  return useQuery({
    queryKey: settingsKeys.authSessions,
    queryFn: async () => unwrap(await api.GET("/api/v1/auth/sessions")) as AuthSessionOut[],
    staleTime: 30_000,
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await api.DELETE("/api/v1/auth/sessions/{session_id}", { params: { path: { session_id: id } } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.authSessions }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/auth/sessions/revoke-others")),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.authSessions }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (body: { confirm: "EXCLUIR"; password: string | null }) => unwrap(await api.POST("/api/v1/me/delete", { body })),
  });
}

export function exportMyData(format: "json" | "csv") {
  return format === "json" ? downloadFile("/api/v1/me/export", "estudatta-export.json") : downloadFile("/api/v1/me/export.csv", "estudatta-historico.csv");
}

// --- Push ---------------------------------------------------------------------------------

export type PushServerState = { kind: "ok"; key: string } | { kind: "disabled"; message: string };

/** Chave pública do servidor; 404 = push ainda não configurado (estado honesto, não erro). */
export async function getVapidPublicKey(): Promise<PushServerState> {
  try {
    const res = unwrap(await api.GET("/api/v1/notifications/push/vapid-public-key"));
    return res.public_key ? { kind: "ok", key: res.public_key } : { kind: "disabled", message: "O servidor ainda não tem o envio de notificações configurado." };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { kind: "disabled", message: e.message || "O servidor ainda não tem o envio de notificações configurado." };
    throw e;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  const reg = await getServiceWorkerRegistration();
  if (!reg || !("pushManager" in reg)) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Assina push neste aparelho e registra no servidor. Pressupõe permissão concedida. */
export async function subscribePush(publicKey: string): Promise<PushSubscription> {
  const reg = await getServiceWorkerRegistration();
  if (!reg) throw new ApiError(0, "no_service_worker", "O app ainda não está pronto para receber avisos em segundo plano neste navegador. Recarregue a página e tente de novo.");
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
  const json = sub.toJSON();
  await rawJson("/api/v1/notifications/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, user_agent: navigator.userAgent.slice(0, 250) }),
  });
  return sub;
}

export async function unsubscribePush(): Promise<void> {
  const sub = await getCurrentPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try {
    await sub.unsubscribe();
  } catch {
    /* segue para remover no servidor */
  }
  await rawJson("/api/v1/notifications/push/subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint }) });
}

export async function sendTestPush(): Promise<string> {
  const res = unwrap(await api.POST("/api/v1/notifications/push/test"));
  return res.message;
}
