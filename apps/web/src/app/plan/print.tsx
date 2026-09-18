import { Link, useSearchParams } from "react-router";
import { CaretLeft, Printer } from "@phosphor-icons/react";
import { Banner, Button, EmptyState, Spinner } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { usePreferences, useWeekPrint, type Task } from "@/api/planning";
import { Logo } from "@/components/app/brand";
import { taskMeta } from "@/components/app/task-toggle";
import { capitalize, hhmmToMinutes, startOfWeekIso } from "@/components/app/week-utils";
import { fmtDateTimeShort, fmtDayShort, fmtMinutes, fmtRange, minutesOf, todayIso } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

/** Só a folha entra na impressão: navegação e avisos do app ficam de fora; tinta escura sobre papel. */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden !important; }
  #week-print, #week-print * { visibility: visible !important; color: #1d1f24 !important; background: transparent !important; box-shadow: none !important; border-color: #9aa0a6 !important; }
  #week-print { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; }
  #week-print tr { break-inside: avoid; }
}`;

const sortTasks = (tasks: Task[]) => [...tasks].sort((a, b) => (hhmmToMinutes(a.start_time) ?? 9999) - (hhmmToMinutes(b.start_time) ?? 9999) || a.sort_order - b.sort_order);

/** Versão imprimível do plano da semana: dias, metas, recuperação e tarefas com caixas para marcar à mão. */
export default function PlanPrintPage() {
  const online = useOnline();
  const [params] = useSearchParams();
  const prefs = usePreferences();
  const raw = params.get("inicio") ?? "";
  const objective = params.get("objetivo");
  const ready = /^\d{4}-\d{2}-\d{2}$/.test(raw) || !prefs.isPending;
  const start = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : startOfWeekIso(todayIso(), prefs.data?.week_starts_on ?? 0);
  const back = `/app/plano?semana=${start}${objective ? `&objetivo=${objective}` : ""}`;

  return (
    <div className="flex flex-col gap-[14px]">
      <style>{PRINT_CSS}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link to={back} className="inline-flex min-h-[44px] items-center gap-1 text-[13px] text-neutral-400 no-underline hover:text-primary">
          <CaretLeft size={14} aria-hidden /> Voltar ao plano
        </Link>
        <Button variant="primary" size="lg" onClick={() => window.print()}>
          <Printer size={16} aria-hidden /> Imprimir
        </Button>
      </div>
      {ready ? <PrintSheet start={start} objective={objective} online={online} /> : <Loading />}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-20" role="status">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

function PrintSheet({ start, objective, online }: { start: string; objective: string | null; online: boolean }) {
  const week = useWeekPrint(start, objective);
  if (week.isPending) return <Loading />;
  if (week.isError) {
    return (
      <Banner kind={online ? "error" : "offline"} actions={<Button size="sm" variant="secondary" onClick={() => week.refetch()}>Tentar de novo</Button>}>
        {online ? `Não foi possível montar a versão para impressão. ${errorMessage(week.error, "")}`.trim() : "Sem conexão: a versão para impressão precisa da internet."}
      </Banner>
    );
  }
  const w = week.data;
  if (w.activities.length === 0) return <EmptyState title="Nenhum objetivo ativo nesta semana." description="Crie um objetivo para ter um plano para imprimir." />;
  const multi = w.activities.length > 1;
  const titleOf = (id: string) => w.activities.find((a) => a.id === id)?.title;

  return (
    <article id="week-print" className="flex flex-col gap-4 rounded-md bg-surface p-4 desktop:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-divider pb-3">
        <div className="flex flex-col gap-1">
          <Logo />
          <h1 className="text-[25px] leading-[1.15]">Plano da semana · {fmtRange(w.start, w.end)}</h1>
          <span className="text-[13px] text-neutral-400">{w.activities.map((a) => a.title).join(" · ")}</span>
        </div>
        <div className="tnum flex flex-col items-end text-[13px] text-neutral-400">
          <span>
            Meta da semana: <strong className="font-medium text-primary">{fmtMinutes(w.target_seconds)}</strong>
            {w.recovery_seconds > 0 ? (
              <>
                {" "}
                + <span className="text-pending">{fmtMinutes(w.recovery_seconds)} de recuperação</span>
              </>
            ) : null}
          </span>
          <span>Tarefas planejadas: {fmtMinutes(w.planned_seconds)}</span>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.1em] text-neutral-500">
              <th className="w-[22%] border-b border-divider py-2 pr-3 font-normal">Dia</th>
              <th className="w-[16%] border-b border-divider py-2 pr-3 font-normal">Meta</th>
              <th className="border-b border-divider py-2 pr-3 font-normal">Tarefas e sessões</th>
              <th className="w-[16%] border-b border-divider py-2 font-normal">Feito (min)</th>
            </tr>
          </thead>
          <tbody>
            {w.days.map((d) => {
              const free = d.target_seconds === 0 && d.recovery_seconds === 0;
              const tasks = sortTasks(d.tasks);
              return (
                <tr key={d.local_date} className={cn("align-top", free && tasks.length === 0 && "text-neutral-500")}>
                  <td className="border-b border-divider py-3 pr-3 font-medium">
                    {capitalize(fmtDayShort(d.local_date))}
                    {d.is_today ? <span className="block text-[11px] font-normal text-accent">hoje</span> : null}
                  </td>
                  <td className="tnum border-b border-divider py-3 pr-3">
                    {d.is_paused ? (
                      "pausa"
                    ) : free ? (
                      "dia livre"
                    ) : (
                      <>
                        {d.target_seconds > 0 ? `${minutesOf(d.target_seconds)} min` : ""}
                        {d.recovery_seconds > 0 ? <span className="text-pending"> +{minutesOf(d.recovery_seconds)} recuperação</span> : null}
                      </>
                    )}
                    {d.over_capacity ? <span className="block text-[11px] text-pending">acima do limite diário</span> : null}
                  </td>
                  <td className="border-b border-divider py-3 pr-3">
                    {tasks.length === 0 ? (
                      <span className="text-neutral-500">—</span>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
                        {tasks.map((t) => (
                          <li key={t.id ?? `${t.series_id}-${t.local_date}`} className="flex items-start gap-2">
                            <span aria-hidden className="mt-[2px] grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[3px] border border-neutral-500 text-[10px] leading-none">
                              {t.status === "done" ? "✓" : ""}
                            </span>
                            <span>
                              {t.title}
                              {t.status === "done" ? <span className="sr-only"> (concluída)</span> : null}
                              <span className="tnum block text-[12px] text-neutral-400">{[multi ? titleOf(t.activity_id) : null, taskMeta(t, { time: true })].filter(Boolean).join(" · ")}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="tnum border-b border-divider py-3">{d.logged_seconds > 0 ? minutesOf(d.logged_seconds) : <span className="inline-block h-[18px] w-16 border-b border-neutral-600" aria-label="espaço para anotar" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap justify-between gap-2 text-[11px] text-neutral-500">
        <span>O que falta no dia é a meta do dia, não atraso. Tempo a recuperar aparece separado, com "+".</span>
        <span className="tnum">Gerado em {fmtDateTimeShort(w.generated_at)}</span>
      </footer>
    </article>
  );
}
