/**
 * Campos de progresso por categoria do objetivo, usados ao registrar/encerrar uma sessão.
 *
 * - Leitura: "Quantas páginas você leu?" — o servidor avança o marcador do livro atual (p. X → X+N).
 * - Demais categorias: sugestões de preenchimento para "o que você estudou" (chips que completam
 *   a observação) e o tipo de estudo mais provável.
 */
import * as React from "react";
import { Link } from "react-router";
import { Field, Input } from "@/components/ui";
import type { StudyType } from "@/api/study";
import type { components } from "@/api/schema";
import { cn } from "@/lib/utils";

export type CurrentMaterial = components["schemas"]["CurrentMaterialOut"];

/** Mesmo limite do servidor (`pages_read`). */
export const MAX_PAGES_READ = 5000;

/** Tipo de estudo mais provável para a categoria (a pessoa pode trocar). */
export function defaultStudyType(category: string | null | undefined): StudyType {
  switch (category) {
    case "leitura":
      return "leitura";
    case "pratica":
    case "rotina":
      return "pratica";
    case "curso":
    case "faculdade":
      return "aula";
    default:
      return "teoria";
  }
}

/** Sugestões curtas do que costuma ser registrado em cada categoria; viram chips na observação. */
export const NOTE_SUGGESTIONS: Record<string, string[]> = {
  idioma: ["Vocabulário", "Gramática", "Listening", "Conversação", "Leitura", "Escrita"],
  ingles: ["Vocabulário", "Gramática", "Listening", "Conversação", "Leitura", "Escrita"],
  concurso: ["Lei seca", "Questões", "Resumo", "Videoaula", "Revisão", "Simulado"],
  faculdade: ["Aula", "Exercícios", "Trabalho", "Leitura", "Prova", "Resumo"],
  certificacao: ["Documentação", "Videoaula", "Laboratório", "Simulado", "Resumo"],
  curso: ["Aula", "Exercícios", "Projeto", "Revisão"],
  outro_estudo: ["Teoria", "Exercícios", "Resumo", "Revisão"],
  pratica: ["Aquecimento", "Técnica", "Repertório", "Treino", "Revisão"],
  rotina: ["Feito", "Parcial"],
};

/** Acrescenta a sugestão à observação ("Vocabulário · Gramática"), sem repetir. */
export function appendSuggestion(note: string, s: string): string {
  const parts = note
    .split("·")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.includes(s)) return note;
  return [...parts, s].join(" · ");
}

export function NoteSuggestions({
  category,
  note,
  onPick,
  className,
}: {
  category: string | null | undefined;
  note: string;
  onPick: (next: string) => void;
  className?: string;
}) {
  const list = category ? NOTE_SUGGESTIONS[category] : undefined;
  if (!list?.length) return null;
  const chosen = new Set(
    note
      .split("·")
      .map((p) => p.trim())
      .filter(Boolean),
  );
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} aria-label="Sugestões para o conteúdo">
      {list.map((s) => {
        const on = chosen.has(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(appendSuggestion(note, s))}
            className={cn(
              "inline-flex min-h-[32px] items-center rounded-full border border-divider px-3 text-[13px] transition-colors duration-base",
              on
                ? "text-accent shadow-inset-accent"
                : "text-neutral-300 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] hover:text-primary",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

/** "Dom Casmurro · p. 42 de 200" (ou só "p. 42" / "ainda sem marcador"). */
export function fmtBookmark(m: CurrentMaterial | null | undefined): string | null {
  if (!m) return null;
  const page = m.current_page ?? 0;
  const where = page > 0 ? `p. ${page}` : "ainda sem marcador";
  return `${m.title} · ${m.pages_total ? `${where} de ${m.pages_total}` : where}`;
}

interface ReadingPagesFieldProps {
  activityId: string;
  material: CurrentMaterial | null | undefined;
  /** Páginas lidas; `null` = não informado. */
  value: number | null;
  onChange: (v: number | null) => void;
  idPrefix?: string;
  autoFocus?: boolean;
}

/** Pergunta quantas páginas foram lidas e mostra para onde o marcador vai. */
export function ReadingPagesField({
  activityId,
  material,
  value,
  onChange,
  idPrefix = "read",
  autoFocus,
}: ReadingPagesFieldProps) {
  const id = `${idPrefix}-pages`;
  const from = material?.current_page ?? 0;
  const total = material?.pages_total ?? null;
  const dest = value != null && value > 0 ? Math.min(from + value, total ?? Number.MAX_SAFE_INTEGER) : null;
  let hint: React.ReactNode;
  if (material) {
    hint = (
      <>
        {fmtBookmark(material)}
        {dest != null ? ` → vai para p. ${dest}` : " · o marcador avança sozinho"}
        {dest != null && total && from + (value ?? 0) > total ? " (fim do livro)" : ""}
      </>
    );
  } else {
    hint = (
      <>
        Sem livro atual. <Link to={`/app/objetivos/${activityId}?aba=materiais`}>Defina o livro</Link> para o
        marcador avançar sozinho.
      </>
    );
  }
  return (
    <Field label="Quantas páginas você leu?" htmlFor={id} hint={hint}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_PAGES_READ}
        step={1}
        placeholder="ex.: 8"
        className="tnum"
        autoFocus={autoFocus}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value.trim() === "" ? null : Number(e.target.value))}
      />
    </Field>
  );
}

/** Erro pt-BR ou `null`. */
export function validatePagesRead(v: number | null): string | null {
  if (v == null) return null;
  if (!Number.isInteger(v) || v < 0) return "Páginas lidas: use um número inteiro a partir de 0.";
  if (v > MAX_PAGES_READ) return `O limite é de ${MAX_PAGES_READ} páginas por sessão.`;
  return null;
}
