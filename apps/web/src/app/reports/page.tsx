import * as React from "react";
import { PlanUpsell, useHasFeature } from "@/components/app/plan-upsell";
import { Link } from "react-router";
import { CaretLeft, CaretRight, DownloadSimple, PencilSimple, Trash } from "@phosphor-icons/react";
import { useActivities } from "@/api/queries";
import { errorMessage, isNetworkError } from "@/api/client";
import {
  exportReportCsv,
  shiftPeriodDate,
  useContentReports,
  useDeleteSession,
  useReportSessions,
  useReportSummary,
  useSessionRevisions,
  useUpdateSession,
  type ReportDayRow,
  type ReportPeriod,
  type ReportSessionOut,
  type SessionUpdate,
  type SummaryOut,
} from "@/api/reports";
import { Banner, Bar, Button, Card, Checkbox, Dialog, DialogActions, DialogContent, EmptyState, Field, Input, Seg, Select, Spinner, Tag, Textarea, toast } from "@/components/ui";
import { fmtDayShort, fmtDayTiny, fmtDateTimeShort, fmtMin, fmtMinutes, fmtRange, fmtTime, isoDate, parseDate, todayIso, WEEKDAY_LABELS, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

const PERIOD_LABEL: Record<ReportPeriod, string> = { week: "semana", month: "mês", quarter: "trimestre" };

/** Tela 10/D3 — Relatório de constância: resumo do período, tempo por dia/objetivo, leitura honesta, histórico editável. */
export default function ReportsPage() {
  const online = useOnline();
  const [period, setPeriod] = React.useState<ReportPeriod>("week");
  const [date, setDate] = React.useState(todayIso());
  const [activityId, setActivityId] = React.useState<string | null>(null);
  const activities = useActivities();
  const fullReports = useHasFeature("reports");
  const locked = period !== "week" && !fullReports;
  const summary = useReportSummary(locked ? "week" : period, date, activityId);

  const acts = activities.data ?? [];
  const isCurrent = React.useMemo(() => {
    const s = summary.data;
    const t = todayIso();
    return !!s && s.start <= t && t <= s.end;
  }, [summary.data]);

  const changePeriod = (p: ReportPeriod) => {
    setPeriod(p);
    setDate(todayIso());
  };

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[13px] text-neutral-400">
            {summary.data ? (
              <>
                <span className="desktop:hidden">{fmtRange(summary.data.start, summary.data.end)}</span>
                <span className="hidden desktop:inline">{fmtRangeLong(summary.data.start, summary.data.end)}</span>
              </>
            ) : (
              " "
            )}
          </span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">
            <span className="desktop:hidden">Relatório</span>
            <span className="hidden desktop:inline">Relatório de constância</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="desktop:hidden">
            <Seg
              label="Período"
              value={period === "quarter" ? "month" : period}
              onChange={(v) => changePeriod(v)}
              options={[
                { value: "week", label: "Semana" },
                { value: "month", label: "Mês" },
              ]}
            />
          </span>
          <span className="hidden desktop:inline-flex">
            <Seg
              label="Período"
              value={period}
              onChange={(v) => changePeriod(v)}
              options={[
                { value: "week", label: "Semana" },
                { value: "month", label: "Mês" },
                { value: "quarter", label: "Trimestre" },
              ]}
            />
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-divider">
          <button type="button" aria-label={`${PERIOD_LABEL[period]} anterior`} onClick={() => setDate(shiftPeriodDate(period, date, -1))} className="grid h-9 w-11 place-items-center text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] hover:text-primary">
            <CaretLeft size={16} />
          </button>
          <button
            type="button"
            aria-label={`${PERIOD_LABEL[period]} seguinte`}
            disabled={isCurrent}
            onClick={() => setDate(shiftPeriodDate(period, date, 1))}
            className="grid h-9 w-11 place-items-center border-l border-divider text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] hover:text-primary disabled:opacity-45"
          >
            <CaretRight size={16} />
          </button>
        </div>
        {!isCurrent && summary.data ? (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>
            Voltar para {period === "week" ? "esta semana" : period === "month" ? "este mês" : "este trimestre"}
          </Button>
        ) : null}
        {acts.length > 1 ? (
          <label className="ml-auto flex items-center gap-2 text-[13px] text-neutral-400">
            <span className="sr-only">Objetivo</span>
            <Select value={activityId ?? ""} onChange={(e) => setActivityId(e.target.value || null)} className="min-h-[36px] w-auto py-1 text-[13px]" aria-label="Filtrar por objetivo">
              <option value="">Todos os objetivos</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      {locked ? (
        <PlanUpsell
          title="Relatórios do mês e do trimestre"
          text="Estão nos planos Essencial e Completo. O relatório da semana continua disponível no Gratuito, com o mesmo histórico completo e a exportação dos seus dados."
        />
      ) : summary.isPending ? (
        <div className="flex justify-center py-20" role="status">
          <Spinner className="h-6 w-6" />
        </div>
      ) : summary.isError || !summary.data ? (
        <Banner
          kind={!online || isNetworkError(summary.error) ? "offline" : "error"}
          actions={
            <Button size="sm" variant="secondary" onClick={() => summary.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {!online || isNetworkError(summary.error) ? "Sem conexão. O relatório precisa de internet para ser calculado." : errorMessage(summary.error, "Não foi possível carregar o relatório.")}
        </Banner>
      ) : (
        <ReportBody data={summary.data} period={period} activityId={activityId} activities={acts.map((a) => ({ id: a.id, title: a.title }))} online={online} />
      )}
    </div>
  );
}

function ReportBody({ data, period, activityId, activities, online }: { data: SummaryOut; period: ReportPeriod; activityId: string | null; activities: { id: string; title: string }[]; online: boolean }) {
  const [exporting, setExporting] = React.useState(false);
  const hasAny = data.logged_seconds > 0 || data.sessions_count > 0;
  const pendingLabel = period === "week" ? "a recuperar ao final da semana" : period === "month" ? "a recuperar ao final do mês" : "a recuperar ao final do trimestre";

  const doExport = async () => {
    setExporting(true);
    try {
      await exportReportCsv(data.start, data.end, activityId);
      toast.success("Arquivo pronto", "O CSV foi salvo no seu aparelho.");
    } catch (e) {
      toast.error("Não foi possível exportar", errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="tnum grid grid-cols-3 gap-2 desktop:grid-cols-4 desktop:gap-4">
        <StatCard value={fmtMinutes(data.logged_seconds)} label={`realizado de ${fmtMinutes(data.planned_seconds)}`} desktopLabel={`realizado de ${fmtMinutes(data.planned_seconds)} planejadas`} />
        <StatCard value={`${data.days_with_log} / ${data.goal_days_planned}`} label="dias com registro" desktopLabel="dias ativos com registro" />
        <StatCard value={fmtMinutes(data.pending_open_seconds)} label="a recuperar" desktopLabel={pendingLabel} pending={data.pending_open_seconds > 0} />
        <StatCard className="hidden desktop:flex" value={String(data.sessions_count)} label={`sessões · média ${fmtMinutes(data.avg_session_seconds)}`} />
      </div>
      <p className="tnum -mt-1 text-[12px] text-neutral-400 desktop:hidden">
        {data.sessions_count} {data.sessions_count === 1 ? "sessão" : "sessões"}
        {data.sessions_count > 0 ? ` · média ${fmtMinutes(data.avg_session_seconds)}` : ""} · sequência de {data.streak_current} {data.streak_current === 1 ? "dia" : "dias"}
      </p>

      <div className="grid gap-[14px] desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-4">
        <Card elev="sm" className="gap-3 p-4 desktop:gap-4 desktop:p-5">
          <span className="kicker">Tempo por dia{typicalTarget(data.per_day) ? ` · meta ${typicalTarget(data.per_day)} min` : ""}</span>
          <DayBars rows={data.per_day} period={period} />
          <div className="flex flex-wrap gap-4 text-[12px] text-neutral-400" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[10px] w-[10px] rounded-[2px] bg-accent" />
              Realizado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[10px] w-[10px] rounded-[2px] shadow-inset-warning" />
              Meta sem registro
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[10px] w-[10px] rounded-[2px] shadow-inset-divider" />
              Meta ainda por vir
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-[14px] desktop:gap-4">
          <Card elev="sm" className="tnum gap-3 p-4 text-[14px] desktop:p-5">
            <span className="kicker">Tempo por objetivo</span>
            {data.by_activity.length === 0 || data.logged_seconds === 0 ? (
              <p className="text-[13px] text-neutral-400">Nenhum tempo registrado neste período.</p>
            ) : (
              data.by_activity.map((r, i) => {
                const share = data.logged_seconds > 0 ? Math.round((r.logged / data.logged_seconds) * 100) : 0;
                return (
                  <div key={r.activity_id}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate">{r.title}</span>
                      <span className="shrink-0 text-neutral-400">
                        {fmtMinutes(r.logged)}
                        <span className="hidden desktop:inline"> · {share}%</span>
                      </span>
                    </div>
                    <Bar value={share / 100} color={i % 2 ? "accent-600" : "accent"} className="mt-1.5" label={`${r.title}: ${fmtMinutes(r.logged)} (${share}% do total)`} />
                  </div>
                );
              })
            )}
            {activityId && data.by_subject.length > 0 ? (
              <details className="mt-1 text-[13px]">
                <summary className="cursor-pointer text-accent">Por matéria</summary>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {data.by_subject.map((s) => (
                    <li key={s.subject_id ?? s.title} className="flex justify-between gap-3">
                      <span className="truncate">{s.title}</span>
                      <span className="shrink-0 text-neutral-400">{fmtMinutes(s.logged)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>

          <Card elev="sm" className="gap-2 p-4 text-[14px] desktop:flex-1 desktop:p-5">
            <span className="kicker">Leitura {period === "week" ? "da semana" : period === "month" ? "do mês" : "do trimestre"}</span>
            {data.reading ? <p>{data.reading}</p> : <p className="text-neutral-400">Ainda não há registros suficientes para uma leitura {period === "week" ? "desta semana" : "deste período"}.</p>}
            {/constância/i.test(data.reading ?? "") ? null : (
              <p className="text-[13px] text-neutral-400">Tempo registrado mede constância, não aprendizado.</p>
            )}
            <p className="tnum text-[13px] text-neutral-400">
              Sequência atual: {data.streak_current} {data.streak_current === 1 ? "dia" : "dias"} · melhor sequência: {data.streak_best} {data.streak_best === 1 ? "dia" : "dias"}.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 desktop:mt-auto">
              <Button variant="primary" onClick={doExport} loading={exporting} disabled={!online || !hasAny} className="self-start">
                <DownloadSimple size={16} aria-hidden />
                Exportar {PERIOD_LABEL[period]} (CSV)
              </Button>
              {!online ? <span className="text-[12px] text-neutral-400">Exportar precisa de conexão.</span> : null}
            </div>
          </Card>
        </div>
      </div>

      <ContentProgress activities={activityId ? activities.filter((a) => a.id === activityId) : activities} />

      <SessionHistory start={data.start} end={data.end} activityId={activityId} online={online} />
    </>
  );
}

function StatCard({ value, label, desktopLabel, pending, className }: { value: string; label: string; desktopLabel?: string; pending?: boolean; className?: string }) {
  return (
    <Card elev="sm" className={cn("gap-[2px] p-3 desktop:gap-1 desktop:p-5", className)}>
      <span className={cn("text-[22px] font-medium leading-tight desktop:text-[32px]", pending && "text-pending")}>{value}</span>
      <span className="text-[11px] leading-snug text-neutral-400 desktop:text-[12px]">
        <span className={cn(desktopLabel && "desktop:hidden")}>{label}</span>
        {desktopLabel ? <span className="hidden desktop:inline">{desktopLabel}</span> : null}
      </span>
    </Card>
  );
}

/** Meta mais comum entre os dias com meta (para o kicker "meta 60 min"). */
function typicalTarget(rows: ReportDayRow[]): number | null {
  const counts = new Map<number, number>();
  for (const r of rows) if (r.target > 0) counts.set(r.target, (counts.get(r.target) ?? 0) + 1);
  if (counts.size === 0) return null;
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return Math.round(best / 60);
}

type BarState = "logged" | "missing" | "rest" | "paused" | "future";
interface BarDatum {
  key: string;
  label: string;
  labelLong: string;
  labelMobileHidden?: boolean;
  logged: number;
  target: number;
  state: BarState;
}

function classify(logged: number, target: number, isPaused: boolean, isPast: boolean): BarState {
  if (logged > 0) return "logged";
  if (isPaused) return "paused";
  if (target === 0) return "rest";
  return isPast ? "missing" : "future";
}

function buildBars(rows: ReportDayRow[], period: ReportPeriod): BarDatum[] {
  const today = todayIso();
  if (period === "quarter") {
    const weeks = new Map<string, { start: string; logged: number; target: number; paused: boolean; count: number }>();
    for (const r of rows) {
      const d = parseDate(r.local_date);
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = isoDate(monday);
      const w = weeks.get(k) ?? { start: k, logged: 0, target: 0, paused: true, count: 0 };
      w.logged += r.logged;
      w.target += r.target;
      w.paused = w.paused && r.is_paused;
      w.count += 1;
      weeks.set(k, w);
    }
    return [...weeks.values()].map((w) => {
      const end = parseDate(w.start);
      end.setDate(end.getDate() + 6);
      return {
        key: w.start,
        label: fmtDayTiny(w.start).split(" ")[1] + "/" + String(parseDate(w.start).getMonth() + 1).padStart(2, "0"),
        labelLong: `semana de ${fmtDayShort(w.start)}`,
        logged: w.logged,
        target: w.target,
        state: classify(w.logged, w.target, w.paused, isoDate(end) < today),
      };
    });
  }
  return rows.map((r) => {
    const d = parseDate(r.local_date);
    const wd = (d.getDay() + 6) % 7;
    const isWeek = period === "week";
    return {
      key: r.local_date,
      label: isWeek ? WEEKDAY_LABELS[wd] : String(d.getDate()),
      labelLong: isWeek ? WEEKDAY_SHORT[wd] : String(d.getDate()),
      labelMobileHidden: !isWeek && d.getDate() % 7 !== 1,
      logged: r.logged,
      target: r.target,
      state: classify(r.logged, r.target, r.is_paused, r.local_date < today),
    };
  });
}

/** Gráfico de barras simples: fundo track + fill acento; meta sem registro em contorno damasco; valores tnum acima. */
function DayBars({ rows, period }: { rows: ReportDayRow[]; period: ReportPeriod }) {
  const bars = React.useMemo(() => buildBars(rows, period), [rows, period]);
  const max = Math.max(60, ...bars.map((b) => Math.max(b.logged, b.target)));
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const dense = period !== "week";
  const summary = bars
    .filter((b) => b.state === "logged" || b.state === "missing")
    .map((b) => `${b.labelLong}: ${b.state === "missing" ? "sem registro" : fmtMinutes(b.logged)}`)
    .join("; ");

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={`Tempo por ${period === "quarter" ? "semana" : "dia"}. ${summary || "Nenhum registro."}`} className="tnum">
        <div aria-hidden className={cn("grid h-[150px] items-end text-[11px] text-neutral-500 desktop:h-[220px] desktop:text-[12px]", dense ? "gap-[3px] desktop:gap-2" : "gap-2 desktop:gap-4")} style={{ gridTemplateColumns: `repeat(${bars.length || 7}, minmax(0, 1fr))` }}>
          {bars.map((b) => {
            const value = b.state === "logged" ? fmtMin(b.logged) : b.state === "missing" ? "0" : "—";
            const h = b.state === "logged" ? pct(b.logged) : b.state === "missing" || b.state === "future" ? pct(b.target) : 0;
            return (
              <div key={b.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1 desktop:gap-1.5">
                <span className={cn("leading-none", b.state === "missing" && "text-pending", dense && "hidden desktop:inline")}>{value}</span>
                <div className="relative w-full flex-1">
                  {b.state === "rest" || b.state === "paused" ? (
                    <div className={cn("absolute inset-x-0 bottom-0 h-[4%] min-h-[3px] rounded-[3px] bg-neutral-800", b.state === "paused" && "recovery-stripes")} />
                  ) : (
                    <div
                      className={cn(
                        "absolute inset-x-0 bottom-0 rounded-t-[3px] desktop:rounded-t-[4px]",
                        b.state === "logged" && "bg-accent",
                        b.state === "missing" && "shadow-inset-warning",
                        b.state === "future" && "shadow-inset-divider",
                      )}
                      style={{ height: `${Math.max(h, 2)}%` }}
                    />
                  )}
                </div>
                <span className={cn("leading-none", b.labelMobileHidden && "invisible desktop:visible")}>
                  <span className={cn(period === "week" && "desktop:hidden")}>{b.label}</span>
                  {period === "week" ? <span className="hidden desktop:inline">{b.labelLong}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-neutral-400 hover:text-primary">Ver como tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tnum w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.1em] text-tertiary">
                <th scope="col" className="py-1 pr-3 font-normal">
                  {period === "quarter" ? "Semana" : "Dia"}
                </th>
                <th scope="col" className="py-1 pr-3 font-normal">
                  Meta
                </th>
                <th scope="col" className="py-1 pr-3 font-normal">
                  Registrado
                </th>
                <th scope="col" className="py-1 font-normal">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-t border-divider">
                  <td className="py-1 pr-3">{period === "week" ? WEEKDAY_NAMES[WEEKDAY_SHORT.indexOf(b.labelLong)] ?? b.labelLong : b.labelLong}</td>
                  <td className="py-1 pr-3">{b.target > 0 ? fmtMinutes(b.target) : "—"}</td>
                  <td className="py-1 pr-3">{b.logged > 0 ? fmtMinutes(b.logged) : "—"}</td>
                  <td className="py-1">
                    {b.state === "logged" && b.logged >= b.target ? "meta cumprida" : b.state === "logged" ? "abaixo da meta" : b.state === "missing" ? "meta sem registro" : b.state === "future" ? "ainda por vir" : b.state === "paused" ? "pausa planejada" : "descanso"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function ContentProgress({ activities }: { activities: { id: string; title: string }[] }) {
  const reports = useContentReports(activities.map((a) => a.id));
  const rows = reports.map((r, i) => ({ activity: activities[i], q: r })).filter(({ q }) => q.data && (q.data.topics_total > 0 || q.data.tasks_total > 0));
  if (activities.length === 0 || rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <span className="kicker">Progresso de conteúdo</span>
        <p className="text-[12px] text-neutral-400">Indicadores separados do tempo: tópicos e tarefas concluídos.</p>
      </div>
      <div className="grid gap-[10px] tablet:grid-cols-2 desktop:gap-4">
        {rows.map(({ activity, q }) => {
          const d = q.data!;
          return (
            <Card key={activity.id} elev="sm" className="tnum gap-3 p-4 text-[14px]">
              <span className="font-medium">{activity.title}</span>
              {d.topics_total > 0 ? (
                <div>
                  <div className="flex justify-between text-[13px]">
                    <span>Tópicos concluídos</span>
                    <span className="text-neutral-400">
                      {d.topics_done} de {d.topics_total}
                      {d.topics_in_progress > 0 ? ` · ${d.topics_in_progress} em andamento` : ""}
                    </span>
                  </div>
                  <Bar value={d.topics_total ? d.topics_done / d.topics_total : 0} className="mt-1.5" label={`${d.topics_done} de ${d.topics_total} tópicos concluídos`} />
                </div>
              ) : null}
              {d.tasks_total > 0 ? (
                <div>
                  <div className="flex justify-between text-[13px]">
                    <span>Tarefas concluídas</span>
                    <span className="text-neutral-400">
                      {d.tasks_done} de {d.tasks_total}
                      {d.tasks_skipped > 0 ? ` · ${d.tasks_skipped} puladas` : ""}
                    </span>
                  </div>
                  <Bar value={d.tasks_total ? d.tasks_done / d.tasks_total : 0} color="accent-600" className="mt-1.5" label={`${d.tasks_done} de ${d.tasks_total} tarefas concluídas`} />
                </div>
              ) : null}
              {d.note ? <p className="text-[12px] text-neutral-400">{d.note}</p> : null}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SessionHistory({ start, end, activityId, online }: { start: string; end: string; activityId: string | null; online: boolean }) {
  const [limit, setLimit] = React.useState(50);
  const sessions = useReportSessions({ start, end, activity_id: activityId, limit });
  const [editing, setEditing] = React.useState<ReportSessionOut | null>(null);
  const [deleting, setDeleting] = React.useState<ReportSessionOut | null>(null);
  const rows = (sessions.data ?? []).filter((s) => s.status !== "discarded");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="kicker">Histórico de sessões</span>
          <p className="text-[12px] text-neutral-400">Edite duração, data ou observação; toda alteração fica registrada com o motivo.</p>
        </div>
      </div>
      {sessions.isPending ? (
        <div className="flex justify-center py-6" role="status">
          <Spinner />
        </div>
      ) : sessions.isError ? (
        <Banner
          kind={isNetworkError(sessions.error) ? "offline" : "error"}
          actions={
            <Button size="sm" variant="secondary" onClick={() => sessions.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {errorMessage(sessions.error, "Não foi possível carregar as sessões.")}
        </Banner>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma sessão neste período."
          description="Comece com 15 minutos e o plano se ajusta."
          action={
            <Button asChild variant="primary">
              <Link to="/app/sessao">Começar sessão</Link>
            </Button>
          }
        />
      ) : (
        <Card elev="sm" className="gap-0 p-0">
          <ul className="divide-y divide-divider">
            {rows.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 text-[14px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="tnum shrink-0 text-[13px] text-neutral-400">
                      {s.local_date ? fmtDayTiny(s.local_date) : s.started_at ? fmtDayTiny(s.started_at) : "—"}
                      {s.started_at && s.kind === "timer" ? ` · ${fmtTime(s.started_at)}` : ""}
                    </span>
                    <span className="truncate">{s.activity_title ?? "Objetivo"}</span>
                    {s.needs_review ? <Tag variant="pending">Revisar</Tag> : null}
                    {s.status !== "finished" ? <Tag variant="neutral">{s.status === "active" ? "em andamento" : s.status === "paused" ? "pausada" : s.status}</Tag> : null}
                  </div>
                  <span className="block truncate text-[12px] text-neutral-400">
                    {[s.subject_title, s.topic_title, s.note, s.page_from ? `p. ${s.page_from}${s.page_to ? `–${s.page_to}` : ""}` : null, s.entry_mode === "manual" ? "registro manual" : s.kind === "pomodoro" ? "pomodoro" : null].filter(Boolean).join(" · ") || " "}
                  </span>
                </div>
                <span className="tnum shrink-0 font-medium">{fmtMinutes(s.duration_seconds ?? s.elapsed_seconds ?? 0)}</span>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost-muted" size="icon" aria-label={`Editar sessão de ${s.local_date ? fmtDayShort(s.local_date) : ""}`} onClick={() => setEditing(s)} disabled={!online}>
                    <PencilSimple size={18} />
                  </Button>
                  <Button variant="ghost-muted" size="icon" aria-label={`Excluir sessão de ${s.local_date ? fmtDayShort(s.local_date) : ""}`} onClick={() => setDeleting(s)} disabled={!online}>
                    <Trash size={18} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {rows.length >= limit ? (
            <div className="border-t border-divider p-2">
              <Button variant="ghost" size="sm" block onClick={() => setLimit((l) => l + 50)}>
                Carregar mais
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      {!online ? <p className="text-[12px] text-neutral-400">Editar ou excluir sessões precisa de conexão.</p> : null}
      {editing ? <EditSessionSheet session={editing} open onOpenChange={(o) => !o && setEditing(null)} /> : null}
      {deleting ? <DeleteSessionDialog session={deleting} open onOpenChange={(o) => !o && setDeleting(null)} /> : null}
    </section>
  );
}

function EditSessionSheet({ session, open, onOpenChange }: { session: ReportSessionOut; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateSession();
  const initialMinutes = Math.round((session.duration_seconds ?? session.elapsed_seconds ?? 0) / 60);
  const [minutes, setMinutes] = React.useState(String(initialMinutes));
  const [date, setDate] = React.useState(session.local_date ?? todayIso());
  const [time, setTime] = React.useState(session.started_at && session.kind !== "timer" ? fmtTime(session.started_at) : "");
  const [note, setNote] = React.useState(session.note ?? "");
  const [pageFrom, setPageFrom] = React.useState(session.page_from ? String(session.page_from) : "");
  const [pageTo, setPageTo] = React.useState(session.page_to ? String(session.page_to) : "");
  const [reason, setReason] = React.useState("");
  const [resolve, setResolve] = React.useState(session.needs_review);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 1) {
      setError("Informe uma duração de pelo menos 1 minuto.");
      return;
    }
    if (!reason.trim()) {
      setError("Diga em poucas palavras o motivo da alteração.");
      return;
    }
    const body: SessionUpdate = { reason: reason.trim(), expected_version: session.version, resolve_review: false };
    if (m !== initialMinutes) body.duration_seconds = m * 60;
    if (date !== session.local_date) body.local_date = date;
    if (time) body.start_time = time;
    if (note !== (session.note ?? "")) body.note = note || null;
    const pf = pageFrom ? Number(pageFrom) : null;
    const pt = pageTo ? Number(pageTo) : null;
    if (pf !== (session.page_from ?? null)) body.page_from = pf;
    if (pt !== (session.page_to ?? null)) body.page_to = pt;
    if (session.needs_review && resolve) body.resolve_review = true;
    try {
      await update.mutateAsync({ id: session.id, body });
      toast.success("Sessão atualizada", "O saldo e a pendência foram recalculados.");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mode="sheet" title="Editar sessão" description={`${session.activity_title ?? "Objetivo"} · ${session.local_date ? fmtDayShort(session.local_date) : ""}`}>
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          {session.needs_review ? (
            <Banner kind="info">
              Esta sessão está em revisão{session.review_reason ? `: ${session.review_reason}` : ""}. Confirme a duração para ela contar no saldo.
            </Banner>
          ) : null}
          {session.kind === "timer" && session.entry_mode !== "manual" ? <p className="text-[12px] text-neutral-400">Ao mudar a duração de uma sessão cronometrada, ela passa a valer pelo tempo informado (os intervalos originais ficam na trilha).</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Duração (minutos)" htmlFor="e-min">
              <Input id="e-min" type="number" inputMode="numeric" min={1} max={960} value={minutes} onChange={(e) => setMinutes(e.target.value)} className="tnum" />
            </Field>
            <Field label="Data" htmlFor="e-date">
              <Input id="e-date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Horário de início (opcional)" htmlFor="e-time">
              <Input id="e-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label="Páginas (opcional)">
              <div className="flex items-center gap-1.5">
                <Input aria-label="Página inicial" type="number" inputMode="numeric" min={1} placeholder="de" value={pageFrom} onChange={(e) => setPageFrom(e.target.value)} className="tnum" />
                <span className="text-neutral-500">–</span>
                <Input aria-label="Página final" type="number" inputMode="numeric" min={1} placeholder="até" value={pageTo} onChange={(e) => setPageTo(e.target.value)} className="tnum" />
              </div>
            </Field>
          </div>
          <Field label="Conteúdo / observação (opcional)" htmlFor="e-note">
            <Input id="e-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Vocabulário · lista 12" />
          </Field>
          <Field label="Motivo da alteração" htmlFor="e-reason" hint="Fica guardado na trilha de alterações desta sessão.">
            <Input id="e-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex.: esqueci o cronômetro ligado" required />
          </Field>
          {session.needs_review ? (
            <label className="flex min-h-[32px] items-center gap-[10px] text-[14px]">
              <Checkbox checked={resolve} onCheckedChange={(v) => setResolve(v === true)} />
              Confirmar a duração e tirar da revisão
            </label>
          ) : null}
          <RevisionsList sessionId={session.id} />
          <Button type="submit" size="xl" block loading={update.isPending}>
            Salvar alterações
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABEL: Record<string, string> = {
  duration_seconds: "duração",
  local_date: "data",
  start_time: "início",
  note: "observação",
  page_from: "página inicial",
  page_to: "página final",
  subject_id: "matéria",
  topic_id: "tópico",
  material_id: "material",
  status: "situação",
  needs_review: "revisão",
  kind: "tipo",
  entry_mode: "modo",
};
const ACTION_LABEL: Record<string, string> = { create: "criada", update: "editada", delete: "excluída", finish: "encerrada", discard: "descartada", review: "revisada" };

function fmtRevValue(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (k === "duration_seconds" && typeof v === "number") return fmtMinutes(v);
  if (k === "local_date" && typeof v === "string") return fmtDayShort(v);
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

function RevisionsList({ sessionId }: { sessionId: string }) {
  const revs = useSessionRevisions(sessionId);
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-accent">Histórico de alterações</summary>
      <div className="mt-2 flex flex-col gap-2">
        {revs.isPending ? (
          <Spinner />
        ) : revs.isError ? (
          <span className="text-neutral-400">{errorMessage(revs.error, "Não foi possível carregar o histórico.")}</span>
        ) : (revs.data ?? []).length === 0 ? (
          <span className="text-neutral-400">Sem alterações registradas.</span>
        ) : (
          (revs.data ?? []).map((r) => {
            const before = (r.before ?? {}) as Record<string, unknown>;
            const after = (r.after ?? {}) as Record<string, unknown>;
            const changed = Object.keys(after).filter((k) => k in FIELD_LABEL && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
            return (
              <div key={r.id} className="rounded-md bg-canvas px-3 py-2">
                <div className="flex justify-between gap-2 text-[12px] text-neutral-400">
                  <span>Sessão {ACTION_LABEL[r.action] ?? r.action}</span>
                  <span className="tnum">{fmtDateTimeShort(r.created_at)}</span>
                </div>
                {changed.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {changed.map((k) => (
                      <li key={k} className="tnum">
                        {FIELD_LABEL[k]}: {fmtRevValue(k, before[k])} → {fmtRevValue(k, after[k])}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {r.reason ? <span className="mt-1 block text-[12px] text-neutral-400">Motivo: {r.reason}</span> : null}
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function DeleteSessionDialog({ session, open, onOpenChange }: { session: ReportSessionOut; open: boolean; onOpenChange: (o: boolean) => void }) {
  const del = useDeleteSession();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const confirm = async () => {
    setError(null);
    try {
      await del.mutateAsync({ id: session.id, reason: reason.trim() || null });
      toast.success("Sessão excluída", "A pendência foi recalculada.");
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Excluir esta sessão?" description={`${fmtMinutes(session.duration_seconds ?? 0)} em ${session.local_date ? fmtDayShort(session.local_date) : ""} · ${session.activity_title ?? ""}`}>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <p className="text-[14px]">O tempo sai do saldo e a pendência é recalculada. A exclusão fica registrada na trilha; nada é apagado silenciosamente.</p>
        <Field label="Motivo (opcional)" htmlFor="d-reason">
          <Textarea id="d-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="min-h-[60px]" />
        </Field>
        <DialogActions>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Manter
          </Button>
          <Button variant="danger" onClick={confirm} loading={del.isPending}>
            Excluir sessão
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

/** "7 – 13 de setembro" */
function fmtRangeLong(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const month = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long" });
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} de ${month(b)}`;
  return `${a.getDate()} de ${month(a)} – ${b.getDate()} de ${month(b)}`;
}
