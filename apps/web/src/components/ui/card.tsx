import * as React from "react";
import { cn } from "@/lib/utils";

type Elev = "none" | "sm" | "md" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elev?: Elev;
  accent?: boolean; // contorno acento (destaque / recomendado)
  as?: "div" | "section" | "article";
}

/** Cartão: superfície, raio 8, padding compacto; elevação = borda 1px + sombra ambiente. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elev = "none", accent, as = "div", ...props }, ref) => {
    const Comp = as;
    return (
      <Comp
        ref={ref}
        className={cn(
          "flex flex-col gap-[6px] rounded-md bg-surface p-[8.4px]",
          elev === "sm" && "shadow-sm",
          elev === "md" && "shadow-md",
          elev === "lg" && "shadow-lg",
          accent && "shadow-accent-ring",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

export function CardKicker({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-[10px] uppercase tracking-[0.1em] text-accent", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-[17px] font-medium leading-[1.2]", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("m-0 flex-1 text-[13px] opacity-80", className)} {...props} />;
}

export function CardMeta({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-[11px] text-[color-mix(in_srgb,var(--color-text-primary)_50%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}
