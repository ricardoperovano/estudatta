import { t as tx } from "@/i18n";
import { LanguageSelect } from "./language-select";
import { DEFAULT_LANGUAGE, type LanguageCode } from "@/lib/languages";
import * as React from "react";
import { Link, useNavigate } from "react-router";
import {
  Banner,
  Button,
  Card,
  DayPicker,
  DurationStepper,
  Field,
  Input,
  RadioGroup,
  RadioItem,
  Select,
  Switch,
  Tag,
  toast,
} from "@/components/ui";
import { ApiError, errorMessage } from "@/api/client";
import {
  CATEGORY_OPTIONS,
  TIMEZONE_OPTIONS,
  useAddGoalRule,
  useAddPause,
  useChangeStatus,
  useChangeTimezone,
  useDeleteActivity,
  useDeletePause,
  useForgive,
  useForgivePreview,
  useUpdateActivity,
  type ActivityUpdate,
  type ForgivePreview,
} from "@/api/activity-settings";
import type { ActivityDetail, GoalRule } from "@/api/types";
import { fmtDayShort, fmtMinutes, minutesOf, todayIso } from "@/lib/format";
import { ConfirmDialog } from "./confirm-dialog";
import { ruleMinutes, shiftIso, summarizeDays, typicalDailyMinutes, tzLabel } from "./week-utils";

type Policy = "accumulate" | "accumulate_suggest" | "none";

function SettingsSection({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" id={id} className="scroll-mt-20 gap-3 p-4">
      <div className="flex flex-col gap-[2px]">
        <h2 className="m-0 text-[17px] font-medium leading-[1.2]">{title}</h2>
        {hint ? <span className="text-[12px] text-neutral-400">{hint}</span> : null}
      </div>
      {children}
    </Card>
  );
}

function ruleLine(rule: GoalRule): string {
  const mins = ruleMinutes(rule);
  const on = mins.filter((m) => m > 0);
  const uniform = on.every((m) => m === on[0]);
  const daily = uniform
    ? tx("{{v0}} por dia", { v0: fmtMinutes((on[0] ?? 0) * 60) })
    : tx("{{v0}} por semana", { v0: fmtMinutes(mins.reduce((a, b) => a + b, 0) * 60) });
  return tx("{{v0}} · {{v1}} · limite {{v2}}", {
    v0: daily,
    v1: summarizeDays(rule),
    v2: fmtMinutes(rule.daily_limit_minutes * 60),
  });
}

/** Aba Configurações: meta com vigência, metas semanais extras (questões/páginas), pausas, fuso, status, perdão de pendência (prévia + confirmação) e histórico. */
export function ActivitySettingsTab({
  activity,
  pendingSeconds,
}: {
  activity: ActivityDetail;
  pendingSeconds: number;
}) {
  return (
    <div className="flex flex-col gap-[14px]">
      <GoalSection activity={activity} />
      <ExtraGoalsSection
        key={`${activity.weekly_questions_goal ?? ""}-${activity.weekly_pages_goal ?? ""}`}
        activity={activity}
      />
      <PausesSection activity={activity} />
      <ForgiveSection activity={activity} pendingSeconds={pendingSeconds} />
      <DetailsSection activity={activity} />
      <TimezoneSection activity={activity} />
      <StatusSection activity={activity} />
      <HistorySection activity={activity} />
    </div>
  );
}

function GoalSection({ activity }: { activity: ActivityDetail }) {
  const rule = activity.current_rule ?? null;
  const tomorrow = shiftIso(todayIso(), 1);
  const add = useAddGoalRule(activity.id);
  const [open, setOpen] = React.useState(false);
  const [minutes, setMinutes] = React.useState(typicalDailyMinutes(rule) || 60);
  const [days, setDays] = React.useState<number[]>(() => {
    const on = ruleMinutes(rule)
      .map((m, i) => (m > 0 ? i : -1))
      .filter((i) => i >= 0);
    return on.length ? on : [0, 1, 2, 3, 4];
  });
  const [limit, setLimit] = React.useState(String(rule?.daily_limit_minutes ?? 120));
  const [from, setFrom] = React.useState(tomorrow);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (days.length === 0) return setError(tx("Escolha pelo menos um dia ativo."));
    const lim = Number(limit) || 0;
    if (lim < minutes) return setError(tx("O limite diário não pode ser menor que a meta."));
    try {
      const created = await add.mutateAsync({
        active_days: days,
        daily_minutes: minutes,
        daily_limit_minutes: lim,
        effective_from: from,
        note: note.trim() || null,
      });
      toast.success(
        tx("Nova meta salva"),
        tx("Vale a partir de {{v0}}. O saldo dos dias anteriores não muda.", {
          v0: fmtDayShort(created.effective_from),
        }),
      );
      setOpen(false);
      setNote("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <SettingsSection
      id="meta"
      title={tx("Meta")}
      hint={
        rule
          ? tx("Em vigor desde {{v0}}", { v0: fmtDayShort(rule.effective_from) })
          : tx("Este objetivo ainda não tem meta de tempo.")
      }
    >
      {rule ? <span className="tnum text-[14px]">{ruleLine(rule)}</span> : null}
      {!open ? (
        <Button variant="secondary" size="lg" className="self-start" onClick={() => setOpen(true)}>
          {tx("Definir nova meta")}
        </Button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          <Field label={tx("Meta por dia")}>
            <DurationStepper minutes={minutes} onChange={setMinutes} className="rounded-md bg-canvas py-4" />
          </Field>
          <Field label={tx("Dias ativos")}>
            <DayPicker value={days} onChange={setDays} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx("Vale a partir de")} htmlFor="g-from">
              <Input
                id="g-from"
                type="date"
                min={tomorrow}
                value={from}
                onChange={(e) => setFrom(e.target.value || tomorrow)}
              />
            </Field>
            <Field label={tx("Limite diário (min)")} htmlFor="g-limit">
              <Input
                id="g-limit"
                type="number"
                inputMode="numeric"
                min={minutes}
                max={1440}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
          </div>
          <Field label={tx("Motivo (opcional)")} htmlFor="g-note">
            <Input
              id="g-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder={tx("Rotina nova no trabalho")}
            />
          </Field>
          <span className="text-[12px] text-neutral-400">
            {tx(
              "A nova meta vale a partir de amanhã (ou da data escolhida). A meta e o saldo de hoje e dos dias anteriores não são reescritos.",
            )}
          </span>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>
              {tx("Cancelar")}
            </Button>
            <Button type="submit" size="lg" loading={add.isPending}>
              {tx("Salvar nova meta")}
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}

function PausesSection({ activity }: { activity: ActivityDetail }) {
  const today = todayIso();
  const add = useAddPause(activity.id);
  const remove = useDeletePause(activity.id);
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState(today);
  const [end, setEnd] = React.useState(shiftIso(today, 2));
  const [reason, setReason] = React.useState("");
  const [silence, setSilence] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const pauses = [...activity.pauses]
    .filter((p) => p.end_date >= today)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (end < start) return setError(tx("A pausa precisa terminar depois de começar."));
    try {
      await add.mutateAsync({
        start_date: start,
        end_date: end,
        reason: reason.trim() || null,
        silence_reminders: silence,
      });
      toast.success(tx("Pausa planejada"), tx("Nesses dias nada entra como pendência."));
      setOpen(false);
      setReason("");
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <SettingsSection
      id="pausas"
      title={tx("Pausas planejadas")}
      hint={tx("Viagem, provas, descanso: nos dias de pausa nada entra como pendência.")}
    >
      {pauses.length === 0 ? (
        <span className="text-[13px] text-neutral-400">{tx("Nenhuma pausa marcada.")}</span>
      ) : null}
      {pauses.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <span className="flex min-w-0 flex-col">
            <span className="tnum">
              {tx("{{v0}} a {{v1}}", { v0: fmtDayShort(p.start_date), v1: fmtDayShort(p.end_date) })}
              {p.start_date <= today ? (
                <Tag variant="neutral" className="ml-2">
                  {tx("em andamento")}
                </Tag>
              ) : null}
            </span>
            <span className="text-[12px] text-neutral-400">
              {[p.reason, p.silence_reminders ? tx("lembretes em silêncio") : tx("lembretes ligados")]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <Button
            variant="ghost-muted"
            size="sm"
            className="min-h-[44px] px-2"
            disabled={remove.isPending}
            onClick={async () => {
              try {
                await remove.mutateAsync(p.id);
                toast.success(tx("Pausa removida"), tx("O plano volta a valer nesses dias."));
              } catch (err) {
                toast.error(tx("Não foi possível remover a pausa"), errorMessage(err));
              }
            }}
          >
            {tx("Remover")}
          </Button>
        </div>
      ))}
      {!open ? (
        <Button variant="secondary" size="lg" className="self-start" onClick={() => setOpen(true)}>
          {tx("+ Planejar pausa")}
        </Button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label={tx("De")} htmlFor="p-start">
              <Input
                id="p-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value || today)}
              />
            </Field>
            <Field label={tx("Até")} htmlFor="p-end">
              <Input
                id="p-end"
                type="date"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value || start)}
              />
            </Field>
          </div>
          <Field label={tx("Motivo (opcional)")} htmlFor="p-reason">
            <Input
              id="p-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder={tx("Viagem")}
            />
          </Field>
          <label className="flex min-h-[44px] items-center justify-between gap-3 text-[14px]">
            {tx("Silenciar lembretes na pausa")}
            <Switch
              checked={silence}
              onCheckedChange={setSilence}
              label={tx("Silenciar lembretes na pausa")}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => setOpen(false)}>
              {tx("Cancelar")}
            </Button>
            <Button type="submit" size="lg" loading={add.isPending}>
              {tx("Salvar pausa")}
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}

function ForgiveSection({ activity, pendingSeconds }: { activity: ActivityDetail; pendingSeconds: number }) {
  const preview = useForgivePreview(activity.id);
  const forgive = useForgive(activity.id);
  const pendingMin = minutesOf(pendingSeconds);
  const [minutes, setMinutes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pv, setPv] = React.useState<ForgivePreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const m = Number(minutes);
    if (!m || m < 1) return setError(tx("Informe quantos minutos perdoar."));
    try {
      setPv(await preview.mutateAsync({ seconds: m * 60, reason: reason.trim() || null }));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <SettingsSection
      id="perdoar"
      title={tx("Perdoar pendência")}
      hint={tx(
        "Às vezes recuperar não faz sentido. Perdoar reduz a pendência sem apagar o histórico: o ajuste fica registrado.",
      )}
    >
      {pendingSeconds <= 0 ? (
        <span className="text-[13px] text-neutral-400">
          {tx("Não há pendência de dias anteriores. O que falta hoje é a meta de hoje, não atraso.")}
        </span>
      ) : (
        <form onSubmit={ask} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          <span className="tnum text-[14px]">
            {tx("Pendência atual:")} <span className="text-pending">{fmtMinutes(pendingSeconds)}</span>
          </span>
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label={tx("Minutos a perdoar")} htmlFor="f-min">
              <Input
                id="f-min"
                type="number"
                inputMode="numeric"
                min={1}
                max={pendingMin}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setMinutes(String(pendingMin))}
            >
              {tx("Tudo")}
            </Button>
          </div>
          <Field label={tx("Motivo (opcional)")} htmlFor="f-reason">
            <Input
              id="f-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder={tx("Semana de doença")}
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            className="self-start"
            loading={preview.isPending}
          >
            {tx("Ver prévia")}
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={!!pv}
        onOpenChange={(o) => !o && setPv(null)}
        title={pv ? tx("Perdoar {{v0}}?", { v0: fmtMinutes(pv.forgiven) }) : tx("Perdoar pendência?")}
        description={tx(
          "O ajuste vale a partir de hoje e fica registrado no histórico. O tempo já estudado não muda.",
        )}
        confirmLabel={tx("Perdoar")}
        loading={forgive.isPending}
        onConfirm={async () => {
          if (!pv) return;
          try {
            await forgive.mutateAsync({ seconds: pv.forgiven, reason: reason.trim() || null });
            toast.success(
              tx("{{v0}} perdoados", { v0: fmtMinutes(pv.forgiven) }),
              pv.pending_after > 0
                ? tx("{{v0}} continuam a recuperar.", { v0: fmtMinutes(pv.pending_after) })
                : tx("Pendência zerada."),
            );
            setMinutes("");
            setReason("");
          } catch (err) {
            setError(errorMessage(err));
          }
          setPv(null);
        }}
      >
        {pv ? (
          <div className="tnum grid grid-cols-2 gap-4 text-[14px]">
            <Card className="gap-1.5 bg-canvas p-[14px]">
              <span className="kicker">{tx("Antes")}</span>
              <span className="flex justify-between text-pending">
                <span>{tx("Pendência")}</span>
                <span>{fmtMinutes(pv.pending_before)}</span>
              </span>
            </Card>
            <Card className="gap-1.5 bg-canvas p-[14px] shadow-accent-ring">
              <span className="kicker-accent">{tx("Depois")}</span>
              <span
                className={
                  pv.pending_after === 0
                    ? "flex justify-between text-success"
                    : "flex justify-between text-pending"
                }
              >
                <span>{tx("Pendência")}</span>
                <span>{fmtMinutes(pv.pending_after)}</span>
              </span>
            </Card>
          </div>
        ) : null}
      </ConfirmDialog>
    </SettingsSection>
  );
}

function DetailsSection({ activity }: { activity: ActivityDetail }) {
  const update = useUpdateActivity(activity.id);
  const [title, setTitle] = React.useState(activity.title);
  const [category, setCategory] = React.useState(
    activity.category === "ingles" ? "idioma" : activity.category,
  );
  const [language, setLanguage] = React.useState<LanguageCode>(
    (activity.language as LanguageCode | null) ?? DEFAULT_LANGUAGE,
  );
  const [end, setEnd] = React.useState(activity.end_date ?? "");
  const [policy, setPolicy] = React.useState<Policy>(activity.recovery_policy as Policy);
  const [error, setError] = React.useState<string | null>(null);
  const dirty =
    title.trim() !== activity.title ||
    category !== activity.category ||
    (category === "idioma" && language !== activity.language) ||
    end !== (activity.end_date ?? "") ||
    policy !== activity.recovery_policy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError(tx("Dê um nome ao objetivo."));
    try {
      await update.mutateAsync({
        title: title.trim(),
        category: category as ActivityUpdate["category"],
        language: category === "idioma" ? language : null,
        end_date: end || null,
        clear_end_date: !end && !!activity.end_date,
        recovery_policy: policy,
      });
      toast.success(tx("Objetivo atualizado"));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <SettingsSection title={tx("Objetivo")}>
      <form onSubmit={submit} className="flex flex-col gap-[14px]">
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Field label={tx("Nome do objetivo")} htmlFor="d-title">
          <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx("Categoria")} htmlFor="d-category">
            <Select id="d-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          {category === "idioma" ? (
            <Field label={tx("Idioma")} htmlFor="d-language">
              <LanguageSelect id="d-language" value={language} onChange={setLanguage} />
            </Field>
          ) : null}
          <Field label={tx("Prazo (opcional)")} htmlFor="d-end">
            <Input
              id="d-end"
              type="date"
              min={activity.start_date}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label={tx("Quando um dia ficar abaixo da meta")}>
          <RadioGroup
            value={policy}
            onValueChange={(v) => setPolicy(v as Policy)}
            className="flex flex-col gap-1"
            aria-label={tx("Política de recuperação")}
          >
            <RadioItem
              value="accumulate_suggest"
              label={tx("Guardar como pendência e sugerir como recuperar")}
            />
            <RadioItem value="accumulate" label={tx("Guardar como pendência, sem sugestões")} />
            <RadioItem value="none" label={tx("Não acumular")} />
          </RadioGroup>
        </Field>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="self-start"
          disabled={!dirty}
          loading={update.isPending}
        >
          {tx("Salvar alterações")}
        </Button>
      </form>
    </SettingsSection>
  );
}

/** Metas semanais de questões e páginas: opcionais; vazio = sem meta (envia 0 para limpar). */
function ExtraGoalsSection({ activity }: { activity: ActivityDetail }) {
  const update = useUpdateActivity(activity.id);
  const initQ = activity.weekly_questions_goal ? String(activity.weekly_questions_goal) : "";
  const initP = activity.weekly_pages_goal ? String(activity.weekly_pages_goal) : "";
  const [questions, setQuestions] = React.useState(initQ);
  const [pages, setPages] = React.useState(initP);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = questions.trim() !== initQ || pages.trim() !== initP;

  const parse = (v: string): number | "bad" => {
    if (!v.trim()) return 0;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : "bad";
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const q = parse(questions);
    const pg = parse(pages);
    if (q === "bad" || pg === "bad")
      return setError(tx("Use números inteiros entre 0 e 10.000 — ou deixe em branco para ficar sem meta."));
    try {
      await update.mutateAsync({ weekly_questions_goal: q, weekly_pages_goal: pg, clear_end_date: false });
      toast.success(tx("Metas semanais salvas"));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <SettingsSection
      title={tx("Metas semanais extras")}
      hint={tx("Opcionais e separadas do tempo. Em branco = sem meta.")}
    >
      <form onSubmit={submit} className="flex flex-col gap-[14px]">
        {error ? <Banner kind="error">{error}</Banner> : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label={tx("Questões por semana")} htmlFor="xg-questions">
            <Input
              id="xg-questions"
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              step={1}
              placeholder={tx("sem meta")}
              className="tnum"
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
            />
          </Field>
          <Field label={tx("Páginas por semana")} htmlFor="xg-pages">
            <Input
              id="xg-pages"
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              step={1}
              placeholder={tx("sem meta")}
              className="tnum"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
          </Field>
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="self-start"
          disabled={!dirty}
          loading={update.isPending}
        >
          {tx("Salvar metas")}
        </Button>
      </form>
    </SettingsSection>
  );
}

function TimezoneSection({ activity }: { activity: ActivityDetail }) {
  const change = useChangeTimezone(activity.id);
  const [tz, setTz] = React.useState(activity.timezone);
  const options = TIMEZONE_OPTIONS.includes(activity.timezone)
    ? TIMEZONE_OPTIONS
    : [activity.timezone, ...TIMEZONE_OPTIONS];
  return (
    <SettingsSection
      title={tx("Fuso horário")}
      hint={tx(
        "Define quando o dia vira para este objetivo. A troca vale a partir de amanhã; os dias já fechados não mudam.",
      )}
    >
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label={tx("Fuso")} htmlFor="tz-select">
          <Select id="tz-select" value={tz} onChange={(e) => setTz(e.target.value)}>
            {options.map((o) => (
              <option key={o} value={o}>
                {tzLabel(o)}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          size="lg"
          disabled={tz === activity.timezone}
          loading={change.isPending}
          onClick={async () => {
            try {
              const out = await change.mutateAsync({ timezone: tz });
              toast.success(
                tx("Fuso atualizado"),
                tx("Vale a partir de {{v0}}.", { v0: fmtDayShort(out.effective_from) }),
              );
            } catch (err) {
              toast.error(tx("Não foi possível trocar o fuso"), errorMessage(err));
            }
          }}
        >
          {tx("Salvar")}
        </Button>
      </div>
    </SettingsSection>
  );
}

function StatusSection({ activity }: { activity: ActivityDetail }) {
  const nav = useNavigate();
  const change = useChangeStatus(activity.id);
  const remove = useDeleteActivity();
  const [confirm, setConfirm] = React.useState<null | "archive" | "delete">(null);
  const [limit, setLimit] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const label =
    activity.status === "active" ? "ativo" : activity.status === "paused" ? "pausado" : "arquivado";

  const set = async (status: "active" | "paused" | "archived") => {
    setError(null);
    setLimit(null);
    try {
      await change.mutateAsync(status);
      toast.success(
        status === "active"
          ? tx("Objetivo ativo")
          : status === "paused"
            ? tx("Objetivo pausado")
            : tx("Objetivo arquivado"),
        status === "paused" ? tx("Enquanto estiver pausado, nada entra como pendência.") : undefined,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "activity_limit") setLimit(err.message);
      else setError(errorMessage(err));
    }
  };

  return (
    <SettingsSection
      title={tx("Status")}
      hint={tx(
        "Pausar interrompe metas e lembretes sem gerar pendência. Arquivar tira o objetivo do plano e guarda o histórico.",
      )}
    >
      {limit ? (
        <Banner
          kind="info"
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link to="/app/planos">{tx("Ver planos")}</Link>
            </Button>
          }
        >
          {limit}
        </Banner>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Tag variant={activity.status === "active" ? "success" : "neutral"}>{label}</Tag>
        {activity.status !== "active" ? (
          <Button variant="primary" size="lg" loading={change.isPending} onClick={() => set("active")}>
            {tx("Ativar")}
          </Button>
        ) : (
          <Button variant="secondary" size="lg" loading={change.isPending} onClick={() => set("paused")}>
            {tx("Pausar objetivo")}
          </Button>
        )}
        {activity.status !== "archived" ? (
          <Button variant="secondary" size="lg" onClick={() => setConfirm("archive")}>
            {tx("Arquivar")}
          </Button>
        ) : null}
        <Button variant="danger" size="lg" onClick={() => setConfirm("delete")}>
          {tx("Excluir")}
        </Button>
      </div>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm === "delete"
            ? tx('Excluir "{{v0}}"?', { v0: activity.title })
            : tx('Arquivar "{{v0}}"?', { v0: activity.title })
        }
        description={
          confirm === "delete"
            ? tx(
                "O objetivo, suas metas, tarefas e sessões registradas são removidos. Essa ação não pode ser desfeita. Para guardar o histórico, prefira arquivar.",
              )
            : tx(
                "O objetivo sai de Hoje e do plano, e para de gerar pendência. O histórico continua nos relatórios e você pode reativar depois.",
              )
        }
        confirmLabel={confirm === "delete" ? tx("Excluir") : tx("Arquivar")}
        danger={confirm === "delete"}
        loading={remove.isPending || change.isPending}
        onConfirm={async () => {
          if (confirm === "archive") {
            await set("archived");
            setConfirm(null);
            return;
          }
          try {
            await remove.mutateAsync(activity.id);
            toast.success(tx("Objetivo excluído"));
            nav("/app/objetivos", { replace: true });
          } catch (err) {
            setError(errorMessage(err));
            setConfirm(null);
          }
        }}
      />
    </SettingsSection>
  );
}

function HistorySection({ activity }: { activity: ActivityDetail }) {
  const rules = [...activity.goal_rules].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  const today = todayIso();
  const currentId = activity.current_rule?.id;
  return (
    <SettingsSection
      title={tx("Histórico de regras")}
      hint={tx("Cada mudança de meta vale a partir da sua data; o passado não é reescrito.")}
    >
      {rules.length === 0 ? (
        <span className="text-[13px] text-neutral-400">{tx("Nenhuma regra de meta ainda.")}</span>
      ) : null}
      {rules.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-[2px] border-t border-divider pt-2 text-[14px] first-of-type:border-t-0 first-of-type:pt-0"
        >
          <span className="tnum flex items-center gap-2">
            {fmtDayShort(r.effective_from)}
            {r.id === currentId ? (
              <Tag variant="outline">{tx("em vigor")}</Tag>
            ) : r.effective_from > today ? (
              <Tag variant="neutral">{tx("futura")}</Tag>
            ) : null}
          </span>
          <span className="tnum text-[12px] text-neutral-400">{ruleLine(r)}</span>
          {r.note ? <span className="w-full text-[12px] text-neutral-400">{r.note}</span> : null}
        </div>
      ))}
      {activity.timezone_history.length > 1 ? (
        <div className="flex flex-col gap-1 border-t border-divider pt-2 text-[12px] text-neutral-400">
          <span className="kicker">{tx("Fusos")}</span>
          {activity.timezone_history.map((t) => (
            <span key={`${t.effective_from}-${t.timezone}`} className="tnum">
              {fmtDayShort(t.effective_from)} · {tzLabel(t.timezone)}
            </span>
          ))}
        </div>
      ) : null}
    </SettingsSection>
  );
}
