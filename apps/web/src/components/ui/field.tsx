import * as React from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/** Rótulo 12px acima do campo; erro com borda + mensagem 12/13px + ícone. */
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("field flex flex-col", className)}>
      {label ? (
        <label htmlFor={htmlFor} className="mb-[5px] block text-[12px] text-[color-mix(in_srgb,var(--color-text-primary)_70%,transparent)]">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <span role="alert" className="mt-[5px] flex items-center gap-1.5 text-[12px] text-error">
          <WarningCircle size={14} weight="regular" aria-hidden />
          {error}
        </span>
      ) : hint ? (
        <span className="mt-[6px] block text-[12px] text-neutral-400">{hint}</span>
      ) : null}
    </div>
  );
}
