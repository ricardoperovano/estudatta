import * as React from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { ArrowsClockwise, CaretLeft, ChartLineUp } from "@phosphor-icons/react";
import { Banner, Bar, Button, EmptyState, Spinner, Tabs, TabsContent, TabsList, TabsTrigger, Tag } from "@/components/ui";
import { ApiError } from "@/api/client";
import { useActivity, useBalance } from "@/api/queries";
import { categoryLabel, useSummary } from "@/api/activity-settings";
import { ActivityMaterialsTab } from "@/components/app/activity-materials-tab";
import { ActivitySettingsTab } from "@/components/app/activity-settings-tab";
import { ActivityTasksTab } from "@/components/app/activity-tasks-tab";
import { StudyInsightsCard } from "@/components/app/study-insights-card";
import { SubjectTree } from "@/components/app/subject-tree";
import { weekTargetSeconds } from "@/components/app/week-utils";
import { fmtDayShort, fmtMinutes, todayIso } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { usePageTour } from "@/components/tour/use-tours";
import { objetivoTour } from "@/tours/objetivo";
import { cn } from "@/lib/utils";

const TABS = ["materias", "materiais", "tarefas", "config"] as const;
type TabKey = (typeof TABS)[number];

/** Tela 06 · Objetivo: kicker, título, três números, barra e abas Matérias · Materiais · Tarefas · Configurações. */
export default function ActivityDetailPage() {
  const { id } = useParams();
  const online = useOnline();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const activity = useActivity(id);
  const balance = useBalance(id, 14);
  const week = useSummary("week", null, id ?? null, !!id);
  const month = useSummary("month", null, id ?? null, !!id);
  usePageTour(objetivoTour, !!activity.data && !balance.isPending && !week.isPending && !month.isPending);

  const raw = params.get("aba");
  const tab: TabKey = TABS.includes(raw as TabKey) ? (raw as TabKey) : "materias";
  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === "materias") next.delete("aba");
    else next.set("aba", v);
    setParams(next, { replace: true });
  };

  // âncoras vindas da recuperação (#perdoar, #meta)
  const loaded = !!activity.data;
  React.useEffect(() => {
    if (!loaded || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ block: "start" });
  }, [loaded, location.hash, tab]);

  if (activity.isPending) {
    return (
      <div className="flex justify-center py-20" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (activity.isError || !activity.data) {
    const notFound = activity.error instanceof ApiError && activity.error.status === 404;
    return (
      <EmptyState
        title={notFound ? "Objetivo não encontrado." : "Não foi possível carregar o objetivo."}
        description={notFound ? "Ele pode ter sido excluído." : online ? "Tente de novo em instantes." : "Sem conexão: o objetivo aparece quando você voltar à internet."}
        action={
          notFound ? (
            <Button asChild>
              <Link to="/app/objetivos">Ver objetivos</Link>
            </Button>
          ) : (
            <Button onClick={() => activity.refetch()}>Tentar de novo</Button>
          )
        }
      />
    );
  }

  const act = activity.data;
  const today = todayIso();
  const summary = balance.data?.today ?? null;
  const pending = summary?.pending_prior ?? 0;
  const weekLogged = week.data?.logged_seconds ?? 0;
  const weekTarget = week.data?.planned_seconds || weekTargetSeconds(act.current_rule);
  const currentPause = act.pauses.find((p) => p.start_date <= today && p.end_date >= today);
  const hasTime = act.tracking_mode !== "checklist";
  const dash = <span className="text-neutral-500">—</span>;

  return (
    <div className="flex flex-col gap-[14px]">
      <Link to="/app/objetivos" className="inline-flex min-h-[32px] items-center gap-1 self-start text-[13px] text-neutral-400 no-underline hover:text-primary desktop:hidden">
        <CaretLeft size={14} aria-hidden /> Objetivos
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <span className="kicker-accent">Objetivo · {categoryLabel(act.category, act.language)}</span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">{act.title}</h1>
        </div>
        {act.status === "active" ? (
          <div className="hidden gap-2 desktop:flex">
            {pending > 0 ? (
              <Button asChild variant="secondary" size="lg">
                <Link to={`/app/objetivos/${act.id}/recuperar`}>Distribuir pendência</Link>
              </Button>
            ) : null}
            <Button asChild variant="primary" size="lg">
              <Link to={`/app/sessao?objetivo=${act.id}`}>Começar sessão</Link>
            </Button>
          </div>
        ) : null}
      </div>

      {act.status !== "active" ? (
        <Tag variant="neutral" className="self-start">
          {act.status === "paused" ? "Objetivo pausado · nada entra como pendência" : "Objetivo arquivado"}
        </Tag>
      ) : currentPause ? (
        <Tag variant="neutral" className="self-start">
          Pausa planejada · {fmtDayShort(currentPause.start_date)} a {fmtDayShort(currentPause.end_date)}
        </Tag>
      ) : null}

      {balance.isError || week.isError ? (
        <Banner kind={online ? "error" : "offline"} actions={<Button size="sm" variant="secondary" onClick={() => { void balance.refetch(); void week.refetch(); void month.refetch(); }}>Tentar de novo</Button>}>
          {online ? "Não foi possível carregar o saldo deste objetivo." : "Sem conexão: o saldo aparece quando você voltar à internet."}
        </Banner>
      ) : null}

      <div className="flex flex-col gap-[14px]" data-tour="objetivo-numeros">
        <div className="tnum flex gap-4 desktop:gap-8">
          <Figure value={week.data ? fmtMinutes(weekLogged) : dash} label={hasTime ? `esta semana / ${fmtMinutes(weekTarget)}` : "esta semana"} />
          <Figure value={month.data ? String(month.data.sessions_count) : dash} label={month.data?.sessions_count === 1 ? "sessão no mês" : "sessões no mês"} />
          <Figure value={balance.data ? fmtMinutes(pending) : dash} label="a recuperar" pending={pending > 0} />
        </div>
        <Bar value={weekTarget > 0 ? weekLogged / weekTarget : 0} height={6} label={`${fmtMinutes(weekLogged)} de ${fmtMinutes(weekTarget)} nesta semana`} />
      </div>

      {act.status === "active" ? (
        <div className="flex items-center justify-between gap-2 desktop:hidden">
          <Button asChild variant="primary" size="lg" className="flex-1">
            <Link to={`/app/sessao?objetivo=${act.id}`}>Começar sessão</Link>
          </Button>
          {pending > 0 ? (
            <Button asChild variant="ghost" size="lg" className="text-[13px]">
              <Link to={`/app/objetivos/${act.id}/recuperar`}>Distribuir pendência</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {hasTime ? (
        <div className="flex max-w-[760px] flex-col gap-2">
          <StudyInsightsCard activityId={act.id} />
          <div className="flex flex-wrap gap-2 self-start" data-tour="objetivo-atalhos">
            <Button asChild variant="secondary" size="lg">
              <Link to={`/app/objetivos/${act.id}/simulados`}>
                <ChartLineUp size={16} aria-hidden /> Simulados
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to={`/app/revisoes?objetivo=${act.id}`}>
                <ArrowsClockwise size={16} aria-hidden /> Revisões
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-[14px]">
        <TabsList className="overflow-x-auto" data-tour="objetivo-abas">
          <TabsTrigger value="materias">Matérias</TabsTrigger>
          <TabsTrigger value="materiais">Materiais</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
          <TabsTrigger value="config">Configurações</TabsTrigger>
        </TabsList>
        <TabsContent value="materias" className="max-w-[760px] outline-none">
          <SubjectTree activityId={act.id} />
        </TabsContent>
        <TabsContent value="materiais" className="max-w-[760px] outline-none">
          <ActivityMaterialsTab activityId={act.id} />
        </TabsContent>
        <TabsContent value="tarefas" className="max-w-[760px] outline-none">
          <ActivityTasksTab activity={act} />
        </TabsContent>
        <TabsContent value="config" className="max-w-[760px] outline-none">
          <ActivitySettingsTab activity={act} pendingSeconds={pending} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Figure({ value, label, pending }: { value: React.ReactNode; label: string; pending?: boolean }) {
  return (
    <div>
      <span className={cn("block text-[20px] font-medium desktop:text-[24px]", pending && "text-pending")}>{value}</span>
      <span className="text-[12px] text-neutral-400">{label}</span>
    </div>
  );
}
