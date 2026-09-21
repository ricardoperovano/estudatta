/** Troca rápida entre claro e escuro (a opção "Sistema" fica em Preferências). Salva na conta. */
import { t } from "@/i18n";
import * as React from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { settingsKeys } from "@/api/settings";
import type { Preferences } from "@/api/types";
import { isDark, readTheme, setTheme, subscribeTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function useThemeSwitch() {
  const dark = React.useSyncExternalStore(
    subscribeTheme,
    () => isDark(readTheme()),
    () => false,
  );
  const qc = useQueryClient();
  const choose = (next: "light" | "dark") => {
    setTheme(next);
    const prev = qc.getQueryData<Preferences>(settingsKeys.preferences);
    if (prev) qc.setQueryData(settingsKeys.preferences, { ...prev, theme: next });
    void api.PATCH("/api/v1/me/preferences", { body: { theme: next } }).catch(() => undefined);
  };
  return { dark, choose };
}

/** Botão redondo (topo do celular). */
export function ThemeToggle({ className }: { className?: string }) {
  const { dark, choose } = useThemeSwitch();
  const label = dark ? t("Usar tema claro") : t("Usar tema escuro");
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => choose(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={className}
    >
      <Icon size={18} weight="bold" aria-hidden />
    </button>
  );
}

/** Seletor sol/lua (barra lateral). Compacto: um botão só quando a barra está recolhida. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { dark, choose } = useThemeSwitch();
  const opt = (value: "light" | "dark", Icon: typeof Sun, label: string) => {
    const on = dark === (value === "dark");
    return (
      <button
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={label}
        title={label}
        onClick={() => choose(value)}
        className={cn(
          "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12px] transition-colors duration-base",
          on ? "bg-surface text-accent shadow-sm" : "text-neutral-500 hover:text-primary",
        )}
      >
        <Icon size={15} weight={on ? "fill" : "regular"} aria-hidden />
        <span className="hidden desktop:inline">{value === "light" ? t("Claro") : t("Escuro")}</span>
      </button>
    );
  };
  return (
    <>
      <div
        role="radiogroup"
        aria-label={t("Tema")}
        className={cn("hidden gap-1 rounded-full bg-canvas p-1 desktop:flex", className)}
      >
        {opt("light", Sun, t("Tema claro"))}
        {opt("dark", Moon, t("Tema escuro"))}
      </div>
      <ThemeToggle className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 hover:bg-canvas hover:text-primary desktop:hidden" />
    </>
  );
}
