import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label || t("Carregando")}
      className={cn("spinner inline-block", className)}
    />
  );
}
