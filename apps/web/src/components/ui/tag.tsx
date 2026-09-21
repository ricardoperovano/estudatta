import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, WifiSlash, Warning } from "@phosphor-icons/react";

type Variant = "accent" | "neutral" | "outline" | "pending" | "success" | "info" | "error";

const styles: Record<Variant, string> = {
  accent: "bg-accent-800 text-accent-100",
  neutral: "bg-neutral-800 text-neutral-100",
  outline: "border border-accent text-accent",
  pending: "bg-warning-tint text-pending",
  success: "bg-success-tint text-success",
  info: "bg-info-tint text-info",
  error: "bg-error-tint text-error",
};

const icons: Partial<Record<Variant, React.ReactNode>> = {
  pending: <Clock size={12} weight="bold" aria-hidden />,
  success: <Check size={12} weight="bold" aria-hidden />,
  info: <WifiSlash size={12} weight="bold" aria-hidden />,
  error: <Warning size={12} weight="bold" aria-hidden />,
};

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  icon?: React.ReactNode | false;
}

/** Tag/chip: 11px, raio 6, tinta das rampas. Status sempre com rótulo e ícone. */
export function Tag({ className, variant = "neutral", icon, children, ...props }: TagProps) {
  const ic = icon === false ? null : (icon ?? icons[variant]);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] px-[10px] py-[3px] text-[11px] tracking-[0.02em]",
        styles[variant],
        className,
      )}
      {...props}
    >
      {ic}
      {children}
    </span>
  );
}
