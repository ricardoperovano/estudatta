import * as React from "react";
import { Link, useNavigate } from "react-router";
import { Banner, Button, Card, Field, Input, Seg, Spinner, Switch, Tag, toast } from "@/components/ui";
import { useActivity, useApplyRecovery, useBalance, useRecoveryPreview } from "@/api/queries";
import { useCancelRecovery } from "@/api/activity-settings";
import { errorMessage } from "@/api/client";
import type { RecoveryPreview } from "@/api/types";
import { fmtDayTiny, fmtMinutes, minutesOf, todayIso, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { capitalize, fmtLongDuration, joinNames, shiftIso, weekdayMon } from "./week-utils";

type Option = "distribute" | "today" | "keep" | "custom" | "until_date";

interface Props {
  activityId: string;
  /** Chamado depois de aplicar/manter (ex.: fechar diálogo). Sem ele, navega para o plano. */
  onDone?: () => void;
  /** Dentro de um diálogo (desktop): sem kicker/título grandes. */
  inDialog?: boolean;
}

const ALTERNATIVE_LABEL: Record<string, string> = {
  ampliar_prazo: "Ampliar prazo",
  aumentar_disponibilidade: "Aumentar disponibilidade",
  revisar_plano: "Revisar o plano",
  perdoar_parte: "Perdoar parte",
};

/**
 * Tela/diálogo de recuperação (09 / D2): três opções com prévia real do servidor, tabela
 * Dia · Antes · Depois, edição dia a dia (estratégia custom) e alternativas quando não cabe tudo.
 * A sugestão nunca aumenta a dívida: o que não couber continua como pendência visível.
 */
export function RecoveryPlanner({ activityId, onDone, inDialog }: Props) {
  const nav = useNavigate();
  const online = useOnline();
  const activity = useActivity(activityId);
  const balance = useBalance(activityId, 14);
  const distribute = useRecoveryPreview(activityId);
  const todayPv = useRecoveryPreview(activityId);
  const keepPv = useRecoveryPreview(activityId);
  const customPv = useRecoveryPreview(activityId);
  const untilPv = useRecoveryPreview(activityId);
  const apply = useApplyRecovery(activityId);
  const cancel = useCancelRecovery(activityId);

  const [option, setOption] = React.useState<Option>("distribute");
  const [horizon, setHorizon] = React.useState<"3" | "5" | "7">("3");
  const [includeRest, setIncludeRest] = React.useState(false);
  const [untilDate, setUntilDate] = React.useState(shiftIso(todayIso(), 14));
  const [customMap, setCustomMap] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  const pending = balance.data?.today?.pending_prior ?? 0;
  const today = todayIso();

  const distributeMutate = distribute.mutate;
  const todayMutate = todayPv.mutate;
  const keepMutate = keepPv.mutate;
  const untilMutate = untilPv.mutate;
  const customMutate = customPv.mutate;

  React.useEffect(() => {
    if (!balance.data) return;
    distributeMutate({ strategy: "distribute", horizon_days: Number(horizon), include_rest_days: includeRest });
  }, [balance.data, horizon, includeRest, distributeMutate]);

  React.useEffect(() => {
    if (!balance.data) return;
    todayMutate({ strategy: "today", include_rest_days: false });
    keepMutate({ strategy: "keep", include_rest_days: false });
  }, [balance.data, todayMutate, keepMutate]);

  React.useEffect(() => {
    if (option !== "until_date" || !untilDate) return;
    untilMutate({ strategy: "until_date", until: untilDate, include_rest_days: includeRest });
  }, [option, untilDate, includeRest, untilMutate]);

  React.useEffect(() => {
    if (option !== "custom") return;
    const custom: Record<string, number> = {};
    for (const [d, v] of Object.entries(customMap)) custom[d] = Math.max(0, Number(v) || 0) * 60;
    const t = setTimeout(() => customMutate({ strategy: "custom", custom, include_rest_days: true }), 350);
    return () => clearTimeout(t);
  }, [option, customMap, customMutate]);

  const previewOf: Record<Option, RecoveryPreview | undefined> = {
    distribute: distribute.data,
    today: todayPv.data,
    keep: keepPv.data,
    custom: customPv.data,
    until_date: untilPv.data,
  };
  const preview = previewOf[option];
  const previewPending = distribute.isPending || (option === "today" && todayPv.isPending) || (option === "custom" && customPv.isPending) || (option === "until_date" && untilPv.isPending);

  // Dias recentes sem registro (para a explicação honesta).
  const deficitDays = (balance.data?.days ?? []).filter((d) => d.local_date < today && d.in_range && !d.is_rest && !d.is_paused && d.deficit > 0).slice(-3);
  const allEmpty = deficitDays.length > 0 && deficitDays.every((d) => d.logged === 0);
  const explanation =
    deficitDays.length === 0
      ? "Escolha como retomar o plano — nada se perde, só muda de lugar."
      : `${capitalize(joinNames(deficitDays.map((d) => WEEKDAY_NAMES[weekdayMon(d.local_date)])))} ${deficitDays.length > 1 ? "ficaram" : "ficou"} ${allEmpty ? "sem registro" : "abaixo da meta"}. Escolha como retomar o plano — nada se perde, só muda de lugar.`;

  const distAlloc = Object.entries(distribute.data?.allocations ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const distDays = distAlloc.length;
  const distUniform = distAlloc.length > 0 && distAlloc.every(([, s]) => s === distAlloc[0][1]);
  const distSub =
    distAlloc.length === 0
      ? distribute.data
        ? "Não há dias com espaço nesse horizonte"
        : "Calculando…"
      : `${distUniform ? `+${minutesOf(distAlloc[0][1])} min` : fmtMinutes(distribute.data!.allocated)} ${joinNames(distAlloc.map(([d]) => WEEKDAY_SHORT[weekdayMon(d)]))} · recomendado`;
  const todayTarget = balance.data?.today?.target ?? 0;
  const todayAlloc = todayPv.data?.allocations?.[today] ?? 0;
  const todayExceeds = (todayPv.data?.exceeds_capacity_on ?? []).includes(today);
  const todayLeft = todayPv.data?.unallocated ?? 0;

  const startEdit = () => {
    const base = preview?.rows ?? [];
    const map: Record<string, string> = {};
    for (const r of base) map[r.local_date] = String(minutesOf(r.after_extra));
    setCustomMap(map);
    setOption("custom");
  };

  const finish = () => {
    if (onDone) onDone();
    else nav("/app/plano");
  };

  const submit = async () => {
    setError(null);
    try {
      if (option === "keep") {
        await cancel.mutateAsync();
        toast.info("Pendência mantida", `${fmtMinutes(pending)} continuam visíveis no plano.`);
        finish();
        return;
      }
      const body =
        option === "distribute"
          ? { strategy: "distribute", horizon_days: Number(horizon), include_rest_days: includeRest }
          : option === "today"
            ? { strategy: "today", include_rest_days: false }
            : option === "until_date"
              ? { strategy: "until_date", until: untilDate, include_rest_days: includeRest }
              : { strategy: "custom", custom: Object.fromEntries(Object.entries(customMap).map(([d, v]) => [d, Math.max(0, Number(v) || 0) * 60])), include_rest_days: true };
      const plan = await apply.mutateAsync(body);
      const left = plan.unallocated_seconds;
      toast.success("Replanejamento aplicado", left > 0 ? `${fmtMinutes(plan.allocated_seconds)} distribuídos; ${fmtMinutes(left)} continuam pendentes.` : `${fmtMinutes(plan.allocated_seconds)} distribuídos nos próximos dias.`);
      finish();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (activity.isPending || balance.isPending) {
    return (
      <div className="flex justify-center py-16" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (activity.isError || balance.isError || !balance.data) {
    return (
      <Banner kind="error" actions={<Button size="sm" variant="secondary" onClick={() => balance.refetch()}>Tentar de novo</Button>}>
        {online ? "Não foi possível carregar a pendência." : "Sem conexão: a recuperação precisa do servidor para calcular."}
      </Banner>
    );
  }

  if (pending <= 0) {
    return (
      <div className="flex flex-col gap-[14px]">
        {!inDialog ? <span className="kicker-pending">Tempo a recuperar</span> : null}
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Nada a recuperar.</h1>
        <p className="text-[14px] text-neutral-400">A pendência de dias anteriores está zerada em {activity.data?.title}. O que falta hoje não é atraso — é a meta de hoje.</p>
        <Button variant="primary" size="lg" className="self-start" onClick={finish}>
          Voltar ao plano
        </Button>
      </div>
    );
  }

  const rows = visibleRows(preview);
  const optionBtn = (value: Option, label: string, sub: React.ReactNode, extra?: React.ReactNode) => {
    const active = option === value || (value === "distribute" && (option === "custom" || option === "until_date"));
    return (
      <Button
        type="button"
        variant={active ? "option-selected" : "option"}
        className="min-h-[64px] flex-col items-start gap-[2px] px-4 py-3 text-left"
        onClick={() => setOption(value)}
        aria-pressed={active}
      >
        <span className="text-[15px]">{label}</span>
        <span className="text-[12px] font-normal text-neutral-400">{sub}</span>
        {extra}
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {!inDialog ? (
        <>
          <span className="kicker-pending">Tempo a recuperar</span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Há {fmtLongDuration(pending)} a recuperar. Distribuir nos próximos dias?</h1>
        </>
      ) : null}
      <p className="text-[14px] text-neutral-400">{explanation}</p>
      {!online ? <Banner kind="offline">Sem conexão: a prévia pode estar desatualizada e o replanejamento só é aplicado quando você voltar à internet.</Banner> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="flex flex-col gap-2">
        {optionBtn("distribute", `Distribuir em ${distDays || horizon} dias`, distSub)}
        {option !== "today" && option !== "keep" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <Seg
              size="sm"
              label="Horizonte"
              value={horizon}
              onChange={(v) => {
                setHorizon(v);
                setOption("distribute");
              }}
              options={[
                { value: "3", label: "3 dias" },
                { value: "5", label: "5 dias" },
                { value: "7", label: "7 dias" },
              ]}
            />
            <label className="flex items-center gap-2 text-[12px] text-neutral-400">
              Incluir descanso
              <Switch checked={includeRest} onCheckedChange={setIncludeRest} label="Incluir dias de descanso" />
            </label>
          </div>
        ) : null}
        {optionBtn(
          "today",
          "Recuperar tudo hoje",
          <>
            Sessão de {fmtMinutes(todayTarget + todayAlloc)} hoje
            {todayLeft > 0 ? ` · só cabem ${fmtMinutes(todayAlloc)}` : ""}
          </>,
          todayExceeds ? (
            <Tag variant="pending" className="mt-1">
              Passa do limite diário
            </Tag>
          ) : null,
        )}
        {optionBtn("keep", "Deixar como está", "A pendência continua visível")}
      </div>

      {option === "until_date" ? (
        <Field label="Distribuir até" htmlFor="rec-until">
          <Input id="rec-until" type="date" min={today} value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
        </Field>
      ) : null}

      {preview && preview.unallocated > 0 && option !== "keep" ? (
        <Banner
          kind="info"
          actions={
            <div className="flex flex-wrap gap-2">
              {preview.alternatives.map((alt) =>
                alt === "ampliar_prazo" ? (
                  <Button key={alt} size="sm" variant="secondary" onClick={() => setOption("until_date")}>
                    {ALTERNATIVE_LABEL[alt]}
                  </Button>
                ) : alt === "revisar_plano" ? (
                  <Button key={alt} asChild size="sm" variant="secondary">
                    <Link to="/app/plano">{ALTERNATIVE_LABEL[alt]}</Link>
                  </Button>
                ) : alt === "perdoar_parte" ? (
                  <Button key={alt} asChild size="sm" variant="secondary">
                    <Link to={`/app/objetivos/${activityId}?aba=config#perdoar`}>{ALTERNATIVE_LABEL[alt]}</Link>
                  </Button>
                ) : (
                  <Button key={alt} asChild size="sm" variant="secondary">
                    <Link to={`/app/objetivos/${activityId}?aba=config#meta`}>{ALTERNATIVE_LABEL[alt] ?? alt}</Link>
                  </Button>
                ),
              )}
            </div>
          }
        >
          Não cabe tudo: {fmtMinutes(preview.unallocated)} ficam sem lugar {option === "today" ? "hoje" : "nesse prazo"}. A sugestão não aumenta a dívida — o que não couber continua como pendência.
        </Banner>
      ) : null}

      {option !== "keep" ? (
        <RecoveryTable rows={rows} pending={pending} pendingAfter={preview?.pending_after ?? pending} loading={previewPending} editing={option === "custom"} customMap={customMap} onCustomChange={(d, v) => setCustomMap((m) => ({ ...m, [d]: v }))} exceeds={preview?.exceeds_capacity_on ?? []} />
      ) : (
        <Card className="gap-2 p-[14px] text-[13px]">
          <div className="flex justify-between border-t-0">
            <span className="text-neutral-400">Pendência ao final</span>
            <span className="tnum text-pending">{fmtMinutes(pending)}</span>
          </div>
          <p className="text-[12px] text-neutral-400">Nada muda no plano. A pendência continua aparecendo em Hoje até você registrar tempo extra ou distribuir depois.</p>
        </Card>
      )}

      <div className={cn("mt-auto flex flex-col gap-2", inDialog && "flex-row-reverse justify-start")}>
        <Button variant="primary" size="xl" block={!inDialog} loading={apply.isPending || cancel.isPending} disabled={option !== "keep" && (!preview || previewPending)} onClick={submit}>
          {option === "keep" ? "Manter como está" : "Aplicar replanejamento"}
        </Button>
        {option !== "keep" ? (
          option === "custom" ? (
            <Button variant="ghost" size="lg" className="text-[13px]" onClick={() => setOption("distribute")}>
              Voltar à sugestão
            </Button>
          ) : (
            <Button variant="ghost" size="lg" className="text-[13px]" onClick={startEdit} disabled={!preview}>
              Editar dia a dia
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function visibleRows(preview: RecoveryPreview | undefined) {
  const rows = preview?.rows ?? [];
  let last = -1;
  rows.forEach((r, i) => {
    if (r.after_extra > 0 || r.before_extra > 0) last = i;
  });
  const n = Math.min(rows.length, Math.max(last + 1, 4), 14);
  return rows.slice(0, n);
}

function Extra({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;
  return <span className="text-pending"> +{minutesOf(seconds)}</span>;
}

function RecoveryTable({
  rows,
  pending,
  pendingAfter,
  loading,
  editing,
  customMap,
  onCustomChange,
  exceeds,
}: {
  rows: RecoveryPreview["rows"];
  pending: number;
  pendingAfter: number;
  loading: boolean;
  editing: boolean;
  customMap: Record<string, string>;
  onCustomChange: (date: string, v: string) => void;
  exceeds: string[];
}) {
  const before = (r: RecoveryPreview["rows"][number]) =>
    r.is_active || r.before_extra > 0 ? (
      <span>
        {r.is_active ? minutesOf(r.target) : ""}
        <Extra seconds={r.before_extra} />
      </span>
    ) : (
      <span className="text-neutral-500">—</span>
    );
  const after = (r: RecoveryPreview["rows"][number]) =>
    editing ? (
      <span className="flex items-center gap-1">
        {r.is_active ? <span>{minutesOf(r.target)}</span> : null}
        <span className="text-pending">+</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={minutesOf(r.capacity_extra) || 600}
          value={customMap[r.local_date] ?? "0"}
          onChange={(e) => onCustomChange(r.local_date, e.target.value)}
          aria-label={`Minutos extras em ${fmtDayTiny(r.local_date)}`}
          className={cn("h-8 min-h-0 w-[64px] px-2 py-0 text-[13px]", exceeds.includes(r.local_date) && "border-pending")}
        />
      </span>
    ) : r.is_active || r.after_extra > 0 ? (
      <span>
        {r.is_active ? minutesOf(r.target) : ""}
        <Extra seconds={r.after_extra} />
        {exceeds.includes(r.local_date) ? <span className="sr-only"> (acima do limite diário)</span> : null}
      </span>
    ) : (
      <span className="text-neutral-500">—</span>
    );
  const beforePendingAfter = Math.max(0, pending - rows.reduce((acc, r) => acc + r.before_extra, 0));
  const footer = (
    <div className="flex justify-between border-t border-divider pt-2">
      <span className="text-neutral-400">Pendência ao final</span>
      <span className={cn("tnum", pendingAfter === 0 ? "text-success" : "text-pending")}>{loading ? "…" : fmtMinutes(pendingAfter)}</span>
    </div>
  );
  return (
    <>
      {/* celular: Dia · Antes · Depois */}
      <Card className="tnum gap-[10px] p-[14px] text-[13px] desktop:hidden" aria-busy={loading || undefined}>
        <div className="grid grid-cols-3 gap-1.5 text-[11px] uppercase tracking-[0.1em] text-neutral-500">
          <span>Dia</span>
          <span>Antes</span>
          <span className="text-accent">Depois</span>
        </div>
        {rows.length === 0 ? <span className="text-neutral-400">{loading ? "Calculando…" : "Sem dias no horizonte."}</span> : null}
        {rows.map((r) => (
          <div key={r.local_date} className={cn("grid grid-cols-3 items-center gap-1.5", !r.is_active && r.after_extra === 0 && !editing && "text-neutral-500")}>
            <span>{fmtDayTiny(r.local_date)}</span>
            {before(r)}
            {after(r)}
          </div>
        ))}
        {footer}
      </Card>
      {/* desktop: duas colunas Antes / Depois (D2) */}
      <div className="tnum hidden grid-cols-2 gap-4 text-[14px] desktop:grid" aria-busy={loading || undefined}>
        <Card className="gap-1.5 bg-canvas p-[14px]">
          <span className="kicker">Antes</span>
          {rows.map((r) => (
            <span key={r.local_date} className={cn("flex justify-between", !r.is_active && "text-neutral-500")}>
              <span>{fmtDayTiny(r.local_date)}</span>
              {before(r)}
            </span>
          ))}
          <span className={cn("flex justify-between border-t border-divider pt-1.5", beforePendingAfter === 0 ? "text-success" : "text-pending")}>
            <span>Pendência ao final</span>
            <span>{minutesOf(beforePendingAfter)}</span>
          </span>
        </Card>
        <Card className="gap-1.5 bg-canvas p-[14px] shadow-accent-ring">
          <span className="kicker-accent">Depois</span>
          {rows.map((r) => (
            <span key={r.local_date} className={cn("flex justify-between", !r.is_active && r.after_extra === 0 && !editing && "text-neutral-500")}>
              <span>{fmtDayTiny(r.local_date)}</span>
              {after(r)}
            </span>
          ))}
          <span className={cn("flex justify-between border-t border-divider pt-1.5", pendingAfter === 0 ? "text-success" : "text-pending")}>
            <span>Pendência ao final</span>
            <span>{loading ? "…" : minutesOf(pendingAfter)}</span>
          </span>
        </Card>
      </div>
    </>
  );
}
