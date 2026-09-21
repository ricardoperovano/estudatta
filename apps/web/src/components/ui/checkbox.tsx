import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Checkbox 20px, raio 4; marcado = acento preenchido com check na cor do fundo. */
export function Checkbox({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-sm border-[1.5px] border-neutral-500 transition-colors duration-base disabled:opacity-45 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check size={12} weight="bold" className="text-canvas" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
