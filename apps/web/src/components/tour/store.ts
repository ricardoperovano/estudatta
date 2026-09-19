/** Estado dos tours: qual a página registrou, qual está ativo e quais a pessoa já viu. */
import { create } from "zustand";
import type { TourDef } from "./types";

interface TourState {
  /** tour da página aberta (para o botão "?") */
  page: TourDef | null;
  active: TourDef | null;
  index: number;
  /** vistos neste aparelho nesta sessão (o servidor é a fonte; isto evita repetir antes da resposta) */
  localSeen: string[];
  register: (def: TourDef | null) => void;
  start: (def: TourDef) => void;
  go: (index: number) => void;
  close: () => string | null;
  markLocal: (key: string) => void;
  resetLocal: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  page: null,
  active: null,
  index: 0,
  localSeen: [],
  register: (def) => set({ page: def }),
  start: (def) => set({ active: def, index: 0 }),
  go: (index) => set({ index }),
  close: () => {
    const key = get().active?.key ?? null;
    set({ active: null, index: 0 });
    return key;
  },
  markLocal: (key) => set((s) => (s.localSeen.includes(key) ? s : { localSeen: [...s.localSeen, key] })),
  resetLocal: () => set({ localSeen: [] }),
}));
