import { t } from "@/i18n";
import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useActivities } from "@/api/queries";
import { useRevisions, useRevisionSummary, type Revision } from "@/api/study";
import {
  Button,
  EmptyState,
  Select,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { RevisionRow } from "@/components/app/revisions-shared";
import { daysBetween } from "@/components/app/revisions-utils";
import { todayIso } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { usePageTour } from "@/components/tour/use-tours";
import { revisoesTour } from "@/tours/revisoes";
import { NoRevisions } from "@/components/empty/no-revisions";

type TabKey = "pendentes" | "concluidas";

/** Revisões espaçadas: atrasadas, de hoje e dos próximos dias, com ações rápidas; histórico de concluídas. */
export default function RevisionsPage() {
  const [params, setParams] = useSearchParams();
  const activities = useActivities();
  const summary = useRevisionSummary();
  const acts = activities.data ?? [];
  const activityId = params.get("objetivo") || undefined;
  const tab: TabKey = params.get("aba") === "concluidas" ? "concluidas" : "pendentes";
  const pendingList = useRevisions({ status: "pending", activity_id: activityId });
  usePageTour(revisoesTour, pendingList.isSuccess);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const today = summary.data?.today ?? todayIso();
  const titleOf = (id: string) => (acts.length > 1 ? acts.find((a) => a.id === id)?.title : undefined);

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[13px] text-neutral-400">{t("Repetição espaçada")}</span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">
            {t("Revisões")}
          </h1>
        </div>
        {acts.length > 1 ? (
          <Select
            value={activityId ?? ""}
            onChange={(e) => setParam("objetivo", e.target.value || null)}
            className="min-h-[36px] w-auto py-1 text-[13px]"
            aria-label={t("Filtrar por objetivo")}
          >
            <option value="">{t("Todos os objetivos")}</option>
            {acts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </Select>
        ) : null}
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setParam("aba", v === "concluidas" ? v : null)}
        className="flex flex-col gap-[14px]"
      >
        <TabsList data-tour="revisoes-abas">
          <TabsTrigger value="pendentes">{t("Pendentes")}</TabsTrigger>
          <TabsTrigger value="concluidas">{t("Concluídas")}</TabsTrigger>
        </TabsList>
        <TabsContent value="pendentes" className="max-w-[760px] outline-none">
          <PendingList activityId={activityId} today={today} titleOf={titleOf} />
        </TabsContent>
        <TabsContent value="concluidas" className="max-w-[760px] outline-none">
          <DoneList activityId={activityId} today={today} titleOf={titleOf} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PendingList({
  activityId,
  today,
  titleOf,
}: {
  activityId?: string;
  today: string;
  titleOf: (id: string) => string | undefined;
}) {
  const online = useOnline();
  const list = useRevisions({ status: "pending", activity_id: activityId });

  if (list.isPending) return <Loading />;
  if (list.isError) return <LoadError online={online} onRetry={() => void list.refetch()} />;

  const items = list.data;
  const groups = groupPending(items, today);
  const counts = {
    overdue: groups.overdue.length,
    today: groups.today.length,
    week: groups.soon.filter((r) => daysBetween(today, r.due_date) <= 7).length,
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        className="tnum grid grid-cols-3 gap-[10px] desktop:gap-4"
        role="group"
        aria-label={t("Resumo das revisões")}
        data-tour="revisoes-contadores"
      >
        <Figure
          value={counts.overdue}
          label={counts.overdue === 1 ? "atrasada" : "atrasadas"}
          tone={counts.overdue > 0 ? "pending" : undefined}
        />
        <Figure value={counts.today} label={t("para hoje")} tone={counts.today > 0 ? "accent" : undefined} />
        <Figure value={counts.week} label={t("próximos 7 dias")} />
      </div>

      {items.length === 0 ? (
        <NoRevisions />
      ) : (
        <>
          <Group
            title={t("Atrasadas")}
            kicker="kicker-pending"
            items={groups.overdue}
            today={today}
            titleOf={titleOf}
          />
          <Group
            title={t("Hoje")}
            kicker="kicker-accent"
            items={groups.today}
            today={today}
            titleOf={titleOf}
            empty={groups.overdue.length === 0 ? t("Nada para revisar hoje.") : undefined}
          />
          <Group title={t("Próximos dias")} items={groups.soon} today={today} titleOf={titleOf} />
          <Group title={t("Mais adiante")} items={groups.later} today={today} titleOf={titleOf} />
          <p className="text-[13px] text-neutral-400">
            {t(
              "Uma sessão do tipo Revisão na mesma matéria ou tópico conclui a revisão sozinha e agenda a próxima etapa.",
            )}{" "}
            <Link to="/app/preferencias" data-tour="revisoes-intervalos">
              {t("Mudar intervalos")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function DoneList({
  activityId,
  today,
  titleOf,
}: {
  activityId?: string;
  today: string;
  titleOf: (id: string) => string | undefined;
}) {
  const online = useOnline();
  const list = useRevisions({ status: "done", activity_id: activityId });
  if (list.isPending) return <Loading />;
  if (list.isError) return <LoadError online={online} onRetry={() => void list.refetch()} />;
  if (list.data.length === 0) {
    return (
      <EmptyState
        title={t("Nenhuma revisão concluída ainda.")}
        description={t("Quando você concluir uma revisão, ela aparece aqui com a data.")}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label={t("Revisões concluídas")}>
      {list.data.map((r) => (
        <RevisionRow
          key={r.id}
          revision={r}
          today={today}
          activityTitle={titleOf(r.activity_id)}
          className="bg-surface shadow-sm"
        />
      ))}
    </ul>
  );
}

function groupPending(items: Revision[], today: string) {
  const g = {
    overdue: [] as Revision[],
    today: [] as Revision[],
    soon: [] as Revision[],
    later: [] as Revision[],
  };
  for (const r of items) {
    const d = daysBetween(today, r.due_date);
    if (d < 0) g.overdue.push(r);
    else if (d === 0) g.today.push(r);
    else if (d <= 7) g.soon.push(r);
    else g.later.push(r);
  }
  return g;
}

function Group({
  title,
  kicker = "kicker",
  items,
  today,
  titleOf,
  empty,
}: {
  title: string;
  kicker?: string;
  items: Revision[];
  today: string;
  titleOf: (id: string) => string | undefined;
  empty?: string;
}) {
  const headingId = React.useId();
  if (items.length === 0 && !empty) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <h2 id={headingId} className={cn(kicker, "font-normal")}>
        {title}
        {items.length > 0 ? ` · ${items.length}` : ""}
      </h2>
      {items.length === 0 ? (
        <p className="text-[13px] text-neutral-400">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r) => (
            <RevisionRow
              key={r.id}
              revision={r}
              today={today}
              activityTitle={titleOf(r.activity_id)}
              className="bg-surface shadow-sm"
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Figure({ value, label, tone }: { value: number; label: string; tone?: "pending" | "accent" }) {
  return (
    <div className="rounded-md bg-surface px-3 py-[10px]">
      <span
        className={cn(
          "block text-[22px] font-medium desktop:text-[25px]",
          tone === "pending" && "text-pending",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </span>
      <span className="text-[12px] text-neutral-400">{label}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12" role="status" aria-label={t("Carregando revisões")}>
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function LoadError({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  return (
    <EmptyState
      title={t("Não foi possível carregar as revisões.")}
      description={
        online
          ? t("Tente de novo em instantes.")
          : t("Sem conexão: as revisões aparecem quando você voltar à internet.")
      }
      action={<Button onClick={onRetry}>{t("Tentar de novo")}</Button>}
    />
  );
}
