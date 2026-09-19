import { Link } from "react-router";
import { useRevisions, useRevisionSummary } from "@/api/study";
import { Card } from "@/components/ui";
import { RevisionRow } from "@/components/app/revisions-shared";
import { daysBetween } from "@/components/app/revisions-utils";
import { todayIso } from "@/lib/format";

/**
 * Cartão "Revisões de hoje" na tela Hoje: até 3 revisões atrasadas/de hoje com ações.
 * Sem nada para hoje: só uma linha com a próxima revisão (ou nada, se não houver nenhuma).
 */
export function RevisionsToday() {
  const summary = useRevisionSummary();
  const pending = useRevisions({ status: "pending" });
  if (!pending.data) return null; // carregando/erro: não compete com as metas do dia

  const today = summary.data?.today ?? todayIso();
  const due = pending.data.filter((r) => r.due_date <= today);
  if (due.length === 0) {
    const next = pending.data.find((r) => r.due_date > today);
    if (!next) return null;
    const days = daysBetween(today, next.due_date);
    return (
      <p className="text-[13px] text-neutral-400">
        Próxima revisão {days === 1 ? "amanhã" : `em ${days} dias`}: {next.title}. <Link to="/app/revisoes">Ver revisões</Link>
      </p>
    );
  }

  const overdue = due.filter((r) => r.due_date < today).length;
  const shown = due.slice(0, 3);
  return (
    <Card as="section" elev="sm" className="gap-3 p-4" aria-labelledby="revisions-today-title">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="revisions-today-title" className="text-[17px] font-medium">
          Revisões de hoje
        </h2>
        <span className="text-[12px] text-neutral-400">
          {due.length - overdue > 0 ? `${due.length - overdue} para hoje` : ""}
          {due.length - overdue > 0 && overdue > 0 ? " · " : ""}
          {overdue > 0 ? <span className="text-pending">{overdue === 1 ? "1 atrasada" : `${overdue} atrasadas`}</span> : null}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((r) => (
          <RevisionRow key={r.id} revision={r} today={today} />
        ))}
      </ul>
      <Link to="/app/revisoes" className="self-start text-[13px]">
        {due.length > shown.length ? `Ver todas (${due.length})` : "Ver todas"}
      </Link>
    </Card>
  );
}
