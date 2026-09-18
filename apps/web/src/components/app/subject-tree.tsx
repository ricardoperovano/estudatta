import * as React from "react";
import { ArrowDown, ArrowUp, CheckCircle, Circle, CircleHalf, PencilSimple, Plus } from "@phosphor-icons/react";
import { Banner, Bar, Button, Card, Dialog, DialogContent, EmptyState, Field, Input, Seg, Select, Spinner, Tag, Textarea, toast } from "@/components/ui";
import { errorMessage } from "@/api/client";
import {
  flattenTopics,
  useContentProgress,
  useCreateSubject,
  useCreateTopic,
  useDeleteSubject,
  useDeleteTopic,
  useReorderSubjects,
  useReorderTopics,
  useSubjects,
  useUpdateSubject,
  useUpdateTopic,
  type Subject,
  type Topic,
} from "@/api/content";
import { fmtMinutes } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { fmtPages, materialKindLabel } from "./week-utils";

type TopicStatus = "not_started" | "in_progress" | "done";
const NEXT_STATUS: Record<TopicStatus, TopicStatus> = { not_started: "in_progress", in_progress: "done", done: "not_started" };
const STATUS_LABEL: Record<TopicStatus, string> = { not_started: "não iniciado", in_progress: "em andamento", done: "concluído" };

/**
 * Árvore de matérias e tópicos (06 / 03): recuo 16px por nível, tags de material por tópico,
 * estado do tópico (não iniciado · em andamento · concluído) e progresso de conteúdo separado do tempo.
 */
export function SubjectTree({ activityId }: { activityId: string }) {
  const online = useOnline();
  const subjects = useSubjects(activityId);
  const progress = useContentProgress(activityId);
  const [subjectSheet, setSubjectSheet] = React.useState<{ subject?: Subject } | null>(null);
  const [topicSheet, setTopicSheet] = React.useState<{ subject: Subject; topic?: Topic; parentId?: string | null } | null>(null);

  if (subjects.isPending) {
    return (
      <div className="flex justify-center py-10" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (subjects.isError) {
    return (
      <Banner kind="error" actions={<Button size="sm" variant="secondary" onClick={() => subjects.refetch()}>Tentar de novo</Button>}>
        {online ? "Não foi possível carregar as matérias." : "Sem conexão: as matérias aparecem quando você voltar à internet."}
      </Banner>
    );
  }
  const list = subjects.data;
  const p = progress.data;

  return (
    <div className="flex flex-col gap-[6px] text-[14px]">
      {p && p.topics_total > 0 ? (
        <Card className="gap-2 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="kicker">Progresso de conteúdo</span>
            <span className="tnum text-[12px] text-neutral-400">
              {p.topics_done} de {p.topics_total} tópicos · {Math.round(p.percent_done)}%
            </span>
          </div>
          <Bar value={p.percent_done / 100} color="accent-600" height={6} label={`${p.topics_done} de ${p.topics_total} tópicos concluídos`} />
          <span className="text-[11px] text-neutral-500">Conteúdo é diferente de tempo: concluir um tópico não registra minutos.</span>
        </Card>
      ) : null}

      {list.length === 0 ? (
        <EmptyState title="Nenhuma matéria ainda." description="Organize o objetivo em matérias e tópicos para vincular materiais e acompanhar o conteúdo." action={<Button variant="primary" onClick={() => setSubjectSheet({})}>+ Adicionar matéria</Button>} />
      ) : (
        list.map((s, idx) => (
          <SubjectCard
            key={s.id}
            subject={s}
            index={idx}
            total={list.length}
            activityId={activityId}
            onEdit={() => setSubjectSheet({ subject: s })}
            onAddTopic={(parentId) => setTopicSheet({ subject: s, parentId })}
            onEditTopic={(t) => setTopicSheet({ subject: s, topic: t })}
          />
        ))
      )}
      {list.length > 0 ? (
        <Button variant="secondary" size="lg" onClick={() => setSubjectSheet({})}>
          + Adicionar matéria
        </Button>
      ) : null}

      {subjectSheet ? <SubjectSheet key={subjectSheet.subject?.id ?? "new"} activityId={activityId} subject={subjectSheet.subject} subjects={list} open onOpenChange={(o) => !o && setSubjectSheet(null)} /> : null}
      {topicSheet ? <TopicSheet key={topicSheet.topic?.id ?? `new-${topicSheet.subject.id}`} activityId={activityId} subject={topicSheet.subject} topic={topicSheet.topic} parentId={topicSheet.parentId} open onOpenChange={(o) => !o && setTopicSheet(null)} /> : null}
    </div>
  );
}

function SubjectCard({ subject, index, total, activityId, onEdit, onAddTopic, onEditTopic }: { subject: Subject; index: number; total: number; activityId: string; onEdit: () => void; onAddTopic: (parentId?: string | null) => void; onEditTopic: (t: Topic) => void }) {
  const update = useUpdateTopic(activityId);
  const rows = flattenTopics(subject.topics);
  const cycle = async (t: Topic) => {
    const next = NEXT_STATUS[(t.status as TopicStatus) ?? "not_started"] ?? "in_progress";
    try {
      await update.mutateAsync({ id: t.id, body: { status: next, clear_parent: false } });
      if (next === "done") toast.success(`"${t.title}" concluído`, "O tempo registrado não muda.");
    } catch (err) {
      toast.error("Não foi possível atualizar o tópico", errorMessage(err));
    }
  };
  return (
    <Card className={cn("gap-2 p-3", rows.length === 0 && "gap-1")}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="flex min-h-[32px] flex-1 items-center gap-2 text-left font-medium" onClick={onEdit} aria-label={`Editar matéria ${subject.title}`}>
          {subject.title}
          <PencilSimple size={14} className="text-neutral-500" aria-hidden />
        </button>
        <span className="tnum shrink-0 text-[12px] text-neutral-400">
          {subject.topics_total} {subject.topics_total === 1 ? "tópico" : "tópicos"}
          {subject.logged_seconds > 0 ? ` · ${fmtMinutes(subject.logged_seconds)}` : ""}
        </span>
      </div>
      {rows.map(({ topic, depth }) => {
        const st = (topic.status as TopicStatus) ?? "not_started";
        const Icon = st === "done" ? CheckCircle : st === "in_progress" ? CircleHalf : Circle;
        const mats = topic.materials ?? [];
        return (
          <div key={topic.id} className={cn("flex items-center justify-between gap-2", st === "done" && "text-neutral-400")} style={{ paddingLeft: 12 + depth * 16 }}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", st === "done" ? "text-accent" : st === "in_progress" ? "text-accent" : "text-neutral-500", "hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]")}
                aria-label={`${topic.title}: ${STATUS_LABEL[st]}. Marcar como ${STATUS_LABEL[NEXT_STATUS[st]]}`}
                onClick={() => cycle(topic)}
                disabled={update.isPending}
              >
                <Icon size={18} weight={st === "done" ? "fill" : "regular"} aria-hidden />
              </button>
              <button type="button" className="min-w-0 flex-1 truncate py-1 text-left" onClick={() => onEditTopic(topic)}>
                {topic.title}
              </button>
            </div>
            {mats.length > 0 ? (
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {mats.slice(0, 2).map((m) => (
                  <Tag key={m.id} variant="neutral">
                    {materialKindLabel(m.kind)}
                    {fmtPages(m.page_from, m.page_to) ? ` · ${fmtPages(m.page_from, m.page_to)}` : ""}
                  </Tag>
                ))}
                {mats.length > 2 ? <Tag variant="neutral">+{mats.length - 2}</Tag> : null}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] text-neutral-400">{topic.estimated_minutes ? `${topic.estimated_minutes} min` : "sem material"}</span>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between pl-3">
        <Button variant="ghost" size="sm" onClick={() => onAddTopic(null)}>
          <Plus size={14} aria-hidden /> Adicionar tópico
        </Button>
        <span className="sr-only">
          Matéria {index + 1} de {total}
        </span>
      </div>
    </Card>
  );
}

function SubjectSheet({ activityId, subject, subjects, open, onOpenChange }: { activityId: string; subject?: Subject; subjects: Subject[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = React.useState(subject?.title ?? "");
  const [description, setDescription] = React.useState(subject?.description ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const create = useCreateSubject(activityId);
  const update = useUpdateSubject(activityId);
  const remove = useDeleteSubject(activityId);
  const reorder = useReorderSubjects(activityId);
  const idx = subject ? subjects.findIndex((s) => s.id === subject.id) : -1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Dê um nome à matéria.");
    try {
      if (subject) await update.mutateAsync({ id: subject.id, body: { title: title.trim(), description: description || null } });
      else await create.mutateAsync({ title: title.trim(), description: description || null });
      toast.success(subject ? "Matéria atualizada" : "Matéria adicionada");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const move = async (dir: -1 | 1) => {
    if (!subject) return;
    const ids = subjects.map((s) => s.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try {
      await reorder.mutateAsync(ids);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mode="sheet" title={subject ? "Editar matéria" : "Nova matéria"}>
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          <Field label="Nome" htmlFor="s-title">
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gramática" maxLength={200} autoFocus />
          </Field>
          <Field label="Descrição (opcional)" htmlFor="s-desc">
            <Textarea id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </Field>
          <Button type="submit" size="xl" block loading={create.isPending || update.isPending}>
            Salvar
          </Button>
          {subject ? (
            <div className="flex items-center justify-between">
              <span className="flex gap-1">
                <Button type="button" variant="secondary" size="icon" aria-label="Mover para cima" disabled={idx <= 0 || reorder.isPending} onClick={() => move(-1)}>
                  <ArrowUp size={16} />
                </Button>
                <Button type="button" variant="secondary" size="icon" aria-label="Mover para baixo" disabled={idx < 0 || idx >= subjects.length - 1 || reorder.isPending} onClick={() => move(1)}>
                  <ArrowDown size={16} />
                </Button>
              </span>
              <Button type="button" variant="ghost-muted" size="sm" className="text-error" onClick={() => setConfirmDelete(true)}>
                Excluir matéria
              </Button>
            </div>
          ) : null}
        </form>
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir "${subject?.title}"?`}
        description="Os tópicos e vínculos com materiais desta matéria são removidos. O tempo registrado continua no objetivo."
        confirmLabel="Excluir"
        danger
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(subject!.id);
            toast.success("Matéria excluída");
            setConfirmDelete(false);
            onOpenChange(false);
          } catch (err) {
            setError(errorMessage(err));
            setConfirmDelete(false);
          }
        }}
      />
    </Dialog>
  );
}

function TopicSheet({ activityId, subject, topic, parentId, open, onOpenChange }: { activityId: string; subject: Subject; topic?: Topic; parentId?: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = React.useState(topic?.title ?? "");
  const [description, setDescription] = React.useState(topic?.description ?? "");
  const [minutes, setMinutes] = React.useState(topic?.estimated_minutes ? String(topic.estimated_minutes) : "");
  const [status, setStatus] = React.useState<TopicStatus>((topic?.status as TopicStatus) ?? "not_started");
  const [parent, setParent] = React.useState<string>(topic?.parent_id ?? parentId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const create = useCreateTopic(activityId);
  const update = useUpdateTopic(activityId);
  const remove = useDeleteTopic(activityId);
  const reorder = useReorderTopics(activityId);

  const all = flattenTopics(subject.topics);
  const parentOptions = all.filter(({ topic: t }) => t.id !== topic?.id && (!topic || !isDescendant(topic, t.id)));
  const siblings = (topic ? findSiblings(subject.topics ?? [], topic) : []).map((t) => t.id);
  const idx = topic ? siblings.indexOf(topic.id) : -1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Dê um nome ao tópico.");
    const est = minutes ? Number(minutes) : null;
    try {
      if (topic) {
        await update.mutateAsync({
          id: topic.id,
          body: { title: title.trim(), description: description || null, estimated_minutes: est, status, parent_id: parent || null, clear_parent: !parent && !!topic.parent_id },
        });
      } else {
        await create.mutateAsync({ subjectId: subject.id, body: { title: title.trim(), description: description || null, parent_id: parent || null, estimated_minutes: est } });
      }
      toast.success(topic ? "Tópico atualizado" : "Tópico adicionado");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const move = async (dir: -1 | 1) => {
    if (!topic) return;
    const ids = [...siblings];
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try {
      await reorder.mutateAsync({ subjectId: subject.id, parentId: topic.parent_id, orderedIds: ids });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mode="sheet" title={topic ? "Editar tópico" : "Novo tópico"} description={`Matéria: ${subject.title}`}>
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          <Field label="Nome" htmlFor="t-title">
            <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Present perfect" maxLength={200} autoFocus />
          </Field>
          {topic ? (
            <Field label="Estado" hint="Concluir um tópico não registra minutos.">
              <Seg
                block
                label="Estado do tópico"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "not_started", label: "Não iniciado" },
                  { value: "in_progress", label: "Em andamento" },
                  { value: "done", label: "Concluído" },
                ]}
              />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Estimativa (min, opcional)" htmlFor="t-min">
              <Input id="t-min" type="number" inputMode="numeric" min={0} max={6000} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
            <Field label="Dentro de (opcional)" htmlFor="t-parent">
              <Select id="t-parent" value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">— nível principal —</option>
                {parentOptions.map(({ topic: t, depth }) => (
                  <option key={t.id} value={t.id}>
                    {"· ".repeat(depth)}
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Descrição (opcional)" htmlFor="t-desc">
            <Textarea id="t-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </Field>
          {topic && topic.materials && topic.materials.length > 0 ? (
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="kicker">Materiais vinculados</span>
              {topic.materials.map((m) => (
                <span key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{m.title}</span>
                  <Tag variant="neutral">
                    {materialKindLabel(m.kind)}
                    {fmtPages(m.page_from, m.page_to) ? ` · ${fmtPages(m.page_from, m.page_to)}` : ""}
                  </Tag>
                </span>
              ))}
              <span className="text-[12px] text-neutral-500">Vincule ou desvincule na aba Materiais.</span>
            </div>
          ) : null}
          <Button type="submit" size="xl" block loading={create.isPending || update.isPending}>
            {topic ? "Salvar" : "Adicionar tópico"}
          </Button>
          {topic ? (
            <div className="flex items-center justify-between">
              <span className="flex gap-1">
                <Button type="button" variant="secondary" size="icon" aria-label="Mover para cima" disabled={idx <= 0 || reorder.isPending} onClick={() => move(-1)}>
                  <ArrowUp size={16} />
                </Button>
                <Button type="button" variant="secondary" size="icon" aria-label="Mover para baixo" disabled={idx < 0 || idx >= siblings.length - 1 || reorder.isPending} onClick={() => move(1)}>
                  <ArrowDown size={16} />
                </Button>
              </span>
              <Button type="button" variant="ghost-muted" size="sm" className="text-error" onClick={() => setConfirmDelete(true)}>
                Excluir tópico
              </Button>
            </div>
          ) : null}
        </form>
      </DialogContent>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir "${topic?.title}"?`}
        description="Subtópicos e vínculos com materiais são removidos. Tempo registrado não muda."
        confirmLabel="Excluir"
        danger
        loading={remove.isPending}
        onConfirm={async () => {
          try {
            await remove.mutateAsync(topic!.id);
            toast.success("Tópico excluído");
            setConfirmDelete(false);
            onOpenChange(false);
          } catch (err) {
            setError(errorMessage(err));
            setConfirmDelete(false);
          }
        }}
      />
    </Dialog>
  );
}

function isDescendant(root: Topic, id: string): boolean {
  return (root.topics ?? []).some((c) => c.id === id || isDescendant(c, id));
}

function findSiblings(topics: Topic[], target: Topic): Topic[] {
  if (topics.some((t) => t.id === target.id)) return topics;
  for (const t of topics) {
    const r = findSiblings(t.topics ?? [], target);
    if (r.length) return r;
  }
  return [];
}
