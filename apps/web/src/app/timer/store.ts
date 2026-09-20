/**
 * Estado do cronômetro no cliente. O visor usa setInterval só para redesenhar;
 * a duração é calculada por timestamps e intervalos persistidos (IndexedDB), e o
 * servidor é a fonte definitiva. Nada de requisição por segundo: sincroniza nas transições.
 */
import { create } from "zustand";
import { db, type LocalTimer } from "@/offline/db";

interface TimerState {
  timer: LocalTimer | null;
  hydrated: boolean;
  load: (userId: string) => Promise<LocalTimer | null>;
  set: (t: LocalTimer | null) => Promise<void>;
  clear: (userId: string) => Promise<void>;
}

/** Sinal síncrono "há cronômetro neste aparelho", lido pela atualização automática do app. */
function flagActive(t: LocalTimer | null) {
  try {
    if (t) localStorage.setItem("estudatta.timer_active", "1");
    else localStorage.removeItem("estudatta.timer_active");
  } catch {
    /* sem storage */
  }
}

export const useTimerStore = create<TimerState>((set, get) => ({
  timer: null,
  hydrated: false,
  async load(userId) {
    try {
      const t = (await db.timers.get(userId)) ?? null;
      set({ timer: t, hydrated: true });
      flagActive(t);
      return t;
    } catch {
      set({ hydrated: true });
      return null;
    }
  },
  async set(t) {
    set({ timer: t });
    flagActive(t);
    if (t) {
      try {
        await db.timers.put(t);
      } catch {
        /* ignore */
      }
    }
  },
  async clear(userId) {
    set({ timer: null });
    flagActive(null);
    try {
      await db.timers.delete(userId);
    } catch {
      /* ignore */
    }
    void get;
  },
}));

/** Segundos de foco acumulados até `now` (intervalos de foco fechados + aberto). */
export function elapsedSeconds(t: LocalTimer | null, now = Date.now()): number {
  if (!t) return 0;
  let total = 0;
  for (const i of t.intervals) {
    if (i.kind !== "focus") continue;
    const s = Date.parse(i.started_at);
    const e = i.ended_at ? Date.parse(i.ended_at) : now;
    if (e > s) total += Math.floor((e - s) / 1000);
  }
  return total;
}
