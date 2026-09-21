/**
 * Tours por página. A página chama `usePageTour(def, pronta)`: o tour fica disponível no botão
 * "?" e começa sozinho na primeira visita (se a pessoa já concluiu o onboarding, a página
 * terminou de carregar e nenhum outro diálogo está aberto). Concluir ou pular marca como visto
 * na conta, então não repete em outro aparelho.
 */
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/api/client";
import { useUser } from "@/api/session";
import { settingsKeys, usePreferences } from "@/api/settings";
import type { Preferences } from "@/api/types";
import { useTourStore } from "./store";
import type { TourDef } from "./types";

export function useToursSeen(): { seen: Set<string>; loaded: boolean } {
  const prefs = usePreferences();
  const localSeen = useTourStore((s) => s.localSeen);
  const server = prefs.data?.tours_seen;
  return React.useMemo(
    () => ({ seen: new Set([...(server ?? []), ...localSeen]), loaded: !!prefs.data }),
    [server, localSeen, prefs.data],
  );
}

export function useMarkTourSeen() {
  const qc = useQueryClient();
  const markLocal = useTourStore((s) => s.markLocal);
  return useMutation({
    mutationFn: async (key: string) => {
      markLocal(key);
      return unwrap(await api.POST("/api/v1/me/tours/seen", { body: { key } }));
    },
    onSuccess: (data) => {
      const prev = qc.getQueryData<Preferences>(settingsKeys.preferences);
      if (prev) qc.setQueryData(settingsKeys.preferences, { ...prev, tours_seen: data.tours_seen });
    },
  });
}

export function useResetTours() {
  const qc = useQueryClient();
  const resetLocal = useTourStore((s) => s.resetLocal);
  return useMutation({
    mutationFn: async () => {
      resetLocal();
      return unwrap(await api.POST("/api/v1/me/tours/reset", { body: {} }));
    },
    onSuccess: (data) => {
      const prev = qc.getQueryData<Preferences>(settingsKeys.preferences);
      if (prev) qc.setQueryData(settingsKeys.preferences, { ...prev, tours_seen: data.tours_seen });
    },
  });
}

function otherDialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-tour-card]), [role="alertdialog"]');
}

export function usePageTour(def: TourDef, ready = true) {
  const user = useUser();
  const register = useTourStore((s) => s.register);
  const active = useTourStore((s) => s.active);
  const start = useTourStore((s) => s.start);
  const { seen, loaded } = useToursSeen();

  React.useEffect(() => {
    register(def);
    return () => {
      if (useTourStore.getState().page?.key === def.key) register(null);
    };
  }, [def, register]);

  const eligible = ready && loaded && !!user?.onboarding_completed_at && !active && !seen.has(def.key);
  React.useEffect(() => {
    if (!eligible) return;
    // espera a página assentar e nenhum outro diálogo (registro manual, comemoração…) estar aberto
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      if (useTourStore.getState().active) return window.clearInterval(id);
      if (!otherDialogOpen()) {
        window.clearInterval(id);
        start(def);
      } else if (tries > 120) window.clearInterval(id);
    }, 700);
    return () => window.clearInterval(id);
  }, [eligible, def, start]);
}
