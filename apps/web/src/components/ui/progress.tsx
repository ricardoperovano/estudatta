import { cn } from "@/lib/utils";

interface GoalBarProps {
  logged: number; // segundos registrados hoje
  target: number; // meta base
  recovery?: number; // recuperação sugerida
  className?: string;
  height?: number;
  label?: string;
}

/**
 * Indicador de meta segmentado: registrado (acento sólido) · falta da meta (contorno) ·
 * recuperação sugerida (damasco tracejado). Rótulo acessível sempre presente.
 */
export function GoalBar({ logged, target, recovery = 0, className, height = 8, label }: GoalBarProps) {
  const done = Math.min(logged, target);
  const missing = Math.max(0, target - logged);
  const total = done + missing + recovery || 1;
  const aria =
    label ??
    `${Math.round(done / 60)} de ${Math.round(target / 60)} minutos registrados${recovery ? `; ${Math.round(recovery / 60)} de recuperação sugerida` : ""}`;
  if (target === 0 && recovery === 0) {
    return <div role="img" aria-label={aria} className={cn("rounded-[4px] bg-track", className)} style={{ height }} />;
  }
  return (
    <div role="img" aria-label={aria} className={cn("flex gap-[3px] overflow-hidden rounded-[4px]", className)} style={{ height }}>
      {done > 0 ? <div className="bg-accent" style={{ flex: done / total }} /> : null}
      {missing > 0 ? <div className="shadow-inset-accent" style={{ flex: missing / total }} /> : null}
      {recovery > 0 ? <div className="recovery-stripes" style={{ flex: recovery / total }} /> : null}
    </div>
  );
}

interface BarProps {
  value: number; // 0..1
  className?: string;
  height?: number;
  color?: "accent" | "accent-600" | "success" | "pending";
  label: string;
}

/** Barra simples: fundo track + preenchimento. Progresso anima só o preenchimento. */
export function Bar({ value, className, height = 6, color = "accent", label }: BarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { accent: "bg-accent", "accent-600": "bg-accent-600", success: "bg-success", pending: "bg-pending" }[color];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className={cn("overflow-hidden rounded-[3px] bg-track", className)} style={{ height }}>
      <div className={cn("h-full rounded-[3px] transition-[width] duration-slow ease-standard", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Legend({ items, className }: { items: { swatch: "accent" | "outline" | "recovery" | "track"; label: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-4 text-[12px] text-neutral-400", className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              "inline-block h-[10px] w-[10px] rounded-[2px]",
              i.swatch === "accent" && "bg-accent",
              i.swatch === "outline" && "shadow-inset-accent",
              i.swatch === "recovery" && "recovery-stripes",
              i.swatch === "track" && "bg-track",
            )}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
