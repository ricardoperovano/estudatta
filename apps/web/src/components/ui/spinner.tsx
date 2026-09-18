import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label || "Carregando"} className={cn("spinner inline-block", className)} />
  );
}
