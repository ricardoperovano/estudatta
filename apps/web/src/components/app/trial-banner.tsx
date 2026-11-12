/**
 * Aviso do teste grátis: aparece na tela Hoje enquanto a conta está no período de teste, com os
 * dias que faltam e o caminho para assinar. Dispensável por dia (volta no dia seguinte, e sempre
 * nos 3 últimos dias). Fora do teste, não renderiza nada.
 */
import * as React from "react";
import { Link } from "react-router";
import { useEntitlements } from "@/api/session";
import { Sparkle } from "@phosphor-icons/react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

const KEY = "estudatta.trial.dismissed";

/** Dias inteiros que faltam (o dia em curso conta): 0 quando já passou. */
export function trialDaysLeft(endsAt: string | null | undefined, now: number = Date.now()): number {
  if (!endsAt) return 0;
  const ms = Date.parse(endsAt) - now;
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(KEY) === new Date().toDateString();
  } catch {
    return false;
  }
}

export function TrialBanner() {
  const ent = useEntitlements();
  const [hidden, setHidden] = React.useState(dismissedToday);
  if (!ent || ent.source !== "trial") return null;
  const days = trialDaysLeft(ent.current_period_end);
  if (days <= 0) return null;
  const urgent = days <= 3;
  if (hidden && !urgent) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, new Date().toDateString());
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
    setHidden(true);
  };
  return (
    <Card
      as="section"
      aria-label={t("Teste grátis")}
      className={cn(
        "flex-row flex-wrap items-center gap-x-3 gap-y-2 p-[14px] text-[14px]",
        urgent && "tint-soft",
      )}
    >
      <Sparkle size={18} className="shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 basis-[220px]">
        <strong className="font-medium">
          {days === 1
            ? t("Último dia do seu teste do {{v0}}.", { v0: ent.plan_name })
            : t("Faltam {{v0}} dias do seu teste do {{v1}}.", { v0: days, v1: ent.plan_name })}
        </strong>{" "}
        <span className="text-neutral-400">
          {t("Depois a conta volta ao gratuito, sem perder nada do que você registrou.")}
        </span>
      </p>
      <div className="flex gap-2">
        <Button asChild variant="primary" size="sm">
          <Link to="/app/planos">{t("Ver planos")}</Link>
        </Button>
        {!urgent ? (
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t("Agora não")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
