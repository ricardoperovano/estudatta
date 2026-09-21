/** Simulados sem registro: convite, exemplo apagado da evolução e das matérias, e o que anotar. */
import { t } from "@/i18n";
import { ChartLineUp, Exam, ListNumbers, Target } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { EmptyHero } from "./empty-hero";
import { ExamplePreview } from "./example-preview";
import { Explainer } from "./explainer";

const EXAMS = [
  { label: "1º", pct: 58 },
  { label: "2º", pct: 64 },
  { label: "3º", pct: 61 },
  { label: "4º", pct: 72 },
];
const SUBJECTS = [
  { name: t("Português"), pct: 78 },
  { name: t("Direito constitucional"), pct: 66 },
  { name: t("Matemática"), pct: 45 },
];

export function NoMockExams({ onNew }: { onNew: () => void }) {
  return (
    <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
      <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
        <EmptyHero
          kicker={t("Nenhum simulado ainda")}
          title={t("Veja sua evolução a cada simulado")}
          mood="focus"
          icon={Exam}
          actions={
            <Button
              variant="primary"
              size="lg"
              className="bg-surface"
              onClick={onNew}
              data-tour="simulados-novo"
            >
              {t("Registrar simulado")}
            </Button>
          }
        >
          <p className="m-0">
            {t(
              "Anote o resultado no total ou por matéria. Os números mostram se você está melhorando e quais matérias pedem mais atenção.",
            )}
          </p>
        </EmptyHero>
        <Explainer
          title={t("O que anotar")}
          items={[
            {
              icon: ListNumbers,
              title: t("Questões e acertos"),
              body: t("No total ou separados por matéria. Leva um minuto."),
              tint: "accent",
            },
            {
              icon: ChartLineUp,
              title: t("A evolução aparece sozinha"),
              body: t("Último, melhor e a variação entre um simulado e outro."),
              tint: "info",
            },
            {
              icon: Target,
              title: t("Onde focar"),
              body: t("As matérias com menos acertos ficam em destaque."),
              tint: "warning",
            },
          ]}
        />
      </div>
      <ExamplePreview
        className="desktop:self-start"
        title={t("Assim fica o acompanhamento")}
        summary={t(
          "quatro simulados com 58, 64, 61 e 72 por cento de acertos; por matéria, Português 78, Direito constitucional 66 e Matemática 45 por cento.",
        )}
      >
        <div className="flex flex-col gap-3">
          <div className="rounded-md bg-surface p-3 shadow-sm">
            <span className="kicker">{t("Evolução")}</span>
            <div className="mt-2 flex h-[112px] items-end gap-3">
              {EXAMS.map((e, i) => (
                <div key={e.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="tnum text-[11px] text-neutral-300">{e.pct}%</span>
                  <span
                    className={cn(
                      "block w-full rounded-t-[6px]",
                      i === EXAMS.length - 1 ? "bg-accent" : "bg-accent-800",
                    )}
                    style={{ height: `${e.pct}px` }}
                  />
                  <span className="text-[11px] text-neutral-400">{e.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-md bg-surface p-3 shadow-sm">
            <span className="kicker">{t("Por matéria")}</span>
            {SUBJECTS.map((s) => (
              <div key={s.name} className="text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  <span className={cn("tnum shrink-0", s.pct < 50 ? "text-pending" : "text-neutral-400")}>
                    {s.pct}%
                  </span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-track">
                  <span
                    className={cn("block h-full rounded-full", s.pct < 50 ? "bg-pending" : "bg-accent")}
                    style={{ width: `${s.pct}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </ExamplePreview>
    </div>
  );
}
