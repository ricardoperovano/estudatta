import { t } from "@/i18n";
import * as React from "react";
import { Link } from "react-router";
import { BellRinging, CheckCircle } from "@phosphor-icons/react";
import { Button, Card, toast } from "@/components/ui";
import { TataSvg } from "@/components/mascot/TataSvg";
import { shortHint } from "@/components/install/guides";
import { useInstallState } from "@/components/install/use-install-state";
import { cn } from "@/lib/utils";

/**
 * Convite de instalação coerente com o navegador: convite nativo quando existe; senão, a
 * instrução de uma linha do navegador detectado e o link para o passo a passo (/app/instalar).
 * Com `showInstalled`, mostra a confirmação quando o app já está instalado (em vez de sumir).
 */
export function InstallPrompt({
  compact = false,
  showInstalled = false,
  className,
}: {
  compact?: boolean;
  showInstalled?: boolean;
  className?: string;
}) {
  const s = useInstallState();
  const [busy, setBusy] = React.useState(false);

  if (s.installed || s.installedNow) {
    if (!showInstalled) return null;
    return (
      <Card className={cn("gap-2 p-4 text-[14px]", className)}>
        <div className="flex items-center gap-2">
          <CheckCircle size={20} weight="fill" className="shrink-0 text-success" aria-hidden />
          <span className="font-medium">
            {s.installed
              ? t("O Estudatta já está instalado neste aparelho.")
              : t("Prontinho! Abra o Estudatta pelo ícone na tela inicial.")}
          </span>
        </div>
        <Link
          to="/app/instalar"
          className="self-start text-[13px] text-accent underline-offset-2 hover:underline"
        >
          {t("Instalar em outro aparelho")}
        </Link>
      </Card>
    );
  }

  const install = async () => {
    setBusy(true);
    const r = await s.promptInstall();
    setBusy(false);
    if (r === "accepted") toast("success", t("Prontinho! O Estudatta foi instalado."));
  };

  const title = s.env.mobile
    ? t("Coloque o Estudatta na tela inicial")
    : t("Instale o Estudatta no computador");

  return (
    <Card className={cn(compact ? "gap-2 p-3" : "gap-3 p-4", "text-[14px]", className)}>
      <div className="flex items-start gap-3">
        {compact ? null : <TataSvg mood="wave" size={48} className="-mt-1 shrink-0" />}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium leading-snug">{title}</span>
          <span className="text-[13px] leading-snug text-secondary">
            {s.canPrompt
              ? t("Seu navegador instala com um toque: abre em tela cheia e direto da tela inicial.")
              : shortHint(s.env)}
          </span>
          {s.group === "ios" && s.env.pushCapable ? (
            <span className="mt-0.5 flex items-start gap-1.5 text-[12px] leading-snug text-secondary">
              <BellRinging size={14} className="mt-px shrink-0 text-accent" aria-hidden />
              {t("No iPhone, os lembretes só chegam com o app instalado.")}
            </span>
          ) : null}
        </div>
      </div>
      <div className={cn("flex flex-wrap items-center gap-2", !compact && "pl-[60px]")}>
        {s.canPrompt ? (
          <Button variant="primary" size="md" onClick={install} loading={busy}>
            {t("Instalar")}
          </Button>
        ) : null}
        <Button asChild variant={s.canPrompt ? "ghost" : "secondary"} size="md">
          <Link to="/app/instalar">{t("Ver passo a passo")}</Link>
        </Button>
      </div>
    </Card>
  );
}
