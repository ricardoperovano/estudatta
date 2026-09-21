import { t } from "@/i18n";
import * as React from "react";
import { AppleLogo, AndroidLogo, Desktop, Info } from "@phosphor-icons/react";
import { Seg } from "@/components/ui";
import type { InstallEnv, InstallPlatform, PlatformGroup } from "@/lib/device";
import { cn } from "@/lib/utils";
import { GROUP_LABEL, getGuide, variantsFor, type Guide } from "./guides";

const GROUP_ICON: Record<PlatformGroup, React.ReactNode> = {
  ios: <AppleLogo size={16} aria-hidden />,
  android: <AndroidLogo size={16} aria-hidden />,
  desktop: <Desktop size={16} aria-hidden />,
};

/** Lista numerada de passos de um guia. */
export function InstallSteps({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {guide.note ? (
        <p className="flex items-start gap-2 rounded-md bg-warning-tint px-3 py-2.5 text-[14px]">
          <Info size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          <span>{guide.note}</span>
        </p>
      ) : null}
      <ol className="flex flex-col gap-3">
        {guide.steps.map((s, i) => (
          <li
            key={i}
            className="grid grid-cols-[32px_1fr] gap-x-3 rounded-lg bg-surface p-3 shadow-sm desktop:grid-cols-[32px_1fr_minmax(0,300px)] desktop:items-center desktop:p-4"
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint text-[15px] font-semibold text-accent"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1 self-center">
              <h3 className="text-[15px] font-medium leading-snug">
                <span className="sr-only">{t("Passo {{v0}}:", { v0: i + 1 })} </span>
                {s.title}
              </h3>
              {s.text ? <p className="text-[13px] leading-relaxed text-secondary">{s.text}</p> : null}
              {s.action ? <div className="mt-1.5 flex">{s.action}</div> : null}
            </div>
            {s.art ? (
              <div className="col-start-2 mt-2.5 max-w-[320px] desktop:col-start-3 desktop:mt-0 desktop:w-full">
                {s.art}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Passo a passo com seletor de plataforma (iPhone/iPad · Android · Computador) e de navegador.
 * Começa pela plataforma e navegador detectados.
 */
export function InstallGuide({
  env,
  className,
  tourAnchors = false,
}: {
  env: InstallEnv;
  className?: string;
  tourAnchors?: boolean;
}) {
  const [group, setGroup] = React.useState<PlatformGroup>(env.group);
  const variants = variantsFor(group, env);
  const [picked, setPicked] = React.useState<Partial<Record<PlatformGroup, InstallPlatform>>>({});
  const platform = picked[group] && variants.includes(picked[group]) ? picked[group] : variants[0];
  const guide = getGuide(platform, env);
  const groups: PlatformGroup[] = ["ios", "android", "desktop"];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div data-tour={tourAnchors ? "instalar-plataformas" : undefined}>
        <Seg<PlatformGroup>
          label={t("Tipo de aparelho")}
          value={group}
          onChange={setGroup}
          block
          size="lg"
          options={groups.map((g) => ({
            value: g,
            label: (
              <span className="flex flex-col items-center leading-tight">
                <span className="inline-flex items-center gap-1.5">
                  {GROUP_ICON[g]}
                  {GROUP_LABEL[g]}
                </span>
                {g === env.group ? (
                  <span className="text-[10px] text-tertiary">{t("este aparelho")}</span>
                ) : null}
              </span>
            ),
          }))}
        />
      </div>
      {variants.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-tertiary" id="install-browser-label">
            {t("Navegador:")}
          </span>
          <div role="radiogroup" aria-labelledby="install-browser-label" className="flex flex-wrap gap-1.5">
            {variants.map((p) => {
              const active = p === platform;
              const label = getGuide(p, env).label;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPicked((m) => ({ ...m, [group]: p }))}
                  className={cn(
                    "min-h-[32px] cursor-pointer rounded-full border px-3 text-[12px] transition-colors duration-base",
                    active
                      ? "border-accent bg-accent-tint font-medium text-accent"
                      : "border-divider text-secondary hover:text-primary",
                  )}
                >
                  {label}
                  {p === env.platform ? <span className="sr-only"> {t("(este navegador)")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <InstallSteps guide={guide} />
    </div>
  );
}
