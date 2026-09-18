import * as React from "react";
import { Check, Warning, WifiSlash } from "@phosphor-icons/react";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";

type Kind = "syncing" | "synced" | "offline" | "conflict" | "error" | "info";

const cfg: Record<Kind, { icon: React.ReactNode; className: string }> = {
  syncing: { icon: <Spinner />, className: "bg-canvas" },
  synced: { icon: <Check size={16} className="text-success" aria-hidden />, className: "bg-canvas" },
  offline: { icon: <WifiSlash size={16} className="text-info" aria-hidden />, className: "bg-info-tint" },
  conflict: { icon: <Warning size={16} className="text-error" aria-hidden />, className: "bg-error-tint" },
  error: { icon: <Warning size={16} className="text-error" aria-hidden />, className: "bg-error-tint" },
  info: { icon: <WifiSlash size={16} className="text-info" aria-hidden />, className: "bg-canvas" },
};

/** Estados de sistema: sincronizando · sincronizado · offline · conflito (com escolha). */
export function Banner({ kind, children, className, actions }: { kind: Kind; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  const c = cfg[kind];
  return (
    <div role={kind === "error" || kind === "conflict" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-md px-3 py-[10px] text-[14px]", c.className, className)}>
      <span className="mt-0.5 shrink-0">{c.icon}</span>
      <div className="flex flex-1 flex-col">
        <span>{children}</span>
        {actions ? <div className="mt-2 flex gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
