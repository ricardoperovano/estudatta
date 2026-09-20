/**
 * Registro do service worker e atualização do app.
 *
 * Como o app instalado guarda a versão anterior, a troca precisa ser ativa:
 * - procura versão nova ao abrir, sempre que o app volta para a frente e a cada 15 min;
 * - quando uma versão nova está pronta, aplica sozinho se for seguro (sem sessão de estudo em
 *   andamento, sem diálogo aberto, fora do cronômetro): salva a rota e recarrega;
 * - durante uma sessão ou com algo aberto, mostra a faixa "Atualizar agora" e aplica na próxima
 *   janela segura (ao voltar para o Hoje, por exemplo).
 */
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

const CHECK_EVERY_MS = 15 * 60_000;

/** Pode recarregar agora sem atrapalhar? (sem cronômetro ativo, sem diálogo, fora da sessão) */
export function safeToReload(): boolean {
  if (typeof document === "undefined") return false;
  if (location.pathname.startsWith("/app/sessao")) return false;
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
  // algo digitado e não enviado (campos de texto com valor)
  const typed = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")).some(
    (el) => !["checkbox", "radio", "hidden", "submit", "button", "file", "range"].includes((el as HTMLInputElement).type) && el.value.trim() !== "" && el.value !== el.defaultValue,
  );
  if (typed) return false;
  try {
    // cronômetro persistido neste aparelho (ver app/timer/store.ts / offline/db.ts)
    if (localStorage.getItem("estudatta.timer_active") === "1") return false;
  } catch {
    /* sem storage */
  }
  return true;
}

export function registerServiceWorker() {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;
  const wb = new Workbox("/sw.js", { scope: "/" });
  const set = usePwaStore.getState().set;
  let pendingTimer: number | null = null;

  const reload = () => window.location.reload();
  /** versão nova esperando: manda ativar; ao assumir a página ("controlling"), recarrega */
  const apply = () => wb.messageSkipWaiting();
  const whenSafe = (fn: () => void) => {
    if (safeToReload()) return fn();
    if (pendingTimer !== null) return;
    // tenta de novo em breve: ao sair do cronômetro ou fechar o diálogo, aplica
    pendingTimer = window.setInterval(() => {
      if (safeToReload()) {
        if (pendingTimer !== null) window.clearInterval(pendingTimer);
        pendingTimer = null;
        fn();
      }
    }, 10_000);
  };

  wb.addEventListener("waiting", () => {
    set({ updateReady: true, apply });
    whenSafe(apply);
  });
  // a versão nova assumiu esta página (após skipWaiting, ou sozinha quando não havia aba
  // controlada): os arquivos em memória são os antigos, então recarrega em momento seguro
  wb.addEventListener("controlling", (e) => {
    // isUpdate: já havia SW ao registrar; isExternal: versão encontrada depois (wb.update, outra aba).
    // Sem os dois é a primeira instalação assumindo a página: nada a recarregar.
    if (!e.isUpdate && !e.isExternal) return;
    set({ updateReady: true, apply: reload });
    whenSafe(reload);
  });
  wb.register()
    .then(() => {
      // versão nova ao voltar para a frente e de tempos em tempos
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void wb.update().catch(() => undefined);
      });
      window.setInterval(() => void wb.update().catch(() => undefined), CHECK_EVERY_MS);
    })
    .catch(() => {
      /* sem SW: o app continua funcionando online */
    });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    set({ installPrompt: e as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => set({ installPrompt: null }));
}
