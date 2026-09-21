import { t } from "@/i18n";
import { Repeat } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui";
import type { Task } from "@/api/planning";
import { cn } from "@/lib/utils";
import { taskMeta, useToggleTaskDone } from "./task-toggle";

interface Props {
  task: Task;
  onEdit: (task: Task) => void;
  prefix?: string;
  className?: string;
}

/** Linha de checklist (D1): checkbox 20px + título (riscado quando concluída) + meta em 12px. */
export function TaskCheckRow({ task, onEdit, prefix, className }: Props) {
  const { toggle, isPending } = useToggleTaskDone();
  const done = task.status === "done";
  const meta = taskMeta(task, { time: true });
  return (
    <div className={cn("flex min-h-[44px] items-center gap-[10px] text-[14px]", className)}>
      <Checkbox
        checked={done}
        disabled={isPending}
        onCheckedChange={(v) => void toggle(task, v === true)}
        aria-label={`${done ? t("Desfazer") : t("Concluir")}: ${task.title}`}
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start py-1 text-left"
        onClick={() => onEdit(task)}
        aria-label={t("Editar tarefa {{v0}}", { v0: task.title })}
      >
        <span
          className={cn(
            "max-w-full truncate",
            done && "text-neutral-500 line-through",
            task.status === "skipped" && "text-neutral-500",
          )}
        >
          {task.series_id ? (
            <Repeat size={12} className="mr-1 inline text-neutral-500" aria-label={t("Série")} />
          ) : null}
          {task.title}
        </span>
        {prefix || meta ? (
          <span className="tnum text-[12px] text-neutral-400">
            {[prefix, meta].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </button>
    </div>
  );
}
