/**
 * Idioma da interface. As chaves são o próprio texto em pt-BR (fallback), e `en.json` traz a
 * tradução. Uso: `import { t } from "@/i18n"` — inclusive em constantes de módulo, porque este
 * módulo inicializa o i18next de forma síncrona antes de qualquer outro código rodar.
 *
 * Trocar o idioma recarrega a página (`setLocale`): textos em constantes e no service worker
 * não observam mudanças em tempo de execução, e recarregar é mais simples do que garantir isso.
 */
import i18next from "i18next";
import en from "./en.json";

export const LOCALES = ["pt-BR", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_LABELS: Record<Locale, string> = { "pt-BR": "Português (Brasil)", en: "English" };

const STORAGE_KEY = "estudatta.locale";

export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.startsWith("pt")) return "pt-BR";
  if (v.startsWith("en")) return "en";
  return null;
}

function stored(): Locale | null {
  try {
    return normalizeLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function fromBrowser(): Locale {
  // nos testes o jsdom se apresenta em en-US; a suíte é escrita em pt-BR
  if (import.meta.env.MODE === "test") return "pt-BR";
  if (typeof navigator === "undefined") return "pt-BR";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    const n = normalizeLocale(l);
    if (n) return n;
  }
  return "pt-BR";
}

/** Idioma em uso nesta carga da página. */
export const locale: Locale = stored() ?? fromBrowser();

void i18next.init({
  lng: locale,
  fallbackLng: "pt-BR",
  resources: { en: { translation: en } },
  keySeparator: false,
  nsSeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

if (typeof document !== "undefined") document.documentElement.lang = locale;

/** Tradução: `t("Texto em português")` ou `t("{{n}} min", { n })`. */
export const t = (key: string, values?: Record<string, unknown>): string =>
  i18next.t(key, values ?? {}) as string;

/** Grava a escolha e recarrega para aplicar em toda a interface. */
export function setLocale(next: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* sem storage: vale só até fechar */
  }
  if (next !== locale) location.reload();
}

/** Alinha o aparelho ao idioma salvo na conta (chamado quando a sessão carrega). */
export function syncLocaleFromAccount(accountLocale: string | null | undefined) {
  const n = normalizeLocale(accountLocale);
  if (!n) return;
  if (n !== locale && !stored()) setLocale(n);
  else if (n !== locale && stored() !== n) setLocale(n);
}

/** Locale para Intl/date-fns. */
export const intlLocale = locale === "en" ? "en-US" : "pt-BR";
