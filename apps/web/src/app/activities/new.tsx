import { LanguageSelect } from "@/components/app/language-select";
import { languageShortName, type LanguageCode } from "@/lib/languages";
import { readObjectivePrefill } from "@/components/empty/starters";
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CaretDown, CaretLeft } from "@phosphor-icons/react";
import { Banner, Button, DayPicker, DurationStepper, Field, Input, RadioGroup, RadioItem, Seg, Select, Textarea, toast } from "@/components/ui";
import { ApiError, errorMessage } from "@/api/client";
import { useCreateActivity } from "@/api/queries";
import { CATEGORY_OPTIONS, TIMEZONE_OPTIONS } from "@/api/activity-settings";
import type { components } from "@/api/schema";
import { currentTimezone, tzLabel } from "@/components/app/week-utils";
import { fmtMinutes, todayIso } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { usePageTour } from "@/components/tour/use-tours";
import { objetivoNovoTour } from "@/tours/objetivo-novo";
import { cn } from "@/lib/utils";

type Body = components["schemas"]["ActivityCreate"];
type Mode = Body["tracking_mode"];
type Policy = Body["recovery_policy"];

/** Novo objetivo: formulário curto (nome, categoria, modo, meta, dias, início, prazo, recuperação) + avançadas recolhidas. */
export default function NewActivityPage() {
  const nav = useNavigate();
  const online = useOnline();
  const create = useCreateActivity();
  usePageTour(objetivoNovoTour);
  const [params] = useSearchParams();
  const [prefill] = React.useState(() => readObjectivePrefill(params));
  const [title, setTitle] = React.useState(prefill.title);
  const [category, setCategory] = React.useState<Body["category"]>(prefill.category);
  const [language, setLanguage] = React.useState<LanguageCode>(prefill.language);
  const [mode, setMode] = React.useState<Mode>(prefill.mode);
  const [minutes, setMinutes] = React.useState(prefill.minutes);
  const [days, setDays] = React.useState<number[]>(prefill.days);
  const [start, setStart] = React.useState(todayIso());
  const [end, setEnd] = React.useState("");
  const [policy, setPolicy] = React.useState<Policy>("accumulate_suggest");
  const [advanced, setAdvanced] = React.useState(false);
  const [limitMinutes, setLimitMinutes] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [timezone, setTimezone] = React.useState(currentTimezone());
  const [errors, setErrors] = React.useState<{ title?: string; days?: string; end?: string; limit?: string }>({});
  const [error, setError] = React.useState<string | null>(null);
  const [planLimit, setPlanLimit] = React.useState<string | null>(null);

  const hasTime = mode !== "checklist";
  const tzOptions = TIMEZONE_OPTIONS.includes(timezone) ? TIMEZONE_OPTIONS : [timezone, ...TIMEZONE_OPTIONS];
  const weekTotal = minutes * days.length * 60;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPlanLimit(null);
    const next: typeof errors = {};
    if (!title.trim()) next.title = "Dê um nome ao objetivo.";
    if (hasTime && days.length === 0) next.days = "Escolha pelo menos um dia.";
    if (end && end < start) next.end = "O prazo precisa ser depois do início.";
    const limit = limitMinutes ? Number(limitMinutes) : Math.max(minutes * 2, 120);
    if (hasTime && limitMinutes && limit < minutes) next.limit = "O limite diário não pode ser menor que a meta.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        category,
        language: category === "idioma" ? language : null,
        tracking_mode: mode,
        description: description.trim() || null,
        desired_outcome: outcome.trim() || null,
        start_date: start,
        end_date: end || null,
        timezone,
        recovery_policy: hasTime ? policy : "none",
        goal: hasTime ? { active_days: days, daily_minutes: minutes, daily_limit_minutes: Math.min(1440, limit), effective_from: start } : null,
      });
      toast.success("Objetivo criado", hasTime ? `${fmtMinutes(minutes * 60)} por dia, ${days.length}× por semana.` : undefined);
      nav(`/app/objetivos/${created.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "activity_limit") setPlanLimit(err.message);
      else setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-[560px] flex-col gap-[14px]" noValidate>
      <Link to="/app/objetivos" className="inline-flex min-h-[32px] items-center gap-1 self-start text-[13px] text-neutral-400 no-underline hover:text-primary">
        <CaretLeft size={14} aria-hidden /> Objetivos
      </Link>
      <div>
        <span className="kicker-accent">Novo objetivo</span>
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">O que você quer acompanhar?</h1>
      </div>

      {!online ? <Banner kind="offline">Sem conexão: criar um objetivo precisa de internet. Seus dados ficam no formulário enquanto isso.</Banner> : null}
      {planLimit ? (
        <Banner
          kind="info"
          actions={
            <>
              <Button asChild size="sm" variant="primary">
                <Link to="/app/planos">Ver planos</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to="/app/objetivos">Pausar outro objetivo</Link>
              </Button>
            </>
          }
        >
          {planLimit}
        </Banner>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="flex flex-col gap-[14px]" data-tour="objetivo-novo-nome">
        <Field label="Nome" htmlFor="a-title" error={errors.title}>
          <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Inglês, espanhol, concurso, violão…" maxLength={120} invalid={!!errors.title} autoFocus />
        </Field>

        <Field label="Categoria" htmlFor="a-category">
          <Select
            id="a-category"
            value={category}
            onChange={(e) => {
              const next = e.target.value as Body["category"];
              setCategory(next);
              // nome vazio ganha o nome do idioma; a pessoa pode trocar
              if (next === "idioma" && !title.trim()) setTitle(languageShortName(language) ?? "");
            }}
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        {category === "idioma" ? (
          <Field label="Idioma" htmlFor="a-language" hint="Mais de 90 idiomas, incluindo Libras. Se o seu não estiver na lista, escolha “Outro idioma”.">
            <LanguageSelect
              id="a-language"
              value={language}
              onChange={(v) => {
                // se o nome ainda é o do idioma anterior, acompanha a troca
                if (!title.trim() || title === languageShortName(language)) setTitle(languageShortName(v) ?? "");
                setLanguage(v);
              }}
            />
          </Field>
        ) : null}
      </div>

      <Field label="Como acompanhar" data-tour="objetivo-novo-modo" hint={mode === "time" ? "Meta diária em minutos, com saldo e recuperação." : mode === "checklist" ? "Só tarefas a concluir, sem meta de tempo." : "Meta de tempo e também tarefas a concluir."}>
        <Seg
          block
          size="lg"
          label="Como acompanhar"
          value={mode}
          onChange={setMode}
          options={[
            { value: "time", label: "Tempo" },
            { value: "checklist", label: "Checklist" },
            { value: "mixed", label: "Misto" },
          ]}
        />
      </Field>

      {hasTime ? (
        <div className="flex flex-col gap-[14px]" data-tour="objetivo-novo-meta">
          <Field label="Meta por dia">
            <DurationStepper minutes={minutes} onChange={setMinutes} className="rounded-md bg-surface py-4" />
          </Field>
          <Field label="Dias ativos" error={errors.days} hint={days.length > 0 ? `${days.length}× por semana · ${fmtMinutes(weekTotal)} na semana` : undefined}>
            <DayPicker value={days} onChange={setDays} />
          </Field>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Field label="Início" htmlFor="a-start">
          <Input id="a-start" type="date" value={start} onChange={(e) => setStart(e.target.value || todayIso())} />
        </Field>
        <Field label="Prazo (opcional)" htmlFor="a-end" error={errors.end}>
          <Input id="a-end" type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} invalid={!!errors.end} />
        </Field>
      </div>

      {hasTime ? (
        <Field label="Quando um dia ficar abaixo da meta" data-tour="objetivo-novo-recuperacao">
          <RadioGroup value={policy} onValueChange={(v) => setPolicy(v as Policy)} className="flex flex-col gap-1" aria-label="Política de recuperação">
            <RadioItem value="accumulate_suggest" label="Guardar como pendência e sugerir como recuperar" description="Recomendado: a sugestão nunca aumenta a dívida." />
            <RadioItem value="accumulate" label="Guardar como pendência, sem sugestões" description="Você decide quando e como recuperar." />
            <RadioItem value="none" label="Não acumular" description="Cada dia começa do zero." />
          </RadioGroup>
        </Field>
      ) : null}

      <button type="button" className="flex min-h-[44px] items-center justify-between text-[14px] text-neutral-400" aria-expanded={advanced} aria-controls="a-advanced" onClick={() => setAdvanced((v) => !v)}>
        Opções avançadas
        <CaretDown size={16} className={cn("transition-transform duration-base", advanced && "rotate-180")} aria-hidden />
      </button>
      {advanced ? (
        <div id="a-advanced" className="flex flex-col gap-[14px]">
          {hasTime ? (
            <Field label="Limite diário (min)" htmlFor="a-limit" error={errors.limit} hint={`Teto para meta + recuperação num mesmo dia. Padrão: ${Math.max(minutes * 2, 120)} min.`}>
              <Input id="a-limit" type="number" inputMode="numeric" min={minutes} max={1440} value={limitMinutes} onChange={(e) => setLimitMinutes(e.target.value)} placeholder={String(Math.max(minutes * 2, 120))} invalid={!!errors.limit} />
            </Field>
          ) : null}
          <Field label="Resultado desejado (opcional)" htmlFor="a-outcome">
            <Input id="a-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Conversar em inglês na viagem de julho" maxLength={300} />
          </Field>
          <Field label="Descrição (opcional)" htmlFor="a-desc">
            <Textarea id="a-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </Field>
          <Field label="Fuso horário" htmlFor="a-tz" hint="Define quando o dia vira para este objetivo.">
            <Select id="a-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tzLabel(tz)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}

      <Button type="submit" size="xl" block loading={create.isPending}>
        Criar objetivo
      </Button>
    </form>
  );
}
