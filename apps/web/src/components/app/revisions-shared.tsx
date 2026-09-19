import * as React from "react";
import { Link } from "react-router";
import { errorMessage } from "@/api/client";
import { useRevisionAction, type Revision } from "@/api/study";
import { Button, Dialog, DialogActions, DialogContent, Field, Input, Tag, toast } from "@/components/ui";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { addDaysIso, fmtDayShort } from "@/lib/format";
import { daysBetween, revisionDueLabel, revisionStepLabel, sessionHref } from "@/components/app/revisions-utils";
import { cn } from "@/lib/utils";

/** Linha de revisão com ações: Revisar agora · Concluir · Pular · Reagendar. */
export function RevisionRow({ revision: r, today, activityTitle, className }: { revision: Revision; today: string; activityTitle?: string; className?: string }) {
  const action = useRevisionAction();
  const [skipOpen, setSkipOpen] = React.useState(false);
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);
  const pending = r.status === "pending";
  const diff = daysBetween(today, r.due_date);
  const late = pending && diff < 0;
  const busy = action.isPending;

  const done = async () => {
    try {
      const next = (await action.mutateAsync({ id: r.id, action: "done" })) as Revision | null;
      toast.success("Revisão concluída", next ? `Próxima revisão ${revisionDueLabel(next.due_date, today)}.` : "Era a última etapa deste conteúdo.");
    } catch (e) {
      toast.error("Não foi possível concluir", errorMessage(e));
    }
  };
  const skip = async () => {
    try {
      await action.mutateAsync({ id: r.id, action: "skip" });
      setSkipOpen(false);
      toast.info("Revisão pulada", "As próximas etapas deste conteúdo não serão agendadas.");
    } catch (e) {
      toast.error("Não foi possível pular", errorMessage(e));
    }
  };

  return (
    <li className={cn("flex flex-col gap-2 rounded-md bg-canvas px-3 py-[10px]", late && "border-l-2 border-pending", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-[15px] font-medium">{r.title}</span>
        {pending ? (
          <span className={cn("text-[12px]", late ? "text-pending" : diff === 0 ? "text-accent" : "text-neutral-400")}>{revisionDueLabel(r.due_date, today)}</span>
        ) : r.status === "done" ? (
          <Tag variant="success">{r.done_at ? `Concluída ${fmtDayShort(r.done_at)}` : "Concluída"}</Tag>
        ) : (
          <Tag variant="neutral">Pulada</Tag>
        )}
      </div>
      <span className="text-[12px] text-neutral-400">
        {revisionStepLabel(r)}
        {activityTitle ? ` · ${activityTitle}` : ""}
      </span>
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="primary" size="sm">
            <Link to={sessionHref({ activityId: r.activity_id, subjectId: r.subject_id, topicId: r.topic_id, type: "revisao" })} aria-label={`Revisar agora: ${r.title}`}>
              Revisar agora
            </Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void done()} loading={busy && action.variables?.action === "done"} disabled={busy} aria-label={`Concluir revisão: ${r.title}`}>
            Concluir
          </Button>
          <Button variant="ghost-muted" size="sm" onClick={() => setSkipOpen(true)} disabled={busy} aria-label={`Pular revisão: ${r.title}`}>
            Pular
          </Button>
          <Button variant="ghost-muted" size="sm" onClick={() => setRescheduleOpen(true)} disabled={busy} aria-label={`Reagendar revisão: ${r.title}`}>
            Reagendar
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={skipOpen}
        onOpenChange={setSkipOpen}
        title="Pular esta revisão?"
        description="Ela sai da lista e as próximas etapas deste conteúdo não são agendadas. Se estudar o conteúdo de novo, uma nova sequência começa."
        confirmLabel="Pular revisão"
        loading={busy}
        onConfirm={skip}
      />
      {rescheduleOpen ? <RescheduleDialog revision={r} today={today} onClose={() => setRescheduleOpen(false)} /> : null}
    </li>
  );
}

function RescheduleDialog({ revision, today, onClose }: { revision: Revision; today: string; onClose: () => void }) {
  const action = useRevisionAction();
  const [date, setDate] = React.useState(() => (revision.due_date > today ? revision.due_date : addDaysIso(today, 1)));
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return setError("Escolha uma data.");
    if (date < today) return setError("Escolha hoje ou uma data futura.");
    setError(null);
    try {
      await action.mutateAsync({ id: revision.id, action: "reschedule", due_date: date });
      toast.success("Revisão reagendada", `Nova data: ${fmtDayShort(date)}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Reagendar revisão" description={revision.title}>
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-[14px]" noValidate>
          <Field label="Nova data" htmlFor={`${id}-date`} error={error}>
            <Input id={`${id}-date`} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} invalid={!!error} required />
          </Field>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Atalhos de data">
            {[1, 3, 7].map((n) => (
              <Button key={n} type="button" variant={date === addDaysIso(today, n) ? "selected" : "secondary"} size="sm" onClick={() => setDate(addDaysIso(today, n))}>
                {n === 1 ? "Amanhã" : `Em ${n} dias`}
              </Button>
            ))}
          </div>
          <DialogActions>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={action.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={action.isPending}>
              Reagendar
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
