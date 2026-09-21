/**
 * Relatório sem nenhum registro no período: convite curto no topo (os números zerados logo
 * abaixo já mostram o formato do relatório, com dados reais).
 */
import { t } from "@/i18n";
import { Link } from "react-router";
import { ChartLineUp } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { EmptyHero } from "./empty-hero";

export function ReportWelcome({
  hasObjective,
  current,
  inPeriod,
}: {
  hasObjective: boolean;
  current: boolean;
  inPeriod: string;
}) {
  if (!current) {
    return (
      <EmptyHero
        kicker={t("Sem registros")}
        title={t("Nada registrado {{v0}}", { v0: inPeriod })}
        mood="sleep"
        icon={ChartLineUp}
      >
        <p className="m-0">
          {t(
            "Tudo bem: períodos sem estudo não apagam nada do que você já fez. Use as setas para ver outros períodos.",
          )}
        </p>
      </EmptyHero>
    );
  }
  return (
    <EmptyHero
      kicker={t("Seu relatório")}
      title={
        hasObjective
          ? t("Seu relatório começa na primeira sessão")
          : t("Primeiro, um objetivo; depois, o relatório")
      }
      mood={hasObjective ? "encourage" : "wave"}
      icon={ChartLineUp}
      actions={
        hasObjective ? (
          <>
            <Button asChild variant="primary" size="lg" className="bg-surface">
              <Link to="/app/sessao">{t("Começar sessão")}</Link>
            </Button>
            <Button asChild variant="secondary" size="lg" className="bg-surface">
              <Link to="/app?registrar=1">{t("Registrar tempo")}</Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="primary" size="lg" className="bg-surface">
            <Link to="/app/objetivos/novo">{t("+ Criar objetivo")}</Link>
          </Button>
        )
      }
    >
      <p className="m-0">
        {hasObjective
          ? t(
              "Cada sessão entra aqui: tempo por dia, dias com registro e o que ficou para recuperar. Pode começar com 15 minutos.",
            )
          : t(
              "Crie um objetivo com meta e dias. A partir da primeira sessão, você vê aqui a sua constância, dia a dia.",
            )}
      </p>
      <p className="m-0 text-[13px] text-neutral-400">
        {t("Tempo registrado mede constância, não aprendizado. Sem ranking e sem comparação.")}
      </p>
    </EmptyHero>
  );
}
