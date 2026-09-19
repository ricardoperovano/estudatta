/** Cartão curto que explica um conceito em poucos itens com ícone (ex.: "O que é um objetivo"). */
import * as React from "react";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type ExplainerTint = "accent" | "info" | "success" | "warning";

export interface ExplainerItem {
  icon: Icon;
  title: string;
  body: React.ReactNode;
  tint?: ExplainerTint;
}

const TINT: Record<ExplainerTint, string> = {
  accent: "bg-accent-900 text-accent",
  info: "bg-info-tint text-info",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-pending",
};

export function Explainer({
  title,
  items,
  numbered,
  footer,
  className,
}: {
  title: string;
  items: ExplainerItem[];
  numbered?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const List = numbered ? "ol" : "ul";
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rise-in flex flex-col gap-3 rounded-[20px] bg-surface p-4 shadow-sm desktop:p-5",
        className,
      )}
    >
      <h2 id={id} className="text-[15px] font-medium">
        {title}
      </h2>
      <List className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((s, i) => {
          const I = s.icon;
          return (
            <li key={s.title} className="flex items-start gap-3">
              <span
                className={cn(
                  "relative grid h-10 w-10 shrink-0 place-items-center rounded-[12px]",
                  TINT[s.tint ?? "accent"],
                )}
                aria-hidden
              >
                <I size={20} weight="duotone" />
                {numbered ? (
                  <span className="tnum absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-surface text-[10px] font-semibold text-neutral-300 shadow-sm">
                    {i + 1}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[14px] font-medium">{s.title}</span>
                <span className="mt-0.5 block text-[13px] leading-[1.45] text-neutral-400">{s.body}</span>
              </span>
            </li>
          );
        })}
      </List>
      {footer ? <div className="text-[13px] text-neutral-400">{footer}</div> : null}
    </section>
  );
}
