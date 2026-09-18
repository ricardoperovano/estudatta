import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

interface Props extends React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string;
}

/** Interruptor 44×26: ligado = acento com bolinha na cor do fundo; desligado = neutro-800. */
export function Switch({ className, label, ...props }: Props) {
  return (
    <SwitchPrimitive.Root
      aria-label={label}
      className={cn(
        "relative inline-flex h-[26px] w-[44px] shrink-0 cursor-pointer items-center rounded-full bg-neutral-800 transition-colors duration-base data-[state=checked]:bg-accent disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-[3px] rounded-full bg-neutral-500 transition-transform duration-base data-[state=checked]:translate-x-[21px] data-[state=checked]:bg-canvas" />
    </SwitchPrimitive.Root>
  );
}
