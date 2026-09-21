import * as React from "react";
import { cn } from "@/lib/utils";
import { TataSvg, type TataMood } from "@/components/mascot/TataSvg";

/** Símbolo da trilha (tracejado = caminho ainda por fazer). */
export function TrailGlyph({
  size = 40,
  className,
  dashed = true,
}: {
  size?: number;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      className={cn("text-neutral-600", className)}
      aria-hidden
    >
      <path d="M10 54H26V38H30" strokeDasharray={dashed ? "4 5" : undefined} />
      <circle cx="43" cy="38" r="4.5" strokeDasharray={dashed ? "3 4" : undefined} />
      <path d="M56 38V10" strokeDasharray={dashed ? "3 4" : undefined} />
    </svg>
  );
}

/** Bolha suave com brilhinhos em volta do símbolo do estado vazio. */
function GlyphBubble({ children, large }: { children: React.ReactNode; large?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-accent-900",
        large ? "h-[104px] w-[104px]" : "h-[72px] w-[72px]",
      )}
      aria-hidden
    >
      <span className="absolute -right-1 top-1 h-2.5 w-2.5 rounded-full bg-warning-tint opacity-80 shadow-[inset_0_0_0_1.5px_var(--color-status-warning)]" />
      <span className="absolute -left-1.5 bottom-3 h-2 w-2 rounded-full bg-info-tint opacity-80 shadow-[inset_0_0_0_1.5px_var(--color-status-info)]" />
      <svg
        viewBox="0 0 16 16"
        className="absolute -left-0.5 top-0 h-3 w-3 text-accent opacity-70"
        fill="currentColor"
      >
        <path d="M8 0l1.8 6.2L16 8l-6.2 1.8L8 16l-1.8-6.2L0 8l6.2-1.8Z" />
      </svg>
      {children}
    </span>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** símbolo próprio (substitui a trilha) */
  glyph?: React.ReactNode;
  /** mostra o Tatá com este humor no lugar do símbolo */
  mascot?: TataMood;
  /** "card": cartão tingido com mais respiro (páginas inteiras vazias) */
  variant?: "plain" | "card";
}

/**
 * Estado vazio acolhedor: símbolo numa bolha suave (ou o Tatá), frase, explicação e ação.
 * Sem culpa e sem números inventados; a ação leva ao próximo passo.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
  glyph,
  mascot,
  variant = "plain",
}: EmptyStateProps) {
  const card = variant === "card";
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 px-5 py-6 text-center",
        card && "tint-soft rounded-[20px] px-6 py-8 shadow-sm",
        className,
      )}
    >
      {mascot ? (
        <TataSvg mood={mascot} size={card ? 96 : 80} className="mb-1" />
      ) : (
        <GlyphBubble large={card}>
          {glyph ?? <TrailGlyph size={card ? 44 : 34} className="text-accent-500" />}
        </GlyphBubble>
      )}
      <span
        className={cn("mt-1 max-w-[36ch] font-medium text-primary", card ? "text-[17px]" : "text-[15px]")}
      >
        {title}
      </span>
      {description ? (
        <span className="max-w-[44ch] text-[13px] leading-[1.5] text-neutral-400">{description}</span>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
