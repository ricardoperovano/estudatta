import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Check } from "@phosphor-icons/react";
import { useToday, useToggleTask } from "@/api/queries";
import { useUser } from "@/api/session";
import { Banner, Button, Card, Checkbox, EmptyState, GoalBar, Legend, Spinner, Tag } from "@/components/ui";
import { fmtDayLong, fmtDayShort, fmtMinutes, fmtTime } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { useSyncStore } from "@/offline/sync";
import { ManualEntrySheet } from "./manual-entry";
import { useTimerStore, elapsedSeconds } from "@/app/timer/store";
import { cn } from "@/lib/utils";
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

  React.useEffect(() => {
    if (params.get("registrar") === "1" && today.data?.data.cards.length) {
      setManualFor(today.data.data.cards[0]);
      params.delete("registrar");
      setParams(params, { replace: true });
    }
  }, [params, setParams, today.data]);

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
  const activeTimer = timer && (timer.status === "active" || timer.status === "paused") ? timer : null;

  return (
    <div className="flex flex-col gap-[14px]">
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="text-[13px] text-neutral-400">
            <span className="desktop:hidden">{dateLabel}</span>
            <span className="hidden desktop:inline">{dateLong}</span>
          </span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Hoje</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="desktop:hidden">
            {!online ? (
              <Tag variant="info">Sem conexão</Tag>
            ) : sync.status === "syncing" ? (
              <Tag variant="neutral" icon={<Spinner />}>Sincronizando</Tag>
            ) : offline ? (
              <Tag variant="info">Salvo {savedAt ? fmtTime(savedAt) : ""}</Tag>
            ) : (
              <Tag variant="info" icon={<Check size={11} weight="bold" aria-hidden />}>Sincronizado</Tag>
            )}
          </span>
          {first ? (
            <div className="hidden gap-2 desktop:flex">
              <Button variant="secondary" size="lg" onClick={() => setManualFor(first)}>
                Registrar manualmente
              </Button>
              <Button variant="primary" size="lg" onClick={() => nav(`/app/sessao?objetivo=${first.activity.id}`)}>
                Começar sessão
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {offline ? <Banner kind="offline">Saldo provisório: mostrando o último plano sincronizado{savedAt ? ` às ${fmtTime(savedAt)}` : ""}.</Banner> : null}

      {activeTimer ? (
        <Card elev="sm" className="gap-2 p-4">
          <div className="flex items-center justify-between">
            <span className="kicker">{activeTimer.status === "active" ? "Em sessão" : "Sessão pausada"}</span>
            <Tag variant="neutral">{activeTimer.activity_title}</Tag>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="tnum text-[32px] font-semibold">{fmtMinutes(elapsedSeconds(activeTimer))}</span>
            <Button variant="primary" size="lg" onClick={() => nav("/app/sessao")}>
              Voltar à sessão
            </Button>
          </div>
        </Card>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState
          title="Nenhum objetivo ainda."
          description="Defina o que quer acompanhar, os dias e a meta diária. O plano mostra o que fazer hoje."
          action={
            <Button asChild variant="primary" size="lg">
              <Link to="/app/objetivos/novo">Criar objetivo</Link>
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-[14px] desktop:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] desktop:gap-8">
        <div className="flex flex-col gap-[14px]">
          {cards.map((c) => (
            <ActivityTodayCard key={c.activity.id} card={c} onManual={() => setManualFor(c)} onStart={() => nav(`/app/sessao?objetivo=${c.activity.id}`)} hideActionsOnDesktop={c === first} />
          ))}
        </div>
        <Agenda items={data.agenda} cards={cards} />
      </div>

      {cards.length > 0 ? <WeekDots card={first} /> : null}

      {manualFor ? <ManualEntrySheet card={manualFor} cards={cards} open onOpenChange={(o) => !o && setManualFor(null)} /> : null}
    </div>
  );
}

function ActivityTodayCard({ card, onManual, onStart, hideActionsOnDesktop }: { card: TodayCard; onManual: () => void; onStart: () => void; hideActionsOnDesktop?: boolean }) {
  const s = card.summary;
  const act = card.activity;
  const rule = act.current_rule;
  const activeDays = rule ? Object.entries(rule.minutes_by_weekday).filter(([, m]) => Number(m) > 0).length : 0;
  const daysLabel = rule ? summarizeDays(rule.minutes_by_weekday as Record<string, number>) : "";

  if (card.pause) {
    return (
      <Card className="gap-3 p-4">
        <Tag variant="neutral" className="self-start">
          Pausa planejada · {fmtDayShort(card.pause.start_date)} a {fmtDayShort(card.pause.end_date)}
        </Tag>
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
    return (
      <Card elev="sm" className="gap-3 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] font-medium">{act.title}</span>
          <span className="text-[12px] text-neutral-400">checklist</span>
        </div>
        <p className="text-[14px] text-neutral-300">
          {card.checklist ? `${card.checklist.done} de ${card.checklist.total} tarefas de hoje concluídas.` : "Sem tarefas hoje."}
        </p>
        <Button asChild variant="secondary" size="lg">
          <Link to={`/app/objetivos/${act.id}`}>Ver tarefas</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card elev="sm" className="gap-3 p-4 desktop:gap-4 desktop:p-6">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-medium desktop:text-[20px]">{act.title}</span>
        {goalDone ? (
          <Tag variant="success">Dia concluído</Tag>
        ) : (
          <span className="text-[12px] text-neutral-400 desktop:text-[13px]">
            meta base {fmtMinutes(s.target)}
            <span className="hidden desktop:inline"> · {daysLabel}</span>
          </span>
        )}
      </div>

      {goalDone && s.pending_prior === 0 ? (
        <div className="h-2 rounded-[4px] bg-accent desktop:h-[10px]" role="img" aria-label="Meta de hoje cumprida" />
      ) : (
        <GoalBar logged={s.logged} target={s.target} recovery={s.suggested_recovery} className="desktop:h-[10px]" />
      )}
      <Legend className="hidden desktop:flex" items={[{ swatch: "accent", label: "Registrado" }, { swatch: "outline", label: "Falta da meta" }, { swatch: "recovery", label: "Recuperação sugerida" }]} />

      {goalDone && s.pending_prior === 0 ? (
        <div className="tnum grid grid-cols-2 gap-[10px]">
          <Stat value={fmtMinutes(s.logged)} label="Registrado hoje" />
          <Stat value="0 min" label="Pendência" />
        </div>
      ) : (
        <div className="tnum grid grid-cols-2 gap-[10px] desktop:grid-cols-4 desktop:gap-4">
          <Stat value={fmtMinutes(s.logged)} label="Registrado hoje" desktopValue={<><span>{Math.round(s.logged / 60)}</span> <span className="text-[14px] font-normal text-neutral-400">/ {Math.round(s.target / 60)}</span></>} />
          <Stat value={fmtMinutes(s.missing_today)} label="Falta para a meta" desktopLabel="Falta para a meta de hoje" />
          <Stat value={fmtMinutes(s.pending_prior)} label="Pendência anterior" desktopLabel="Pendência de dias anteriores" pending />
          <Stat value={fmtMinutes(s.suggested_recovery)} label="Recuperação sugerida" desktopLabel="Recuperação sugerida hoje" pending />
        </div>
      )}

      <div className="flex items-center justify-between gap-4 rounded-md bg-canvas px-3 py-[10px] desktop:px-4 desktop:py-[14px]">
        <p className="text-[14px] leading-[1.45] desktop:text-[15px]">
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
        <Button variant="primary" size="xl" block onClick={onStart} className={cn(hideActionsOnDesktop && "desktop:hidden")}>
          Começar sessão
        </Button>
      )}
      <div className={cn("flex justify-between", hideActionsOnDesktop && "desktop:hidden")}>
        <Button variant="ghost" size="sm" onClick={onManual}>
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

function Stat({ value, label, desktopValue, desktopLabel, pending }: { value: string; label: string; desktopValue?: React.ReactNode; desktopLabel?: string; pending?: boolean }) {
  return (
    <div>
      <span className={cn("block text-[20px] font-medium desktop:text-[25px]", pending && "text-pending")}>
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
    <div className="flex flex-col gap-3">
      <span className="kicker">Agenda de hoje</span>
      {study.length === 0 ? (
        <p className="text-[13px] text-neutral-400">
          Nenhum bloco planejado. <Link to="/app/plano">Planejar a semana</Link>
        </p>
      ) : (
        study.map((t) => (
          <div key={t.id} className="flex gap-3 text-[14px]">
            <span className="tnum w-11 shrink-0 text-neutral-500 desktop:w-12">{t.start_time ?? "—"}</span>
            <div className={cn("flex-1 rounded-md border-l-2 bg-surface px-3 py-2 desktop:px-[14px] desktop:py-[10px]", t.status === "done" ? "border-accent" : "border-neutral-600")}>
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
          <span className="kicker mt-3">Tarefas</span>
          {tasks.map((t) => (
            <label key={t.id} className="flex min-h-[32px] items-center gap-[10px] text-[14px]">
              <Checkbox checked={t.status === "done"} onCheckedChange={(v) => toggle.mutate({ id: t.id, done: v === true })} aria-label={t.title} />
              <span className={cn(t.status === "done" && "text-neutral-500 line-through")}>{t.title}</span>
            </label>
          ))}
        </>
      ) : null}
    </div>
  );
}

function WeekDots({ card }: { card: TodayCard }) {
  const rule = card.activity.current_rule;
  if (!rule) return null;
  const planned = Object.values(rule.minutes_by_weekday).filter((m) => Number(m) > 0).length;
  const done = card.week_days_with_log;
  return (
    <div className="flex flex-col items-center gap-2 py-2 desktop:hidden">
      <div className="flex justify-center gap-1.5" aria-hidden>
        {Array.from({ length: planned }).map((_, i) => (
          <span key={i} className={cn("h-[10px] w-[10px] rounded-full", i < done ? "bg-accent" : "shadow-[inset_0_0_0_1px_var(--color-neutral-600)]")} />
        ))}
      </div>
      <p className="text-center text-[13px] text-neutral-400">
        {done} de {planned} dias desta semana com registro.
      </p>
    </div>
  );
}
