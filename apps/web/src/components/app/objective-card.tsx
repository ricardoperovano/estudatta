import * as React from "react";
import { Link } from "react-router";
import { Bar, Button, Card, CardMeta, Tag } from "@/components/ui";
import { fmtMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ObjectiveCardProps {
  to: string;
  title: string;
  /** "5×/sem" */
  cadence?: string;
  /** 0..1 */
  progress: number;
  /** "3h10 de 5h" */
  progressLabel: string;
  /** segundos de pendência anterior (dívida vencida), nunca "falta de hoje" */
  pendingSeconds?: number;
  /** texto alternativo à pendência (ex.: "em dia", "pausado") */
  status?: { label: string; tone: "success" | "neutral" | "pending" };
  /** "12 tópicos · 3 materiais · próximo: …" */
  meta?: string;
  className?: string;
}

/** Cartão de objetivo (D1 / 03): título, cadência, barra 6px, semana × meta, pendência em damasco, meta em 11px. */
export function ObjectiveCard({ to, title, cadence, progress, progressLabel, pendingSeconds = 0, status, meta, className }: ObjectiveCardProps) {
  const right = status ?? (pendingSeconds > 0 ? { label: `${fmtMinutes(pendingSeconds)} a recuperar`, tone: "pending" as const } : { label: "em dia", tone: "success" as const });
  return (
    <Link to={to} className="block rounded-md text-primary no-underline hover:text-primary focus-visible:outline-offset-2">
      <Card as="article" className={cn("h-full gap-2 p-4 transition-shadow duration-base hover:shadow-md", className)}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-[17px] font-medium leading-[1.2]">{title}</span>
          {cadence ? <Tag variant="neutral">{cadence}</Tag> : null}
        </div>
        <Bar value={progress} height={6} label={`${progressLabel}`} />
        <div className="tnum flex items-center justify-between gap-2 text-[12px] text-neutral-400 desktop:text-[13px]">
          <span>{progressLabel}</span>
          <span className={cn(right.tone === "pending" && "text-pending", right.tone === "success" && "text-success")}>{right.label}</span>
        </div>
        {meta ? <CardMeta className="text-[11px]">{meta}</CardMeta> : null}
      </Card>
    </Link>
  );
}

/** Cartão pontilhado "Novo objetivo" (D1). */
export function NewObjectiveCard({ hint, disabledReason }: { hint?: React.ReactNode; disabledReason?: React.ReactNode }) {
  return (
    <Card className="min-h-[120px] items-start justify-center gap-2 bg-transparent p-4 shadow-inset-divider">
      <span className="text-[14px] text-neutral-400">Novo objetivo: concurso, instrumento, rotina da casa…</span>
      {disabledReason ? <span className="text-[12px] text-neutral-400">{disabledReason}</span> : null}
      <Button asChild variant="secondary">
        <Link to="/app/objetivos/novo">+ Criar objetivo</Link>
      </Button>
      {hint}
    </Card>
  );
}
