import { t as tx } from "@/i18n";
import { Field, Input, Select } from "@/components/ui";
import { QUESTION_TYPES, STUDY_TYPES, type StudyType } from "@/api/study";
import { cn } from "@/lib/utils";

/** Mesmo limite do servidor (`MAX_QUESTIONS`). */
export const MAX_QUESTIONS = 5000;

export interface StudyFieldsValue {
  study_type: StudyType;
  /** Questões feitas; `null` = não informado. */
  questions_total: number | null;
  /** Acertos; `null` = não informado. */
  questions_correct: number | null;
}

export const EMPTY_STUDY_FIELDS: StudyFieldsValue = {
  study_type: "teoria",
  questions_total: null,
  questions_correct: null,
};

/** O tipo pede questões feitas/acertos? */
export const asksQuestions = (t: string | null | undefined) => !!t && QUESTION_TYPES.includes(t);

/** Valor inicial a partir de uma sessão existente (SessionOut / ReportSessionOut). */
export function studyFieldsFrom(s: {
  study_type?: string | null;
  questions_total?: number | null;
  questions_correct?: number | null;
}): StudyFieldsValue {
  const t = STUDY_TYPES.some((x) => x.value === s.study_type) ? (s.study_type as StudyType) : "teoria";
  return {
    study_type: t,
    questions_total: s.questions_total ?? null,
    questions_correct: s.questions_correct ?? null,
  };
}

/**
 * Retorna a mensagem de erro (pt-BR) ou `null` se estiver tudo certo. Tipos sem questões nunca têm erro.
 * Questões e acertos são opcionais, mas andam juntos: os dois vazios ou os dois preenchidos.
 */
export function validateStudyFields(v: StudyFieldsValue): string | null {
  if (!asksQuestions(v.study_type)) return null;
  const { questions_total: total, questions_correct: correct } = v;
  if (
    (total != null && (!Number.isInteger(total) || total < 0)) ||
    (correct != null && (!Number.isInteger(correct) || correct < 0))
  ) {
    return tx("Use números inteiros a partir de 0 para questões e acertos.");
  }
  if (total != null && total > MAX_QUESTIONS)
    return tx("O limite é de {{v0}} questões por sessão.", { v0: MAX_QUESTIONS });
  if (correct != null && total == null) return tx("Informe quantas questões você fez.");
  // o servidor grava acertos em branco como 0; melhor pedir do que mostrar 0% sem querer
  if (total != null && correct == null) return tx("Informe também quantas você acertou.");
  if (correct != null && total != null && correct > total)
    return tx("Os acertos não podem passar do número de questões feitas.");
  return null;
}

/**
 * Campos para o corpo da API (manual, edição, finalizar, sync). Em tipos sem questões, as questões
 * vão como `null`; `hasQuestions` diz se há algo a gravar (útil para decidir `clear_questions` na edição).
 */
export function studyFieldsPayload(v: StudyFieldsValue): StudyFieldsValue & { hasQuestions: boolean } {
  const ask = asksQuestions(v.study_type);
  const total = ask ? v.questions_total : null;
  const correct = ask && total != null ? v.questions_correct : null;
  return {
    study_type: v.study_type,
    questions_total: total,
    questions_correct: correct,
    hasQuestions: total != null,
  };
}

interface StudyFieldsProps {
  value: StudyFieldsValue;
  onChange: (v: StudyFieldsValue) => void;
  /** Versão enxuta: tipo em `<select>` em vez da grade de chips (folhas apertadas, como o fim do cronômetro). */
  compact?: boolean;
  /** Prefixo dos ids dos campos, para não colidir quando há mais de um formulário na tela. */
  idPrefix?: string;
  className?: string;
}

/**
 * Tipo de estudo + "Questões feitas" / "Acertos" (só aparecem em tipos de `QUESTION_TYPES`).
 *
 * Uso:
 * ```tsx
 * const [study, setStudy] = React.useState<StudyFieldsValue>(EMPTY_STUDY_FIELDS);
 * <StudyFields value={study} onChange={setStudy} compact />
 * // no submit:
 * const err = validateStudyFields(study); if (err) return setError(err);
 * const { study_type, questions_total, questions_correct } = studyFieldsPayload(study);
 * ```
 * O componente é controlado e não guarda estado próprio; o erro de acertos > questões aparece
 * em linha, mas a validação no submit (`validateStudyFields`) continua sendo responsabilidade de quem usa.
 * Ids gerados: `${idPrefix}-type` (compact), `${idPrefix}-q-total`, `${idPrefix}-q-correct`.
 */
export function StudyFields({ value, onChange, compact, idPrefix = "study", className }: StudyFieldsProps) {
  const ask = asksQuestions(value.study_type);
  // em linha só quando os dois estão preenchidos (acertos > questões, limites) — não reclama no meio da digitação
  const error =
    value.questions_total != null && value.questions_correct != null ? validateStudyFields(value) : null;
  const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));
  const setType = (t: StudyType) => onChange({ ...value, study_type: t });

  return (
    <div className={cn("flex flex-col gap-[14px]", className)}>
      {compact ? (
        <Field label={tx("Tipo de estudo")} htmlFor={`${idPrefix}-type`}>
          <Select
            id={`${idPrefix}-type`}
            value={value.study_type}
            onChange={(e) => setType(e.target.value as StudyType)}
          >
            {STUDY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="flex flex-col">
          <span
            id={`${idPrefix}-type-label`}
            className="mb-[5px] block text-[12px] text-[color-mix(in_srgb,var(--color-text-primary)_70%,transparent)]"
          >
            {tx("Tipo de estudo")}
          </span>
          <div
            role="radiogroup"
            aria-labelledby={`${idPrefix}-type-label`}
            // 9 tipos: três colunas fecham as linhas certinho e cabe "Devocional" sem cortar
            className="grid grid-cols-3 gap-1.5"
          >
            {STUDY_TYPES.map((t) => {
              const active = t.value === value.study_type;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setType(t.value)}
                  className={cn(
                    "inline-flex min-h-[36px] min-w-0 cursor-pointer items-center justify-center rounded-md border border-divider px-1.5 py-[6px] text-[13px] transition-colors duration-base",
                    active
                      ? "text-accent shadow-inset-accent"
                      : "text-primary hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]",
                    "focus-visible:outline-offset-[-2px]",
                  )}
                >
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {ask ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx("Questões feitas")} htmlFor={`${idPrefix}-q-total`}>
            <Input
              id={`${idPrefix}-q-total`}
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_QUESTIONS}
              step={1}
              placeholder="opcional"
              className="tnum"
              value={value.questions_total ?? ""}
              onChange={(e) => onChange({ ...value, questions_total: num(e.target.value) })}
            />
          </Field>
          <Field label={tx("Acertos")} htmlFor={`${idPrefix}-q-correct`} error={error ?? undefined}>
            <Input
              id={`${idPrefix}-q-correct`}
              type="number"
              inputMode="numeric"
              min={0}
              max={value.questions_total ?? MAX_QUESTIONS}
              step={1}
              placeholder="opcional"
              className="tnum"
              invalid={!!error}
              value={value.questions_correct ?? ""}
              onChange={(e) => onChange({ ...value, questions_correct: num(e.target.value) })}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** "12/15 questões (80%)" — `null` quando a sessão não tem questões. */
export function fmtQuestions(
  total: number | null | undefined,
  correct: number | null | undefined,
): string | null {
  if (total == null || total <= 0) return null;
  if (correct == null) return `${total} ${total === 1 ? tx("questão") : tx("questões")}`;
  return tx("{{v0}}/{{v1}} questões ({{v2}}%)", {
    v0: correct,
    v1: total,
    v2: Math.round((correct / total) * 100),
  });
}
