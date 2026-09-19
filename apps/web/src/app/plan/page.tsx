import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { CaretLeft, CaretRight, Check, Printer, Warning } from "@phosphor-icons/react";
import { Banner, Button, Card, Dialog, DialogContent, Seg, Select, Spinner, Tag, toast } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useActivities, useToday } from "@/api/queries";
import { useCalendar, useDeleteSeries, usePreferences, useSeries, type CalendarDay, type Series, type Task } from "@/api/planning";
import { useRangeSessions } from "@/api/plan-week";
import type { Activity, StudySession, TodayCard } from "@/api/types";
import { ManualEntrySheet } from "@/app/today/manual-entry";
import { AutoPlanDialog } from "@/components/app/auto-plan-dialog";
import { PlanUpsell, useHasFeature } from "@/components/app/plan-upsell";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { RecoveryPlanner } from "@/components/app/recovery-planner";
import { TaskCheckRow } from "@/components/app/task-check-row";
import { taskMeta, useToggleTaskDone } from "@/components/app/task-toggle";
import { TaskEditorSheet, type TaskDefaults } from "@/components/app/task-editor-sheet";
import { capitalize, fmtLongDuration, hhmmToMinutes, joinNames, shiftIso, startOfWeekIso, weekdayMon } from "@/components/app/week-utils";
import { fmtDayShort, fmtMinutes, fmtRange, fmtTime, minutesOf, parseDate, todayIso, WEEKDAY_SHORT } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { usePageTour } from "@/components/tour/use-tours";
import { planoTour } from "@/tours/plano";
import { NoPlan } from "@/components/empty/no-plan";
import { PlanWeekTip } from "@/components/empty/plan-week-tip";
import { cn } from "@/lib/utils";

type View = "agenda" | "lista";
const VIEW_KEY = "estudatta.plano.visao"; // só preferência de exibição

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "lista" ? "lista" : "agenda";
  } catch {
    return "agenda";
  }
}

const dayNum = (iso: string) => parseDate(iso).getDate();
const dur = (s: StudySession) => s.duration_seconds ?? 0;
const taskKey = (t: Task) => t.id ?? `${t.series_id}-${t.local_date}`;
const sortTasks = (tasks: Task[]) => [...tasks].sort((a, b) => (hhmmToMinutes(a.start_time) ?? 9999) - (hhmmToMinutes(b.start_time) ?? 9999) || a.sort_order - b.sort_order);
/** Dia passado, ativo, abaixo da meta. "Falta hoje" não entra aqui: hoje nunca é atraso. */
const isShort = (d: CalendarDay, today: string) => d.local_date < today && d.target_seconds > 0 && !d.is_paused && d.logged_seconds < d.target_seconds;

/** Plano da semana (07 / 08 / D2): grade de 7 dias, agenda do dia, lista, tarefas, séries, distribuição automática e impressão. */
export default function PlanPage() {
  const online = useOnline();
  const today = todayIso();
  const [params, setParams] = useSearchParams();
  const prefs = usePreferences();
  const activities = useActivities();
  const todayQ = useToday();
  const [view, setViewState] = React.useState<View>(readView);
  const weekStartsOn = prefs.data?.week_starts_on ?? 0;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get("semana") ?? "") ? params.get("semana")! : today;
  const start = startOfWeekIso(anchor, weekStartsOn);
  const end = shiftIso(start, 6);
  const isCurrentWeek = today >= start && today <= end;
  const filter = params.get("objetivo");
  const calendar = useCalendar(start, end, filter);
  const sessions = useRangeSessions(start, end, filter);
  const series = useSeries(filter);

  const [selected, setSelected] = React.useState(today);
  const selectedDate = selected >= start && selected <= end ? selected : isCurrentWeek ? today : start;

  const [editor, setEditor] = React.useState<{ task?: Task; defaults?: TaskDefaults } | null>(null);
  const [manual, setManual] = React.useState<{ card: TodayCard; date: string } | null>(null);
  const [autoPlan, setAutoPlan] = React.useState(false);
  const canAutoPlan = useHasFeature("auto_planning");
  const [recoveryFor, setRecoveryFor] = React.useState<string | null>(null);
  usePageTour(planoTour, calendar.isSuccess && activities.isSuccess);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* preferência de exibição é opcional */
    }
  };
  const patchParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const goWeek = (dir: -1 | 1) => {
    const target = shiftIso(start, dir * 7);
    patchParams({ semana: today >= target && today <= shiftIso(target, 6) ? null : target });
  };

  const acts = (activities.data ?? []).filter((a) => a.status === "active");
  const cards = todayQ.data?.data.cards ?? [];
  const scopedCards = filter ? cards.filter((c) => c.activity.id === filter) : cards;
  const pending = scopedCards.reduce((acc, c) => acc + (c.summary?.pending_prior ?? 0), 0);
  const pendingCard = scopedCards.find((c) => (c.summary?.pending_prior ?? 0) > 0);
  const manualCard = scopedCards[0] ?? cards[0];

  const days = calendar.data?.days ?? [];
  const logged = days.reduce((a, d) => a + d.logged_seconds, 0);
  const target = days.reduce((a, d) => a + d.target_seconds, 0);
  const recovery = days.reduce((a, d) => a + d.recovery_seconds, 0);
  const overloaded = days.filter((d) => d.over_capacity || d.overload_seconds > 0);

  const openManual = (date: string) => {
    if (!manualCard) {
      toast.info("Crie um objetivo para registrar tempo");
      return;
    }
    setManual({ card: manualCard, date });
  };
  const addTask = (date: string, time?: string) => setEditor({ defaults: { activityId: filter ?? acts[0]?.id, date, time, kind: "study" } });
  const printHref = `/app/plano/imprimir?inicio=${start}${filter ? `&objetivo=${filter}` : ""}`;

  const subtitle = (
    <span className="tnum text-[13px] text-neutral-400">
      {fmtRange(start, end)}
      {calendar.data ? ` · ${fmtMinutes(logged)} de ${fmtMinutes(target)}` : ""}
      {pending > 0 && pendingCard ? (
        <>
          {" · "}
          <Link to={`/app/objetivos/${pendingCard.activity.id}/recuperar`} className="text-pending no-underline hover:underline desktop:hidden">
            {fmtMinutes(pending)} a recuperar
          </Link>
          <button type="button" className="hidden text-pending hover:underline desktop:inline" onClick={() => setRecoveryFor(pendingCard.activity.id)}>
            {fmtMinutes(pending)} a recuperar
          </button>
        </>
      ) : null}
    </span>
  );

  const weekNav = (
    <>
      {!isCurrentWeek ? (
        <Button variant="ghost" size="md" onClick={() => patchParams({ semana: null })}>
          Hoje
        </Button>
      ) : null}
      <Button variant="secondary" size="icon" aria-label="Semana anterior" onClick={() => goWeek(-1)}>
        <CaretLeft size={16} aria-hidden />
      </Button>
      <Button variant="secondary" size="icon" aria-label="Próxima semana" onClick={() => goWeek(1)}>
        <CaretRight size={16} aria-hidden />
      </Button>
    </>
  );
  const viewSeg = (
    <Seg
      label="Visão do plano"
      value={view}
      onChange={setView}
      options={[
        { value: "agenda", label: "Agenda" },
        { value: "lista", label: "Lista" },
      ]}
    />
  );

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <header className="flex items-center justify-between gap-3 desktop:items-end">
        <div className="flex min-w-0 flex-col">
          <span className="hidden desktop:block">{subtitle}</span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Plano da semana</h1>
        </div>
        <div className="flex items-center gap-2" data-tour="plano-visao">
          {viewSeg}
          <span className="hidden items-center gap-2 desktop:flex">{weekNav}</span>
        </div>
      </header>
      <div className="flex items-center justify-between gap-2 desktop:hidden">
        {subtitle}
        <span className="flex shrink-0 items-center gap-2">{weekNav}</span>
      </div>

      {acts.length > 1 ? (
        <Select aria-label="Filtrar por objetivo" value={filter ?? ""} onChange={(e) => patchParams({ objetivo: e.target.value || null })} className="desktop:max-w-[280px]">
          <option value="">Todos os objetivos</option>
          {acts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </Select>
      ) : null}

      {overloaded.length > 0 ? (
        <Banner
          kind="info"
          actions={
            <Button size="sm" variant="secondary" onClick={() => setAutoPlan(true)}>
              Redistribuir tarefas
            </Button>
          }
        >
          <span className="inline-flex items-center gap-1 text-pending">
            <Warning size={14} aria-hidden /> Sobrecarga
          </span>{" "}
          em {joinNames(overloaded.map((d) => `${WEEKDAY_SHORT[weekdayMon(d.local_date)]} ${dayNum(d.local_date)}`))}: o planejado passa do limite diário
          {overloaded.length === 1 && overloaded[0].overload_seconds > 0 ? ` em ${fmtMinutes(overloaded[0].overload_seconds)}` : ""}. Mova tarefas ou reduza a recuperação do dia.
        </Banner>
      ) : null}

      {calendar.isPending ? (
        <div className="flex justify-center py-20" role="status">
          <Spinner className="h-6 w-6" />
        </div>
      ) : calendar.isError ? (
        <Banner kind={online ? "error" : "offline"} actions={<Button size="sm" variant="secondary" onClick={() => calendar.refetch()}>Tentar de novo</Button>}>
          {online ? `Não foi possível carregar o plano. ${errorMessage(calendar.error, "")}`.trim() : "Sem conexão: o plano da semana aparece quando você voltar à internet."}
        </Banner>
      ) : acts.length === 0 && activities.isSuccess ? (
        <NoPlan hasPaused={(activities.data ?? []).some((a) => a.status === "paused")} />
      ) : view === "agenda" ? (
        <>
          <div className="desktop:hidden" data-tour="plano-semana">
            <WeekBars days={days} today={today} selected={selectedDate} onSelect={setSelected} />
          </div>
          <div className="flex flex-col gap-[14px] desktop:hidden">
            <DayAgenda day={days.find((d) => d.local_date === selectedDate) ?? days[0]} today={today} sessions={sessions.data ?? []} activities={activities.data ?? []} showActivity={!filter && acts.length > 1} onEdit={(task) => setEditor({ task })} onAdd={addTask} onManual={openManual} />
          </div>
          <WeekColumns days={days} today={today} pending={pending} sessions={sessions.data ?? []} onEdit={(task) => setEditor({ task })} onAdd={addTask} onManual={openManual} />
        </>
      ) : (
        <WeekList days={days} today={today} pending={pending} sessions={sessions.data ?? []} onEdit={(task) => setEditor({ task })} onAdd={addTask} onManual={openManual} canRegister={!!manualCard} />
      )}

      {calendar.data && acts.length > 0 ? (
        <>
          {days.every((d) => d.tasks.length === 0) && logged === 0 ? <PlanWeekTip /> : null}
          <p className="m-0 text-[13px] text-neutral-400">
            Total planejado: {fmtMinutes(target)}
            {recovery > 0 ? ` + ${fmtMinutes(recovery)} de recuperação` : ""}.
            {pending > 0 && isCurrentWeek ? (
              recovery >= pending ? (
                " Ao final da semana a pendência zera."
              ) : (
                <>
                  {" "}
                  {recovery > 0 ? `Ainda ficam ${fmtMinutes(pending - recovery)} a recuperar depois desta semana.` : `Há ${fmtLongDuration(pending)} a recuperar fora do plano.`}{" "}
                  {pendingCard ? (
                    <Link to={`/app/objetivos/${pendingCard.activity.id}/recuperar`} className="text-accent">
                      Distribuir
                    </Link>
                  ) : null}
                </>
              )
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" onClick={() => addTask(selectedDate < today ? today : selectedDate)} data-tour="plano-nova-tarefa">
              + Nova tarefa
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setAutoPlan(true)} data-tour="plano-distribuir">
              Distribuir tarefas
            </Button>
            <Button asChild variant="secondary" size="lg" data-tour="plano-imprimir">
              <Link to={printHref}>
                <Printer size={16} aria-hidden /> Imprimir semana
              </Link>
            </Button>
          </div>
          <SeriesList series={series.data ?? []} activities={activities.data ?? []} />
        </>
      ) : null}

      {editor ? <TaskEditorSheet key={editor.task ? taskKey(editor.task) : `new-${editor.defaults?.date}-${editor.defaults?.time ?? ""}`} open onOpenChange={(o) => !o && setEditor(null)} activities={acts} task={editor.task} defaults={editor.defaults} /> : null}
      {manual ? <ManualEntrySheet key={manual.date} card={manual.card} cards={cards} open onOpenChange={(o) => !o && setManual(null)} defaultDate={manual.date} /> : null}
      {autoPlan && canAutoPlan ? <AutoPlanDialog open onOpenChange={setAutoPlan} activities={acts} defaultActivityId={filter} start={start} end={end} /> : null}
      {autoPlan && !canAutoPlan ? (
        <Dialog open onOpenChange={setAutoPlan}>
          <DialogContent title="Distribuir tarefas automaticamente">
            <PlanUpsell
              className="bg-canvas"
              title="Recurso dos planos pagos"
              text="A distribuição automática das tarefas na semana está nos planos Essencial e Completo. No Gratuito, você planeja cada tarefa manualmente, com a mesma agenda e os mesmos lembretes."
            />
          </DialogContent>
        </Dialog>
      ) : null}
      <Dialog open={!!recoveryFor} onOpenChange={(o) => !o && setRecoveryFor(null)}>
        <DialogContent title={`Há ${fmtLongDuration(pending)} a recuperar. Distribuir nos próximos dias?`} width="min(560px, calc(100% - 32px))">
          {recoveryFor ? <RecoveryPlanner activityId={recoveryFor} inDialog onDone={() => setRecoveryFor(null)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Rótulo curto sob a mini-barra: "60" concluído, "0" sem registro, "60+20", "+20", "—". */
function dayFigure(d: CalendarDay, today: string): { text: string; className: string } {
  const t = minutesOf(d.target_seconds);
  const l = minutesOf(d.logged_seconds);
  const r = minutesOf(d.recovery_seconds);
  if (d.is_paused) return { text: "pausa", className: "" };
  if (d.local_date < today) {
    if (d.target_seconds === 0) return l > 0 ? { text: String(l), className: "text-success" } : { text: "—", className: "" };
    return d.logged_seconds >= d.target_seconds ? { text: String(l), className: "text-success" } : { text: String(l), className: "text-pending" };
  }
  if (d.local_date === today) {
    if (d.target_seconds > 0 && d.logged_seconds >= d.target_seconds + d.recovery_seconds) return { text: String(l), className: "text-success" };
    return { text: l > 0 || t > 0 ? String(l) : r > 0 ? `+${r}` : "—", className: "text-primary" };
  }
  if (t === 0 && r === 0) return { text: "—", className: "" };
  return { text: `${t > 0 ? t : ""}${r > 0 ? `+${r}` : ""}`, className: "" };
}

function WeekBars({ days, today, selected, onSelect }: { days: CalendarDay[]; today: string; selected: string; onSelect: (d: string) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-neutral-500">
      {days.map((d) => {
        const isToday = d.local_date === today;
        const free = d.target_seconds === 0 && d.recovery_seconds === 0 && d.logged_seconds === 0;
        const total = Math.max(d.target_seconds + d.recovery_seconds, d.logged_seconds, 1);
        const loggedPct = Math.min(100, (d.logged_seconds / total) * 100);
        const recoveryLeft = Math.max(0, d.recovery_seconds - Math.max(0, d.logged_seconds - d.target_seconds));
        const recoveryPct = d.local_date >= today ? Math.min(100 - loggedPct, (recoveryLeft / total) * 100) : 0;
        const fig = dayFigure(d, today);
        const short = isShort(d, today);
        const label = `${capitalize(fmtDayShort(d.local_date))}${isToday ? ", hoje" : ""}: ${minutesOf(d.logged_seconds)} de ${minutesOf(d.target_seconds)} minutos${d.recovery_seconds > 0 ? `, mais ${minutesOf(d.recovery_seconds)} de recuperação` : ""}${d.over_capacity ? ", sobrecarga" : ""}`;
        return (
          <button key={d.local_date} type="button" aria-pressed={selected === d.local_date} aria-label={label} onClick={() => onSelect(d.local_date)} className={cn("flex flex-col items-center gap-1 rounded-md pb-1", free && !isToday && "opacity-50")}>
            <span className={cn(isToday && "text-accent")}>{WEEKDAY_SHORT[weekdayMon(d.local_date)]}</span>
            <span className={cn("tnum text-[14px]", isToday ? "text-accent" : "text-primary", selected === d.local_date && "underline decoration-accent decoration-2 underline-offset-4")}>{dayNum(d.local_date)}</span>
            <span
              className={cn(
                "relative block h-20 w-full overflow-hidden rounded-[6px] bg-surface",
                isToday && "shadow-inset-accent",
                !isToday && short && d.logged_seconds === 0 && "shadow-[inset_0_0_0_1px_var(--color-pending)]",
              )}
            >
              {recoveryPct > 0 ? <span className="recovery-stripes-v absolute inset-x-0 block" style={{ bottom: `${loggedPct}%`, height: `${recoveryPct}%` }} /> : null}
              {loggedPct > 0 ? <span className="absolute inset-x-0 bottom-0 block bg-accent-800" style={{ height: `${loggedPct}%` }} /> : null}
            </span>
            <span className={cn("tnum inline-flex items-center gap-[2px]", fig.className)}>
              {fig.text}
              {d.over_capacity ? <Warning size={10} className="text-pending" aria-hidden /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function sessionLabel(s: StudySession, activities: Activity[], showActivity: boolean): string {
  const act = activities.find((a) => a.id === s.activity_id)?.title;
  const base = s.note?.trim() || (s.kind === "manual" ? "Registro manual" : "Sessão");
  return showActivity && act ? `${act} · ${base}` : base;
}

type Slot = { key: string; minute: number; time: string | null } & ({ kind: "session"; session: StudySession } | { kind: "task"; task: Task });

function daySlots(day: CalendarDay, sessions: StudySession[]): Slot[] {
  const linked = new Set(sessions.filter((s) => s.planned_task_id).map((s) => s.planned_task_id));
  const out: Slot[] = [];
  for (const s of sessions) {
    if (s.local_date !== day.local_date || s.status !== "finished" || dur(s) <= 0) continue;
    const time = s.started_at ? fmtTime(s.started_at) : null;
    out.push({ key: s.id, kind: "session", session: s, time, minute: hhmmToMinutes(time) ?? -1 });
  }
  for (const t of sortTasks(day.tasks)) {
    if (t.kind !== "study") continue;
    if (t.id && linked.has(t.id) && t.status === "done") continue; // já aparece como sessão registrada
    const time = t.start_time?.slice(0, 5) ?? null;
    out.push({ key: taskKey(t), kind: "task", task: t, time, minute: hhmmToMinutes(time) ?? 9999 });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

/** Próximo horário livre sugerido: depois do último bloco com horário, senão 19:00. */
function freeSlotTime(slots: Slot[]): string {
  let last = -1;
  for (const s of slots) {
    if (s.minute < 0 || s.minute >= 9999) continue;
    const len = s.kind === "task" ? minutesOf(s.task.estimated_seconds ?? 1800) : minutesOf(dur(s.session));
    last = Math.max(last, s.minute + len);
  }
  if (last < 0) return "19:00";
  const rounded = Math.min(23 * 60, Math.ceil((last + 30) / 30) * 30);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

interface DayProps {
  today: string;
  sessions: StudySession[];
  onEdit: (t: Task) => void;
  onAdd: (date: string, time?: string) => void;
  onManual: (date: string) => void;
}

function DayAgenda({ day, today, sessions, activities, showActivity, onEdit, onAdd, onManual }: DayProps & { day: CalendarDay | undefined; activities: Activity[]; showActivity: boolean }) {
  if (!day) return null;
  const slots = daySlots(day, sessions);
  const checklist = sortTasks(day.tasks).filter((t) => t.kind !== "study");
  const short = isShort(day, today);
  const past = day.local_date < today;
  const free = freeSlotTime(slots);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="kicker">{capitalize(fmtDayShort(day.local_date))}</span>
        <span className="flex gap-1">
          {day.is_paused ? <Tag variant="neutral">Pausa planejada</Tag> : null}
          {day.over_capacity ? <Tag variant="pending">Sobrecarga{day.overload_seconds > 0 ? ` · +${fmtMinutes(day.overload_seconds)}` : ""}</Tag> : null}
        </span>
      </div>
      {slots.map((s) => (
        <div key={s.key} className="flex gap-3 text-[14px]">
          <span className="tnum w-11 shrink-0 pt-2 text-neutral-500">{s.time ?? "—"}</span>
          {s.kind === "session" ? (
            <div className="flex-1 rounded-md border-l-2 border-accent bg-surface px-3 py-2">
              <span className="block">{sessionLabel(s.session, activities, showActivity)}</span>
              <span className="tnum text-[12px] text-success">{fmtMinutes(dur(s.session))} · registrado</span>
            </div>
          ) : (
            <TaskBlock task={s.task} onEdit={onEdit} />
          )}
        </div>
      ))}
      {short && day.logged_seconds === 0 ? (
        <div className="flex gap-3 text-[14px]">
          <span className="w-11 shrink-0" />
          <button type="button" className="flex-1 rounded-md border border-dashed border-pending px-3 py-2 text-left text-pending" onClick={() => onManual(day.local_date)}>
            <span className="block">Sem registro</span>
            <span className="tnum text-[12px]">{fmtMinutes(day.target_seconds)} · registrar se você estudou</span>
          </button>
        </div>
      ) : null}
      {checklist.length > 0 ? (
        <div className="flex flex-col">
          <span className="kicker mb-1">Tarefas</span>
          {checklist.map((t) => (
            <TaskCheckRow key={taskKey(t)} task={t} onEdit={onEdit} />
          ))}
        </div>
      ) : null}
      {!past ? (
        <div className="flex gap-3 text-[14px] opacity-70 hover:opacity-100">
          <span className="tnum w-11 shrink-0 pt-2 text-neutral-500">{free}</span>
          <button type="button" className="min-h-[44px] flex-1 rounded-md border border-dashed border-neutral-700 px-3 py-2 text-left text-neutral-400" onClick={() => onAdd(day.local_date, free)}>
            Horário livre · adicionar sessão
          </button>
        </div>
      ) : (
        <Button variant="ghost" size="lg" className="self-start text-[13px]" onClick={() => onManual(day.local_date)}>
          Registrar tempo neste dia
        </Button>
      )}
    </>
  );
}

function TaskBlock({ task, onEdit, compact }: { task: Task; onEdit: (t: Task) => void; compact?: boolean }) {
  const { toggle, isPending } = useToggleTaskDone();
  const done = task.status === "done";
  const base = Math.max(0, (task.estimated_seconds ?? 0) - task.recovery_seconds);
  const recoveryOnly = task.recovery_seconds > 0 && base === 0;
  return (
    <div className={cn("flex min-w-0 items-stretch rounded-md border-l-2", compact ? "flex-none rounded-[6px]" : "flex-1", done ? "border-accent bg-accent-900" : recoveryOnly ? "border-pending bg-surface" : "border-neutral-600 bg-surface", task.status === "skipped" && "opacity-60")}>
      <button type="button" className={cn("min-w-0 flex-1 text-left", compact ? "px-2 py-[6px]" : "px-3 py-2")} onClick={() => onEdit(task)} aria-label={`Editar ${task.title}`}>
        <span className="block truncate">
          {task.title}
          {done ? " ✓" : ""}
        </span>
        <span className="tnum block truncate text-[12px] text-neutral-400">
          {compact && task.start_time ? `${task.start_time.slice(0, 5)} · ` : ""}
          {task.estimated_seconds ? (
            task.recovery_seconds > 0 ? (
              <>
                {base > 0 ? minutesOf(base) : ""} <span className="text-pending">+{minutesOf(task.recovery_seconds)}</span>
                {compact ? "" : " de recuperação"}
              </>
            ) : (
              fmtMinutes(task.estimated_seconds)
            )
          ) : (
            "sem duração"
          )}
          {!compact && taskMeta({ ...task, estimated_seconds: null, start_time: null }) ? ` · ${taskMeta({ ...task, estimated_seconds: null, start_time: null })}` : ""}
        </span>
      </button>
      {task.status !== "skipped" ? (
        <button type="button" className={cn("grid w-11 shrink-0 place-items-center rounded-r-md", done ? "text-accent" : "text-neutral-500 hover:text-accent")} disabled={isPending} onClick={() => void toggle(task, !done)} aria-label={`${done ? "Desfazer conclusão de" : "Concluir"} ${task.title}`} aria-pressed={done}>
          <Check size={16} weight={done ? "bold" : "regular"} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Desktop (D2): sete colunas com cabeçalho de estado e blocos do dia em ordem de horário. */
function WeekColumns({ days, today, pending, sessions, onEdit, onAdd, onManual }: DayProps & { days: CalendarDay[]; pending: number }) {
  return (
    <div className="hidden grid-cols-7 gap-2 text-[12px] desktop:grid" data-tour="plano-semana">
      {days.map((d) => {
        const isToday = d.local_date === today;
        const t = minutesOf(d.target_seconds);
        const l = minutesOf(d.logged_seconds);
        const r = minutesOf(d.recovery_seconds);
        const free = d.target_seconds === 0 && d.recovery_seconds === 0;
        const short = isShort(d, today);
        return (
          <div key={d.local_date} className={cn("tnum text-center text-neutral-400", isToday && "text-accent", free && !isToday && "text-neutral-500")}>
            {WEEKDAY_SHORT[weekdayMon(d.local_date)]}
            <span className={cn("block text-[16px]", !isToday && !free && "text-primary")}>{dayNum(d.local_date)}</span>
            {d.is_paused ? (
              <span>pausa</span>
            ) : d.local_date < today ? (
              free ? (
                <span>{l > 0 ? `${l} · extra` : "livre"}</span>
              ) : short ? (
                <span className="text-pending">
                  {l} · {t - l} {pending > 0 ? "a recuperar" : "abaixo da meta"}
                </span>
              ) : (
                <span className="text-success">{l} · concluído</span>
              )
            ) : isToday ? (
              <span>
                {l} / {t}
                {r > 0 ? <span className="text-pending"> +{r}</span> : null} · hoje
              </span>
            ) : free ? (
              <span>livre</span>
            ) : (
              <span>
                {t > 0 ? t : ""}
                {r > 0 ? <span className="text-pending"> +{r}</span> : null}
              </span>
            )}
            {d.over_capacity ? (
              <span className="flex items-center justify-center gap-1 text-pending">
                <Warning size={12} aria-hidden /> sobrecarga
              </span>
            ) : null}
          </div>
        );
      })}
      <div className="col-span-7 grid min-h-[420px] grid-cols-7 gap-2 border-t border-divider pt-2">
        {days.map((d, i) => {
          const isToday = d.local_date === today;
          const slots = daySlots(d, sessions);
          const checklist = sortTasks(d.tasks).filter((t) => t.kind !== "study");
          const short = isShort(d, today);
          return (
            <div key={d.local_date} className={cn("flex min-w-0 flex-col gap-[6px] border-l border-divider pb-2 pl-[6px] pr-[2px]", isToday && "border-accent bg-[color-mix(in_srgb,var(--color-accent-900)_40%,transparent)]", i === 6 && "border-r")}>
              {slots.map((s) =>
                s.kind === "session" ? (
                  <div key={s.key} className="rounded-[6px] border-l-2 border-accent bg-accent-900 px-2 py-[6px]">
                    <span className="block truncate">{s.session.note?.trim() || "Sessão"} ✓</span>
                    <span className="tnum block truncate text-neutral-400">
                      {s.time ? `${s.time} · ` : ""}
                      {fmtMinutes(dur(s.session))}
                    </span>
                  </div>
                ) : (
                  <TaskBlock key={s.key} task={s.task} onEdit={onEdit} compact />
                ),
              )}
              {short && d.logged_seconds === 0 ? (
                <button type="button" className="rounded-[6px] border border-dashed border-pending px-2 py-[6px] text-left text-pending" onClick={() => onManual(d.local_date)}>
                  <span className="block">Sem registro</span>
                  <span className="tnum">{fmtMinutes(d.target_seconds)} · registrar</span>
                </button>
              ) : null}
              {d.recovery_seconds > 0 && d.local_date >= today && !d.tasks.some((t) => t.recovery_seconds > 0) ? (
                <div className="recovery-stripes rounded-[6px] border-l-2 border-pending px-2 py-[6px]">
                  <span className="rounded-[4px] bg-canvas px-1">
                    Recuperação <span className="tnum text-pending">+{minutesOf(d.recovery_seconds)}</span>
                  </span>
                </div>
              ) : null}
              {checklist.map((t) => (
                <TaskCheckRow key={taskKey(t)} task={t} onEdit={onEdit} className="min-h-[36px] gap-[6px] text-[12px]" />
              ))}
              {d.local_date >= today ? (
                <button type="button" className="mt-auto min-h-[36px] rounded-[6px] border border-dashed border-neutral-700 px-2 py-[6px] text-left text-neutral-400 opacity-70 hover:opacity-100" onClick={() => onAdd(d.local_date, freeSlotTime(slots))} aria-label={`Adicionar sessão em ${fmtDayShort(d.local_date)}`}>
                  + adicionar sessão
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekList({ days, today, pending, sessions, onEdit, onAdd, onManual, canRegister }: DayProps & { days: CalendarDay[]; pending: number; canRegister: boolean }) {
  return (
    <div className="flex flex-col gap-[10px] desktop:max-w-[760px]" data-tour="plano-semana">
      {days.map((d) => {
        const isToday = d.local_date === today;
        const t = minutesOf(d.target_seconds);
        const l = minutesOf(d.logged_seconds);
        const r = minutesOf(d.recovery_seconds);
        const free = d.target_seconds === 0 && d.recovery_seconds === 0;
        const short = isShort(d, today);
        const past = d.local_date < today;
        const tasks = sortTasks(d.tasks);
        const registered = sessions.filter((s) => s.local_date === d.local_date && s.status === "finished" && dur(s) > 0);
        const name = `${capitalize(WEEKDAY_SHORT[weekdayMon(d.local_date)])}, ${dayNum(d.local_date)}`;
        return (
          <Card key={d.local_date} className={cn("gap-1 px-[14px] py-3 text-[14px]", isToday && "shadow-inset-accent", free && !isToday && tasks.length === 0 && l === 0 && "opacity-60")}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">
                {name}
                {isToday ? " · hoje" : ""}
              </span>
              <span className="tnum flex items-center gap-1 text-[12px] text-neutral-400">
                {d.is_paused ? (
                  "pausa planejada"
                ) : past ? (
                  free ? (
                    l > 0 ? `${l} min · extra` : "dia livre"
                  ) : short ? (
                    <span className="text-pending">
                      {l} / {t} · {t - l} min {pending > 0 ? "a recuperar" : "abaixo da meta"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check size={12} weight="bold" aria-hidden />
                      {l} / {t} · concluído
                    </span>
                  )
                ) : isToday ? (
                  <span className="text-neutral-300">
                    {l} / {t}
                    {r > 0 ? ` · +${r} recuperação` : ""}
                  </span>
                ) : free ? (
                  "dia livre"
                ) : (
                  <>
                    {t > 0 ? t : ""}
                    {r > 0 ? <span className="text-pending">+{r}</span> : null}
                    {t === 0 && r > 0 ? " recuperação" : ""}
                  </>
                )}
                {d.over_capacity ? (
                  <span className="ml-1 inline-flex items-center gap-[2px] text-pending">
                    <Warning size={12} aria-hidden /> sobrecarga
                  </span>
                ) : null}
              </span>
            </div>
            {registered.length > 0 ? <span className="tnum text-[12px] text-neutral-400">{registered.map((s) => `${s.started_at ? `${fmtTime(s.started_at)} ` : ""}${s.note?.trim() || "Sessão"} ✓`).join(" · ")}</span> : null}
            {short && canRegister ? (
              <span className="text-[12px] text-neutral-400">
                Você estudou e esqueceu de registrar?{" "}
                <button type="button" className="min-h-[32px] text-accent hover:underline" onClick={() => onManual(d.local_date)}>
                  Registrar
                </button>
              </span>
            ) : null}
            {tasks.map((task) => (
              <TaskCheckRow key={taskKey(task)} task={task} onEdit={onEdit} className="min-h-[40px]" />
            ))}
            {!past ? (
              <button type="button" className="min-h-[32px] self-start text-[12px] text-neutral-400 hover:text-accent" onClick={() => onAdd(d.local_date)} aria-label={`Adicionar tarefa em ${name}`}>
                + adicionar
              </button>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function SeriesList({ series, activities }: { series: Series[]; activities: Activity[] }) {
  const remove = useDeleteSeries();
  const [confirm, setConfirm] = React.useState<Series | null>(null);
  const active = series.filter((s) => s.active);
  if (active.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 desktop:max-w-[760px]">
      <h2 className="kicker m-0 font-normal">Tarefas que se repetem</h2>
      <Card className="gap-1 px-[14px] py-2 text-[14px]">
        {active.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 flex-col py-1">
              <span className="truncate">{s.title}</span>
              <span className="tnum text-[12px] text-neutral-400">
                {[s.weekdays.length === 7 ? "todos os dias" : s.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", "), s.start_time?.slice(0, 5), s.estimated_seconds ? fmtMinutes(s.estimated_seconds) : null, s.end_date ? `até ${fmtDayShort(s.end_date)}` : null, activities.length > 1 ? activities.find((a) => a.id === s.activity_id)?.title : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2" onClick={() => setConfirm(s)}>
              Excluir série
            </Button>
          </div>
        ))}
        <span className="pb-1 text-[12px] text-neutral-500">Para mudar horário ou dias de uma série, toque em uma das ocorrências no plano.</span>
      </Card>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Excluir a série "${confirm?.title ?? ""}"?`}
        description="As próximas ocorrências saem do plano. Tarefas já concluídas continuam no histórico."
        confirmLabel="Excluir série"
        danger
        loading={remove.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await remove.mutateAsync(confirm.id);
            toast.success("Série excluída");
          } catch (err) {
            toast.error("Não foi possível excluir a série", errorMessage(err));
          }
          setConfirm(null);
        }}
      />
    </section>
  );
}
