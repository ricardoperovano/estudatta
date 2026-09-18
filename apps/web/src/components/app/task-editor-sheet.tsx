import * as React from "react";
import { Repeat } from "@phosphor-icons/react";
import { Banner, Button, DayPicker, Dialog, DialogContent, Field, Input, Seg, Select, Switch, Textarea, toast } from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useSubjects, flattenTopics } from "@/api/content";
import {
  useCreateSeries,
  useCreateTask,
  useDeleteSeries,
  useDeleteTask,
  useMaterializeOccurrence,
  useRescheduleTask,
  useSkipTask,
  useUpdateSeries,
  useUpdateTask,
  type Task,
} from "@/api/planning";
import type { Activity } from "@/api/types";
import { todayIso } from "@/lib/format";
import { ConfirmDialog } from "./confirm-dialog";
import { fmtPages, parsePages, weekdayMon } from "./week-utils";

export interface TaskDefaults {
  activityId?: string;
  date?: string;
  time?: string;
  kind?: "study" | "checklist";
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activities: Activity[];
  /** Tarefa existente (edição). Remonte o componente com `key` ao trocar. */
  task?: Task | null;
  defaults?: TaskDefaults;
}

const PRESETS = ["15", "30", "45", "60", "90"];

/**
 * Folha de tarefa/sessão planejada: criar, editar, reagendar (mesma tarefa), pular, excluir,
 * e séries semanais. Ocorrências virtuais de série viram tarefa real ao editar.
 */
export function TaskEditorSheet({ open, onOpenChange, activities, task, defaults }: Props) {
  const editing = !!task;
  const [activityId, setActivityId] = React.useState(task?.activity_id ?? defaults?.activityId ?? activities[0]?.id ?? "");
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [kind, setKind] = React.useState<"study" | "checklist">((task?.kind as "study" | "checklist") ?? defaults?.kind ?? "study");
  const [date, setDate] = React.useState(task?.local_date ?? defaults?.date ?? todayIso());
  const [time, setTime] = React.useState(task?.start_time?.slice(0, 5) ?? defaults?.time ?? "");
  const initialMinutes = task?.estimated_seconds ? String(Math.round(task.estimated_seconds / 60)) : kind === "study" ? "30" : "";
  const [preset, setPreset] = React.useState(PRESETS.includes(initialMinutes) ? initialMinutes : initialMinutes ? "outro" : "30");
  const [customMin, setCustomMin] = React.useState(PRESETS.includes(initialMinutes) ? "" : initialMinutes);
  const [subjectId, setSubjectId] = React.useState(task?.subject_id ?? "");
  const [topicId, setTopicId] = React.useState(task?.topic_id ?? "");
  const [pages, setPages] = React.useState(fmtPages(task?.page_from, task?.page_to)?.replace("p. ", "") ?? "");
  const [notes, setNotes] = React.useState(task?.notes ?? "");
  const [repeat, setRepeat] = React.useState(false);
  const [weekdays, setWeekdays] = React.useState<number[]>([weekdayMon(task?.local_date ?? defaults?.date ?? todayIso())]);
  const [repeatUntil, setRepeatUntil] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<null | "delete" | "end-series" | "delete-series">(null);

  const subjects = useSubjects(activityId || undefined);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const reschedule = useRescheduleTask();
  const deleteTask = useDeleteTask();
  const skipTask = useSkipTask();
  const materialize = useMaterializeOccurrence();
  const createSeries = useCreateSeries();
  const updateSeries = useUpdateSeries();
  const deleteSeries = useDeleteSeries();

  const busy = createTask.isPending || updateTask.isPending || reschedule.isPending || materialize.isPending || createSeries.isPending;
  const minutes = preset === "outro" ? Number(customMin) || 0 : Number(preset);
  const estimated = kind === "checklist" && !minutes ? null : minutes * 60;
  const subject = subjects.data?.find((s) => s.id === subjectId);
  const topics = flattenTopics(subject?.topics);

  const close = () => onOpenChange(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!activityId) return setError("Escolha um objetivo.");
    if (!title.trim()) return setError("Dê um nome à tarefa.");
    if (kind === "study" && minutes < 5) return setError("Sessões precisam de pelo menos 5 minutos.");
    const [pf, pt] = parsePages(pages);
    try {
      if (!editing) {
        if (repeat) {
          if (weekdays.length === 0) return setError("Escolha ao menos um dia da semana.");
          await createSeries.mutateAsync({
            activity_id: activityId,
            title: title.trim(),
            weekdays,
            start_date: date,
            end_date: repeatUntil || null,
            start_time: time || null,
            estimated_seconds: estimated,
            subject_id: subjectId || null,
            topic_id: topicId || null,
            kind,
          });
          toast.success("Série criada", "As ocorrências aparecem no plano da semana.");
        } else {
          await createTask.mutateAsync({
            activity_id: activityId,
            title: title.trim(),
            kind,
            local_date: date,
            start_time: time || null,
            estimated_seconds: estimated,
            subject_id: subjectId || null,
            topic_id: topicId || null,
            page_from: pf,
            page_to: pt,
            notes: notes || null,
            priority: 2,
            pinned: false,
          });
          toast.success(kind === "study" ? "Sessão planejada" : "Tarefa adicionada");
        }
        close();
        return;
      }
      // edição
      const t = task!;
      const dateChanged = date !== t.local_date || (time || null) !== (t.start_time?.slice(0, 5) ?? null);
      if (t.virtual && t.series_id) {
        const real = await materialize.mutateAsync({
          seriesId: t.series_id,
          date: t.local_date,
          body: { title: title.trim(), notes: notes || null, start_time: time || null, clear_start_time: !time, estimated_seconds: estimated },
        });
        if (dateChanged && real.id && date !== t.local_date) {
          await reschedule.mutateAsync({ id: real.id, body: { local_date: date, start_time: time || null, clear_start_time: !time } });
        }
      } else if (t.id) {
        await updateTask.mutateAsync({
          id: t.id,
          body: {
            title: title.trim(),
            kind,
            estimated_seconds: estimated,
            subject_id: subjectId || null,
            topic_id: topicId || null,
            page_from: pf,
            page_to: pt,
            notes: notes || null,
            clear_start_time: false,
            expected_version: t.version,
          },
        });
        if (dateChanged) {
          await reschedule.mutateAsync({ id: t.id, body: { local_date: date, start_time: time || null, clear_start_time: !time } });
        }
      }
      toast.success(dateChanged ? "Tarefa reagendada" : "Tarefa atualizada", dateChanged ? "É a mesma tarefa, só mudou de lugar." : undefined);
      close();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const doDelete = async () => {
    const t = task!;
    try {
      if (t.virtual && t.series_id) {
        await materialize.mutateAsync({ seriesId: t.series_id, date: t.local_date, body: { status: "skipped", clear_start_time: false } });
      } else if (t.id) {
        await deleteTask.mutateAsync(t.id);
      }
      toast.success("Tarefa removida");
      setConfirm(null);
      close();
    } catch (err) {
      setError(errorMessage(err));
      setConfirm(null);
    }
  };

  const doSkip = async () => {
    const t = task!;
    try {
      if (t.virtual && t.series_id) {
        await materialize.mutateAsync({ seriesId: t.series_id, date: t.local_date, body: { status: "skipped", clear_start_time: false } });
      } else if (t.id) {
        await skipTask.mutateAsync(t.id);
      }
      toast.info("Tarefa pulada", "Ela não conta como concluída nem como pendência.");
      close();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const doEndSeries = async () => {
    try {
      await updateSeries.mutateAsync({ id: task!.series_id!, body: { active: false, clear_end_date: false, clear_start_time: false } });
      toast.success("Série encerrada", "As ocorrências futuras deixam de aparecer.");
      setConfirm(null);
      close();
    } catch (err) {
      setError(errorMessage(err));
      setConfirm(null);
    }
  };

  const doDeleteSeries = async () => {
    try {
      await deleteSeries.mutateAsync(task!.series_id!);
      toast.success("Série excluída");
      setConfirm(null);
      close();
    } catch (err) {
      setError(errorMessage(err));
      setConfirm(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mode="sheet" title={editing ? "Editar tarefa" : "Nova tarefa"} description={editing ? "Mudar data ou horário reagenda a mesma tarefa." : "Uma sessão ocupa a meta do dia; uma tarefa é só um item para marcar."}>
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          {!editing && activities.length > 1 ? (
            <Field label="Objetivo" htmlFor="t-activity">
              <Select
                id="t-activity"
                value={activityId}
                onChange={(e) => {
                  setActivityId(e.target.value);
                  setSubjectId("");
                  setTopicId("");
                }}
              >
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Título" htmlFor="t-title">
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "study" ? "Listening · unidade 4" : "Revisar unidade 4"} maxLength={200} autoFocus={!editing} />
          </Field>
          <Seg
            block
            label="Tipo"
            value={kind}
            onChange={(v) => setKind(v)}
            options={[
              { value: "study", label: "Sessão de estudo" },
              { value: "checklist", label: "Tarefa" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Data" htmlFor="t-date">
              <Input id="t-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Horário (opcional)" htmlFor="t-time">
              <Input id="t-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label={kind === "study" ? "Duração estimada" : "Duração estimada (opcional)"}>
            <Seg block label="Duração" value={preset} onChange={setPreset} options={[...PRESETS.map((p) => ({ value: p, label: p })), { value: "outro", label: "Outro" }]} />
            {preset === "outro" ? <Input className="mt-2" type="number" inputMode="numeric" min={0} max={600} placeholder="Minutos" value={customMin} onChange={(e) => setCustomMin(e.target.value)} aria-label="Minutos" /> : null}
          </Field>
          {subjects.data && subjects.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Matéria (opcional)" htmlFor="t-subject">
                <Select
                  id="t-subject"
                  value={subjectId}
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setTopicId("");
                  }}
                >
                  <option value="">—</option>
                  {subjects.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tópico (opcional)" htmlFor="t-topic">
                <Select id="t-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!subjectId}>
                  <option value="">—</option>
                  {topics.map(({ topic, depth }) => (
                    <option key={topic.id} value={topic.id}>
                      {"· ".repeat(depth)}
                      {topic.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Páginas (opcional)" htmlFor="t-pages">
              <Input id="t-pages" placeholder="40–46" value={pages} onChange={(e) => setPages(e.target.value)} />
            </Field>
            <Field label="Observações (opcional)" htmlFor="t-notes">
              <Textarea id="t-notes" className="min-h-[44px]" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
          </div>
          {!editing ? (
            <div className="flex flex-col gap-3 rounded-md bg-canvas p-3">
              <label className="flex items-center justify-between gap-3 text-[14px]">
                <span className="flex items-center gap-2">
                  <Repeat size={16} aria-hidden /> Repetir toda semana
                </span>
                <Switch checked={repeat} onCheckedChange={setRepeat} label="Repetir toda semana" />
              </label>
              {repeat ? (
                <>
                  <DayPicker value={weekdays} onChange={setWeekdays} />
                  <Field label="Até (opcional)" htmlFor="t-until">
                    <Input id="t-until" type="date" min={date} value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
                  </Field>
                </>
              ) : null}
            </div>
          ) : null}
          {editing && task?.series_id ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-canvas p-3 text-[13px] text-neutral-400">
              <span className="flex items-center gap-2">
                <Repeat size={14} aria-hidden /> Parte de uma série semanal
              </span>
              <span className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm("end-series")}>
                  Encerrar série
                </Button>
                <Button type="button" variant="ghost-muted" size="sm" onClick={() => setConfirm("delete-series")}>
                  Excluir série
                </Button>
              </span>
            </div>
          ) : null}
          <Button type="submit" size="xl" block loading={busy}>
            {editing ? "Salvar" : repeat ? "Criar série" : kind === "study" ? "Planejar sessão" : "Adicionar tarefa"}
          </Button>
          {editing ? (
            <div className="flex justify-between">
              {task?.status === "planned" ? (
                <Button type="button" variant="ghost-muted" size="sm" onClick={doSkip} disabled={skipTask.isPending}>
                  Pular esta tarefa
                </Button>
              ) : (
                <span />
              )}
              <Button type="button" variant="ghost-muted" size="sm" className="text-error" onClick={() => setConfirm("delete")}>
                Excluir
              </Button>
            </div>
          ) : null}
        </form>
      </DialogContent>
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Excluir esta tarefa?"
        description="Ela sai do plano. Tempo já registrado não muda."
        confirmLabel="Excluir"
        danger
        loading={deleteTask.isPending || materialize.isPending}
        onConfirm={doDelete}
      />
      <ConfirmDialog
        open={confirm === "end-series"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Encerrar a série?"
        description="As ocorrências futuras deixam de aparecer. As já concluídas continuam no histórico."
        confirmLabel="Encerrar"
        loading={updateSeries.isPending}
        onConfirm={doEndSeries}
      />
      <ConfirmDialog
        open={confirm === "delete-series"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Excluir a série inteira?"
        description="Todas as ocorrências planejadas são removidas. Tempo já registrado não muda."
        confirmLabel="Excluir série"
        danger
        loading={deleteSeries.isPending}
        onConfirm={doDeleteSeries}
      />
    </Dialog>
  );
}
