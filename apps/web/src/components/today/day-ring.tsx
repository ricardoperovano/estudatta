import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Anel de progresso do dia (registrado / meta). Decorativo: o texto ao lado dá os números. */
export function DayRing({ value, size = 56, stroke = 7, tone = "accent", children, className }: { value: number; size?: number; stroke?: number; tone?: "accent" | "success" | "rest"; children?: ReactNode; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const color = tone === "success" ? "var(--color-status-success)" : tone === "rest" ? "var(--color-status-info)" : "var(--color-progress-fill)";
  return (
    <div className={cn("relative grid shrink-0 place-items-center", className)} style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-progress-track)" strokeWidth={stroke} />
        {v > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * v} ${c}`}
            className="transition-[stroke-dasharray] duration-slow ease-standard"
          />
        ) : null}
      </svg>
      {children ? <div className="absolute inset-0 grid place-items-center">{children}</div> : null}
    </div>
  );
}
