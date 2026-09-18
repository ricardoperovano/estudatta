import { brand } from "@/design/brand";
import { cn } from "@/lib/utils";

/** Símbolo Trilho (acento). Mesmo desenho em qualquer tema: acento sobre escuro, acento-700 sobre claro. */
export function Symbol({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("text-accent", className)} aria-hidden fill="none">
      <path d="M10 54H26V38H30" stroke="currentColor" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="43" cy="38" r="4.5" fill="currentColor" />
      <path d="M56 38V10" stroke="currentColor" strokeWidth={9} strokeLinecap="round" />
    </svg>
  );
}

/** Logotipo horizontal: símbolo + "Estudatta" em Inter 500, tracking −0,015em. */
export function Logo({ size = 24, className, textClassName }: { size?: number; className?: string; textClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[10px]", className)}>
      <Symbol size={size} />
      <span className={cn("font-medium tracking-[-0.015em] text-primary", textClassName)} style={{ fontSize: Math.round(size * 0.67) }}>
        {brand.name}
      </span>
    </span>
  );
}
