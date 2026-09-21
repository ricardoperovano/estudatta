import { t as tx, intlLocale } from "@/i18n";
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
import {
  Banner,
  Bar,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Seg,
  Select,
  Spinner,
  Tag,
  Textarea,
  toast,
} from "@/components/ui";
import {
  fmtDayShort,
  fmtDayTiny,
  fmtDateTimeShort,
  fmtMin,
  fmtMinutes,
  fmtRange,
  fmtTime,
  isoDate,
  parseDate,
  todayIso,
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
} from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { studyTypeLabel, useInsights } from "@/api/study";
import { usePageTour } from "@/components/tour/use-tours";
import { ReportWelcome } from "@/components/empty/report-welcome";
import { relatorioTour } from "@/tours/relatorio";
import {
  fmtQuestions,
  StudyFields,
  studyFieldsFrom,
  studyFieldsPayload,
  validateStudyFields,
  type StudyFieldsValue,
} from "@/components/app/study-fields";

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  week: "semana",
  month: tx("mês"),
  quarter: "trimestre",
};

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
  usePageTour(relatorioTour, !!summary.data);

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
                <span className="hidden desktop:inline">
                  {fmtRangeLong(summary.data.start, summary.data.end)}
                </span>
              </>
            ) : (
              " "
            )}
          </span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">
            <span className="desktop:hidden">{tx("Relatório")}</span>
            <span className="hidden desktop:inline">{tx("Relatório de constância")}</span>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2" data-tour="relatorio-periodo">
          <span className="desktop:hidden">
            <Seg
              label={tx("Período")}
              value={period === "quarter" ? "month" : period}
              onChange={(v) => changePeriod(v)}
              options={[
                { value: "week", label: tx("Semana") },
                { value: "month", label: tx("Mês") },
              ]}
            />
          </span>
          <span className="hidden desktop:inline-flex">
            <Seg
              label={tx("Período")}
              value={period}
              onChange={(v) => changePeriod(v)}
              options={[
                { value: "week", label: tx("Semana") },
                { value: "month", label: tx("Mês") },
                { value: "quarter", label: tx("Trimestre") },
              ]}
            />
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-divider">
          <button
            type="button"
            aria-label={tx("{{v0}} anterior", { v0: PERIOD_LABEL[period] })}
            onClick={() => setDate(shiftPeriodDate(period, date, -1))}
            className="grid h-9 w-11 place-items-center text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] hover:text-primary"
          >
            <CaretLeft size={16} />
          </button>
          <button
            type="button"
            aria-label={tx("{{v0}} seguinte", { v0: PERIOD_LABEL[period] })}
            disabled={isCurrent}
            onClick={() => setDate(shiftPeriodDate(period, date, 1))}
            className="grid h-9 w-11 place-items-center border-l border-divider text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)] hover:text-primary disabled:opacity-45"
          >
            <CaretRight size={16} />
          </button>
        </div>
        {!isCurrent && summary.data ? (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayIso())}>
            {tx("Voltar para {{v0}}", {
              v0:
                period === "week"
                  ? tx("esta semana")
                  : period === "month"
                    ? tx("este mês")
                    : tx("este trimestre"),
            })}
          </Button>
        ) : null}
        {acts.length > 1 ? (
          <label className="ml-auto flex items-center gap-2 text-[13px] text-neutral-400">
            <span className="sr-only">{tx("Objetivo")}</span>
            <Select
              value={activityId ?? ""}
              onChange={(e) => setActivityId(e.target.value || null)}
              className="min-h-[36px] w-auto py-1 text-[13px]"
              aria-label={tx("Filtrar por objetivo")}
            >
              <option value="">{tx("Todos os objetivos")}</option>
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
          title={tx("Relatórios do mês e do trimestre")}
          text={tx(
            "Estão nos planos Essencial e Completo. O relatório da semana continua disponível no Gratuito, com o mesmo histórico completo e a exportação dos seus dados.",
          )}
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
              {tx("Tentar de novo")}
            </Button>
          }
        >
          {!online || isNetworkError(summary.error)
            ? tx("Sem conexão. O relatório precisa de internet para ser calculado.")
            : errorMessage(summary.error, tx("Não foi possível carregar o relatório."))}
        </Banner>
      ) : (
        <ReportBody
          data={summary.data}
          period={period}
          activityId={activityId}
          activities={acts.map((a) => ({ id: a.id, title: a.title }))}
          online={online}
        />
      )}
    </div>
  );
}

function ReportBody({
  data,
  period,
  activityId,
  activities,
  online,
}: {
  data: SummaryOut;
  period: ReportPeriod;
  activityId: string | null;
  activities: { id: string; title: string }[];
  online: boolean;
}) {
  const [exporting, setExporting] = React.useState(false);
  const hasAny = data.logged_seconds > 0 || data.sessions_count > 0;
  const pendingLabel =
    period === "week"
      ? tx("a recuperar ao final da semana")
      : period === "month"
        ? tx("a recuperar ao final do mês")
        : tx("a recuperar ao final do trimestre");

  const doExport = async () => {
    setExporting(true);
    try {
      await exportReportCsv(data.start, data.end, activityId);
      toast.success(tx("Arquivo pronto"), tx("O CSV foi salvo no seu aparelho."));
    } catch (e) {
      toast.error(tx("Não foi possível exportar"), errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const today = todayIso();
  const isCurrent = data.start <= today && today <= data.end;

  return (
    <>
      {!hasAny ? (
        <ReportWelcome
          hasObjective={activities.length > 0}
          current={isCurrent}
          inPeriod={
            period === "week"
              ? tx("nesta semana")
              : period === "month"
                ? tx("neste mês")
                : tx("neste trimestre")
          }
        />
      ) : null}
      <div
        className="tnum grid grid-cols-3 gap-2 desktop:grid-cols-4 desktop:gap-4"
        data-tour="relatorio-numeros"
      >
        <StatCard
          value={fmtMinutes(data.logged_seconds)}
          label={tx("realizado de {{v0}}", { v0: fmtMinutes(data.planned_seconds) })}
          desktopLabel={tx("realizado de {{v0}} planejadas", { v0: fmtMinutes(data.planned_seconds) })}
        />
        <StatCard
          value={`${data.days_with_log} / ${data.goal_days_planned}`}
          label={tx("dias com registro")}
          desktopLabel={tx("dias ativos com registro")}
        />
        <StatCard
          value={fmtMinutes(data.pending_open_seconds)}
          label={tx("a recuperar")}
          desktopLabel={pendingLabel}
          pending={data.pending_open_seconds > 0}
        />
        <StatCard
          className="hidden desktop:flex"
          value={String(data.sessions_count)}
          label={tx("sessões · média {{v0}}", { v0: fmtMinutes(data.avg_session_seconds) })}
        />
      </div>
      <p className="tnum -mt-1 text-[12px] text-neutral-400 desktop:hidden">
        {data.sessions_count} {data.sessions_count === 1 ? tx("sessão") : tx("sessões")}
        {tx("{{v0}} · sequência de {{v1}} {{v2}}", {
          v0:
            data.sessions_count > 0
              ? " " + tx("· média {{v0}}", { v0: fmtMinutes(data.avg_session_seconds) })
              : "",
          v1: data.streak_current,
          v2: data.streak_current === 1 ? "dia" : "dias",
        })}
      </p>

      <div className="grid gap-[14px] desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-4">
        <Card elev="sm" className="gap-3 p-4 desktop:gap-4 desktop:p-5" data-tour="relatorio-dias">
          <span className="kicker">
            {tx("Tempo por dia{{v0}}", {
              v0: typicalTarget(data.per_day)
                ? " " + tx("· meta {{v0}} min", { v0: typicalTarget(data.per_day) })
                : "",
            })}
          </span>
          <DayBars rows={data.per_day} period={period} />
          <div className="flex flex-wrap gap-4 text-[12px] text-neutral-400" aria-hidden>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[10px] w-[10px] rounded-[2px] bg-accent" />
              {tx("Realizado")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[10px] w-[10px] rounded-[2px] shadow-inset-warning" />
              {tx("Meta sem registro")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[10px] w-[10px] rounded-[2px] shadow-inset-divider" />
              {tx("Meta ainda por vir")}
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-[14px] desktop:gap-4">
          <Card elev="sm" className="tnum gap-3 p-4 text-[14px] desktop:p-5">
            <span className="kicker">{tx("Tempo por objetivo")}</span>
            {data.by_activity.length === 0 || data.logged_seconds === 0 ? (
              <p className="text-[13px] text-neutral-400">{tx("Nenhum tempo registrado neste período.")}</p>
            ) : (
              data.by_activity.map((r, i) => {
                const share =
                  data.logged_seconds > 0 ? Math.round((r.logged / data.logged_seconds) * 100) : 0;
                return (
                  <div key={r.activity_id}>
                    <div className="flex justify-between gap-3">
                      <span className="truncate">{r.title}</span>
                      <span className="shrink-0 text-neutral-400">
                        {fmtMinutes(r.logged)}
                        <span className="hidden desktop:inline"> · {share}%</span>
                      </span>
                    </div>
                    <Bar
                      value={share / 100}
                      color={i % 2 ? "accent-600" : "accent"}
                      className="mt-1.5"
                      label={tx("{{v0}}: {{v1}} ({{v2}}% do total)", {
                        v0: r.title,
                        v1: fmtMinutes(r.logged),
                        v2: share,
                      })}
                    />
                  </div>
                );
              })
            )}
            {activityId && data.by_subject.length > 0 ? (
              <details className="mt-1 text-[13px]">
                <summary className="cursor-pointer text-accent">{tx("Por matéria")}</summary>
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

          <Card
            elev="sm"
            className="gap-2 p-4 text-[14px] desktop:flex-1 desktop:p-5"
            data-tour="relatorio-leitura"
          >
            <span className="kicker">
              {tx("Leitura {{v0}}", {
                v0:
                  period === "week"
                    ? tx("da semana")
                    : period === "month"
                      ? tx("do mês")
                      : tx("do trimestre"),
              })}
            </span>
            {data.reading ? (
              <p>{data.reading}</p>
            ) : (
              <p className="text-neutral-400">
                {tx("Ainda não há registros suficientes para uma leitura {{v0}}.", {
                  v0: period === "week" ? tx("desta semana") : tx("deste período"),
                })}
              </p>
            )}
            {/constância/i.test(data.reading ?? "") ? null : (
              <p className="text-[13px] text-neutral-400">
                {tx("Tempo registrado mede constância, não aprendizado.")}
              </p>
            )}
            <p className="tnum text-[13px] text-neutral-400">
              {tx("Sequência atual: {{v0}} {{v1}} · melhor sequência: {{v2}} {{v3}}.", {
                v0: data.streak_current,
                v1: data.streak_current === 1 ? "dia" : "dias",
                v2: data.streak_best,
                v3: data.streak_best === 1 ? "dia" : "dias",
              })}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 desktop:mt-auto">
              <Button
                variant="primary"
                onClick={doExport}
                loading={exporting}
                disabled={!online || !hasAny}
                className="self-start"
              >
                <DownloadSimple size={16} aria-hidden />
                {tx("Exportar {{v0}} (CSV)", { v0: PERIOD_LABEL[period] })}
              </Button>
              {!online ? (
                <span className="text-[12px] text-neutral-400">{tx("Exportar precisa de conexão.")}</span>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {activityId || activities[0] ? (
        <StudyBreakdown
          activityId={activityId ?? activities[0].id}
          activityTitle={
            activities.length > 1
              ? activities.find((a) => a.id === (activityId ?? activities[0].id))?.title
              : undefined
          }
        />
      ) : null}

      <ContentProgress activities={activityId ? activities.filter((a) => a.id === activityId) : activities} />

      <SessionHistory
        start={data.start}
        end={data.end}
        activityId={activityId}
        online={online}
        quiet={!hasAny}
      />
    </>
  );
}

function StatCard({
  value,
  label,
  desktopLabel,
  pending,
  className,
}: {
  value: string;
  label: string;
  desktopLabel?: string;
  pending?: boolean;
  className?: string;
}) {
  return (
    <Card elev="sm" className={cn("gap-[2px] p-3 desktop:gap-1 desktop:p-5", className)}>
      <span
        className={cn("text-[22px] font-medium leading-tight desktop:text-[32px]", pending && "text-pending")}
      >
        {value}
      </span>
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
    const weeks = new Map<
      string,
      { start: string; logged: number; target: number; paused: boolean; count: number }
    >();
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
        label:
          fmtDayTiny(w.start).split(" ")[1] +
          "/" +
          String(parseDate(w.start).getMonth() + 1).padStart(2, "0"),
        labelLong: tx("semana de {{v0}}", { v0: fmtDayShort(w.start) }),
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
    .map((b) => `${b.labelLong}: ${b.state === "missing" ? tx("sem registro") : fmtMinutes(b.logged)}`)
    .join("; ");

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={tx("Tempo por {{v0}}. {{v1}}", {
          v0: period === "quarter" ? "semana" : "dia",
          v1: summary || tx("Nenhum registro."),
        })}
        className="tnum"
      >
        <div
          aria-hidden
          className={cn(
            "grid h-[150px] items-end text-[11px] text-neutral-500 desktop:h-[220px] desktop:text-[12px]",
            dense ? "gap-[3px] desktop:gap-2" : "gap-2 desktop:gap-4",
          )}
          style={{ gridTemplateColumns: `repeat(${bars.length || 7}, minmax(0, 1fr))` }}
        >
          {bars.map((b) => {
            const value = b.state === "logged" ? fmtMin(b.logged) : b.state === "missing" ? "0" : "—";
            const h =
              b.state === "logged"
                ? pct(b.logged)
                : b.state === "missing" || b.state === "future"
                  ? pct(b.target)
                  : 0;
            return (
              <div
                key={b.key}
                className="flex h-full min-w-0 flex-col items-center justify-end gap-1 desktop:gap-1.5"
              >
                <span
                  className={cn(
                    "leading-none",
                    b.state === "missing" && "text-pending",
                    dense && "hidden desktop:inline",
                  )}
                >
                  {value}
                </span>
                <div className="relative w-full flex-1">
                  {b.state === "rest" || b.state === "paused" ? (
                    <div
                      className={cn(
                        "absolute inset-x-0 bottom-0 h-[4%] min-h-[3px] rounded-[3px] bg-neutral-800",
                        b.state === "paused" && "recovery-stripes",
                      )}
                    />
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
        <summary className="cursor-pointer text-neutral-400 hover:text-primary">
          {tx("Ver como tabela")}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tnum w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.1em] text-tertiary">
                <th scope="col" className="py-1 pr-3 font-normal">
                  {period === "quarter" ? tx("Semana") : tx("Dia")}
                </th>
                <th scope="col" className="py-1 pr-3 font-normal">
                  {tx("Meta")}
                </th>
                <th scope="col" className="py-1 pr-3 font-normal">
                  {tx("Registrado")}
                </th>
                <th scope="col" className="py-1 font-normal">
                  {tx("Situação")}
                </th>
              </tr>
            </thead>
            <tbody>
              {bars.map((b) => (
                <tr key={b.key} className="border-t border-divider">
                  <td className="py-1 pr-3">
                    {period === "week"
                      ? (WEEKDAY_NAMES[WEEKDAY_SHORT.indexOf(b.labelLong)] ?? b.labelLong)
                      : b.labelLong}
                  </td>
                  <td className="py-1 pr-3">{b.target > 0 ? fmtMinutes(b.target) : "—"}</td>
                  <td className="py-1 pr-3">{b.logged > 0 ? fmtMinutes(b.logged) : "—"}</td>
                  <td className="py-1">
                    {b.state === "logged" && b.logged >= b.target
                      ? tx("meta cumprida")
                      : b.state === "logged"
                        ? tx("abaixo da meta")
                        : b.state === "missing"
                          ? tx("meta sem registro")
                          : b.state === "future"
                            ? tx("ainda por vir")
                            : b.state === "paused"
                              ? tx("pausa planejada")
                              : "descanso"}
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

const fmtPercent = (p: number) => `${Number.isInteger(p) ? p : p.toFixed(1).replace(".", ",")}%`;

/**
 * Tempo por tipo de estudo (semana atual) e acertos por matéria (desde o início), do endpoint de análise.
 * Só mostra o que o servidor devolveu — sem estimativas.
 */
function StudyBreakdown({ activityId, activityTitle }: { activityId: string; activityTitle?: string }) {
  const insights = useInsights(activityId);
  if (insights.isPending) {
    return (
      <div className="flex justify-center py-6" role="status">
        <Spinner />
      </div>
    );
  }
  if (insights.isError || !insights.data) {
    return (
      <Banner
        kind={isNetworkError(insights.error) ? "offline" : "error"}
        actions={
          <Button size="sm" variant="secondary" onClick={() => insights.refetch()}>
            {tx("Tentar de novo")}
          </Button>
        }
      >
        {errorMessage(insights.error, tx("Não foi possível carregar a análise por tipo e acertos."))}
      </Banner>
    );
  }
  const { week, accuracy_by_subject: accuracy } = insights.data;
  const types = week.by_type.filter((t) => t.seconds > 0);
  const typeTotal = types.reduce((a, t) => a + t.seconds, 0);
  const rows = accuracy.filter((r) => r.questions > 0);
  const suffix = activityTitle ? ` · ${activityTitle}` : "";

  return (
    <div className="grid gap-[14px] tablet:grid-cols-2 desktop:gap-4">
      <Card elev="sm" className="tnum gap-3 p-4 text-[14px] desktop:p-5" data-tour="relatorio-tipos">
        <div>
          <span className="kicker">{tx("Por tipo de estudo")}</span>
          <p className="text-[12px] text-neutral-400">
            {tx("Esta semana ({{v0}}){{v1}}", { v0: fmtRange(week.start, week.end), v1: suffix })}
          </p>
        </div>
        {types.length === 0 ? (
          <p className="text-[13px] text-neutral-400">{tx("Nenhum tempo registrado nesta semana.")}</p>
        ) : (
          types.map((t, i) => {
            const share = typeTotal > 0 ? t.seconds / typeTotal : 0;
            return (
              <div key={t.study_type}>
                <div className="flex justify-between gap-3">
                  <span className="truncate">{t.label || studyTypeLabel(t.study_type)}</span>
                  <span className="shrink-0 text-neutral-400">
                    {fmtMinutes(t.seconds)} · {Math.round(share * 100)}%
                  </span>
                </div>
                <Bar
                  value={share}
                  color={i % 2 ? "accent-600" : "accent"}
                  className="mt-1.5"
                  label={tx("{{v0}}: {{v1}} ({{v2}}% da semana)", {
                    v0: t.label || studyTypeLabel(t.study_type),
                    v1: fmtMinutes(t.seconds),
                    v2: Math.round(share * 100),
                  })}
                />
              </div>
            );
          })
        )}
        {week.questions > 0 || week.pages > 0 ? (
          <p className="text-[13px] text-neutral-400">
            {[
              week.questions > 0
                ? tx("{{v0}}/{{v1}} questões{{v2}}{{v3}}", {
                    v0: week.questions_correct,
                    v1: week.questions,
                    v2: week.accuracy != null ? ` (${fmtPercent(week.accuracy)})` : "",
                    v3: week.questions_goal ? " " + tx("· meta {{v0}}", { v0: week.questions_goal }) : "",
                  })
                : null,
              week.pages > 0
                ? `${week.pages} ${week.pages === 1 ? tx("página") : tx("páginas")}${week.pages_goal ? " " + tx("· meta {{v0}}", { v0: week.pages_goal }) : ""}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </Card>

      <Card elev="sm" className="tnum gap-3 p-4 text-[14px] desktop:p-5">
        <div>
          <span className="kicker">{tx("Acertos por matéria")}</span>
          <p className="text-[12px] text-neutral-400">
            {tx("Desde o início{{v0}} · das mais difíceis para as mais fáceis", { v0: suffix })}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-neutral-400">
            {tx("Registre questões nas sessões para ver seus acertos.")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.subject_id ?? r.subject_title}>
                <div className="flex justify-between gap-3">
                  <span className="truncate">{r.subject_title}</span>
                  <span className="shrink-0 text-neutral-400">
                    {r.correct}/{r.questions}
                    {r.percent != null ? ` · ${fmtPercent(r.percent)}` : ""}
                  </span>
                </div>
                <Bar
                  value={r.questions > 0 ? r.correct / r.questions : 0}
                  color="success"
                  className="mt-1.5"
                  label={tx("{{v0}}: {{v1}} acertos em {{v2}} questões{{v3}}", {
                    v0: r.subject_title,
                    v1: r.correct,
                    v2: r.questions,
                    v3: r.percent != null ? ` (${fmtPercent(r.percent)})` : "",
                  })}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ContentProgress({ activities }: { activities: { id: string; title: string }[] }) {
  const reports = useContentReports(activities.map((a) => a.id));
  const rows = reports
    .map((r, i) => ({ activity: activities[i], q: r }))
    .filter(({ q }) => q.data && (q.data.topics_total > 0 || q.data.tasks_total > 0));
  if (activities.length === 0 || rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <span className="kicker">{tx("Progresso de conteúdo")}</span>
        <p className="text-[12px] text-neutral-400">
          {tx("Indicadores separados do tempo: tópicos e tarefas concluídos.")}
        </p>
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
                    <span>{tx("Tópicos concluídos")}</span>
                    <span className="text-neutral-400">
                      {tx("{{v0}} de {{v1}}", { v0: d.topics_done, v1: d.topics_total })}
                      {d.topics_in_progress > 0
                        ? " " + tx("· {{v0}} em andamento", { v0: d.topics_in_progress })
                        : ""}
                    </span>
                  </div>
                  <Bar
                    value={d.topics_total ? d.topics_done / d.topics_total : 0}
                    className="mt-1.5"
                    label={tx("{{v0}} de {{v1}} tópicos concluídos", {
                      v0: d.topics_done,
                      v1: d.topics_total,
                    })}
                  />
                </div>
              ) : null}
              {d.tasks_total > 0 ? (
                <div>
                  <div className="flex justify-between text-[13px]">
                    <span>{tx("Tarefas concluídas")}</span>
                    <span className="text-neutral-400">
                      {tx("{{v0}} de {{v1}}", { v0: d.tasks_done, v1: d.tasks_total })}
                      {d.tasks_skipped > 0 ? " " + tx("· {{v0}} puladas", { v0: d.tasks_skipped }) : ""}
                    </span>
                  </div>
                  <Bar
                    value={d.tasks_total ? d.tasks_done / d.tasks_total : 0}
                    color="accent-600"
                    className="mt-1.5"
                    label={tx("{{v0}} de {{v1}} tarefas concluídas", {
                      v0: d.tasks_done,
                      v1: d.tasks_total,
                    })}
                  />
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

/** `quiet`: o convite do topo já chama para a primeira sessão; aqui basta uma linha. */
function SessionHistory({
  start,
  end,
  activityId,
  online,
  quiet,
}: {
  start: string;
  end: string;
  activityId: string | null;
  online: boolean;
  quiet?: boolean;
}) {
  const [limit, setLimit] = React.useState(50);
  const sessions = useReportSessions({ start, end, activity_id: activityId, limit });
  const [editing, setEditing] = React.useState<ReportSessionOut | null>(null);
  const [deleting, setDeleting] = React.useState<ReportSessionOut | null>(null);
  const rows = (sessions.data ?? []).filter((s) => s.status !== "discarded");

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3" data-tour="relatorio-historico">
        <div>
          <span className="kicker">{tx("Histórico de sessões")}</span>
          <p className="text-[12px] text-neutral-400">
            {tx(
              "Edite duração, data, tipo, questões ou observação; toda alteração fica registrada com o motivo.",
            )}
          </p>
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
              {tx("Tentar de novo")}
            </Button>
          }
        >
          {errorMessage(sessions.error, tx("Não foi possível carregar as sessões."))}
        </Banner>
      ) : rows.length === 0 && quiet ? (
        <p className="m-0 rounded-md border border-dashed border-divider px-4 py-3 text-[13px] text-neutral-400">
          {tx("As sessões deste período aparecem aqui, com data, objetivo, tipo e duração.")}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          title={tx("Nenhuma sessão neste período.")}
          description={tx("Comece com 15 minutos e o plano se ajusta.")}
          action={
            <Button asChild variant="primary">
              <Link to="/app/sessao">{tx("Começar sessão")}</Link>
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
                      {s.local_date
                        ? fmtDayTiny(s.local_date)
                        : s.started_at
                          ? fmtDayTiny(s.started_at)
                          : "—"}
                      {s.started_at && s.kind === "timer" ? ` · ${fmtTime(s.started_at)}` : ""}
                    </span>
                    <span className="truncate">{s.activity_title ?? tx("Objetivo")}</span>
                    <Tag variant="neutral" icon={false}>
                      {studyTypeLabel(s.study_type)}
                    </Tag>
                    {s.needs_review ? <Tag variant="pending">{tx("Revisar")}</Tag> : null}
                    {s.status !== "finished" ? (
                      <Tag variant="neutral">
                        {s.status === "active"
                          ? tx("em andamento")
                          : s.status === "paused"
                            ? "pausada"
                            : s.status}
                      </Tag>
                    ) : null}
                  </div>
                  <span className="block truncate text-[12px] text-neutral-400">
                    {[
                      s.subject_title,
                      s.topic_title,
                      fmtQuestions(s.questions_total, s.questions_correct),
                      s.note,
                      s.page_from
                        ? tx("p. {{v0}}{{v1}}", { v0: s.page_from, v1: s.page_to ? `–${s.page_to}` : "" })
                        : null,
                      s.entry_mode === "manual"
                        ? tx("registro manual")
                        : s.kind === "pomodoro"
                          ? "pomodoro"
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || " "}
                  </span>
                </div>
                <span className="tnum shrink-0 font-medium">
                  {fmtMinutes(s.duration_seconds ?? s.elapsed_seconds ?? 0)}
                </span>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost-muted"
                    size="icon"
                    aria-label={tx("Editar sessão de {{v0}}", {
                      v0: s.local_date ? fmtDayShort(s.local_date) : "",
                    })}
                    onClick={() => setEditing(s)}
                    disabled={!online}
                  >
                    <PencilSimple size={18} />
                  </Button>
                  <Button
                    variant="ghost-muted"
                    size="icon"
                    aria-label={tx("Excluir sessão de {{v0}}", {
                      v0: s.local_date ? fmtDayShort(s.local_date) : "",
                    })}
                    onClick={() => setDeleting(s)}
                    disabled={!online}
                  >
                    <Trash size={18} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {rows.length >= limit ? (
            <div className="border-t border-divider p-2">
              <Button variant="ghost" size="sm" block onClick={() => setLimit((l) => l + 50)}>
                {tx("Carregar mais")}
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      {!online ? (
        <p className="text-[12px] text-neutral-400">{tx("Editar ou excluir sessões precisa de conexão.")}</p>
      ) : null}
      {editing ? (
        <EditSessionSheet session={editing} open onOpenChange={(o) => !o && setEditing(null)} />
      ) : null}
      {deleting ? (
        <DeleteSessionDialog session={deleting} open onOpenChange={(o) => !o && setDeleting(null)} />
      ) : null}
    </section>
  );
}

function EditSessionSheet({
  session,
  open,
  onOpenChange,
}: {
  session: ReportSessionOut;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateSession();
  const initialMinutes = Math.round((session.duration_seconds ?? session.elapsed_seconds ?? 0) / 60);
  const [minutes, setMinutes] = React.useState(String(initialMinutes));
  const [date, setDate] = React.useState(session.local_date ?? todayIso());
  const [time, setTime] = React.useState(
    session.started_at && session.kind !== "timer" ? fmtTime(session.started_at) : "",
  );
  const [note, setNote] = React.useState(session.note ?? "");
  const [pageFrom, setPageFrom] = React.useState(session.page_from ? String(session.page_from) : "");
  const [pageTo, setPageTo] = React.useState(session.page_to ? String(session.page_to) : "");
  const [study, setStudy] = React.useState<StudyFieldsValue>(() => studyFieldsFrom(session));
  const [reason, setReason] = React.useState("");
  const [resolve, setResolve] = React.useState(session.needs_review);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 1) {
      setError(tx("Informe uma duração de pelo menos 1 minuto."));
      return;
    }
    const studyError = validateStudyFields(study);
    if (studyError) {
      setError(studyError);
      return;
    }
    if (!reason.trim()) {
      setError(tx("Diga em poucas palavras o motivo da alteração."));
      return;
    }
    // `clear_questions` pode ainda não estar no schema gerado; o servidor o aceita na edição.
    const body: SessionUpdate = {
      reason: reason.trim(),
      expected_version: session.version,
      resolve_review: false,
      clear_questions: false,
    };
    if (m !== initialMinutes) body.duration_seconds = m * 60;
    if (date !== session.local_date) body.local_date = date;
    if (time) body.start_time = time;
    if (note !== (session.note ?? "")) body.note = note || null;
    const pf = pageFrom ? Number(pageFrom) : null;
    const pt = pageTo ? Number(pageTo) : null;
    if (pf !== (session.page_from ?? null)) body.page_from = pf;
    if (pt !== (session.page_to ?? null)) body.page_to = pt;
    const sp = studyFieldsPayload(study);
    if (sp.study_type !== (session.study_type || "teoria"))
      body.study_type = sp.study_type as SessionUpdate["study_type"];
    const hadQuestions = session.questions_total != null;
    if (!sp.hasQuestions) {
      if (hadQuestions) body.clear_questions = true;
    } else if (
      sp.questions_total !== (session.questions_total ?? null) ||
      sp.questions_correct !== (session.questions_correct ?? null)
    ) {
      body.questions_total = sp.questions_total;
      body.questions_correct = sp.questions_correct;
    }
    if (session.needs_review && resolve) body.resolve_review = true;
    try {
      await update.mutateAsync({ id: session.id, body });
      toast.success(tx("Sessão atualizada"), tx("O saldo e a pendência foram recalculados."));
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mode="sheet"
        title={tx("Editar sessão")}
        description={`${session.activity_title ?? tx("Objetivo")} · ${session.local_date ? fmtDayShort(session.local_date) : ""}`}
      >
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          {session.needs_review ? (
            <Banner kind="info">
              {tx("Esta sessão está em revisão{{v0}}. Confirme a duração para ela contar no saldo.", {
                v0: session.review_reason ? `: ${session.review_reason}` : "",
              })}
            </Banner>
          ) : null}
          {session.kind === "timer" && session.entry_mode !== "manual" ? (
            <p className="text-[12px] text-neutral-400">
              {tx(
                "Ao mudar a duração de uma sessão cronometrada, ela passa a valer pelo tempo informado (os intervalos originais ficam na trilha).",
              )}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx("Duração (minutos)")} htmlFor="e-min">
              <Input
                id="e-min"
                type="number"
                inputMode="numeric"
                min={1}
                max={960}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="tnum"
              />
            </Field>
            <Field label={tx("Data")} htmlFor="e-date">
              <Input
                id="e-date"
                type="date"
                max={todayIso()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx("Horário de início (opcional)")} htmlFor="e-time">
              <Input id="e-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label={tx("Páginas (opcional)")}>
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label={tx("Página inicial")}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="de"
                  value={pageFrom}
                  onChange={(e) => setPageFrom(e.target.value)}
                  className="tnum"
                />
                <span className="text-neutral-500">–</span>
                <Input
                  aria-label={tx("Página final")}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder={tx("até")}
                  value={pageTo}
                  onChange={(e) => setPageTo(e.target.value)}
                  className="tnum"
                />
              </div>
            </Field>
          </div>
          <StudyFields idPrefix="e-study" value={study} onChange={setStudy} />
          <Field label={tx("Conteúdo / observação (opcional)")} htmlFor="e-note">
            <Input
              id="e-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder={tx("Vocabulário · lista 12")}
            />
          </Field>
          <Field
            label={tx("Motivo da alteração")}
            htmlFor="e-reason"
            hint={tx("Fica guardado na trilha de alterações desta sessão.")}
          >
            <Input
              id="e-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder={tx("Ex.: esqueci o cronômetro ligado")}
              required
            />
          </Field>
          {session.needs_review ? (
            <label className="flex min-h-[32px] items-center gap-[10px] text-[14px]">
              <Checkbox checked={resolve} onCheckedChange={(v) => setResolve(v === true)} />
              {tx("Confirmar a duração e tirar da revisão")}
            </label>
          ) : null}
          <RevisionsList sessionId={session.id} />
          <Button type="submit" size="xl" block loading={update.isPending}>
            {tx("Salvar alterações")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABEL: Record<string, string> = {
  duration_seconds: tx("duração"),
  local_date: "data",
  start_time: tx("início"),
  note: tx("observação"),
  page_from: tx("página inicial"),
  page_to: tx("página final"),
  subject_id: tx("matéria"),
  topic_id: tx("tópico"),
  material_id: tx("material"),
  status: tx("situação"),
  needs_review: tx("revisão"),
  kind: "tipo",
  entry_mode: "modo",
  study_type: tx("tipo de estudo"),
  questions_total: tx("questões"),
  questions_correct: "acertos",
};
const ACTION_LABEL: Record<string, string> = {
  create: "criada",
  update: "editada",
  delete: tx("excluída"),
  finish: "encerrada",
  discard: "descartada",
  review: "revisada",
};

function fmtRevValue(k: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (k === "duration_seconds" && typeof v === "number") return fmtMinutes(v);
  if (k === "local_date" && typeof v === "string") return fmtDayShort(v);
  if (typeof v === "boolean") return v ? "sim" : tx("não");
  if (k === "study_type" && typeof v === "string") return studyTypeLabel(v);
  return String(v);
}

function RevisionsList({ sessionId }: { sessionId: string }) {
  const revs = useSessionRevisions(sessionId);
  return (
    <details className="text-[13px]">
      <summary className="cursor-pointer text-accent">{tx("Histórico de alterações")}</summary>
      <div className="mt-2 flex flex-col gap-2">
        {revs.isPending ? (
          <Spinner />
        ) : revs.isError ? (
          <span className="text-neutral-400">
            {errorMessage(revs.error, tx("Não foi possível carregar o histórico."))}
          </span>
        ) : (revs.data ?? []).length === 0 ? (
          <span className="text-neutral-400">{tx("Sem alterações registradas.")}</span>
        ) : (
          (revs.data ?? []).map((r) => {
            const before = (r.before ?? {}) as Record<string, unknown>;
            const after = (r.after ?? {}) as Record<string, unknown>;
            const changed = Object.keys(after).filter(
              (k) => k in FIELD_LABEL && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
            );
            return (
              <div key={r.id} className="rounded-md bg-canvas px-3 py-2">
                <div className="flex justify-between gap-2 text-[12px] text-neutral-400">
                  <span>{tx("Sessão {{v0}}", { v0: ACTION_LABEL[r.action] ?? r.action })}</span>
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
                {r.reason ? (
                  <span className="mt-1 block text-[12px] text-neutral-400">
                    {tx("Motivo: {{v0}}", { v0: r.reason })}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function DeleteSessionDialog({
  session,
  open,
  onOpenChange,
}: {
  session: ReportSessionOut;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const del = useDeleteSession();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const confirm = async () => {
    setError(null);
    try {
      await del.mutateAsync({ id: session.id, reason: reason.trim() || null });
      toast.success(tx("Sessão excluída"), tx("A pendência foi recalculada."));
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={tx("Excluir esta sessão?")}
        description={tx("{{v0}} em {{v1}} · {{v2}}", {
          v0: fmtMinutes(session.duration_seconds ?? 0),
          v1: session.local_date ? fmtDayShort(session.local_date) : "",
          v2: session.activity_title ?? "",
        })}
      >
        {error ? <Banner kind="error">{error}</Banner> : null}
        <p className="text-[14px]">
          {tx(
            "O tempo sai do saldo e a pendência é recalculada. A exclusão fica registrada na trilha; nada é apagado silenciosamente.",
          )}
        </p>
        <Field label={tx("Motivo (opcional)")} htmlFor="d-reason">
          <Textarea
            id="d-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            className="min-h-[60px]"
          />
        </Field>
        <DialogActions>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tx("Manter")}
          </Button>
          <Button variant="danger" onClick={confirm} loading={del.isPending}>
            {tx("Excluir sessão")}
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
  const month = (d: Date) => d.toLocaleDateString(intlLocale, { month: "long" });
  if (a.getMonth() === b.getMonth())
    return tx("{{v0}} – {{v1}} de {{v2}}", { v0: a.getDate(), v1: b.getDate(), v2: month(b) });
  return tx("{{v0}} de {{v1}} – {{v2}} de {{v3}}", {
    v0: a.getDate(),
    v1: month(a),
    v2: b.getDate(),
    v3: month(b),
  });
}
