/**
 * "Primeiros passos": lista curta para deixar o Estudatta pronto. Cada passo só aparece como
 * feito quando dá para saber de verdade (objetivo criado, tempo registrado, lembretes
 * permitidos neste aparelho, app instalado, Conquistas visitadas a partir daqui).
 * Quem já tem objetivo pode recolher ou dispensar a lista (guardado neste aparelho).
 */
import * as React from "react";
import { Link } from "react-router";
import { BellRinging, CaretDown, CaretRight, Check, DeviceMobile, Target, Timer, Trophy, X, type Icon } from "@phosphor-icons/react";
import { useGamification } from "@/api/study";
import { isStandalone } from "@/lib/device";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

const DISMISS_KEY = "estudatta.primeiros-passos.oculto";
const OPEN_KEY = "estudatta.primeiros-passos.aberto";
const ACH_KEY = "estudatta.primeiros-passos.conquistas";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

interface Step {
  key: string;
  title: string;
  hint: string;
  to: string;
  icon: Icon;
  done: boolean;
  onClick?: () => void;
}

function notificationsGranted(): boolean {
  try {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch {
    return false;
  }
}

function useFirstSteps(hasObjective: boolean) {
  const g = useGamification();
  const [achSeen, setAchSeen] = React.useState(() => readFlag(ACH_KEY));
  const hasSession = !!g.data && (g.data.records.total_seconds > 0 || g.data.achievements.some((a) => a.code === "first_session" && a.unlocked));
  const steps: Step[] = [
    { key: "objetivo", title: "Criar seu primeiro objetivo", hint: "Concurso, idioma, instrumento… com dias e meta diária.", to: "/app/objetivos/novo", icon: Target, done: hasObjective },
    { key: "sessao", title: "Fazer a primeira sessão", hint: "Ligue o cronômetro ou registre um tempo que já estudou.", to: "/app/sessao", icon: Timer, done: hasSession },
    { key: "lembretes", title: "Ativar lembretes", hint: "Um toque gentil no horário que você escolher.", to: "/app/preferencias", icon: BellRinging, done: notificationsGranted() },
    { key: "instalar", title: "Instalar o app no celular", hint: "Abre direto da tela inicial, como um app.", to: "/app/instalar", icon: DeviceMobile, done: isStandalone() },
    {
      key: "conquistas",
      title: "Conhecer suas conquistas",
      hint: "Níveis e medalhas que não se perdem se a sequência quebrar.",
      to: "/app/conquistas",
      icon: Trophy,
      done: achSeen,
      onClick: () => {
        writeFlag(ACH_KEY, true);
        setAchSeen(true);
      },
    },
  ];
  return { steps, ready: !g.isPending };
}

export function FirstSteps({ hasObjective, className }: { hasObjective: boolean; className?: string }) {
  const { steps, ready } = useFirstSteps(hasObjective);
  const [dismissed, setDismissed] = React.useState(() => readFlag(DISMISS_KEY));
  const [open, setOpen] = React.useState(() => !hasObjective || readFlag(OPEN_KEY));
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const listId = React.useId();

  if (!ready && hasObjective) return null;
  if (hasObjective && (dismissed || !next)) return null;

  const expanded = !hasObjective || open;
  const toggle = () => {
    writeFlag(OPEN_KEY, !open);
    setOpen(!open);
  };

  return (
    <section aria-labelledby="primeiros-passos" className={cn("tint-soft rise-in flex flex-col gap-3 rounded-[20px] p-4 shadow-sm desktop:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="kicker-accent">Primeiros passos</span>
          <h2 id="primeiros-passos" className="mt-1 text-[18px] leading-[1.2]">
            {hasObjective ? "Falta pouco para deixar tudo pronto" : "Vamos deixar tudo pronto?"}
          </h2>
        </div>
        {hasObjective ? (
          <Button
            variant="ghost-muted"
            size="icon"
            onClick={() => {
              writeFlag(DISMISS_KEY, true);
              setDismissed(true);
            }}
            aria-label="Dispensar primeiros passos"
            title="Dispensar"
          >
            <X size={16} aria-hidden />
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" role="img" aria-label={`${done} de ${steps.length} passos feitos`}>
          {steps.map((s) => (
            <span key={s.key} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-slow", s.done ? "bg-success" : "bg-track")} />
          ))}
        </div>
        <span className="tnum shrink-0 text-[12px] text-neutral-400" aria-hidden>
          {done} de {steps.length}
        </span>
      </div>

      {expanded ? (
        <ol id={listId} className="m-0 flex list-none flex-col gap-1.5 p-0">
          {steps.map((s) => (
            <li key={s.key}>
              <StepRow step={s} highlight={s === next} />
            </li>
          ))}
        </ol>
      ) : next ? (
        <StepRow step={next} highlight />
      ) : null}

      {hasObjective ? (
        <button type="button" onClick={toggle} aria-expanded={expanded} aria-controls={expanded ? listId : undefined} className="flex items-center gap-1 self-start rounded-md px-1 py-1 text-[13px] text-accent hover:underline">
          {expanded ? "Mostrar só o próximo" : `Ver os ${steps.length} passos`}
          <CaretDown size={12} aria-hidden className={cn("transition-transform duration-base", expanded && "rotate-180")} />
        </button>
      ) : null}
    </section>
  );
}

function StepRow({ step, highlight }: { step: Step; highlight?: boolean }) {
  const I = step.icon;
  return (
    <Link
      to={step.to}
      onClick={step.onClick}
      className={cn(
        "group flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-primary no-underline transition-colors duration-fast",
        highlight ? "bg-surface shadow-accent-ring" : "hover:bg-surface",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full",
          step.done ? "bg-success-tint text-success" : highlight ? "bg-accent-900 text-accent" : "bg-neutral-800 text-neutral-400",
        )}
        aria-hidden
      >
        {step.done ? <Check size={16} weight="bold" /> : <I size={18} weight={highlight ? "fill" : "regular"} />}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block text-[14px] font-medium", step.done && "text-neutral-400")}>
          {step.title}
          {step.done ? <span className="sr-only"> (feito)</span> : null}
        </span>
        {!step.done ? <span className="mt-0.5 block text-[12px] text-neutral-400">{step.hint}</span> : null}
      </span>
      {!step.done ? <CaretRight size={14} className={cn("shrink-0", highlight ? "text-accent" : "text-neutral-500")} aria-hidden /> : null}
    </Link>
  );
}
