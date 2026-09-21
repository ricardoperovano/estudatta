/**
 * Prévia honesta de como a página vai ficar: moldura tracejada com o selo "Exemplo" e o
 * conteúdo apagado (sem cliques, fora da leitura de tela). Nada aqui é dado da pessoa.
 */
import { t } from "@/i18n";
import * as React from "react";
import { Eye } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function ExampleTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-neutral-800 px-2 py-[2px] text-[11px] font-medium tracking-[0.02em] text-neutral-300",
        className,
      )}
    >
      <Eye size={12} weight="bold" aria-hidden />
      {t("Exemplo")}
    </span>
  );
}

interface Props {
  /** título curto da prévia ("Assim fica um objetivo") */
  title: string;
  /** o que a prévia mostra, para leitores de tela */
  summary: string;
  /** nota abaixo da prévia */
  note?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ExamplePreview({ title, summary, note, children, className }: Props) {
  const id = React.useId();
  return (
    <figure
      aria-labelledby={id}
      className={cn(
        "rise-in m-0 flex flex-col gap-3 rounded-[20px] border border-dashed border-neutral-700 bg-[color-mix(in_srgb,var(--color-bg-surface)_45%,transparent)] p-4 desktop:p-5",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-2">
        <span id={id} className="text-[14px] font-medium text-neutral-300">
          {title}
        </span>
        <ExampleTag />
      </figcaption>
      <div className="pointer-events-none select-none opacity-75 saturate-[0.85]" aria-hidden inert>
        {children}
      </div>
      <p className="sr-only">{t("Exemplo ilustrativo: {{v0}}", { v0: summary })}</p>
      {note ? <p className="m-0 text-[12px] leading-[1.45] text-neutral-400">{note}</p> : null}
    </figure>
  );
}
