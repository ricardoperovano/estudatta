/** Troca rápida entre claro e escuro (a opção "Sistema" fica em Preferências). Salva na conta. */
import * as React from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { settingsKeys } from "@/api/settings";
import type { Preferences } from "@/api/types";
import { isDark, readTheme, setTheme, subscribeTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function useIsDark() {
  return React.useSyncExternalStore(subscribeTheme, () => isDark(readTheme()), () => false);
}

export function ThemeToggle({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const dark = useIsDark();
  const qc = useQueryClient();
  const toggle = () => {
    const next = dark ? "light" : "dark";
    setTheme(next);
    const prev = qc.getQueryData<Preferences>(settingsKeys.preferences);
    if (prev) qc.setQueryData(settingsKeys.preferences, { ...prev, theme: next });
    void api.PATCH("/api/v1/me/preferences", { body: { theme: next } }).catch(() => undefined);
  };
  const label = dark ? "Usar tema claro" : "Usar tema escuro";
  const Icon = dark ? Sun : Moon;
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className={className}>
      <Icon size={withLabel ? 24 : 18} weight={withLabel ? "regular" : "bold"} aria-hidden className={cn(withLabel && "shrink-0 desktop:hidden")} />
      {withLabel ? <span className="hidden desktop:inline">{dark ? "Tema claro" : "Tema escuro"}</span> : null}
    </button>
  );
}
