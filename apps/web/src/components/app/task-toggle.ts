import { toast } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useCompleteTask, useMaterializeOccurrence, type Task } from "@/api/planning";
import { fmtMinutes } from "@/lib/format";
import { fmtPages } from "./week-utils";

/** Alterna concluída/planejada; ocorrência virtual de série vira tarefa real ao concluir. Não lança minutos. */
export function useToggleTaskDone() {
  const complete = useCompleteTask();
  const materialize = useMaterializeOccurrence();
  const toggle = async (task: Task, done: boolean) => {
    try {
      if (task.id) await complete.mutateAsync({ id: task.id, done });
      else if (task.series_id) await materialize.mutateAsync({ seriesId: task.series_id, date: task.local_date, body: { status: done ? "done" : "planned", clear_start_time: false } });
    } catch (err) {
      toast.error("Não foi possível atualizar a tarefa", errorMessage(err));
    }
  };
  return { toggle, isPending: complete.isPending || materialize.isPending };
}

/** "19:30 · 60 min + 20 de recuperação · p. 40–46" */
export function taskMeta(task: Task, opts: { time?: boolean } = {}): string {
  const base = Math.max(0, (task.estimated_seconds ?? 0) - task.recovery_seconds);
  const parts = [
    opts.time && task.start_time ? task.start_time.slice(0, 5) : null,
    task.estimated_seconds ? (task.recovery_seconds > 0 ? `${base > 0 ? `${fmtMinutes(base)} + ` : "+"}${Math.round(task.recovery_seconds / 60)} de recuperação` : fmtMinutes(task.estimated_seconds)) : null,
    fmtPages(task.page_from, task.page_to),
    task.status === "skipped" ? "pulada" : null,
  ];
  return parts.filter(Boolean).join(" · ");
}
