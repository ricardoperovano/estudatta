/// <reference lib="webworker" />
/**
 * Service worker: precache do shell e assets versionados (Workbox injectManifest),
 * cache leve para respostas privadas de leitura (network-first, curta duração),
 * notificações push e clique. Não cacheia mutações nem arquivos de materiais.
 */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Todas as navegações do domínio do app usam o shell (SPA); a API nunca é navegação
const handler = createHandlerBoundToURL("/index.html");
registerRoute(new NavigationRoute(handler, { denylist: [/^\/api\//] }));

// Leituras da API: rede primeiro; cache curto só para GETs de leitura do plano (nunca auth/billing/arquivos)
registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    url.pathname.startsWith("/api/v1/") &&
    /^\/api\/v1\/(dashboard|activities|tasks|calendar|reports|notifications|materials|subjects)/.test(url.pathname) &&
    !url.pathname.startsWith("/api/v1/files"),
  new NetworkFirst({
    cacheName: "estudatta-api-read",
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 })],
  }),
);

// Fontes/ícones
registerRoute(
  ({ request }) => request.destination === "font" || request.destination === "image",
  new CacheFirst({ cacheName: "estudatta-static", plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
);

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string; data?: unknown } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { title: "Estudatta", body: event.data?.text() || "" };
  }
  const title = data.title || "Estudatta";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/marca/icon-192.png",
      badge: "/marca/favicon-32.png",
      tag: data.tag || "estudatta",
      data: { url: data.url || "/app", ...(typeof data.data === "object" ? data.data : {}) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("pushsubscriptionchange", () => {
  // O app renova a assinatura ao abrir (ver src/app/push.ts)
});
