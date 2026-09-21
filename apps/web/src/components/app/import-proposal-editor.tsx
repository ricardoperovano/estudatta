import { t as tx, intlLocale } from "@/i18n";
import * as React from "react";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { ArrowDown, ArrowUp, CaretDown, CaretRight, Plus, Sparkle, Trash } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import {
  AI_UNAVAILABLE_NOTE,
  aiReasonLabel,
  countEditor,
  editorProblem,
  fmtPages,
  fromEditor,
  isAiDisabledError,
  MAX_TITLE_CHARS,
  newEditorSubject,
  newEditorSubtopic,
  newEditorTopic,
  normalizeProposal,
  parsePages,
  toEditor,
  useAiStatus,
  useCancelImport,
  useConfirmImport,
  useSuggestStructure,
  useUpdateImport,
  type EditorSubject,
  type EditorSubtopic,
  type EditorTopic,
  type ImportConfirmOut,
  type ImportOut,
} from "@/api/imports";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Banner, Button, Card, Input, Tag, toast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Updater = (fn: (list: EditorSubject[]) => EditorSubject[]) => void;
type Dir = -1 | 1;

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString(intlLocale)} ${n === 1 ? one : many}`;

function moveBy<T extends { key: string }>(list: T[], key: string, dir: Dir): T[] {
  const i = list.findIndex((x) => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = list.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function mapSubject(
  list: EditorSubject[],
  sKey: string,
  fn: (s: EditorSubject) => EditorSubject,
): EditorSubject[] {
  return list.map((s) => (s.key === sKey ? fn(s) : s));
}

function mapTopic(
  list: EditorSubject[],
  sKey: string,
  tKey: string,
  fn: (t: EditorTopic) => EditorTopic,
): EditorSubject[] {
  return mapSubject(list, sKey, (s) => ({ ...s, topics: s.topics.map((t) => (t.key === tKey ? fn(t) : t)) }));
}

/** Acima disso a árvore abre só com a primeira matéria expandida (propostas longas de PDF). */
const COLLAPSE_THRESHOLD = 120;

interface EditorProps {
  job: ImportOut;
  activityName?: string | null;
  online: boolean;
  onConfirmed: (out: ImportConfirmOut) => void;
}

/**
 * Revisão editável da proposta de importação. Monte com `key={job.id}`: o estado nasce da proposta do job
 * e só volta ao servidor em "Salvar rascunho" ou "Confirmar e criar".
 */
export function ImportProposalEditor({ job, activityName, online, onConfirmed }: EditorProps) {
  const [subjects, setSubjects] = React.useState<EditorSubject[]>(() =>
    toEditor(normalizeProposal(job.proposal)),
  );
  const [dirty, setDirty] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => {
    if (countEditor(subjects).topics <= COLLAPSE_THRESHOLD) return new Set();
    return new Set(subjects.slice(1).map((s) => s.key));
  });
  const [askConfirm, setAskConfirm] = React.useState(false);
  const [askCancel, setAskCancel] = React.useState(false);
  const [askReplace, setAskReplace] = React.useState(false);
  const [aiOff, setAiOff] = React.useState(false);
  const [aiNote, setAiNote] = React.useState<string | null>(null);

  const ai = useAiStatus();
  const save = useUpdateImport();
  const confirm = useConfirmImport();
  const cancel = useCancelImport();
  const suggest = useSuggestStructure();

  const apply = React.useCallback<Updater>((fn) => {
    setSubjects(fn);
    setDirty(true);
  }, []);
  const toggle = React.useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const stats = normalizeProposal(job.proposal).stats ?? null;
  const counts = countEditor(subjects);
  const problem = editorProblem(subjects);
  const busy = save.isPending || confirm.isPending || cancel.isPending || suggest.isPending;
  const blocked = !online || busy;
  const proposal = () => fromEditor(subjects, stats);

  const onSave = () => {
    save.mutate(
      { id: job.id, proposal: proposal() },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success(tx("Rascunho salvo"), tx("Nada foi criado no seu plano ainda."));
        },
        onError: (e) => toast.error(tx("Não foi possível salvar o rascunho"), errorMessage(e)),
      },
    );
  };

  const onConfirm = () => {
    confirm.mutate(
      { id: job.id, proposal: proposal() },
      {
        onSuccess: (out) => {
          setAskConfirm(false);
          onConfirmed(out);
        },
        onError: () => setAskConfirm(false),
      },
    );
  };

  const onCancel = () => {
    cancel.mutate(job.id, {
      onSuccess: () => {
        setAskCancel(false);
        toast.info(tx("Importação cancelada"), tx("Nada do seu plano foi alterado."));
      },
      onError: (e) => {
        setAskCancel(false);
        toast.error(tx("Não foi possível cancelar"), errorMessage(e));
      },
    });
  };

  const runSuggest = () => {
    setAskReplace(false);
    suggest.mutate(
      { import_id: job.id },
      {
        onSuccess: (out) => {
          const next = toEditor(normalizeProposal(out.proposal));
          if (next.length === 0) {
            toast.info(tx("Nenhuma estrutura sugerida"), tx("A revisão continua como estava."));
            return;
          }
          setSubjects(next);
          setCollapsed(new Set());
          setDirty(true);
          setAiNote(
            out.truncated
              ? tx(
                  "Prévia sugerida a partir de parte do conteúdo (o texto era longo). Nada foi criado; revise e confirme.",
                )
              : tx("Prévia sugerida automaticamente. Nada foi criado; revise e confirme."),
          );
        },
        onError: (e) => {
          if (isAiDisabledError(e)) {
            setAiOff(true);
            toast.info(tx("Sugestão indisponível"), tx("Você pode organizar o conteúdo manualmente."));
          } else toast.error(tx("Não foi possível sugerir a estrutura"), errorMessage(e));
        },
      },
    );
  };

  const aiEnabled = !!ai.data?.enabled && !aiOff;
  const remaining = ai.data?.remaining_today ?? 0;
  const aiDisabledNote = aiEnabled
    ? null
    : aiOff
      ? AI_UNAVAILABLE_NOTE
      : ai.data
        ? (aiReasonLabel(ai.data.reason) ?? AI_UNAVAILABLE_NOTE)
        : null;
  const skipped = typeof stats?.skipped === "number" ? stats.skipped : 0;

  return (
    <div className="flex flex-col gap-[14px]">
      <Card className="gap-[10px] p-[14px] desktop:p-4" data-tour="importar-revisao">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="kicker">{tx("Revisão")}</span>
            <span className="text-[17px] font-medium leading-[1.2]">{tx("Confira antes de criar")}</span>
          </div>
          <Tag variant="pending">{tx("Aguardando revisão")}</Tag>
        </div>
        <p className="m-0 text-[13px] text-neutral-400">
          {tx(
            tx(
              "Edite títulos, páginas e minutos, reorganize ou remova linhas. Nada entra{{v0}} até você confirmar.",
            ),
            { v0: activityName ? " " + tx("em “{{v0}}”", { v0: activityName }) : tx("no objetivo") },
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="tnum">
            {plural(counts.subjects, tx("matéria"), tx("matérias"))} ·{" "}
            {plural(counts.topics, tx("tópico"), tx("tópicos"))}
          </span>
          {dirty ? <span className="text-[12px] text-pending">{tx("Edições ainda não salvas")}</span> : null}
        </div>
        {stats?.truncated === true ? (
          <span className="text-[12px] text-neutral-400">
            {tx("O conteúdo era longo: só a primeira parte virou proposta. Confira se falta algo.")}
          </span>
        ) : null}
        {skipped > 0 ? (
          <span className="tnum text-[12px] text-neutral-400">
            {tx("{{v0}} por não parecerem itens de conteúdo.", {
              v0: plural(skipped, tx("linha foi ignorada"), tx("linhas foram ignoradas")),
            })}
          </span>
        ) : null}
        {aiEnabled ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-tour="importar-ia">
            <Button
              variant="secondary"
              className="min-h-[44px]"
              loading={suggest.isPending}
              disabled={blocked || remaining <= 0}
              onClick={() => (dirty ? setAskReplace(true) : runSuggest())}
            >
              {suggest.isPending ? null : <Sparkle size={16} aria-hidden />}
              {tx("Sugerir estrutura")}
            </Button>
            <span className="tnum text-[12px] text-neutral-400">
              {remaining > 0
                ? tx("{{v0}} hoje{{v1}}. Só preenche esta revisão.", {
                    v0: plural(remaining, tx("sugestão restante"), tx("sugestões restantes")),
                    v1:
                      ai.data?.remaining_this_month != null
                        ? " " + tx("· {{v0}} no mês", { v0: ai.data.remaining_this_month })
                        : "",
                  })
                : (aiReasonLabel(ai.data?.reason) ?? tx("Você usou todas as sugestões de hoje."))}
            </span>
          </div>
        ) : ai.data?.reason === "ai_plan" && !aiOff ? (
          <PlanUpsell
            compact
            text={tx("A IA para organizar o conteúdo está nos planos Essencial e Completo.")}
          />
        ) : aiDisabledNote ? (
          <span className="text-[12px] text-neutral-500">{aiDisabledNote}</span>
        ) : null}
        {aiNote ? <span className="text-[12px] text-neutral-400">{aiNote}</span> : null}
      </Card>

      {subjects.length === 0 ? (
        <Card className="p-[14px] text-[13px] text-neutral-400">
          {tx("A proposta está vazia. Adicione uma matéria para começar.")}
        </Card>
      ) : (
        subjects.map((s, i) => (
          <SubjectBlock
            key={s.key}
            subject={s}
            index={i}
            total={subjects.length}
            collapsed={collapsed.has(s.key)}
            onToggle={toggle}
            apply={apply}
            disabled={busy}
          />
        ))
      )}

      <Button
        variant="secondary"
        className="min-h-[44px] self-start"
        disabled={busy}
        onClick={() => apply((list) => [...list, { ...newEditorSubject(), topics: [newEditorTopic()] }])}
      >
        <Plus size={16} aria-hidden />
        {tx("Adicionar matéria")}
      </Button>

      {confirm.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" onClick={() => setAskConfirm(true)} disabled={blocked || !!problem}>
              {tx("Tentar de novo")}
            </Button>
          }
        >
          {tx("{{v0}} Nada do seu plano foi alterado.", {
            v0: errorMessage(confirm.error, tx("Não foi possível criar o conteúdo.")),
          })}
        </Banner>
      ) : null}

      <Card
        elev="md"
        className="sticky bottom-[calc(var(--layout-bottom-nav-height)+8px)] z-10 gap-[10px] p-[14px] tablet:bottom-4"
      >
        {problem ? (
          <span role="alert" className="text-[13px] text-error">
            {problem}
          </span>
        ) : !online ? (
          <span className="text-[13px] text-neutral-400">
            {tx(
              "Sem conexão: salvar e confirmar voltam a funcionar quando a internet voltar. Suas edições continuam nesta tela.",
            )}
          </span>
        ) : (
          <span className="tnum text-[13px] text-neutral-400">
            {tx("Pronto para criar {{v0}} e {{v1}}.", {
              v0: plural(counts.subjects, tx("matéria"), tx("matérias")),
              v1: plural(counts.topics, tx("tópico"), tx("tópicos")),
            })}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            className="flex-1 tablet:flex-none"
            disabled={blocked || !!problem}
            onClick={() => setAskConfirm(true)}
          >
            {tx("Confirmar e criar")}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            loading={save.isPending}
            disabled={blocked || !!problem || !dirty}
            onClick={onSave}
          >
            {tx("Salvar rascunho")}
          </Button>
          <Button
            variant="ghost-muted"
            size="lg"
            className="px-2"
            disabled={blocked}
            onClick={() => setAskCancel(true)}
          >
            {tx("Cancelar importação")}
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={askConfirm}
        onOpenChange={setAskConfirm}
        title={tx("Criar este conteúdo?")}
        description={tx("Serão criados {{v0}} e {{v1}}{{v2}}. Você pode editar tudo depois no objetivo.", {
          v0: plural(counts.subjects, tx("matéria"), tx("matérias")),
          v1: plural(counts.topics, tx("tópico"), tx("tópicos")),
          v2: activityName ? " " + tx("em “{{v0}}”", { v0: activityName }) : "",
        })}
        confirmLabel={tx("Confirmar e criar")}
        cancelLabel={tx("Voltar à revisão")}
        loading={confirm.isPending}
        onConfirm={onConfirm}
      />
      <ConfirmDialog
        open={askCancel}
        onOpenChange={setAskCancel}
        title={tx("Cancelar esta importação?")}
        description={tx(
          "A proposta e as edições desta revisão serão descartadas. Nada do seu plano foi alterado.",
        )}
        confirmLabel={tx("Cancelar importação")}
        cancelLabel={tx("Continuar revisando")}
        danger
        loading={cancel.isPending}
        onConfirm={onCancel}
      />
      <ConfirmDialog
        open={askReplace}
        onOpenChange={setAskReplace}
        title={tx("Substituir o que você editou?")}
        description={tx(
          "A sugestão troca todo o conteúdo desta revisão, incluindo as suas edições. Nada é criado até você confirmar.",
        )}
        confirmLabel={tx("Substituir pela sugestão")}
        cancelLabel={tx("Manter minhas edições")}
        onConfirm={runSuggest}
      />
    </div>
  );
}

// --- Matéria ------------------------------------------------------------------------------

interface SubjectBlockProps {
  subject: EditorSubject;
  index: number;
  total: number;
  collapsed: boolean;
  onToggle: (key: string) => void;
  apply: Updater;
  disabled: boolean;
}

const SubjectBlock = React.memo(function SubjectBlock({
  subject,
  index,
  total,
  collapsed,
  onToggle,
  apply,
  disabled,
}: SubjectBlockProps) {
  const sKey = subject.key;
  const nTopics = subject.topics.reduce((n, t) => n + 1 + t.children.length, 0);
  const label = subject.title.trim() || tx("matéria {{v0}}", { v0: index + 1 });
  return (
    <Card
      as="section"
      aria-label={tx("Matéria: {{v0}}", { v0: label })}
      className="gap-[10px] p-[14px] desktop:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost-muted"
          size="icon"
          className="h-11 w-9 shrink-0"
          aria-expanded={!collapsed}
          aria-label={collapsed ? tx("Expandir {{v0}}", { v0: label }) : tx("Recolher {{v0}}", { v0: label })}
          onClick={() => onToggle(sKey)}
        >
          {collapsed ? <CaretRight size={16} aria-hidden /> : <CaretDown size={16} aria-hidden />}
        </Button>
        <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1">
          <span className="kicker">{tx("Matéria {{v0}}", { v0: index + 1 })}</span>
          <Input
            aria-label={tx("Título da matéria {{v0}}", { v0: index + 1 })}
            placeholder={tx("Nome da matéria")}
            value={subject.title}
            maxLength={MAX_TITLE_CHARS}
            invalid={!subject.title.trim()}
            disabled={disabled}
            className="text-[15px] font-medium"
            onChange={(e) =>
              apply((list) => mapSubject(list, sKey, (s) => ({ ...s, title: e.target.value })))
            }
          />
        </div>
        <RowActions
          label={label}
          canUp={index > 0}
          canDown={index < total - 1}
          disabled={disabled}
          onMove={(dir) => apply((list) => moveBy(list, sKey, dir))}
          onRemove={() => apply((list) => list.filter((s) => s.key !== sKey))}
        />
      </div>
      {collapsed ? (
        <span className="tnum pl-[44px] text-[12px] text-neutral-400">
          {tx("{{v0}} nesta matéria", { v0: plural(nTopics, tx("tópico"), tx("tópicos")) })}
        </span>
      ) : (
        <>
          {subject.topics.length === 0 ? (
            <span className="text-[12px] text-neutral-400">
              {tx("Sem tópicos. A matéria será criada vazia.")}
            </span>
          ) : null}
          <ul className="m-0 flex list-none flex-col p-0">
            {subject.topics.map((t, ti) => (
              <li
                key={t.key}
                className="flex flex-col gap-2 border-t border-divider py-[10px] first:border-t-0 first:pt-0"
              >
                <ItemRow
                  kind="tópico"
                  item={t}
                  disabled={disabled}
                  canUp={ti > 0}
                  canDown={ti < subject.topics.length - 1}
                  onChange={(patch) =>
                    apply((list) => mapTopic(list, sKey, t.key, (x) => ({ ...x, ...patch })))
                  }
                  onMove={(dir) =>
                    apply((list) =>
                      mapSubject(list, sKey, (s) => ({ ...s, topics: moveBy(s.topics, t.key, dir) })),
                    )
                  }
                  onRemove={() =>
                    apply((list) =>
                      mapSubject(list, sKey, (s) => ({
                        ...s,
                        topics: s.topics.filter((x) => x.key !== t.key),
                      })),
                    )
                  }
                />
                {t.children.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-2 border-l border-divider p-0 pl-3 tablet:ml-3">
                    {t.children.map((c, ci) => (
                      <li key={c.key}>
                        <ItemRow
                          kind="subtópico"
                          item={c}
                          disabled={disabled}
                          canUp={ci > 0}
                          canDown={ci < t.children.length - 1}
                          onChange={(patch) =>
                            apply((list) =>
                              mapTopic(list, sKey, t.key, (x) => ({
                                ...x,
                                children: x.children.map((y) => (y.key === c.key ? { ...y, ...patch } : y)),
                              })),
                            )
                          }
                          onMove={(dir) =>
                            apply((list) =>
                              mapTopic(list, sKey, t.key, (x) => ({
                                ...x,
                                children: moveBy(x.children, c.key, dir),
                              })),
                            )
                          }
                          onRemove={() =>
                            apply((list) =>
                              mapTopic(list, sKey, t.key, (x) => ({
                                ...x,
                                children: x.children.filter((y) => y.key !== c.key),
                              })),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px] self-start tablet:ml-3"
                  disabled={disabled}
                  onClick={() =>
                    apply((list) =>
                      mapTopic(list, sKey, t.key, (x) => ({
                        ...x,
                        children: [...x.children, newEditorSubtopic()],
                      })),
                    )
                  }
                >
                  <Plus size={14} aria-hidden />
                  {tx("Subtópico")}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            className="min-h-[44px] self-start"
            disabled={disabled}
            onClick={() =>
              apply((list) =>
                mapSubject(list, sKey, (s) => ({ ...s, topics: [...s.topics, newEditorTopic()] })),
              )
            }
          >
            <Plus size={16} aria-hidden />
            {tx("Adicionar tópico")}
          </Button>
        </>
      )}
    </Card>
  );
});

// --- Linha de tópico / subtópico -------------------------------------------------------------

interface ItemRowProps {
  kind: "tópico" | "subtópico";
  item: EditorSubtopic;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onChange: (patch: Partial<Pick<EditorSubtopic, "title" | "pages" | "estimated_minutes">>) => void;
  onMove: (dir: Dir) => void;
  onRemove: () => void;
}

function ItemRow({ kind, item, disabled, canUp, canDown, onChange, onMove, onRemove }: ItemRowProps) {
  const label = item.title.trim() || kind;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={tx("Título do {{v0}}", { v0: kind })}
        placeholder={kind === "tópico" ? tx("Título do tópico") : tx("Título do subtópico")}
        value={item.title}
        maxLength={MAX_TITLE_CHARS}
        invalid={!item.title.trim()}
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 basis-full tablet:basis-[220px]",
          kind === "subtópico" && "text-[13px]",
        )}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <Input
        aria-label={tx("Páginas de {{v0}}", { v0: label })}
        placeholder={tx("Págs. 12–30")}
        inputMode="numeric"
        value={item.pages}
        disabled={disabled}
        className="tnum w-[104px] shrink-0"
        onChange={(e) => onChange({ pages: e.target.value.slice(0, 16) })}
        onBlur={() => {
          const p = parsePages(item.pages);
          const clean = fmtPages(p.page, p.page_to);
          if (clean !== item.pages) onChange({ pages: clean });
        }}
      />
      <Input
        aria-label={tx("Minutos estimados de {{v0}}", { v0: label })}
        placeholder={tx("Min.")}
        inputMode="numeric"
        value={item.estimated_minutes ?? ""}
        disabled={disabled}
        className="tnum w-[68px] shrink-0"
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          const n = digits ? Math.min(6000, Number(digits)) : 0;
          onChange({ estimated_minutes: n >= 1 ? n : null });
        }}
      />
      <RowActions
        label={label}
        canUp={canUp}
        canDown={canDown}
        disabled={disabled}
        onMove={onMove}
        onRemove={onRemove}
      />
    </div>
  );
}

function RowActions({
  label,
  canUp,
  canDown,
  disabled,
  onMove,
  onRemove,
}: {
  label: string;
  canUp: boolean;
  canDown: boolean;
  disabled: boolean;
  onMove: (dir: Dir) => void;
  onRemove: () => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center">
      <Button
        variant="ghost-muted"
        size="icon"
        className="h-11 w-9"
        aria-label={tx("Mover {{v0}} para cima", { v0: label })}
        disabled={disabled || !canUp}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={16} aria-hidden />
      </Button>
      <Button
        variant="ghost-muted"
        size="icon"
        className="h-11 w-9"
        aria-label={tx("Mover {{v0}} para baixo", { v0: label })}
        disabled={disabled || !canDown}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={16} aria-hidden />
      </Button>
      <Button
        variant="ghost-muted"
        size="icon"
        className="h-11 w-9 hover:text-error"
        aria-label={tx("Remover {{v0}}", { v0: label })}
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash size={16} aria-hidden />
      </Button>
    </div>
  );
}
