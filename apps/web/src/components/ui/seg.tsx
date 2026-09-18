import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

interface SegProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
  name?: string;
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  block?: boolean;
}

/** Controle segmentado (presets, Agenda/Lista, Semana/Mês, tom). Ativo = contorno acento interno. */
export function Seg<T extends string>({ value, onChange, options, label, className, size = "md", block }: SegProps<T>) {
  const h = size === "sm" ? "min-h-[36px]" : size === "lg" ? "min-h-[44px]" : "min-h-[36px]";
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex overflow-hidden rounded-md border border-divider", block && "flex w-full", className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 px-3 py-[7px] text-[13px] transition-colors duration-base cursor-pointer disabled:opacity-45",
              h,
              block && "flex-1",
              i > 0 && "border-l border-divider",
              active ? "text-accent shadow-inset-accent" : "text-primary hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]",
              "focus-visible:outline-offset-[-2px]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
