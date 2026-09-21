/**
 * Web Push: pede permissão só após ação explícita, obtém a chave pública do servidor
 * (404 = push não configurado) e registra a assinatura. No iOS/iPadOS 16.4+ só funciona
 * com o app adicionado à tela inicial. Não promete alarme exato nem execução permanente.
 */
import { rawJson, ApiError } from "@/api/client";
import { isIOS, isStandalone, supportsPush } from "@/lib/device";

export type PushState =
  "unsupported" | "ios-needs-install" | "server-disabled" | "denied" | "default" | "granted";

export async function pushState(): Promise<PushState> {
  if (!supportsPush()) return isIOS() && !isStandalone() ? "ios-needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    await rawJson<{ public_key: string }>("/api/v1/notifications/push/vapid-public-key");
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return "server-disabled";
    if (e instanceof ApiError && e.status === 0)
      return Notification.permission === "granted" ? "granted" : "default";
    return "server-disabled";
  }
  return Notification.permission === "granted" ? "granted" : "default";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Deve ser chamado a partir de um clique do usuário. */
export async function subscribeToPush(): Promise<PushState> {
  const state = await pushState();
  if (state !== "default" && state !== "granted") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "default";
  const { public_key } = await rawJson<{ public_key: string }>("/api/v1/notifications/push/vapid-public-key");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
    });
  }
  const json = sub.toJSON();
  await rawJson("/api/v1/notifications/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      user_agent: navigator.userAgent,
    }),
  });
  return "granted";
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!supportsPush()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try {
    await rawJson("/api/v1/notifications/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } finally {
    await sub.unsubscribe();
  }
}

/** Renova a assinatura no servidor ao abrir o app (cobre `pushsubscriptionchange`). */
export async function refreshPushSubscription(): Promise<void> {
  if (!supportsPush() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    await rawJson("/api/v1/notifications/push/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        user_agent: navigator.userAgent,
      }),
    });
  } catch {
    /* silencioso: tenta de novo na próxima abertura */
  }
}
