/** Notificações vazias: o que costuma chegar aqui e onde ajustar os lembretes. */
import { t } from "@/i18n";
import { Link } from "react-router";
import { Alarm, BellSimple, ChartLineUp, Target, UserCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { EmptyHero } from "./empty-hero";
import { Explainer } from "./explainer";

export function NoNotifications() {
  return (
    <div className="flex flex-col gap-4">
      <EmptyHero
        kicker={t("Tudo calmo")}
        title={t("Nenhuma notificação ainda")}
        mood="sleep"
        icon={BellSimple}
        actions={
          <Button asChild variant="primary" size="lg" className="bg-surface">
            <Link to="/app/preferencias">{t("Ajustar lembretes")}</Link>
          </Button>
        }
      >
        <p className="m-0">
          {t(
            "Quando chegar a hora de estudar ou houver algo importante na sua conta, o aviso aparece aqui, mesmo que você não tenha visto na hora.",
          )}
        </p>
      </EmptyHero>
      <Explainer
        title={t("O que chega aqui")}
        items={[
          {
            icon: Alarm,
            title: t("Hora de estudar"),
            body: t("Um lembrete no horário que você escolher, nos dias do seu objetivo."),
            tint: "accent",
          },
          {
            icon: Target,
            title: t("Meta do dia"),
            body: t("Um aviso gentil perto do fim do dia e um parabéns quando a meta fecha."),
            tint: "success",
          },
          {
            icon: ChartLineUp,
            title: t("Resumo da semana"),
            body: t("Como foi a sua constância, sem cobrança."),
            tint: "info",
          },
          {
            icon: UserCircle,
            title: t("Avisos da conta"),
            body: t("Assinatura e recados importantes."),
            tint: "warning",
          },
        ]}
      />
    </div>
  );
}
