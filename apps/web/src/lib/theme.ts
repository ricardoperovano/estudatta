/**
 * Tema do app. Padrão: claro (igual ao site). "Sistema" acompanha o aparelho; "Escuro" é opcional.
 * A escolha vale na hora neste aparelho (localStorage) e fica salva na conta para os outros.
 */
export type Theme = "system" | "dark" | "light";

const KEY = "estudatta.theme";
export const DEFAULT_THEME: Theme = "light";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* sem storage */
  }
  return null;
}

export function readTheme(): Theme {
  return stored() ?? DEFAULT_THEME;
}

/** A pessoa já escolheu um tema neste aparelho? */
export function hasStoredTheme(): boolean {
  return stored() !== null;
}

export function isDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark(theme) ? "#161826" : "#f3f5fe");
  listeners.forEach((l) => l());
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

const listeners = new Set<() => void>();
/** Para useSyncExternalStore: avisa quando o tema muda. */
export function subscribeTheme(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
