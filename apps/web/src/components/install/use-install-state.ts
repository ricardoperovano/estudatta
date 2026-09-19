/**
 * Estado de instalação do app neste aparelho: já instalado (standalone), plataforma detectada,
 * convite nativo disponível (`beforeinstallprompt`, guardado em `usePwaStore`) e o "agora não"
 * do banner (vale 14 dias, guardado no localStorage).
 */
import * as React from "react";
import { create } from "zustand";
import { detectInstallEnv, isStandalone, type InstallEnv, type InstallPlatform, type PlatformGroup } from "@/lib/device";
import { usePwaStore } from "@/pwa/register";

const DISMISS_KEY = "estudatta.install_banner_dismissed_at";
export const INSTALL_DISMISS_DAYS = 14;
const DISMISS_MS = INSTALL_DISMISS_DAYS * 24 * 60 * 60 * 1000;

function readDismissedAt(): number | null {
  try {
    const v = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

interface InstallUiState {
  dismissedAt: number | null;
  /** O convite nativo foi aceito nesta aba (o app foi instalado, mas esta aba ainda é o navegador). */
  installedNow: boolean;
  set: (p: Partial<Omit<InstallUiState, "set">>) => void;
}

const useInstallUi = create<InstallUiState>((set) => ({
  dismissedAt: typeof window === "undefined" ? null : readDismissedAt(),
  installedNow: false,
  set: (p) => set(p),
}));

if (typeof window !== "undefined") {
  window.addEventListener("appinstalled", () => useInstallUi.getState().set({ installedNow: true }));
}

function subscribeDisplayMode(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

/** "Agora não" vale 14 dias; datas absurdas (relógio adiantado) não prendem o banner para sempre. */
export function isDismissed(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null) return false;
  const age = now - dismissedAt;
  return age < DISMISS_MS && age > -DISMISS_MS;
}

export type PromptOutcome = "accepted" | "dismissed" | "unavailable";

export interface InstallState {
  /** Aberto como app instalado (tela inicial / janela própria). */
  installed: boolean;
  /** Acabou de instalar pelo convite nativo nesta aba (ainda no navegador). */
  installedNow: boolean;
  platform: InstallPlatform;
  group: PlatformGroup;
  env: InstallEnv;
  /** O navegador ofereceu o convite nativo (Chrome/Edge/Samsung no Android e no computador). */
  canPrompt: boolean;
  /** Abre o convite nativo. Deve ser chamado a partir de um clique. */
  promptInstall: () => Promise<PromptOutcome>;
  /** A pessoa tocou "agora não" no banner nos últimos 14 dias. */
  dismissed: boolean;
  dismiss: () => void;
}

export function useInstallState(): InstallState {
  const installPrompt = usePwaStore((s) => s.installPrompt);
  const setPwa = usePwaStore((s) => s.set);
  const { dismissedAt, installedNow, set } = useInstallUi();
  const installed = React.useSyncExternalStore(subscribeDisplayMode, () => isStandalone(), () => false);
  const env = React.useMemo(() => detectInstallEnv(), []);
  // relógio lido uma vez por montagem (render puro)
  const [now] = React.useState(() => Date.now());

  const promptInstall = React.useCallback(async (): Promise<PromptOutcome> => {
    if (!installPrompt) return "unavailable";
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      // o evento só pode ser usado uma vez
      setPwa({ installPrompt: null });
      if (choice.outcome === "accepted") set({ installedNow: true });
      return choice.outcome;
    } catch {
      setPwa({ installPrompt: null });
      return "unavailable";
    }
  }, [installPrompt, setPwa, set]);

  const dismiss = React.useCallback(() => {
    const at = Date.now();
    try {
      localStorage.setItem(DISMISS_KEY, String(at));
    } catch {
      /* sem storage: vale só nesta sessão */
    }
    set({ dismissedAt: at });
  }, [set]);

  return {
    installed,
    installedNow,
    platform: env.platform,
    group: env.group,
    env,
    canPrompt: !!installPrompt,
    promptInstall,
    dismissed: isDismissed(dismissedAt, now),
    dismiss,
  };
}
