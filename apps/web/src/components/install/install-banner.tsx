import * as React from "react";
import { Link } from "react-router";
import { X } from "@phosphor-icons/react";
import { Button, toast } from "@/components/ui";
import { TataSvg } from "@/components/mascot/TataSvg";
import { cn } from "@/lib/utils";
import { INSTALL_DISMISS_DAYS, useInstallState } from "./use-install-state";

export interface InstallBannerProps {
  className?: string;
  /** Mostrar também no computador (padrão: só em celular/tablet). */
  showOnDesktop?: boolean;
  /** Ignora o "agora não" dos últimos 14 dias (ex.: dentro de Preferências). */
  ignoreDismiss?: boolean;
  /** Esconde o botão de dispensar. */
  hideDismiss?: boolean;
}

/**
 * Convite compacto para instalar o app. Só aparece quando o app não está instalado, em
 * celular (ou no computador com `showOnDesktop`) e se a pessoa não dispensou nos últimos 14 dias.
 * "Instalar" usa o convite nativo quando o navegador oferece; senão, "Ver como" abre /app/instalar.
 */
export function InstallBanner({ className, showOnDesktop = false, ignoreDismiss = false, hideDismiss = false }: InstallBannerProps) {
  const s = useInstallState();
  const [busy, setBusy] = React.useState(false);
  const titleId = React.useId();

  if (s.installed || s.installedNow) return null;
  if (!ignoreDismiss && s.dismissed) return null;
  if (!s.env.mobile && !showOnDesktop) return null;
  if (!s.env.mobile && s.platform === "desktop-other" && !s.canPrompt) return null;

  const install = async () => {
    setBusy(true);
    const r = await s.promptInstall();
    setBusy(false);
    if (r === "accepted") toast("success", "Prontinho! O Estudatta está na sua tela inicial.");
  };

  const sub =
    s.group === "ios"
      ? s.env.pushCapable
        ? "Três toques e pronto. No iPhone, os lembretes só chegam com o app instalado."
        : "Abre direto da tela inicial, em tela cheia."
      : s.env.mobile
        ? "Abre direto da tela inicial, em tela cheia e com lembretes."
        : "Abre numa janela própria, sem as abas do navegador.";

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative flex items-center gap-3 overflow-hidden rounded-lg bg-accent-tint py-3 pl-2 pr-3 shadow-sm",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300",
        className,
      )}
      data-install-banner
    >
      <TataSvg mood="wave" size={56} className="shrink-0 -mb-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 id={titleId} className="pr-7 text-[15px] font-medium leading-snug">
          {s.env.mobile ? "Instale o Estudatta no seu celular" : "Instale o Estudatta no computador"}
        </h2>
        <p className="text-[12px] leading-snug text-secondary">{sub}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {s.canPrompt ? (
            <Button variant="primary" size="md" onClick={install} loading={busy} className="bg-surface">
              Instalar
            </Button>
          ) : null}
          <Button asChild variant={s.canPrompt ? "ghost" : "primary"} size="md" className={s.canPrompt ? undefined : "bg-surface"}>
            <Link to="/app/instalar">{s.canPrompt ? "Como funciona" : "Ver como"}</Link>
          </Button>
        </div>
      </div>
      {hideDismiss ? null : (
        <button
          type="button"
          onClick={s.dismiss}
          aria-label={`Agora não (esconder por ${INSTALL_DISMISS_DAYS} dias)`}
          title="Agora não"
          className="absolute right-1.5 top-1.5 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--color-text-primary)_8%,transparent)] hover:text-primary"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </section>
  );
}
