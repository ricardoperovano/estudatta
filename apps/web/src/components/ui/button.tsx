import { t } from "@/i18n";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * Botões do design system: primário = contorno acento (nunca preenchido);
 * secundário = contorno divisor; ghost; ícone 36px; bloco.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-[14px] font-medium leading-tight transition-colors duration-base ease-standard disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary: t(
          "border-accent text-accent hover:bg-[color-mix(in_srgb,var(--color-action-primary)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--color-action-primary)_22%,transparent)] active:text-accent-300",
        ),
        secondary: t(
          "border-divider text-primary hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--color-text-primary)_14%,transparent)]",
        ),
        ghost: t(
          "text-accent px-1 hover:bg-[color-mix(in_srgb,var(--color-action-primary)_10%,transparent)] active:bg-[color-mix(in_srgb,var(--color-action-primary)_18%,transparent)]",
        ),
        "ghost-muted": t(
          "text-neutral-400 px-1 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]",
        ),
        selected: "border-accent text-accent bg-accent-900",
        danger: "border-error text-error hover:bg-error-tint",
        option: t(
          "border-divider text-primary justify-between hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]",
        ),
        "option-selected": "border-accent bg-accent-900 text-primary justify-between",
      },
      size: {
        sm: "min-h-[32px] px-2.5 py-1 text-[12px]",
        md: "min-h-[36px] px-[10px] py-[6px]",
        lg: "min-h-[44px] px-4 text-[15px]",
        xl: "min-h-[52px] px-5 text-[16px]",
        icon: "h-9 w-9 p-0",
        "icon-lg": "h-11 w-11 p-0 text-[20px]",
        chip: "h-11 w-11 p-0",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        aria-busy={loading || undefined}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Spinner /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
