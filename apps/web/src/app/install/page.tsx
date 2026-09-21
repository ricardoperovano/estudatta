import { t } from "@/i18n";
import * as React from "react";
import { Link } from "react-router";
import {
  ArrowsOut,
  BellRinging,
  CheckCircle,
  DeviceMobile,
  HouseSimple,
  Warning,
} from "@phosphor-icons/react";
import { Button, Card, toast } from "@/components/ui";
import { TataSvg } from "@/components/mascot/TataSvg";
import { InstallGuide } from "@/components/install/install-guide";
import { useInstallState } from "@/components/install/use-install-state";
import { usePageTour } from "@/components/tour/use-tours";
import { instalarTour } from "@/tours/instalar";

function fmtIos(v: number): string {
  const major = Math.floor(v);
  const minor = Math.round((v - major) * 100);
  return minor ? `${major}.${minor}` : String(major);
}

/** Instalar o app: por que vale a pena, convite nativo quando existe e passo a passo por aparelho. */
export default function InstallPage() {
  const s = useInstallState();
  const [busy, setBusy] = React.useState(false);
  usePageTour(instalarTour);
  const done = s.installed || s.installedNow;

  const install = async () => {
    setBusy(true);
    const r = await s.promptInstall();
    setBusy(false);
    if (r === "accepted") toast("success", t("Prontinho! O Estudatta foi instalado."));
    else if (r === "dismissed")
      toast("info", t("Tudo bem!"), t("Se mudar de ideia, o passo a passo está logo abaixo."));
    else
      toast("info", t("O convite do navegador não está disponível agora"), t("Siga o passo a passo abaixo."));
  };

  const iosOld = s.group === "ios" && !s.env.pushCapable;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 desktop:gap-8">
      <header>
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">
          {t("Instalar o app")}
        </h1>
      </header>

      {done ? (
        <Card
          as="section"
          className="items-center gap-3 rounded-lg bg-success-tint p-5 text-center"
          aria-labelledby="install-done"
          data-tour="instalar-porque"
        >
          <TataSvg mood="cheer" size={96} />
          <h2 id="install-done" className="text-balance text-[19px] font-medium leading-tight">
            <CheckCircle
              size={22}
              weight="fill"
              className="-mt-1 mr-1.5 inline-block align-middle text-success"
              aria-hidden
            />
            {s.installed ? t("Você já está usando o app instalado") : t("Prontinho, o app foi instalado!")}
          </h2>
          <p className="max-w-[46ch] text-[14px] text-secondary">
            {s.installed
              ? t("Tudo certo por aqui. Que tal ligar os lembretes para eu te chamar na hora de estudar?")
              : t(
                  "Procure o ícone do Estudatta na tela inicial (ou na lista de apps) e abra por lá. Depois, ligue os lembretes.",
                )}
          </p>
          <Button asChild variant="primary" size="lg" className="bg-surface">
            <Link to="/app/preferencias">
              <BellRinging size={18} aria-hidden />
              {t("Ativar lembretes")}
            </Link>
          </Button>
        </Card>
      ) : (
        <section
          aria-labelledby="install-why"
          className="overflow-hidden rounded-lg bg-surface shadow-sm"
          data-tour="instalar-porque"
        >
          <div className="flex items-end gap-3 bg-accent-tint px-4 pt-4 desktop:px-6">
            <TataSvg mood="wave" size={88} className="-mb-1 shrink-0" />
            <div className="relative mb-4 rounded-lg rounded-bl-sm bg-surface px-3.5 py-2.5 shadow-sm">
              <h2 id="install-why" className="text-[17px] font-medium leading-snug">
                {t("Me leva no seu {{v0}}?", { v0: s.env.mobile ? "celular" : "computador" })}
              </h2>
              <p className="text-[13px] text-secondary">{t("Instalado, eu fico a um toque de distância.")}</p>
            </div>
          </div>
          <ul className="grid gap-3 p-4 desktop:grid-cols-3 desktop:p-6">
            <Benefit
              icon={<HouseSimple size={20} weight="duotone" />}
              title={t("Abre direto da tela inicial")}
            >
              {t("Sem procurar aba nem digitar endereço.")}
            </Benefit>
            <Benefit icon={<ArrowsOut size={20} weight="duotone" />} title={t("Tela cheia")}>
              {t("Sem as barras do navegador, com mais espaço para estudar.")}
            </Benefit>
            <Benefit icon={<BellRinging size={20} weight="duotone" />} title={t("Lembretes no celular")}>
              {t("No iPhone, os lembretes só funcionam com o app instalado.")}
            </Benefit>
          </ul>
        </section>
      )}

      {!done && s.canPrompt ? (
        <Card
          as="section"
          accent
          className="gap-3 rounded-lg p-4 desktop:flex-row desktop:items-center desktop:justify-between desktop:p-6"
          aria-labelledby="install-now"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
              <DeviceMobile size={22} aria-hidden />
            </span>
            <div>
              <h2 id="install-now" className="text-[16px] font-medium leading-snug">
                {t("Seu navegador instala com um toque")}
              </h2>
              <p className="text-[13px] text-secondary">
                {t("Toque em instalar e confirme. Não ocupa quase nada de espaço.")}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="xl"
            block
            onClick={install}
            loading={busy}
            className="desktop:w-auto"
          >
            {t("Instalar agora")}
          </Button>
        </Card>
      ) : null}

      {iosOld && !done ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-tint px-3 py-2.5 text-[14px]" role="note">
          <Warning size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>
            {t(
              "Seu aparelho está no iOS {{v0}}. O app instala, mas os lembretes no celular só chegam a partir do iOS 16.4. Dá para atualizar em Ajustes → Geral → Atualização de Software.",
              { v0: s.env.iosVersion ? fmtIos(s.env.iosVersion) : "antigo" },
            )}
          </span>
        </p>
      ) : null}

      <section aria-labelledby="install-steps" className="flex flex-col gap-3" data-tour="instalar-passos">
        <div>
          <h2 id="install-steps" className="text-[19px] font-medium leading-tight">
            {done
              ? t("Instalar em outro aparelho")
              : s.canPrompt
                ? t("Prefere fazer pelo menu?")
                : t("Passo a passo")}
          </h2>
          <p className="text-[13px] text-secondary">
            {done
              ? t("Escolha o aparelho e o navegador.")
              : t("Já separei as instruções do seu {{v0}} ({{v1}}).", {
                  v0: s.env.mobile ? "celular" : "computador",
                  v1: s.env.browser,
                })}
          </p>
        </div>
        <InstallGuide env={s.env} tourAnchors />
      </section>

      {!done ? (
        <Card className="flex-row items-center gap-3 rounded-lg p-4">
          <TataSvg mood="love" size={48} className="shrink-0" />
          <p className="text-[13px] text-secondary">
            <strong className="font-medium text-primary">{t("Depois de instalar:")}</strong>{" "}
            {t("abra o app pelo ícone e ligue os lembretes em")}{" "}
            <Link to="/app/preferencias" className="text-accent underline underline-offset-2">
              {t("Preferências")}
            </Link>
            .
          </p>
        </Card>
      ) : null}
    </div>
  );
}

function Benefit({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent"
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-[14px] font-medium leading-snug">{title}</span>
        <span className="text-[13px] leading-snug text-secondary">{children}</span>
      </span>
    </li>
  );
}
