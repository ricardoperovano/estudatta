/** Plano da semana sem objetivo ativo: convite, exemplo de semana e como o plano nasce. */
import { t } from "@/i18n";
import { Link } from "react-router";
import { ArrowsClockwise, CalendarPlus, ListChecks, Target } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { EmptyHero } from "./empty-hero";
import { Explainer } from "./explainer";
import { WeekPreview } from "./week-preview";

export function NoPlan({ hasPaused }: { hasPaused?: boolean }) {
  return (
    <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
      <EmptyHero
        kicker={t("Comece por aqui")}
        title={hasPaused ? t("Seus objetivos estão pausados") : t("Sua semana começa com um objetivo")}
        mood={hasPaused ? "paused" : "encourage"}
        icon={CalendarPlus}
        className="desktop:col-start-1"
        actions={
          hasPaused ? (
            <Button asChild variant="primary" size="lg" className="bg-surface">
              <Link to="/app/objetivos">{t("Ver objetivos")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="primary" size="lg" className="bg-surface">
                <Link to="/app/objetivos/novo">{t("+ Criar objetivo")}</Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="bg-surface">
                <Link to="/app/objetivos">{t("Ver modelos")}</Link>
              </Button>
            </>
          )
        }
      >
        <p className="m-0">
          {hasPaused
            ? t(
                "Enquanto estiverem pausados, nada entra no plano nem vira pendência. Reative um objetivo ou crie outro para a semana ganhar blocos.",
              )
            : t(
                "Escolha a meta e os dias, e o plano se monta sozinho: blocos em cada dia, o que já foi feito e onde encaixar mais estudo.",
              )}
        </p>
      </EmptyHero>
      <WeekPreview className="desktop:col-span-2 desktop:row-start-2" />
      <Explainer
        className="desktop:col-start-2 desktop:row-start-1"
        title={t("Como o plano nasce")}
        numbered
        items={[
          {
            icon: Target,
            title: t("Da meta de cada objetivo"),
            body: t("Minutos por dia nos dias que você escolheu."),
            tint: "accent",
          },
          {
            icon: ListChecks,
            title: t("Tarefas e sessões com horário"),
            body: t("Adicione o que quer fazer em cada dia, se quiser."),
            tint: "info",
          },
          {
            icon: ArrowsClockwise,
            title: t("Recuperação aos poucos"),
            body: t("Um dia ficou para trás? O tempo é espalhado pelos próximos, sem passar do seu limite."),
            tint: "warning",
          },
        ]}
      />
    </div>
  );
}
