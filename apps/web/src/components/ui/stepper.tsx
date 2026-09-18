import { Minus, Plus } from "@phosphor-icons/react";
import { Button } from "./button";
import { Seg } from "./seg";
import { cn } from "@/lib/utils";

interface DurationStepperProps {
  minutes: number;
  onChange: (m: number) => void;
  step?: number;
  min?: number;
  max?: number;
  presets?: number[];
  size?: "md" | "lg";
  className?: string;
}

/** Duração: stepper −/+ com valor tnum e presets 15 · 30 · 45 · 60 · 90. */
export function DurationStepper({ minutes, onChange, step = 5, min = 5, max = 600, presets = [15, 30, 45, 60, 90], size = "md", className }: DurationStepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const presetValue = presets.includes(minutes) ? String(minutes) : "outro";
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="flex items-center justify-center gap-3">
        <Button type="button" variant="secondary" size="icon-lg" aria-label={`Menos ${step} minutos`} onClick={() => onChange(clamp(minutes - step))}>
          <Minus size={20} />
        </Button>
        <span className={cn("tnum min-w-[120px] text-center font-medium", size === "lg" ? "min-w-[150px] text-[42px]" : "text-[32px]")} aria-live="polite">
          {minutes} min
        </span>
        <Button type="button" variant="secondary" size="icon-lg" aria-label={`Mais ${step} minutos`} onClick={() => onChange(clamp(minutes + step))}>
          <Plus size={20} />
        </Button>
      </div>
      <Seg
        label="Presets de duração"
        value={presetValue}
        onChange={(v) => {
          if (v !== "outro") onChange(Number(v));
        }}
        options={[...presets.map((p) => ({ value: String(p), label: String(p) })), { value: "outro", label: "Outro" }]}
      />
    </div>
  );
}

interface DayPickerProps {
  value: number[]; // 0=segunda … 6=domingo
  onChange: (days: number[]) => void;
  className?: string;
}

/** Seleção de dias: 7 chips 44×44 (S T Q Q S S D); ativo = contorno acento + tinta accent-900. */
export function DayPicker({ value, onChange, className }: DayPickerProps) {
  const labels = ["S", "T", "Q", "Q", "S", "S", "D"];
  const names = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
  return (
    <div role="group" aria-label="Dias ativos" className={cn("flex justify-between gap-1.5", className)}>
      {labels.map((l, i) => {
        const active = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            aria-pressed={active}
            aria-label={names[i]}
            onClick={() => onChange(active ? value.filter((d) => d !== i) : [...value, i].sort())}
            className={cn(
              "h-11 w-11 max-xs:w-10 rounded-md border text-[14px] font-medium transition-colors duration-base cursor-pointer",
              active ? "border-accent bg-accent-900 text-accent" : "border-divider text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]",
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
