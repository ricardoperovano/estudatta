import { t } from "@/i18n";
import { Link } from "react-router";
import { Lock } from "@phosphor-icons/react";
import { Button, Card } from "@/components/ui";
import { useEntitlements } from "@/api/session";
import { cn } from "@/lib/utils";

/** Valor de um limite do plano atual (vindo do servidor). */
export function usePlanLimit(key: string): unknown {
  const ent = useEntitlements();
  return ent?.limits?.[key];
}

/** O plano atual inclui o recurso? (`reports`/`reminders` = "full"; `auto_planning` = true) */
export function useHasFeature(key: "reports" | "reminders" | "auto_planning"): boolean {
  const v = usePlanLimit(key);
  // sem sessão carregada ainda: não bloqueia a interface; o servidor decide
  if (v === undefined) return true;
  return key === "auto_planning" ? v === true : v === "full";
}

/** Aviso honesto de recurso de plano pago, com caminho para a tela de planos. */
export function PlanUpsell({
  title = "",
  text,
  className,
  compact,
}: {
  title?: string;
  text: string;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-400",
          className,
        )}
      >
        <Lock size={12} aria-hidden className="text-accent" />
        {text}{" "}
        <Link to="/app/planos" className="text-accent">
          {t("Ver planos")}
        </Link>
      </span>
    );
  }
  return (
    <Card className={cn("gap-2 p-4", className)}>
      <span className="inline-flex items-center gap-2 text-[15px] font-medium">
        <Lock size={16} aria-hidden className="text-accent" />
        {title}
      </span>
      <p className="text-[14px] text-neutral-400">{text}</p>
      <Button asChild variant="primary" size="md" className="self-start">
        <Link to="/app/planos">{t("Ver planos")}</Link>
      </Button>
    </Card>
  );
}
