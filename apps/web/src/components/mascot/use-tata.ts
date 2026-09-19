/** Preferências do Tatá: ligado/desligado (conta), falas silenciadas (aparelho) e tom (lembretes). */
import * as React from "react";
import { useNotificationPrefs, usePreferences } from "@/api/settings";
import type { TataTone } from "./tata-messages";

const MUTE_KEY = "estudatta.tata.muted";
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTataMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTataPrefs(): { enabled: boolean; muted: boolean; tone: TataTone } {
  const prefs = usePreferences();
  const notif = useNotificationPrefs();
  const muted = React.useSyncExternalStore(subscribe, readMuted, () => false);
  const tone = ((notif.data as { tone?: string } | undefined)?.tone as TataTone | undefined) ?? "acolhedor";
  return { enabled: prefs.data?.mascot_enabled ?? true, muted, tone };
}

function reducedMotionNow() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
      mq?.addEventListener?.("change", cb);
      return () => mq?.removeEventListener?.("change", cb);
    },
    reducedMotionNow,
    () => false,
  );
}
