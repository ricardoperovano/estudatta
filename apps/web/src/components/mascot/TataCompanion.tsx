/**
 * Tatá como companhia: escolhe a pose pelo que está acontecendo (foco, pausa, meta, descanso),
 * reage a transições (começou, pausou, voltou, bateu a meta, marcos de 25 min), ao carinho
 * (clique/toque) e cochila quando a tela fica parada. Os olhos seguem o ponteiro.
 * Falas curtas num balão (aria-live), que podem ser silenciadas neste aparelho; o mascote
 * inteiro pode ser desligado em Preferências. Com movimento reduzido, fica parado.
 */
import * as React from "react";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { TataSvg, type TataMood } from "./TataSvg";
import { tataSay, type TataSituation } from "./tata-messages";
import { setTataMuted, useReducedMotion, useTataPrefs } from "./use-tata";

export type CompanionScene =
  | { kind: "timer"; status: "active" | "paused"; elapsed: number; pausedFor: number; goalReached: boolean }
  | { kind: "today"; situation: TataSituation }
  | { kind: "static"; mood: TataMood; text?: string };

interface Props {
  scene: CompanionScene;
  size?: number;
  /** balão ao lado (row) ou abaixo (column) */
  layout?: "row" | "column";
  className?: string;
}

const MILESTONE = 25 * 60;
const PAUSE_LONG = 10 * 60;
const IDLE_SLEEP_MS = 90_000;

type Reaction = { mood: TataMood; text: string | null; until: number };

function fmtMilestone(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

const TODAY_MOOD: Partial<Record<TataSituation, TataMood>> = {
  today_all_done: "love",
  today_in_session: "focus",
  today_rest: "sleep",
  today_pending: "encourage",
  today_no_goal: "wave",
};

/** Assinatura do estado: quando muda, o Tatá reage uma vez. */
function signature(scene: CompanionScene): string {
  if (scene.kind === "timer") {
    const long = scene.status === "paused" && scene.pausedFor >= PAUSE_LONG;
    return `timer|${scene.status}|${long ? 1 : 0}|${scene.goalReached ? 1 : 0}|${Math.floor(scene.elapsed / MILESTONE)}`;
  }
  if (scene.kind === "today") return `today|${scene.situation}`;
  return `static|${scene.mood}`;
}

function reactionFor(prev: string | null, next: string, scene: CompanionScene, tone: Parameters<typeof tataSay>[1], n: number, now: number): Reaction | null {
  const say = (s: TataSituation, vars?: Record<string, string>) => tataSay(s, tone, n, vars);
  if (scene.kind === "today") return { mood: scene.situation === "today_all_done" ? "cheer" : "wave", text: null, until: now + 2600 };
  if (scene.kind !== "timer") return null;
  const [, pStatus, pLong, pGoal, pMile] = (prev ?? "").split("|");
  const [, status, long, goal, mile] = next.split("|");
  if (!prev) return { mood: status === "active" ? "encourage" : "paused", text: say(status === "active" ? (scene.elapsed < 60 ? "timer_start" : "timer_resumed") : "timer_paused"), until: now + 6000 };
  if (goal === "1" && pGoal === "0") return { mood: "cheer", text: say("timer_goal"), until: now + 8000 };
  if (status === "paused" && pStatus === "active") return { mood: "paused", text: say("timer_paused"), until: now + 6000 };
  if (status === "active" && pStatus === "paused") return { mood: "wave", text: say("timer_resumed"), until: now + 5000 };
  if (long === "1" && pLong === "0") return { mood: "sleep", text: say("timer_paused_long"), until: now + 60 * 60_000 };
  if (status === "active" && mile !== pMile && Number(mile) > 0) return { mood: "cheer", text: say("timer_milestone", { min: fmtMilestone(Number(mile) * MILESTONE) }), until: now + 6000 };
  return null;
}

export function TataCompanion({ scene, size = 112, layout = "row", className }: Props) {
  const { enabled, muted, tone } = useTataPrefs();
  const reduced = useReducedMotion();
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [clock, setClock] = React.useState(() => Date.now());
  const [lastActive, setLastActive] = React.useState(() => Date.now());
  const [look, setLook] = React.useState({ x: 0, y: 0 });
  const [n, setN] = React.useState(0);
  const [reaction, setReaction] = React.useState<Reaction | null>(null);

  // relógio interno (expira reações e detecta tela parada)
  React.useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);

  // olhos seguem o ponteiro; qualquer movimento conta como atividade
  React.useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let lastMark = 0;
    const onMove = (e: PointerEvent) => {
      const t = Date.now();
      if (t - lastMark > 2000) {
        lastMark = t;
        setLastActive(t);
      }
      if (reduced || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = wrapRef.current?.querySelector("svg");
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(200, window.innerWidth / 3);
        const dy = (e.clientY - (r.top + r.height / 2.2)) / Math.max(200, window.innerHeight / 3);
        setLook({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
      });
    };
    const onKey = () => setLastActive(Date.now());
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled, reduced]);

  // reações a transições (padrão "estado anterior" do React, sem efeito)
  const sig = signature(scene);
  const [prevSig, setPrevSig] = React.useState<string | null>(null);
  if (enabled && sig !== prevSig) {
    setPrevSig(sig);
    const r = reactionFor(prevSig, sig, scene, tone, n, clock);
    if (r) {
      setReaction(r);
      setN(n + 1);
    }
  }

  // cochilo por tela parada (fora de uma sessão ativa)
  const canDoze = scene.kind === "today" && scene.situation !== "today_in_session";
  const dozing = canDoze && clock - lastActive > IDLE_SLEEP_MS;
  const [wasDozing, setWasDozing] = React.useState(false);
  if (dozing !== wasDozing) {
    setWasDozing(dozing);
    if (!dozing) setReaction({ mood: "wave", text: tataSay("wake", tone, n), until: clock + 4000 });
  }

  if (!enabled) return null;

  const active = reaction && reaction.until > clock ? reaction : null;
  let mood: TataMood;
  let baseText: string | null = null;
  if (scene.kind === "timer") {
    const long = scene.status === "paused" && scene.pausedFor >= PAUSE_LONG;
    mood = scene.status === "paused" ? (long ? "sleep" : "paused") : "focus";
    if (long) baseText = tataSay("timer_paused_long", tone, 0);
  } else if (scene.kind === "today") {
    mood = TODAY_MOOD[scene.situation] ?? "idle";
    baseText = tataSay(scene.situation, tone, 0);
  } else {
    mood = scene.mood;
    baseText = scene.text ?? null;
  }
  if (dozing) mood = "sleep";
  if (active) mood = active.mood;
  const text = muted ? null : (active?.text ?? (dozing ? null : baseText));

  const poke = () => {
    setLastActive(Date.now());
    const now = Date.now();
    setClock(now);
    setReaction({ mood: "love", text: tataSay(mood === "sleep" ? "wake" : "poke", tone, n), until: now + 3500 });
    setN(n + 1);
  };

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-label="Tatá, seu companheiro de estudo"
      className={cn("tata-companion flex items-center gap-3", layout === "column" ? "flex-col" : "flex-row", className)}
    >
      <button
        type="button"
        onClick={poke}
        className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Fazer carinho no Tatá"
      >
        <TataSvg mood={mood} size={size} look={mood === "focus" || mood === "sleep" ? { x: 0, y: 0 } : look} />
      </button>
      <div className={cn("flex min-w-0 items-start gap-1", layout === "column" ? "flex-col items-center" : "flex-1")}>
        <p
          aria-live="polite"
          className={cn(
            "tata-bubble m-0 min-w-0 max-w-[320px] rounded-lg border border-divider bg-surface px-3 py-2 text-left text-[13px] leading-[1.35] text-primary shadow-sm transition-opacity duration-base",
            layout === "column" ? "tata-bubble--up text-center" : "tata-bubble--left flex-1",
            text ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {text ?? " "}
        </p>
        <button
          type="button"
          onClick={() => setTataMuted(!muted)}
          className="rounded-md p-1 text-neutral-500 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={muted ? "Ativar falas do Tatá" : "Silenciar falas do Tatá"}
          title={muted ? "Ativar falas do Tatá" : "Silenciar falas do Tatá"}
        >
          {muted ? <SpeakerSlash size={16} aria-hidden /> : <SpeakerHigh size={16} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
