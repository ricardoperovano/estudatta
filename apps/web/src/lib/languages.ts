/**
 * Idiomas de um objetivo da categoria "idioma" (mesmos códigos de `app/core/languages.py`).
 * O tipo `LanguageCode` vem da API; o `Record` obriga a ter nome para todos os códigos.
 */
import type { components } from "@/api/schema";

export type LanguageCode = NonNullable<components["schemas"]["ActivityCreate"]["language"]>;

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: "Inglês",
  es: "Espanhol",
  fr: "Francês",
  de: "Alemão",
  it: "Italiano",
  ja: "Japonês",
  zh: "Chinês (mandarim)",
  ko: "Coreano",
  ru: "Russo",
  ar: "Árabe",
  bzs: "Libras (Língua Brasileira de Sinais)",
  pt: "Português",
  af: "Africâner",
  sq: "Albanês",
  am: "Amárico",
  hy: "Armênio",
  az: "Azerbaijano",
  eu: "Basco",
  bn: "Bengali",
  be: "Bielorrusso",
  my: "Birmanês",
  bs: "Bósnio",
  bg: "Búlgaro",
  yue: "Cantonês",
  ca: "Catalão",
  kk: "Cazaque",
  si: "Cingalês",
  hr: "Croata",
  ht: "Crioulo haitiano",
  ku: "Curdo",
  da: "Dinamarquês",
  sk: "Eslovaco",
  sl: "Esloveno",
  eo: "Esperanto",
  et: "Estoniano",
  fi: "Finlandês",
  gd: "Gaélico escocês",
  gl: "Galego",
  cy: "Galês",
  ka: "Georgiano",
  el: "Grego",
  gn: "Guarani",
  gu: "Guzerate",
  ha: "Hauçá",
  haw: "Havaiano",
  he: "Hebraico",
  hi: "Hindi",
  nl: "Holandês",
  hu: "Húngaro",
  ig: "Igbo",
  yi: "Iídiche",
  id: "Indonésio",
  yo: "Iorubá",
  ga: "Irlandês",
  is: "Islandês",
  km: "Khmer",
  lo: "Laosiano",
  la: "Latim",
  lv: "Letão",
  ase: "Língua de sinais americana (ASL)",
  lt: "Lituano",
  lb: "Luxemburguês",
  mk: "Macedônio",
  ms: "Malaio",
  mt: "Maltês",
  mi: "Maori",
  mr: "Marati",
  mn: "Mongol",
  nah: "Náuatle",
  ne: "Nepali",
  no: "Norueguês",
  ps: "Pachto",
  pa: "Panjabi",
  fa: "Persa",
  pl: "Polonês",
  qu: "Quíchua",
  ro: "Romeno",
  sr: "Sérvio",
  so: "Somali",
  sw: "Suaíli",
  sv: "Sueco",
  tl: "Tagalo (filipino)",
  th: "Tailandês",
  ta: "Tâmil",
  cs: "Tcheco",
  te: "Telugu",
  tr: "Turco",
  uk: "Ucraniano",
  ur: "Urdu",
  uz: "Uzbeque",
  vi: "Vietnamita",
  xh: "Xhosa",
  zu: "Zulu",
  und: "Outro idioma",
};

/** Mais procurados, na ordem em que aparecem no topo da lista. */
export const POPULAR_LANGUAGES: LanguageCode[] = ["en", "es", "fr", "de", "it", "ja", "zh", "ko", "ru", "ar", "bzs", "pt"];

/** Demais idiomas em ordem alfabética; "Outro idioma" por último. */
export const OTHER_LANGUAGES: LanguageCode[] = (Object.keys(LANGUAGE_NAMES) as LanguageCode[])
  .filter((c) => !POPULAR_LANGUAGES.includes(c) && c !== "und")
  .sort((a, b) => LANGUAGE_NAMES[a].localeCompare(LANGUAGE_NAMES[b], "pt-BR"))
  .concat("und");

export function languageName(code: string | null | undefined): string | null {
  return code && code in LANGUAGE_NAMES ? LANGUAGE_NAMES[code as LanguageCode] : null;
}

/** Nome curto para títulos ("Libras (Língua Brasileira de Sinais)" vira "Libras"). */
export function languageShortName(code: string | null | undefined): string | null {
  const n = languageName(code);
  return n ? n.replace(/\s*\(.*\)$/, "") : null;
}
