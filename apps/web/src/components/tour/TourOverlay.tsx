/**
 * Camada do tour: escurece a página, recorta um foco em volta do elemento do passo e mostra o
 * cartão com o Tatá. Teclado: Enter/→ avança, ← volta, Esc pula. Com movimento reduzido, sem
 * transições. No celular o cartão fica encaixado no topo ou na base, longe do elemento.
 */
import { t as tx } from "@/i18n";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui";
import { TataSvg, type TataMood } from "@/components/mascot/TataSvg";
import { useReducedMotion, useTataPrefs } from "@/components/mascot/use-tata";
import { cn } from "@/lib/utils";
import { useTourStore } from "./store";
import { useMarkTourSeen } from "./use-tours";

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_W = 340;

function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null;
  const all = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(name)}"]`));
  return (
    all.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    }) ?? null
  );
}

function sameRect(a: Rect | null, b: Rect | null) {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

export function TourOverlay() {
  const def = useTourStore((s) => s.active);
  const index = useTourStore((s) => s.index);
  const go = useTourStore((s) => s.go);
  const close = useTourStore((s) => s.close);
  const markSeen = useMarkTourSeen();
  const reduced = useReducedMotion();
  const { enabled: tata } = useTataPrefs();
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [vw, setVw] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth : 1024));
  const [vh, setVh] = React.useState(() => (typeof window !== "undefined" ? window.innerHeight : 768));
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const bodyId = React.useId();

  // passos opcionais sem alvo na tela são pulados (na direção em que a pessoa andou)
  const steps = def?.steps ?? [];
  const step = steps[index];

  // acompanha o elemento (rolagem, redimensionamento, layout que muda)
  React.useEffect(() => {
    if (!def || !step) return;
    let raf = 0;
    let last: Rect | null = null;
    const el = findTarget(step.target);
    if (el) el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    const tick = () => {
      const t = findTarget(step.target);
      const r = t?.getBoundingClientRect();
      const next = r
        ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
        : null;
      if (!sameRect(next, last)) {
        last = next;
        setRect(next);
      }
      if (window.innerWidth !== vwRef.current || window.innerHeight !== vhRef.current) {
        vwRef.current = window.innerWidth;
        vhRef.current = window.innerHeight;
        setVw(window.innerWidth);
        setVh(window.innerHeight);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [def, step, reduced]);
  const vwRef = React.useRef(vw);
  const vhRef = React.useRef(vh);

  // pula passo opcional cujo alvo não existe
  React.useEffect(() => {
    if (!def || !step || !step.optional || !step.target) return;
    const id = window.setTimeout(() => {
      if (!findTarget(step.target)) {
        const dir = useTourStore.getState().index >= index ? 1 : -1;
        const nextIdx = index + dir;
        if (nextIdx >= 0 && nextIdx < steps.length) go(nextIdx);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [def, step, index, steps.length, go]);

  React.useEffect(() => {
    if (def) primaryRef.current?.focus({ preventScroll: true });
  }, [def, index]);

  const finish = React.useCallback(() => {
    const key = close();
    if (key) markSeen.mutate(key);
  }, [close, markSeen]);

  // um único ouvinte enquanto o tour está ativo (lê o passo atual no store, então trocar de passo
  // não deixa nenhum instante sem ouvinte: Esc sempre fecha)
  const { mutate: markSeenMutate } = markSeen;
  React.useEffect(() => {
    if (!def) return;
    const end = () => {
      const key = useTourStore.getState().close();
      if (key) markSeenMutate(key);
    };
    const onKey = (e: KeyboardEvent) => {
      const st = useTourStore.getState();
      const total = st.active?.steps.length ?? 0;
      if (e.key === "Escape") {
        e.preventDefault();
        end();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (st.index < total - 1) st.go(st.index + 1);
        else end();
      } else if (e.key === "ArrowLeft" && st.index > 0) {
        e.preventDefault();
        st.go(st.index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [def, markSeenMutate]);

  if (!def || !step) return null;

  const last = index === steps.length - 1;
  const hasTarget = !!rect && !!step.target;
  const mobile = vw < 640;
  const mood: TataMood = step.mood ?? (index === 0 ? "wave" : last ? "cheer" : "encourage");

  // posição do cartão
  const cardStyle: React.CSSProperties = {};
  if (mobile) {
    const targetLow = hasTarget && rect!.top + rect!.height / 2 > vh * 0.5;
    if (targetLow) cardStyle.top = "calc(env(safe-area-inset-top, 0px) + 12px)";
    else
      cardStyle.bottom = tx(
        "calc(var(--layout-bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 12px)",
      );
    cardStyle.left = 12;
    cardStyle.right = 12;
  } else if (hasTarget) {
    const r = rect!;
    const tall = r.height > vh * 0.6 && r.width < vw * 0.4;
    const below = vh - (r.top + r.height);
    const above = r.top;
    const left = Math.min(Math.max(16, r.left + r.width / 2 - CARD_W / 2), vw - CARD_W - 16);
    if (below >= 240 || below >= above) cardStyle.top = Math.min(r.top + r.height + 12, vh - 260);
    else cardStyle.bottom = Math.max(16, vh - r.top + 12);
    if (r.width > vw * 0.6 && below < 240 && above < 240) {
      cardStyle.top = 16;
      delete cardStyle.bottom;
    }
    cardStyle.left = left;
    cardStyle.width = CARD_W;
    if (tall) {
      // elemento alto e estreito (barra lateral): cartão ao lado, centralizado na vertical
      delete cardStyle.bottom;
      cardStyle.top = Math.max(16, vh / 2 - 130);
      cardStyle.left =
        r.left + r.width + 16 + CARD_W < vw ? r.left + r.width + 16 : Math.max(16, r.left - CARD_W - 16);
    }
  } else {
    cardStyle.top = "50%";
    cardStyle.left = "50%";
    cardStyle.width = Math.min(CARD_W + 40, vw - 32);
    cardStyle.transform = "translate(-50%, -50%)";
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-tour-root>
      {/* bloqueia cliques na página durante o tour */}
      <div className={cn("absolute inset-0", !hasTarget && "bg-[rgba(10,11,20,0.62)]")} aria-hidden />
      {hasTarget ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-[12px] ring-2 ring-accent",
            !reduced && "transition-all duration-300 ease-standard",
          )}
          style={{
            top: rect!.top,
            left: rect!.left,
            width: rect!.width,
            height: rect!.height,
            boxShadow: "0 0 0 9999px rgba(10, 11, 20, 0.62)",
          }}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-tour-card
        className={cn(
          "absolute flex flex-col gap-3 rounded-lg border border-divider bg-surface p-4 text-left shadow-lg",
          !reduced && "transition-[top,left,bottom] duration-300 ease-standard",
        )}
        style={cardStyle}
      >
        <div className="flex items-start gap-3">
          {tata ? <TataSvg mood={mood} size={56} className="-mt-1 shrink-0" /> : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.08em] text-accent">
              {tx("{{v0}} · {{v1}} de {{v2}}", { v0: def.title, v1: index + 1, v2: steps.length })}
            </span>
            <h2 id={titleId} className="text-[17px] font-medium leading-tight">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={finish}
            className="-mr-1 -mt-1 rounded-md p-1 text-neutral-500 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={tx("Fechar tour")}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <p id={bodyId} className="m-0 text-[14px] leading-[1.5] text-neutral-300">
          {step.body}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn("h-1.5 rounded-full", i === index ? "w-4 bg-accent" : "w-1.5 bg-neutral-700")}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            {last ? tx("Fechar") : tx("Pular tour")}
          </Button>
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => go(index - 1)}>
                {tx("Voltar")}
              </Button>
            ) : null}
            <Button
              ref={primaryRef}
              variant="primary"
              size="sm"
              onClick={() => (last ? finish() : go(index + 1))}
            >
              {last ? tx("Concluir") : tx("Próximo")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
