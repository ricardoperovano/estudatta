import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/** Campo: superfície + borda divisor; foco troca borda para acento; erro em status.error. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      "w-full min-h-[44px] rounded-md border border-divider bg-surface px-[10px] py-[6px] text-[14px] text-primary caret-accent placeholder:text-neutral-500 transition-colors duration-base",
      "hover:border-[color-mix(in_srgb,var(--color-text-primary)_45%,transparent)] focus-visible:border-accent focus-visible:outline-offset-0 disabled:opacity-45",
      invalid && "border-error focus-visible:border-error",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full min-h-[90px] resize-y rounded-md border border-divider bg-surface px-[10px] py-[6px] text-[14px] text-primary caret-accent placeholder:text-neutral-500",
        "hover:border-[color-mix(in_srgb,var(--color-text-primary)_45%,transparent)] focus-visible:border-accent focus-visible:outline-offset-0 disabled:opacity-45",
        invalid && "border-error",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "w-full min-h-[44px] rounded-md border border-divider bg-surface px-[10px] py-[6px] text-[14px] text-primary focus-visible:border-accent focus-visible:outline-offset-0 disabled:opacity-45",
        invalid && "border-error",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";
