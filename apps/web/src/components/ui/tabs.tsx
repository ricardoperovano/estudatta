import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

/** Abas com sublinhado 2px acento sobre divisor. */
export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-5 border-b border-divider text-[14px]", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px min-h-[44px] border-b-2 border-transparent py-[10px] text-neutral-500 transition-colors duration-base data-[state=active]:border-accent data-[state=active]:text-primary hover:text-primary cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}
