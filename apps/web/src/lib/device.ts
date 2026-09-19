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

/** O app está aberto como app instalado (tela inicial / janela própria), não numa aba do navegador. */
export function isStandalone(win: Pick<Window, "matchMedia" | "navigator"> | undefined = typeof window === "undefined" ? undefined : window): boolean {
  if (!win) return false;
  try {
    if (win.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (win.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
  } catch {
    /* matchMedia indisponível */
  }
  return (win.navigator as unknown as { standalone?: boolean } | undefined)?.standalone === true;
}

/** Dados do navegador usados na detecção. Tudo opcional para facilitar testes. */
export interface DeviceHints {
  /** `navigator.platform` (o iPadOS em modo desktop se apresenta como "MacIntel"). */
  platform?: string;
  /** `navigator.maxTouchPoints` (distingue iPad de Mac). */
  maxTouchPoints?: number;
}

function currentUA(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent || "";
}

function currentHints(): DeviceHints {
  if (typeof navigator === "undefined") return {};
  return { platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints };
}

/** iPhone, iPod ou iPad (inclusive iPad em modo desktop, que finge ser Mac). */
export function isIOS(ua: string = currentUA(), hints: DeviceHints = currentHints()): boolean {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  const macLike = /Macintosh/.test(ua) || hints.platform === "MacIntel";
  return macLike && (hints.maxTouchPoints ?? 0) > 1;
}

function parseVer(v: string | undefined): number | null {
  if (!v) return null;
  const [maj, min = "0"] = v.split(/[._]/);
  const n = Number(maj) + Number(min.padStart(2, "0").slice(0, 2)) / 100;
  return Number.isFinite(n) ? n : null;
}

/**
 * Versão do iOS/iPadOS como número (16.4 → 16.04; 17.10 → 17.10), ou null se não for iOS.
 * Usa o maior entre "OS x_y" e "Version/x.y": o iOS 26 congela o "OS 18_6" no UA, mas o
 * Safari informa a versão real em "Version/".
 */
export function iosVersion(ua: string = currentUA(), hints: DeviceHints = currentHints()): number | null {
  if (!isIOS(ua, hints)) return null;
  const os = parseVer(/OS (\d+[_.]\d+)/.exec(ua)?.[1] ?? /OS (\d+) like/.exec(ua)?.[1]);
  const safari = /(?:CriOS|FxiOS|EdgiOS)/.test(ua) ? null : parseVer(/Version\/(\d+(?:\.\d+)?)/.exec(ua)?.[1]);
  const macOs = /Macintosh/.test(ua) ? null : os; // iPad em modo desktop traz "Mac OS X 10_15"
  const v = Math.max(macOs ?? 0, safari ?? 0);
  return v > 0 ? v : null;
}

/** Web Push no iPhone/iPad exige iOS/iPadOS 16.4+ (e o app instalado na tela inicial). */
export function iosSupportsWebPush(ua: string = currentUA(), hints: DeviceHints = currentHints()): boolean {
  const v = iosVersion(ua, hints);
  return v !== null && v >= 16.04;
}

/**
 * Como instalar neste navegador:
 * - `ios-safari`: Compartilhar → Adicionar à Tela de Início.
 * - `ios-other`: Chrome/Firefox/Edge no iOS 16.4+ (também pelo menu Compartilhar).
 * - `ios-other-legacy`: outro navegador em iOS < 16.4 (só o Safari consegue adicionar).
 * - `android-chrome` / `android-samsung` / `android-firefox` / `android-other`.
 * - `desktop-chromium`: Chrome, Edge, Opera, Brave (convite nativo / ícone na barra).
 * - `desktop-safari`: Safari 17+ no macOS Sonoma (Arquivo → Adicionar ao Dock).
 * - `desktop-other`: Firefox no computador, Safari antigo etc. (não instala).
 * - `in-app`: navegador embutido (Instagram, Facebook, TikTok…): precisa abrir no navegador.
 */
export type InstallPlatform =
  | "ios-safari"
  | "ios-other"
  | "ios-other-legacy"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "android-other"
  | "desktop-chromium"
  | "desktop-safari"
  | "desktop-other"
  | "in-app";

export type PlatformGroup = "ios" | "android" | "desktop";

export interface InstallEnv {
  platform: InstallPlatform;
  group: PlatformGroup;
  /** Celular ou tablet. */
  mobile: boolean;
  /** Nome amigável do navegador ("Safari", "Chrome"…). */
  browser: string;
  /** Versão do iOS (16.04 = 16.4) ou null. */
  iosVersion: number | null;
  /** No iOS: a versão recebe lembretes (push) depois de instalado. Fora do iOS: true. */
  pushCapable: boolean;
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Pinterest/i;

export function isInAppBrowser(ua: string = currentUA()): boolean {
  return IN_APP.test(ua) || /; wv\)/.test(ua);
}

export function isAndroid(ua: string = currentUA()): boolean {
  return /Android/i.test(ua);
}

/** Detecta plataforma e navegador para escolher as instruções de instalação. Função pura. */
export function detectInstallEnv(ua: string = currentUA(), hints: DeviceHints = currentHints()): InstallEnv {
  const ios = isIOS(ua, hints);
  const android = !ios && isAndroid(ua);
  const iv = ios ? iosVersion(ua, hints) : null;
  const pushCapable = ios ? iv !== null && iv >= 16.04 : true;
  const group: PlatformGroup = ios ? "ios" : android ? "android" : "desktop";
  const base = { group, mobile: ios || android, iosVersion: iv, pushCapable };

  if ((ios || android) && isInAppBrowser(ua)) return { ...base, platform: "in-app", browser: "navegador do app" };

  if (ios) {
    const other = /CriOS/.test(ua) ? "Chrome" : /FxiOS/.test(ua) ? "Firefox" : /EdgiOS/.test(ua) ? "Edge" : /OPiOS|OPT\//.test(ua) ? "Opera" : /DuckDuckGo/.test(ua) ? "DuckDuckGo" : /GSA\//.test(ua) ? "Google" : null;
    if (!other) return { ...base, platform: "ios-safari", browser: "Safari" };
    return { ...base, platform: pushCapable ? "ios-other" : "ios-other-legacy", browser: other };
  }

  if (android) {
    if (/SamsungBrowser/.test(ua)) return { ...base, platform: "android-samsung", browser: "Samsung Internet" };
    if (/Firefox\//.test(ua)) return { ...base, platform: "android-firefox", browser: "Firefox" };
    if (/EdgA\//.test(ua)) return { ...base, platform: "android-other", browser: "Edge" };
    if (/OPR\/|Opera/.test(ua)) return { ...base, platform: "android-other", browser: "Opera" };
    if (/Chrome\//.test(ua)) return { ...base, platform: "android-chrome", browser: "Chrome" };
    return { ...base, platform: "android-other", browser: "navegador" };
  }

  if (/Edg\//.test(ua)) return { ...base, platform: "desktop-chromium", browser: "Edge" };
  if (/OPR\//.test(ua)) return { ...base, platform: "desktop-chromium", browser: "Opera" };
  if (/Firefox\//.test(ua)) return { ...base, platform: "desktop-other", browser: "Firefox" };
  if (/Chrome\/|Chromium\//.test(ua)) return { ...base, platform: "desktop-chromium", browser: "Chrome" };
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) {
    const v = parseVer(/Version\/(\d+(?:\.\d+)?)/.exec(ua)?.[1]) ?? 0;
    return { ...base, platform: v >= 17 ? "desktop-safari" : "desktop-other", browser: "Safari" };
  }
  return { ...base, platform: "desktop-other", browser: "navegador" };
}

/** Plataforma de instalação deste navegador (atalho de `detectInstallEnv`). */
export function detectInstallPlatform(ua: string = currentUA(), hints: DeviceHints = currentHints()): InstallPlatform {
  return detectInstallEnv(ua, hints).platform;
}

export function supportsPush(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
