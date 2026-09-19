/** Notificações vazias: o que costuma chegar aqui e onde ajustar os lembretes. */
import { Link } from "react-router";
import { Alarm, BellSimple, ChartLineUp, Target, UserCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { EmptyHero } from "./empty-hero";
import { Explainer } from "./explainer";

export function NoNotifications() {
  return (
    <div className="flex flex-col gap-4">
      <EmptyHero
        kicker="Tudo calmo"
        title="Nenhuma notificação ainda"
        mood="sleep"
        icon={BellSimple}
        actions={
          <Button asChild variant="primary" size="lg" className="bg-surface">
            <Link to="/app/preferencias">Ajustar lembretes</Link>
          </Button>
        }
      >
        <p className="m-0">
          Quando chegar a hora de estudar ou houver algo importante na sua conta, o aviso aparece aqui, mesmo
          que você não tenha visto na hora.
        </p>
      </EmptyHero>
      <Explainer
        title="O que chega aqui"
        items={[
          {
            icon: Alarm,
            title: "Hora de estudar",
            body: "Um lembrete no horário que você escolher, nos dias do seu objetivo.",
            tint: "accent",
          },
          {
            icon: Target,
            title: "Meta do dia",
            body: "Um aviso gentil perto do fim do dia e um parabéns quando a meta fecha.",
            tint: "success",
          },
          {
            icon: ChartLineUp,
            title: "Resumo da semana",
            body: "Como foi a sua constância, sem cobrança.",
            tint: "info",
          },
          {
            icon: UserCircle,
            title: "Avisos da conta",
            body: "Assinatura e recados importantes.",
            tint: "warning",
          },
        ]}
      />
    </div>
  );
}
