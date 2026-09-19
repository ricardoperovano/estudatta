import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, BookBookmark, BookOpen, CalendarPlus, Certificate, ChalkboardTeacher, Check, Exam, GraduationCap, HouseLine, Lightning, Translate, type Icon } from "@phosphor-icons/react";
import { useToday, useToggleTask } from "@/api/queries";
import { useUser } from "@/api/session";
import { Banner, Button, Card, Checkbox, EmptyState, GoalBar, Legend, Spinner, Tag } from "@/components/ui";
import { fmtDayLong, fmtDayShort, fmtMinutes, fmtMinutesShort, fmtTime } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { useSyncStore } from "@/offline/sync";
import { ManualEntrySheet } from "./manual-entry";
import { RevisionsToday } from "@/components/app/revisions-today";
import { StudyInsightsCard } from "@/components/app/study-insights-card";
import { useTimerStore, elapsedSeconds } from "@/app/timer/store";
import { cn } from "@/lib/utils";
import { TataSvg } from "@/components/mascot/TataSvg";
import { useTataPrefs } from "@/components/mascot/use-tata";
import { TodayHero } from "@/components/today/today-hero";
import { FirstSteps } from "@/components/today/first-steps";
import { InstallBanner } from "@/components/install";
import { HowItWorks } from "@/components/today/how-it-works";
import { TataTip } from "@/components/today/tata-tip";
import { usePageTour } from "@/components/tour/use-tours";
import { hojeTour } from "@/tours/hoje";
import type { TodayCard, AgendaItem } from "@/api/types";

/** Tela Hoje: um próximo passo executável por objetivo, "Começar sessão" em destaque e "Registrar tempo". */
export default function TodayPage() {
  const user = useUser();
  const online = useOnline();
  const sync = useSyncStore();
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [manualFor, setManualFor] = React.useState<TodayCard | null>(null);
  const timer = useTimerStore((s) => s.timer);
  const nav = useNavigate();

  // tour de boas-vindas: começa quando o plano de hoje carregou e há objetivo na tela
  usePageTour(hojeTour, !!today.data && today.data.data.cards.length > 0);
  const wantsManual = params.get("registrar") === "1";
  const closeManual = () => {
    setManualFor(null);
    if (wantsManual) {
      params.delete("registrar");
      setParams(params, { replace: true });
    }
  };

  React.useEffect(() => {
    if (user) useTimerStore.getState().load(user.id);
  }, [user]);

  if (today.isPending) {
    return (
      <div className="flex justify-center py-20" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (today.isError || !today.data) {
    return (
      <EmptyState
        mascot="think"
        variant="card"
        className="mt-6"
        title="Não foi possível carregar o plano de hoje."
        description={online ? "Tente de novo em instantes." : "Sem conexão e sem plano salvo neste aparelho ainda."}
        action={<Button onClick={() => today.refetch()}>Tentar de novo</Button>}
      />
    );
  }

  const { data, offline, savedAt } = today.data;
  const dateLabel = fmtDayShort(data.date);
  const dateLong = fmtDayLong(data.date);
  const cards = data.cards;
  const first = cards[0];
  const studyActs = cards.filter((c) => c.activity.tracking_mode !== "checklist").map((c) => ({ id: c.activity.id, title: c.activity.title }));
  const activeTimer = timer && (timer.status === "active" || timer.status === "paused") ? timer : null;

  const hour = new Date().getHours();
  const syncTag = !online ? (
    <Tag variant="info">Sem conexão</Tag>
  ) : sync.status === "syncing" ? (
    <Tag variant="neutral" icon={<Spinner />}>Sincronizando</Tag>
  ) : offline ? (
    <Tag variant="info">Salvo {savedAt ? fmtTime(savedAt) : ""}</Tag>
  ) : (
    <Tag variant="success" icon={<Check size={11} weight="bold" aria-hidden />}>Sincronizado</Tag>
  );

  return (
    <div className="relative isolate flex flex-col gap-4 desktop:gap-6">

      <TodayHero
        cards={cards}
        inSession={!!activeTimer}
        hour={hour}
        userName={user?.name}
        dateShort={dateLabel}
        dateLong={dateLong}
        status={syncTag}
        week={first ? <WeekDots card={first} /> : null}
        actions={
          first ? (
            <>
              <Button variant="secondary" size="lg" className="bg-surface" onClick={() => setManualFor(first)} data-tour="registrar">
                Registrar manualmente
              </Button>
              <Button variant="primary" size="lg" className="bg-surface" onClick={() => nav(`/app/sessao?objetivo=${first.activity.id}`)} data-tour="comecar">
                Começar sessão
              </Button>
            </>
          ) : (
            <Button asChild variant="primary" size="lg" className="bg-surface">
              <Link to="/app/objetivos/novo">Criar meu primeiro objetivo</Link>
            </Button>
          )
        }
      />

      {offline ? <Banner kind="offline">Saldo provisório: mostrando o último plano sincronizado{savedAt ? ` às ${fmtTime(savedAt)}` : ""}.</Banner> : null}

      {activeTimer ? (
        <Card className="tint-soft gap-2 rounded-[20px] p-4 shadow-accent-ring">
          <div className="flex items-center justify-between">
            <span className="kicker-accent flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", activeTimer.status === "active" ? "animate-pulse bg-success" : "bg-pending")} aria-hidden />
              {activeTimer.status === "active" ? "Em sessão" : "Sessão pausada"}
            </span>
            <Tag variant="neutral">{activeTimer.activity_title}</Tag>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="tnum text-[32px] font-semibold">{fmtMinutes(elapsedSeconds(activeTimer))}</span>
            <Button variant="primary" size="lg" className="bg-surface" onClick={() => nav("/app/sessao")}>
              Voltar à sessão
            </Button>
          </div>
        </Card>
      ) : null}

      {cards.length === 0 ? (
        <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
          <FirstSteps hasObjective={false} />
          <div className="flex flex-col gap-4 desktop:gap-6">
            <HowItWorks />
            <TataTip hasObjective={false} />
          </div>
        </div>
      ) : (
        <>
          <FirstSteps hasObjective />
          {/* convite para instalar no celular (some quando instalado ou dispensado por 14 dias) */}
          <InstallBanner />
          <div className="grid gap-4 desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-6">
            <div className="flex min-w-0 flex-col gap-4 desktop:gap-6">
              <div className="flex flex-col gap-4" data-tour="hoje-objetivos">
                {cards.map((c) => (
                  <ActivityTodayCard key={c.activity.id} card={c} onManual={() => setManualFor(c)} onStart={() => nav(`/app/sessao?objetivo=${c.activity.id}`)} hideActionsOnDesktop={c === first} />
                ))}
              </div>
              <div data-tour="revisoes-hoje" className="empty:hidden">
                <RevisionsToday />
              </div>
              {studyActs.length > 0 ? <StudyInsightsCard activityId={studyActs[0].id} activities={studyActs} hideWhenEmpty /> : null}
            </div>
            <div className="flex min-w-0 flex-col gap-4 desktop:sticky desktop:top-6 desktop:gap-6 desktop:self-start">
              <Agenda items={data.agenda} cards={cards} />
              <TataTip hasObjective />
            </div>
          </div>
          <ObjectiveRow cards={cards} />
        </>
      )}

      {(manualFor ?? (wantsManual ? first : null)) ? (
        <ManualEntrySheet card={(manualFor ?? first)!} cards={cards} open onOpenChange={(o) => !o && closeManual()} />
      ) : null}
    </div>
  );
}

const CATEGORY_ICON: Record<string, Icon> = {
  ingles: Translate,
  idioma: Translate,
  concurso: Exam,
  faculdade: GraduationCap,
  certificacao: Certificate,
  curso: ChalkboardTeacher,
  leitura: BookOpen,
  pratica: Lightning,
  rotina: HouseLine,
};

function ActivityBadge({ category }: { category: string }) {
  const I = CATEGORY_ICON[category] ?? BookBookmark;
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-accent-900 text-accent" aria-hidden>
      <I size={20} weight="duotone" />
    </span>
  );
}

function ActivityTodayCard({ card, onManual, onStart, hideActionsOnDesktop }: { card: TodayCard; onManual: () => void; onStart: () => void; hideActionsOnDesktop?: boolean }) {
  const { enabled: mascot } = useTataPrefs();
  const s = card.summary;
  const act = card.activity;
  const rule = act.current_rule;
  const activeDays = rule ? Object.entries(rule.minutes_by_weekday).filter(([, m]) => Number(m) > 0).length : 0;
  const daysLabel = rule ? summarizeDays(rule.minutes_by_weekday as Record<string, number>) : "";

  if (card.pause) {
    return (
      <Card className="gap-3 rounded-[20px] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {mascot ? <TataSvg mood="paused" size={48} className="shrink-0" /> : <ActivityBadge category={act.category} />}
          <div className="min-w-0">
            <span className="block text-[17px] font-medium">{act.title}</span>
            <Tag variant="info" icon={false}>
              Pausa planejada · {fmtDayShort(card.pause.start_date)} a {fmtDayShort(card.pause.end_date)}
            </Tag>
          </div>
        </div>
        <p className="text-[15px]">Você marcou estes dias como pausa. Nada entra como pendência e os lembretes ficam em silêncio.</p>
        <p className="text-[13px] text-neutral-400">{card.next_step}</p>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="lg" className="flex-1">
            <Link to={`/app/objetivos/${act.id}`}>Encurtar pausa</Link>
          </Button>
          <Button variant="ghost" size="lg" onClick={onStart}>
            Estudar mesmo assim
          </Button>
        </div>
      </Card>
    );
  }

  if (!s) return null;
  const goalDone = s.goal_met;
  const pendingAfter = s.pending_after_plan;

  if (act.tracking_mode === "checklist") {
    const cl = card.checklist as { done?: number; total?: number } | null;
    return (
      <Card className="gap-3 rounded-[20px] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <ActivityBadge category={act.category} />
          <div className="min-w-0 flex-1">
            <span className="block text-[17px] font-medium">{act.title}</span>
            <span className="text-[12px] text-neutral-400">checklist</span>
          </div>
        </div>
        <p className="text-[14px] text-neutral-300">{cl ? `${cl.done} de ${cl.total} tarefas de hoje concluídas.` : "Sem tarefas hoje."}</p>
        <Button asChild variant="secondary" size="lg">
          <Link to={`/app/objetivos/${act.id}`}>Ver tarefas</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card className="gap-3 rounded-[20px] p-4 shadow-sm desktop:gap-4 desktop:p-6">
      <div className="flex items-center gap-3">
        <ActivityBadge category={act.category} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[17px] font-medium desktop:text-[20px]">{act.title}</span>
            {goalDone ? <Tag variant="success">Dia concluído</Tag> : null}
          </div>
          <span className="block text-[12px] text-neutral-400 desktop:text-[13px]">
            {goalDone ? (
              <>{daysLabel}</>
            ) : s.target === 0 ? (
              <>Hoje é dia de descanso · {daysLabel}</>
            ) : (
              <>
                meta base {fmtMinutesShort(s.target)}
                <span className="hidden desktop:inline"> · {daysLabel}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {goalDone && s.pending_prior === 0 ? (
        <div className="h-2.5 rounded-full bg-success desktop:h-3" role="img" aria-label="Meta de hoje cumprida" />
      ) : (
        <GoalBar logged={s.logged} target={s.target} recovery={s.suggested_recovery} height={10} className="rounded-full desktop:h-3" />
      )}
      <Legend className="hidden desktop:flex" items={[{ swatch: "accent", label: "Registrado" }, { swatch: "outline", label: "Falta da meta" }, { swatch: "recovery", label: "Recuperação sugerida" }]} />

      {goalDone && s.pending_prior === 0 ? (
        <div className="tnum grid grid-cols-2 gap-2">
          <Stat value={fmtMinutesShort(s.logged)} label="Registrado hoje" tone="success" />
          <Stat value="0 min" label="Pendência" />
        </div>
      ) : (
        <div className="tnum grid grid-cols-2 gap-2 desktop:grid-cols-4 desktop:gap-3">
          <Stat value={fmtMinutesShort(s.logged)} label="Registrado hoje" tone="accent" desktopValue={s.target > 0 ? <><span>{Math.round(s.logged / 60)}</span> <span className="text-[14px] font-normal text-neutral-400">/ {Math.round(s.target / 60)}</span></> : undefined} />
          <Stat value={fmtMinutesShort(s.missing_today)} label="Falta para a meta" desktopLabel="Falta para a meta de hoje" />
          <Stat value={fmtMinutesShort(s.pending_prior)} label="Pendência anterior" desktopLabel="Pendência de dias anteriores" tone={s.pending_prior > 0 ? "pending" : undefined} />
          <Stat value={fmtMinutesShort(s.suggested_recovery)} label="Recuperação sugerida" desktopLabel="Recuperação sugerida hoje" tone={s.suggested_recovery > 0 ? "pending" : undefined} />
        </div>
      )}

      <div className="flex items-center gap-3 rounded-[14px] bg-accent-900 px-3 py-2.5 desktop:px-4 desktop:py-3" data-tour="proximo-passo">
        {mascot && goalDone ? (
          <TataSvg mood="cheer" size={34} className="-my-1 shrink-0" />
        ) : (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface text-accent" aria-hidden>
            <ArrowRight size={14} weight="bold" />
          </span>
        )}
        <p className="min-w-0 flex-1 text-[14px] leading-[1.45] desktop:text-[15px]">
          <strong className="font-medium">Próximo passo:</strong> {card.next_step}
        </p>
        {s.pending_prior > 0 ? (
          <Button asChild variant="ghost" size="sm" className="hidden shrink-0 desktop:inline-flex">
            <Link to={`/app/objetivos/${act.id}/recuperar`}>Distribuir pendência</Link>
          </Button>
        ) : null}
      </div>

      {goalDone ? (
        <Button variant="secondary" size="xl" block onClick={onStart} className={cn(hideActionsOnDesktop && "desktop:hidden")}>
          Estudar mais um pouco
        </Button>
      ) : (
        <Button variant="primary" size="xl" block onClick={onStart} className={cn(hideActionsOnDesktop && "desktop:hidden")} data-tour="comecar">
          Começar sessão
        </Button>
      )}
      <div className={cn("-mt-1 flex justify-between", hideActionsOnDesktop && "desktop:hidden")}>
        <Button variant="ghost" size="sm" onClick={onManual} data-tour="registrar">
          Registrar manualmente
        </Button>
        {s.pending_prior > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/app/objetivos/${act.id}/recuperar`}>Distribuir pendência</Link>
          </Button>
        ) : null}
      </div>
      {pendingAfter > 0 && s.suggested_recovery > 0 ? <span className="sr-only">Pendência que continua depois: {fmtMinutes(pendingAfter)}</span> : null}
      <span className="sr-only">{activeDays} dias ativos por semana</span>
    </Card>
  );
}

function Stat({ value, label, desktopValue, desktopLabel, tone }: { value: string; label: string; desktopValue?: React.ReactNode; desktopLabel?: string; tone?: "accent" | "pending" | "success" }) {
  return (
    <div className={cn("rounded-[12px] px-3 py-2", tone === "pending" ? "bg-warning-tint" : tone === "success" ? "bg-success-tint" : "bg-canvas")}>
      <span className={cn("block text-[20px] font-medium leading-tight desktop:text-[24px]", tone === "pending" && "text-pending", tone === "success" && "text-success")}>
        {desktopValue ? (
          <>
            <span className="desktop:hidden">{value}</span>
            <span className="hidden desktop:inline">{desktopValue}</span>
          </>
        ) : (
          value
        )}
      </span>
      <span className="text-[12px] text-neutral-400">
        <span className={cn(desktopLabel && "desktop:hidden")}>{label}</span>
        {desktopLabel ? <span className="hidden desktop:inline">{desktopLabel}</span> : null}
      </span>
    </div>
  );
}

function summarizeDays(m: Record<string, number>): string {
  const on = [0, 1, 2, 3, 4, 5, 6].filter((d) => Number(m[String(d)] ?? 0) > 0);
  const names = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  if (on.length === 7) return "todos os dias";
  if (on.join() === "0,1,2,3,4") return "seg a sex";
  return on.map((d) => names[d]).join(", ");
}

function Agenda({ items, cards }: { items: AgendaItem[]; cards: TodayCard[] }) {
  const toggle = useToggleTask();
  const study = items.filter((i) => i.kind === "study");
  const tasks = items.filter((i) => i.kind === "checklist");
  const titleOf = (id: string) => cards.find((c) => c.activity.id === id)?.activity.title;
  return (
    <section aria-labelledby="agenda-hoje" className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 shadow-sm desktop:p-5" data-tour="agenda">
      <div className="flex items-center justify-between gap-2">
        <h2 id="agenda-hoje" className="kicker">
          Agenda de hoje
        </h2>
        {study.length > 0 ? (
          <Link to="/app/plano" className="text-[12px] no-underline hover:underline">
            Ver semana
          </Link>
        ) : null}
      </div>
      {study.length === 0 ? (
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-info-tint text-info" aria-hidden>
            <CalendarPlus size={20} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[14px] font-medium">Nenhum bloco planejado.</p>
            <p className="mt-0.5 text-[12px] text-neutral-400">Distribua o estudo pela semana, com horários, se quiser.</p>
          </div>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link to="/app/plano">Planejar</Link>
          </Button>
        </div>
      ) : (
        study.map((t) => (
          <div key={t.id} className="flex gap-3 text-[14px]">
            <span className="tnum w-11 shrink-0 pt-2 text-neutral-500 desktop:w-12">{t.start_time ?? "—"}</span>
            <div className={cn("flex-1 rounded-[12px] border-l-[3px] bg-canvas px-3 py-2 desktop:px-[14px] desktop:py-[10px]", t.status === "done" ? "border-success" : "border-accent-600")}>
              <span className="block">
                {t.title}
                {cards.length > 1 ? <span className="text-neutral-400"> · {titleOf(t.activity_id)}</span> : null}
              </span>
              <span className={cn("text-[12px]", t.status === "done" ? "text-success" : "text-neutral-400")}>
                {t.status === "done"
                  ? `${t.estimated_seconds ? fmtMinutes(t.estimated_seconds) + " · " : ""}concluído`
                  : [t.estimated_seconds ? fmtMinutes(t.estimated_seconds) : null, t.recovery_seconds ? `+ ${Math.round(t.recovery_seconds / 60)} de recuperação` : null, t.page_from ? `p. ${t.page_from}–${t.page_to ?? ""}` : null]
                      .filter(Boolean)
                      .join(" · ")}
              </span>
            </div>
          </div>
        ))
      )}
      {tasks.length > 0 ? (
        <>
          <span className="kicker mt-2">Tarefas</span>
          {tasks.map((t) => (
            <label key={t.id} className="flex min-h-[32px] items-center gap-[10px] text-[14px]">
              <Checkbox checked={t.status === "done"} onCheckedChange={(v) => toggle.mutate({ id: t.id, done: v === true })} aria-label={t.title} />
              <span className={cn(t.status === "done" && "text-neutral-500 line-through")}>{t.title}</span>
            </label>
          ))}
        </>
      ) : null}
    </section>
  );
}

/** Desktop (D1): cartões resumidos por objetivo + "Novo objetivo". */
function ObjectiveRow({ cards }: { cards: TodayCard[] }) {
  return (
    <div className="hidden gap-4 desktop:grid desktop:grid-cols-3">
      {cards.map((c) => {
        const rule = c.activity.current_rule;
        const perWeek = rule ? Object.values(rule.minutes_by_weekday).filter((m) => Number(m) > 0).length : 0;
        const pending = c.summary?.pending_prior ?? 0;
        return (
          <Link key={c.activity.id} to={`/app/objetivos/${c.activity.id}`} className="no-underline hover:text-primary">
            <Card className="h-full gap-2.5 rounded-[18px] p-4 shadow-sm transition-shadow duration-base hover:shadow-md">
              <div className="flex items-center gap-2.5">
                <ActivityBadge category={c.activity.category} />
                <span className="min-w-0 flex-1 truncate font-medium text-primary">{c.activity.title}</span>
                <Tag variant="neutral">{perWeek}×/sem</Tag>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-accent" style={{ width: `${c.week_target ? Math.min(100, (c.week_logged / c.week_target) * 100) : 0}%` }} />
              </div>
              <div className="tnum flex justify-between text-[12px] text-neutral-400">
                <span>
                  {fmtMinutes(c.week_logged)} de {fmtMinutes(c.week_target)}
                </span>
                {pending > 0 ? <span className="text-pending">{fmtMinutes(pending)} a recuperar</span> : <span className="text-success">em dia</span>}
              </div>
            </Card>
          </Link>
        );
      })}
      <Card className="items-start justify-center gap-2 rounded-[18px] border border-dashed border-border bg-transparent p-4">
        <span className="text-[14px] text-neutral-400">Novo objetivo: concurso, instrumento, rotina da casa…</span>
        <Button asChild variant="secondary">
          <Link to="/app/objetivos/novo">+ Criar objetivo</Link>
        </Button>
      </Card>
    </div>
  );
}

/** Bolinhas dos dias da semana com registro (no resumo do topo). */
function WeekDots({ card }: { card: TodayCard }) {
  const rule = card.activity.current_rule;
  if (!rule) return null;
  const planned = Object.values(rule.minutes_by_weekday).filter((m) => Number(m) > 0).length;
  if (planned === 0) return null;
  const done = Math.min(card.week_days_with_log, planned);
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: planned }).map((_, i) => (
          <span key={i} className={cn("h-2 w-2 rounded-full", i < done ? "bg-accent" : "shadow-[inset_0_0_0_1.5px_var(--color-neutral-700)]")} />
        ))}
      </div>
      <p className="tnum whitespace-nowrap text-[12px] text-neutral-400">
        <span aria-hidden>
          {done} de {planned} dias
        </span>
        <span className="sr-only">
          {done} de {planned} dias desta semana com registro.
        </span>
      </p>
    </div>
  );
}
