import { t as tx } from "@/i18n";
import * as React from "react";
import { Banner, Button, EmptyState, Input, Spinner, toast } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useCreateTask, useTasks, type Task } from "@/api/planning";
import type { Activity } from "@/api/types";
import { fmtDayShort, todayIso } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { TaskCheckRow } from "./task-check-row";
import { TaskEditorSheet } from "./task-editor-sheet";
import { capitalize, shiftIso } from "./week-utils";

/** Aba Tarefas: checklist do objetivo (hoje, próximos dias, anteriores), criação rápida e edição completa. */
export function ActivityTasksTab({ activity }: { activity: Activity }) {
  const online = useOnline();
  const today = todayIso();
  const start = shiftIso(today, -14);
  const end = shiftIso(today, 28);
  const tasks = useTasks(start, end, activity.id);
  const create = useCreateTask();
  const [title, setTitle] = React.useState("");
  const [editor, setEditor] = React.useState<{ task?: Task } | null>(null);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    try {
      await create.mutateAsync({
        activity_id: activity.id,
        title: t,
        kind: "checklist",
        local_date: today,
        priority: 0,
        pinned: false,
      });
      setTitle("");
    } catch (err) {
      toast.error(tx("Não foi possível criar a tarefa"), errorMessage(err));
    }
  };

  if (tasks.isPending) {
    return (
      <div className="flex justify-center py-10" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (tasks.isError) {
    return (
      <Banner
        kind={online ? "error" : "offline"}
        actions={
          <Button size="sm" variant="secondary" onClick={() => tasks.refetch()}>
            {tx("Tentar de novo")}
          </Button>
        }
      >
        {online
          ? tx("Não foi possível carregar as tarefas.")
          : tx("Sem conexão: as tarefas aparecem quando você voltar à internet.")}
      </Banner>
    );
  }

  const list = tasks.data;
  const todays = list.filter((t) => t.local_date === today);
  const upcoming = list.filter((t) => t.local_date > today);
  const earlierOpen = list.filter((t) => t.local_date < today && t.status === "planned");
  const earlierDone = list.filter((t) => t.local_date < today && t.status !== "planned").reverse();
  const group = (label: string, items: Task[], withDate: boolean) =>
    items.length > 0 ? (
      <section className="flex flex-col">
        <h2 className="kicker m-0 mb-1 font-normal">{label}</h2>
        {items.map((t) => (
          <TaskCheckRow
            key={t.id ?? `${t.series_id}-${t.local_date}`}
            task={t}
            prefix={withDate ? capitalize(fmtDayShort(t.local_date)) : undefined}
            onEdit={(task) => setEditor({ task })}
          />
        ))}
      </section>
    ) : null;

  return (
    <div className="flex flex-col gap-[14px]">
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={tx("Nova tarefa para hoje")}
          aria-label={tx("Nova tarefa para hoje")}
          maxLength={200}
          className="flex-1"
        />
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          loading={create.isPending}
          disabled={!title.trim()}
        >
          {tx("Adicionar")}
        </Button>
      </form>
      {list.length === 0 ? (
        <EmptyState
          title={tx("Nenhuma tarefa por aqui.")}
          description={tx("Tarefas são passos a concluir. Concluir uma tarefa não registra minutos.")}
        />
      ) : (
        <>
          {group(tx("Hoje"), todays, false)}
          {group(tx("Anteriores em aberto"), earlierOpen, true)}
          {group(tx("Próximos dias"), upcoming, true)}
          {group(tx("Concluídas ou puladas"), earlierDone, true)}
        </>
      )}
      <Button variant="ghost" size="lg" className="self-start text-[13px]" onClick={() => setEditor({})}>
        {tx("+ Planejar com data, horário ou repetição")}
      </Button>
      {editor ? (
        <TaskEditorSheet
          key={editor.task?.id ?? editor.task?.local_date ?? "new"}
          open
          onOpenChange={(o) => !o && setEditor(null)}
          activities={[activity]}
          task={editor.task}
          defaults={{ activityId: activity.id, kind: "checklist", date: today }}
        />
      ) : null}
    </div>
  );
}
