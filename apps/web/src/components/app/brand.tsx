import { brand } from "@/design/brand";
import { cn } from "@/lib/utils";

/**
 * Logo do Estudatta (ícone cronômetro + livro). Duas versões com fundo sólido, que coincide
 * com o fundo de cada tema: a escura no tema escuro e a clara no tema claro (troca por CSS).
 */
export function Symbol({ size = 24, className }: { size?: number; className?: string }) {
  const box = Math.round(size * 1.2);
  return (
    <span
      className={cn("brand-logo inline-block shrink-0", className)}
      style={{ width: box, height: box }}
      aria-hidden
    >
      <img
        src={brand.logos.escuro}
        alt=""
        width={box}
        height={box}
        className="brand-logo-dark h-full w-full rounded-[22%]"
      />
      <img
        src={brand.logos.claro}
        alt=""
        width={box}
        height={box}
        className="brand-logo-light h-full w-full rounded-[22%]"
      />
    </span>
  );
}

/** Logotipo horizontal: logo + "Estudatta" em Inter 500, tracking −0,015em. */
export function Logo({
  size = 24,
  className,
  textClassName,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[10px]", className)}>
      <Symbol size={size} />
      <span
        className={cn("font-medium tracking-[-0.015em] text-primary", textClassName)}
        style={{ fontSize: Math.round(size * 0.67) }}
      >
        {brand.name}
      </span>
    </span>
  );
}
