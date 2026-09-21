import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

/**
 * Abas com sublinhado 2px acento sobre divisor. O divisor é uma sombra interna (não uma borda com
 * margem negativa nas abas): assim a lista rola só na horizontal em telas estreitas, sem barra
 * de rolagem vertical de 1px nem barra visível.
 */
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex gap-5 overflow-x-auto overflow-y-hidden text-[14px] shadow-[inset_0_-1px_0_var(--color-divider)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-[44px] shrink-0 cursor-pointer whitespace-nowrap border-b-2 border-transparent py-[10px] text-neutral-500 transition-colors duration-base hover:text-primary data-[state=active]:border-accent data-[state=active]:text-primary",
        className,
      )}
      {...props}
    />
  );
}
