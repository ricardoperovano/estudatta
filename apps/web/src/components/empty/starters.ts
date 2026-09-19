/**
 * Modelos de objetivo (tela Objetivos vazia) e os parâmetros de URL que o formulário
 * /app/objetivos/novo entende para já abrir preenchido.
 */
import {
  BookOpenText,
  Exam,
  GraduationCap,
  ListChecks,
  MusicNotes,
  Translate,
  type Icon,
} from "@phosphor-icons/react";
import { CATEGORY_OPTIONS } from "@/api/activity-settings";
import type { components } from "@/api/schema";
import { DEFAULT_LANGUAGE, LANGUAGE_NAMES, languageShortName, type LanguageCode } from "@/lib/languages";

type Body = components["schemas"]["ActivityCreate"];
type Mode = Body["tracking_mode"];

export interface Starter {
  key: string;
  title: string;
  /** "30 min · seg a sex" */
  meta: string;
  hint: string;
  icon: Icon;
  tint: string;
  params: {
    nome?: string;
    categoria: string;
    idioma?: string;
    minutos?: number;
    dias?: number[];
    modo?: "time" | "checklist" | "mixed";
  };
}

const WEEKDAYS = [0, 1, 2, 3, 4];
const ALL = [0, 1, 2, 3, 4, 5, 6];

export const STARTERS: Starter[] = [
  {
    key: "idioma",
    title: "Idioma",
    meta: "30 min · seg a sex",
    hint: "Inglês, espanhol, Libras…",
    icon: Translate,
    tint: "bg-accent-900 text-accent",
    params: { nome: "Inglês", categoria: "idioma", idioma: "en", minutos: 30, dias: WEEKDAYS },
  },
  {
    key: "concurso",
    title: "Concurso",
    meta: "2h · seg a sáb",
    hint: "Edital, matérias e simulados",
    icon: Exam,
    tint: "bg-warning-tint text-pending",
    params: { categoria: "concurso", minutos: 120, dias: [0, 1, 2, 3, 4, 5] },
  },
  {
    key: "faculdade",
    title: "Faculdade",
    meta: "1h · seg a sex",
    hint: "Disciplinas, provas e trabalhos",
    icon: GraduationCap,
    tint: "bg-info-tint text-info",
    params: { categoria: "faculdade", minutos: 60, dias: WEEKDAYS, modo: "mixed" },
  },
  {
    key: "leitura",
    title: "Leitura",
    meta: "20 min · todo dia",
    hint: "Um livro por vez, sem pressa",
    icon: BookOpenText,
    tint: "bg-success-tint text-success",
    params: { nome: "Leitura", categoria: "leitura", minutos: 20, dias: ALL },
  },
  {
    key: "pratica",
    title: "Instrumento",
    meta: "30 min · 3×/sem",
    hint: "Violão, piano, desenho…",
    icon: MusicNotes,
    tint: "bg-accent-900 text-accent",
    params: { nome: "Violão", categoria: "pratica", minutos: 30, dias: [0, 2, 4] },
  },
  {
    key: "rotina",
    title: "Rotina",
    meta: "checklist · sem tempo",
    hint: "Tarefas para marcar como feitas",
    icon: ListChecks,
    tint: "bg-info-tint text-info",
    params: { nome: "Rotina de estudos", categoria: "rotina", modo: "checklist" },
  },
];

export function starterHref(s: Starter): string {
  const q = new URLSearchParams();
  const p = s.params;
  if (p.nome) q.set("nome", p.nome);
  q.set("categoria", p.categoria);
  if (p.idioma) q.set("idioma", p.idioma);
  if (p.minutos) q.set("minutos", String(p.minutos));
  if (p.dias) q.set("dias", p.dias.join(","));
  if (p.modo) q.set("modo", p.modo);
  return `/app/objetivos/novo?${q.toString()}`;
}

export interface ObjectivePrefill {
  title: string;
  category: Body["category"];
  language: LanguageCode;
  mode: Mode;
  minutes: number;
  days: number[];
}

/**
 * Valores iniciais vindos da URL (modelos da tela Objetivos), todos opcionais e validados:
 * ?nome=Inglês&categoria=idioma&idioma=en&minutos=30&dias=0,1,2,3,4&modo=time
 * (dias: 0 = segunda … 6 = domingo; modo: time | checklist | mixed).
 */
export function readObjectivePrefill(params: URLSearchParams): ObjectivePrefill {
  const cat = params.get("categoria");
  const category = (CATEGORY_OPTIONS.some((c) => c.value === cat) ? cat : "outro_estudo") as Body["category"];
  const lang = params.get("idioma");
  const language = lang && lang in LANGUAGE_NAMES ? (lang as LanguageCode) : DEFAULT_LANGUAGE;
  const m = params.get("modo");
  const mode: Mode = m === "checklist" || m === "mixed" || m === "time" ? m : "time";
  const mins = Number(params.get("minutos"));
  const minutes = Number.isFinite(mins) && mins >= 5 ? Math.min(600, Math.round(mins / 5) * 5) : 60;
  const rawDays = params.get("dias");
  const parsed = rawDays
    ? [...new Set(rawDays.split(",").map((d) => Number(d.trim())))]
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        .sort()
    : [];
  const days = parsed.length > 0 ? parsed : [0, 1, 2, 3, 4];
  const nome = (params.get("nome") ?? "").trim().slice(0, 120);
  const title = nome || (category === "idioma" ? (languageShortName(language) ?? "") : "");
  return { title, category, language, mode, minutes, days };
}
