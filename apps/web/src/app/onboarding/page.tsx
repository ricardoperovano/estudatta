import * as React from "react";
import { useNavigate } from "react-router";
import { ArrowRight } from "@phosphor-icons/react";
import { Symbol } from "@/components/app/brand";
import { Banner, Button, DayPicker, DurationStepper, Field, Input, RadioGroup, RadioItem, Seg } from "@/components/ui";
import { useCompleteOnboarding, useCreateActivity } from "@/api/queries";
import { useUser } from "@/api/session";
import { errorMessage, api, unwrap } from "@/api/client";
import { detectTimezone } from "@/lib/device";
import { addDaysIso, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Category = "ingles" | "idioma" | "concurso" | "outro_estudo" | "leitura" | "pratica" | "personalizado";
const categories: { value: Category; label: string; sample: string }[] = [
  { value: "ingles", label: "Inglês ou outro idioma", sample: "Inglês" },
  { value: "concurso", label: "Concurso", sample: "Concurso" },
  { value: "outro_estudo", label: "Outro estudo", sample: "Faculdade" },
  { value: "pratica", label: "Atividade ou rotina", sample: "Violão" },
];
const kickerOf: Record<Category, string> = { ingles: "Inglês", idioma: "Idioma", concurso: "Concurso", outro_estudo: "Estudo", leitura: "Leitura", pratica: "Prática", personalizado: "Atividade" };

/**
 * Onboarding em 4 etapas curtas (progresso 2px): o que acompanhar → nome e resultado →
 * tempo/dias/início/lembrete/recuperação → tom. Tudo editável depois.
 */
export default function OnboardingPage() {
  const nav = useNavigate();
  const user = useUser();
  const create = useCreateActivity();
  const complete = useCompleteOnboarding();
  const [step, setStep] = React.useState(0);
  const [category, setCategory] = React.useState<Category | null>(null);
  const [title, setTitle] = React.useState("");
  const [outcome, setOutcome] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [minutes, setMinutes] = React.useState(60);
  const [days, setDays] = React.useState([0, 1, 2, 3, 4]);
  const [start, setStart] = React.useState(todayIso());
  const [reminder, setReminder] = React.useState("19:30");
  const [policy, setPolicy] = React.useState<"accumulate_suggest" | "accumulate" | "none">("accumulate_suggest");
  const [tone, setTone] = React.useState<"acolhedor" | "direto" | "firme">("acolhedor");
  const [limit, setLimit] = React.useState(120);
  const [error, setError] = React.useState<string | null>(null);
  const tz = user?.timezone || detectTimezone();
  const weekMinutes = minutes * days.length;

  const finish = async (skipDetails = false) => {
    setError(null);
    try {
      await create.mutateAsync({
        title: (title || (category ? categories.find((c) => c.value === category)?.sample : "") || "Estudo").trim(),
        category: category || "outro_estudo",
        tracking_mode: category === "pratica" && !skipDetails ? "time" : "time",
        desired_outcome: outcome || null,
        start_date: start,
        end_date: deadline || null,
        timezone: tz,
        recovery_policy: policy,
        goal: { daily_minutes: minutes, active_days: days, daily_limit_minutes: Math.max(limit, minutes) },
        preferred_times: reminder ? [reminder] : [],
        availability: {},
      });
      try {
        await api.PATCH("/api/v1/me/preferences", { body: { tone } });
        await api.PATCH("/api/v1/notifications/preferences", { body: { reminder_time: reminder, reminder_days: days } as never });
      } catch {
        /* preferências podem ser ajustadas depois */
      }
      await complete.mutateAsync();
      nav("/app", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const skipAll = async () => {
    setError(null);
    try {
      unwrap(await api.POST("/api/v1/me/onboarding", { body: { completed: true } }));
      await complete.mutateAsync();
      nav("/app", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (step === 0) {
    return (
      <div className="glow-top-right flex min-h-dvh flex-col">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-[18px] px-5 pb-6 pt-[max(64px,calc(40px+env(safe-area-inset-top,0px)))]">
          <Symbol size={40} />
          <h1 className="mt-2 text-[32px] leading-[1.1]">O que você quer acompanhar?</h1>
          <p className="text-[15px] text-neutral-300">Você define a meta. O plano mostra o que fazer hoje e como retomar se atrasar.</p>
          <div className="mt-2 flex flex-col gap-2">
            {categories.map((c, i) => (
              <Button
                key={c.value}
                type="button"
                variant={i === 0 ? "option-selected" : "option"}
                className="min-h-[56px] px-4 text-[15px]"
                onClick={() => {
                  setCategory(c.value);
                  setStep(1);
                }}
              >
                <span>{c.label}</span>
                <ArrowRight size={18} className={i === 0 ? "text-accent" : "text-neutral-500"} aria-hidden />
              </Button>
            ))}
          </div>
          <p className="mb-6 mt-auto text-[13px] text-neutral-500">Você organiza aqui o estudo que acontece em cursos, livros, vídeos e aulas. Sem promessas de aprovação ou fluência.</p>
          <button type="button" onClick={skipAll} className="self-start text-[13px] text-neutral-500 underline-offset-4 hover:underline">
            Pular por agora
          </button>
        </div>
      </div>
    );
  }

  const kicker = category ? kickerOf[category] : "";
  const Progress = () => (
    <div className="flex gap-1" aria-label={`Etapa ${step} de 3`} role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
      {[1, 2, 3].map((i) => (
        <div key={i} className={cn("h-[2px] flex-1", i <= step ? "bg-accent" : "bg-neutral-800")} />
      ))}
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-4 px-4 pb-6 pt-[max(56px,calc(32px+env(safe-area-inset-top,0px)))]">
        <Progress />
        <span className="text-[10px] uppercase tracking-[0.1em] text-accent">{kicker}</span>
        {error ? <Banner kind="error">{error}</Banner> : null}

        {step === 1 ? (
          <>
            <h1 className="text-[25px] leading-[1.15]">Dê um nome ao objetivo</h1>
            <Field label="Nome" htmlFor="ob-title">
              <Input id="ob-title" autoFocus placeholder={categories.find((c) => c.value === category)?.sample} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            </Field>
            <Field label="Resultado desejado (opcional)" htmlFor="ob-outcome" hint="Ex.: conversar com segurança, passar na prova, terminar o livro.">
              <Input id="ob-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={300} />
            </Field>
            <Field label="Prazo final (opcional)" htmlFor="ob-deadline" hint="A data de uma prova, por exemplo.">
              <Input id="ob-deadline" type="date" min={todayIso()} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h1 className="text-[25px] leading-[1.15]">Quanto tempo por dia?</h1>
            <DurationStepper minutes={minutes} onChange={setMinutes} size="lg" className="py-2" />
            <Field label="Dias ativos" hint={`${Math.floor(weekMinutes / 60)} h${weekMinutes % 60 ? ` ${weekMinutes % 60} min` : ""} por semana`}>
              <DayPicker value={days} onChange={setDays} />
            </Field>
            <Field label="Começar em" htmlFor="ob-start">
              <Input id="ob-start" type="date" min={addDaysIso(todayIso(), -366)} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Lembrete" htmlFor="ob-reminder" hint="Nos dias ativos. Você ajusta o tom e o silêncio depois.">
              <Input id="ob-reminder" type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
            </Field>
            <Field label="Se um dia ficar sem registro" hint="Acumular é o padrão: o tempo que faltou vira pendência visível e você decide como recuperar.">
              <RadioGroup value={policy} onValueChange={(v) => setPolicy(v as typeof policy)} className="flex flex-col">
                <RadioItem value="accumulate_suggest" label="Distribuir o tempo nos próximos dias" />
                <RadioItem value="accumulate" label="Acumular e eu decido quando recuperar" />
                <RadioItem value="none" label="Só me avisar, sem acumular" />
              </RadioGroup>
            </Field>
            <details className="text-[13px] text-neutral-400">
              <summary className="cursor-pointer">Opções avançadas</summary>
              <div className="mt-2 flex flex-col gap-2">
                <Field label="Limite confortável por dia (minutos)" htmlFor="ob-limit" hint="Usado para não sugerir recuperação além do que cabe.">
                  <Input id="ob-limit" type="number" min={minutes} max={1440} value={limit} onChange={(e) => setLimit(Number(e.target.value) || minutes)} />
                </Field>
                <span>Fuso horário detectado: {tz}. Você pode mudar em Preferências.</span>
              </div>
            </details>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h1 className="text-[25px] leading-[1.15]">Como quer ser lembrado?</h1>
            <Field label="Tom das mensagens">
              <Seg block size="lg" label="Tom das mensagens" value={tone} onChange={setTone} options={[{ value: "acolhedor", label: "Acolhedor" }, { value: "direto", label: "Direto" }, { value: "firme", label: "Firme" }]} />
            </Field>
            <div className="flex items-start gap-[10px] rounded-md bg-surface p-3">
              <Symbol size={20} className="mt-0.5" />
              <div className="text-[14px]">
                <span className="block text-[12px] text-neutral-400">Exemplo · {tone}</span>
                {tone === "acolhedor" ? "Hoje dá para retomar. Vamos começar com 15 minutos?" : tone === "direto" ? `Faltam ${minutes} minutos para sua meta de hoje.` : "Você reservou este horário para estudar. Comece a sessão agora ou reagende."}
              </div>
            </div>
            <p className="text-[13px] text-neutral-400">Matérias, tópicos e materiais podem ser adicionados depois, na tela do objetivo. Você não precisa importar nada para começar.</p>
          </>
        ) : null}

        <div className="mt-auto flex gap-2 pb-6 pt-4">
          <Button type="button" variant="ghost" size="lg" onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
          {step < 3 ? (
            <Button type="button" size="lg" className="flex-1" onClick={() => setStep(step + 1)} disabled={step === 2 && days.length === 0}>
              Continuar
            </Button>
          ) : (
            <Button type="button" size="lg" className="flex-1" loading={create.isPending || complete.isPending} onClick={() => finish()}>
              Concluir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
