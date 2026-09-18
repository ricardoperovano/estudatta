import * as React from "react";
import { cn } from "@/lib/utils";

/** Estado vazio: símbolo em traço tracejado + frase + ação. Sem mascote. */
export function TrailGlyph({ size = 40, className, dashed = true }: { size?: number; className?: string; dashed?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" className={cn("text-neutral-600", className)} aria-hidden>
      <path d="M10 54H26V38H30" strokeDasharray={dashed ? "4 5" : undefined} />
      <circle cx="43" cy="38" r="4.5" strokeDasharray={dashed ? "3 4" : undefined} />
      <path d="M56 38V10" strokeDasharray={dashed ? "3 4" : undefined} />
    </svg>
  );
}

export function EmptyState({ title, description, action, className, glyph }: { title: string; description?: string; action?: React.ReactNode; className?: string; glyph?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 p-5 text-center", className)}>
      {glyph ?? <TrailGlyph />}
      <span className="text-[14px]">{title}</span>
      {description ? <span className="text-[13px] text-neutral-400">{description}</span> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
