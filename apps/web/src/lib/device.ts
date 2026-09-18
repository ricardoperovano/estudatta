import { uuid } from "./utils";

const KEY = "estudatta.device_id";

/** Identificador estável deste aparelho/navegador (não é credencial). */
export function deviceId(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = uuid();
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return "sem-storage";
  }
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function supportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
