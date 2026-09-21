/**
 * Revisões sem nada pendente: como as revisões aparecem sozinhas (linha do tempo com os
 * intervalos da pessoa) e um exemplo apagado de como fica uma revisão na lista.
 */
import { t } from "@/i18n";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowsClockwise, BookOpen } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { usePreferences } from "@/api/settings";
import { cn } from "@/lib/utils";
import { EmptyHero } from "./empty-hero";
import { ExamplePreview } from "./example-preview";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Linha do tempo: estudou → revisões depois de N dias (padrão 1, 7 e 30). */
export function SpacedTimeline({ className }: { className?: string }) {
  const prefs = usePreferences();
  const raw = (prefs.data as { revision_intervals?: number[] } | undefined)?.revision_intervals;
  const intervals = raw && raw.length > 0 ? raw.slice(0, 5) : [1, 7, 30];
  return (
    <section
      aria-labelledby="linha-revisoes"
      className={cn(
        "rise-in flex flex-col gap-3 rounded-[20px] bg-surface p-4 shadow-sm desktop:p-5",
        className,
      )}
    >
      <h2 id="linha-revisoes" className="text-[15px] font-medium">
        {t("Como as revisões aparecem")}
      </h2>
      <ol className="m-0 flex list-none items-start gap-0 p-0">
        <Stop
          icon={<BookOpen size={18} weight="duotone" />}
          tone="accent"
          title={t("Você estuda")}
          sub={t("teoria, aula, leitura…")}
          first
        />
        {intervals.map((d, i) => (
          <Stop
            key={i}
            icon={<span className="tnum text-[12px] font-semibold">{i + 1}ª</span>}
            tone={i === intervals.length - 1 ? "success" : "info"}
            title={`+${plural(d, "dia", "dias")}`}
            sub={t("{{v0}}ª revisão", { v0: i + 1 })}
          />
        ))}
      </ol>
      <p className="m-0 text-[13px] leading-[1.45] text-neutral-400">
        {t("Basta escolher a matéria ao registrar uma sessão. Uma sessão do tipo")}{" "}
        <strong className="font-medium text-neutral-300">{t("Revisão")}</strong>{" "}
        {t("na mesma matéria conclui a revisão do dia e agenda a próxima.")}
      </p>
    </section>
  );
}

function Stop({
  icon,
  tone,
  title,
  sub,
  first,
}: {
  icon: ReactNode;
  tone: "accent" | "info" | "success";
  title: string;
  sub: string;
  first?: boolean;
}) {
  return (
    <li className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      {!first ? (
        <span
          className="absolute right-1/2 top-[17px] h-0 w-full border-t-2 border-dashed border-neutral-700"
          aria-hidden
        />
      ) : null}
      <span
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-full",
          tone === "accent" && "bg-accent-900 text-accent",
          tone === "info" && "bg-info-tint text-info",
          tone === "success" && "bg-success-tint text-success",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="tnum text-[13px] font-medium leading-tight">{title}</span>
      <span className="text-[11px] leading-tight text-neutral-400">{sub}</span>
    </li>
  );
}

function ExampleRow({
  title,
  due,
  step,
  late,
  today,
}: {
  title: string;
  due: string;
  step: string;
  late?: boolean;
  today?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md bg-surface px-3 py-[10px] shadow-sm",
        late && "border-l-2 border-pending",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium">{title}</span>
        <span
          className={cn("text-[12px]", late ? "text-pending" : today ? "text-accent" : "text-neutral-400")}
        >
          {due}
        </span>
      </div>
      <span className="text-[12px] text-neutral-400">{step}</span>
      {today ? (
        <span className="mt-1 flex gap-2">
          <span className="rounded-md border border-accent px-2.5 py-1 text-[12px] text-accent">
            {t("Revisar agora")}
          </span>
          <span className="rounded-md border border-divider px-2.5 py-1 text-[12px]">{t("Concluir")}</span>
        </span>
      ) : null}
    </div>
  );
}

export function NoRevisions() {
  return (
    <div className="flex flex-col gap-4">
      <EmptyHero
        kicker={t("Nada para revisar")}
        title={t("As revisões chegam sozinhas")}
        mood="think"
        icon={ArrowsClockwise}
        actions={
          <>
            <Button asChild variant="primary" size="lg" className="bg-surface">
              <Link to="/app/sessao">{t("Começar sessão")}</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="bg-surface"
              data-tour="revisoes-intervalos"
            >
              <Link to="/app/preferencias">{t("Mudar intervalos")}</Link>
            </Button>
          </>
        }
      >
        <p className="m-0">
          {t(
            "Estudou um conteúdo? A revisão aparece aqui na hora certa, para ele não escapar da memória. Você não precisa criar nada.",
          )}
        </p>
      </EmptyHero>
      <SpacedTimeline />
      <ExamplePreview
        title={t("Assim fica uma revisão")}
        summary={t(
          "revisão de Verbos irregulares para hoje, primeira revisão um dia depois, com os botões Revisar agora e Concluir; e Crase, segunda revisão, em 5 dias.",
        )}
      >
        <div className="flex flex-col gap-2">
          <ExampleRow
            title={t("Verbos irregulares")}
            due={t("para hoje")}
            step={t("1ª revisão · 1 dia depois · Inglês")}
            today
          />
          <ExampleRow
            title={t("Crase")}
            due={t("em 5 dias")}
            step={t("2ª revisão · 7 dias depois · Português")}
          />
        </div>
      </ExamplePreview>
    </div>
  );
}
