/** Editor dos limites conhecidos do catálogo (mesmas regras de `validate_limits` no servidor). */
import * as React from "react";
import { KNOWN_LIMIT_KEYS } from "@/api/admin";
import { fmtValue, humanize } from "@/components/app/admin-format";
import { Button, Input, Select } from "@/components/ui";

type LimitKey = (typeof KNOWN_LIMIT_KEYS)[number];
type Spec = { kind: "int_or_null" | "int"; min: number } | { kind: "bool" } | { kind: "choice"; options: readonly string[] };

const SPECS: Record<LimitKey, Spec> = {
  max_active_activities: { kind: "int_or_null", min: 1 },
  materials_storage_mb: { kind: "int_or_null", min: 0 },
  max_materials: { kind: "int_or_null", min: 0 },
  ai_daily_actions: { kind: "int", min: 0 },
  reports: { kind: "choice", options: ["basic", "full"] },
  recovery_distribution: { kind: "bool" },
  csv_export: { kind: "bool" },
  reminders: { kind: "choice", options: ["basic", "full"] },
};

const LABEL: Record<LimitKey, string> = {
  max_active_activities: "Objetivos ativos (máximo)",
  materials_storage_mb: "Armazenamento de materiais (MB)",
  max_materials: "Materiais (máximo)",
  ai_daily_actions: "Ações de IA por dia",
  reports: "Relatórios",
  recovery_distribution: "Distribuição de tempo a recuperar",
  csv_export: "Exportação CSV",
  reminders: "Lembretes",
};

const CHOICE_LABEL: Record<string, string> = { basic: "básico", full: "completo" };

type Limits = Record<string, unknown>;

interface Props {
  value: Limits;
  onChange: (next: Limits) => void;
  idPrefix: string;
}

export function LimitsEditor({ value, onChange, idPrefix }: Props) {
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });
  const unset = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const unknownKeys = Object.keys(value).filter((k) => !(KNOWN_LIMIT_KEYS as readonly string[]).includes(k));

  return (
    <div className="flex flex-col gap-2">
      {KNOWN_LIMIT_KEYS.map((key) => (
        <LimitRow key={key} id={`${idPrefix}-${key}`} limitKey={key} present={key in value} value={value[key]} onSet={(v) => set(key, v)} onUnset={() => unset(key)} />
      ))}
      {unknownKeys.map((k) => (
        <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-error-tint p-2 text-[13px]">
          <span>
            <code>{k}</code> = {fmtValue(value[k])} — limite desconhecido; o servidor recusa ao salvar.
          </span>
          <Button variant="danger" size="sm" onClick={() => unset(k)}>
            Remover
          </Button>
        </div>
      ))}
    </div>
  );
}

interface RowProps {
  id: string;
  limitKey: LimitKey;
  present: boolean;
  value: unknown;
  onSet: (v: unknown) => void;
  onUnset: () => void;
}

function LimitRow({ id, limitKey, present, value, onSet, onUnset }: RowProps) {
  const spec = SPECS[limitKey];
  let mode: string;
  if (!present) mode = "unset";
  else if (spec.kind === "bool") mode = value === true ? "true" : "false";
  else if (spec.kind === "choice") mode = typeof value === "string" ? value : "unset";
  else mode = value === null ? "null" : "value";

  const onMode = (m: string) => {
    if (m === "unset") return onUnset();
    if (spec.kind === "bool") return onSet(m === "true");
    if (spec.kind === "choice") return onSet(m);
    if (m === "null") return onSet(null);
    onSet(typeof value === "number" ? value : spec.min);
  };

  return (
    <div className="grid grid-cols-1 items-center gap-2 border-b border-divider pb-2 tablet:grid-cols-[1fr_180px_120px]">
      <label htmlFor={id} className="text-[13px]">
        {LABEL[limitKey]}
        <span className="block text-[11px] text-neutral-400">{humanize(limitKey)}</span>
      </label>
      <Select id={id} value={mode} onChange={(e) => onMode(e.target.value)}>
        <option value="unset">Não definido</option>
        {spec.kind === "bool" ? (
          <>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </>
        ) : null}
        {spec.kind === "choice" ? spec.options.map((o) => <option key={o} value={o}>{CHOICE_LABEL[o] ?? o}</option>) : null}
        {spec.kind === "int_or_null" ? <option value="null">Sem limite</option> : null}
        {spec.kind === "int_or_null" || spec.kind === "int" ? <option value="value">Valor</option> : null}
      </Select>
      {(spec.kind === "int_or_null" || spec.kind === "int") && mode === "value" ? (
        <IntInput label={`${LABEL[limitKey]}: valor`} min={spec.min} value={typeof value === "number" ? value : spec.min} onChange={onSet} />
      ) : (
        <span className="hidden tablet:block" />
      )}
    </div>
  );
}

/** Texto livre enquanto digita; só propaga inteiros válidos (≥ min). */
function IntInput({ label, min, value, onChange }: { label: string; min: number; value: number; onChange: (n: number) => void }) {
  const [text, setText] = React.useState(String(value));
  const valid = /^\d+$/.test(text) && Number(text) >= min;
  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      className="tnum"
      value={text}
      invalid={!valid}
      title={valid ? undefined : `Inteiro a partir de ${min}`}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        if (/^\d+$/.test(t) && Number(t) >= min) onChange(Number(t));
      }}
      onBlur={() => {
        if (!valid) setText(String(value));
      }}
    />
  );
}
