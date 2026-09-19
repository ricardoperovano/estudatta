/**
 * Objetivos sem nenhum objetivo: convite do Tatá, modelos de um toque, o que é um objetivo
 * e um cartão de exemplo (apagado, com selo "Exemplo").
 */
import { Link } from "react-router";
import { ArrowsClockwise, CalendarCheck, Target, Timer } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { ObjectiveCard } from "@/components/app/objective-card";
import { EmptyHero } from "./empty-hero";
import { ExamplePreview } from "./example-preview";
import { Explainer } from "./explainer";
import { ObjectiveStarters } from "./objective-starters";

export function NoObjectives() {
  return (
    <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
      <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
        <EmptyHero
          kicker="Primeiro passo"
          title="Vamos criar seu primeiro objetivo?"
          mood="wave"
          icon={Target}
          actions={
            <Button asChild variant="primary" size="lg" className="bg-surface" data-tour="objetivos-novo">
              <Link to="/app/objetivos/novo">+ Criar objetivo</Link>
            </Button>
          }
        >
          <p className="m-0">
            Conte o que quer acompanhar e quanto tempo por dia. O plano da semana se monta sozinho a partir
            daí, e você ajusta quando quiser.
          </p>
        </EmptyHero>
        <ObjectiveStarters />
      </div>
      <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
        <ExamplePreview
          title="Assim fica um objetivo"
          summary="cartão do objetivo Inglês, 5 vezes por semana, com 1h30 feitas de 2h30 na semana, em dia."
          note="O cartão mostra a semana contra a meta e avisa com calma quando há algo a recuperar."
        >
          <ObjectiveCard
            to="/app/objetivos"
            title="Inglês"
            cadence="5×/sem"
            progress={0.6}
            progressLabel="1h30 de 2h30"
            meta="8 tópicos · 2 materiais"
          />
        </ExamplePreview>
        <Explainer
          title="O que é um objetivo?"
          items={[
            {
              icon: Target,
              title: "O que você quer acompanhar",
              body: "Um idioma, um concurso, a faculdade, um instrumento ou uma rotina.",
              tint: "accent",
            },
            {
              icon: Timer,
              title: "Uma meta pequena por dia",
              body: "Minutos por dia ou só tarefas para marcar. Pode começar com 15 minutos.",
              tint: "info",
            },
            {
              icon: CalendarCheck,
              title: "Os dias que cabem na sua vida",
              body: "Escolha os dias da semana; o plano distribui o resto.",
              tint: "success",
            },
            {
              icon: ArrowsClockwise,
              title: "Sem culpa quando atrasar",
              body: "O que ficar para trás vira recuperação aos poucos. Dá para pausar em viagens.",
              tint: "warning",
            },
          ]}
        />
      </div>
    </div>
  );
}
