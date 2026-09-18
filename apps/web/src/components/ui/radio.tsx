import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@/lib/utils";

export const RadioGroup = RadioGroupPrimitive.Root;

interface ItemProps extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/** Rádio nativo temático: bolinha 16px, borda divisor; marcado = acento com miolo na cor do fundo. */
export function RadioItem({ label, description, className, ...props }: ItemProps) {
  return (
    <label className={cn("flex min-h-[40px] cursor-pointer items-center gap-2 text-[14px]", className)}>
      <RadioGroupPrimitive.Item
        className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-divider transition-colors duration-base hover:border-accent data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:shadow-[inset_0_0_0_4px_var(--color-bg-canvas)]"
        {...props}
      />
      <span className="flex flex-col">
        <span>{label}</span>
        {description ? <span className="text-[12px] text-neutral-400">{description}</span> : null}
      </span>
    </label>
  );
}
