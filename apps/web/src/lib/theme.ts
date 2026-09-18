export type Theme = "system" | "dark" | "light";

const KEY = "estudatta.theme";

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {
    /* sem storage */
  }
  return "system";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  meta?.setAttribute("content", dark ? "#161826" : "#f3f5fe");
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}
