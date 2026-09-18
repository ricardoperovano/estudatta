/** Registro do service worker com atualização em momento seguro (nunca durante sessão ativa). */
import { Workbox } from "workbox-window";
import { create } from "zustand";

interface PwaState {
  updateReady: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  apply: () => void;
  set: (p: Partial<PwaState>) => void;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export const usePwaStore = create<PwaState>((set) => ({
  updateReady: false,
  installPrompt: null,
  apply: () => {},
  set: (p) => set(p),
}));

export function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  const wb = new Workbox("/sw.js", { scope: "/" });
  const set = usePwaStore.getState().set;
  wb.addEventListener("waiting", () => {
    set({
      updateReady: true,
      apply: () => {
        wb.addEventListener("controlling", () => window.location.reload());
        wb.messageSkipWaiting();
      },
    });
  });
  wb.register().catch(() => {
    /* sem SW: o app continua funcionando online */
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    set({ installPrompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => set({ installPrompt: null }));
}
