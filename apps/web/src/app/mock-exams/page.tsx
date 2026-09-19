import * as React from "react";
import { Link, useParams } from "react-router";
import { CaretLeft, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { ApiError, errorMessage } from "@/api/client";
import { useActivity } from "@/api/queries";
import { useSubjects, type Subject } from "@/api/content";
import { useDeleteMockExam, useMockExams, useSaveMockExam, type MockExam, type MockExamIn, type MockOverview } from "@/api/study";
import { Bar, Button, Card, Dialog, DialogActions, DialogContent, EmptyState, Field, Input, Seg, Select, Spinner, Tag, Textarea, toast } from "@/components/ui";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { fmtPct } from "@/components/app/revisions-utils";
import { fmtDayShort, todayIso } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

/** Simulados do objetivo: último, melhor, variação, evolução, matérias mais fracas e histórico editável. */
export default function MockExamsPage() {
  const { id = "" } = useParams();
  const online = useOnline();
  const activity = useActivity(id);
  const mocks = useMockExams(id);
  const [editing, setEditing] = React.useState<MockExam | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<MockExam | null>(null);
  const del = useDeleteMockExam();

  const remove = async () => {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Simulado excluído");
      setDeleting(null);
    } catch (e) {
      toast.error("Não foi possível excluir", errorMessage(e));
    }
  };

  const notFound = activity.error instanceof ApiError && activity.error.status === 404;
  const actTitle = activity.data?.title;

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <Link to={`/app/objetivos/${id}`} className="inline-flex min-h-[32px] items-center gap-1 self-start text-[13px] text-neutral-400 no-underline hover:text-primary">
        <CaretLeft size={14} aria-hidden /> {actTitle ?? "Objetivo"}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="kicker-accent">Simulados{actTitle ? ` · ${actTitle}` : ""}</span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Simulados</h1>
        </div>
        {mocks.data && mocks.data.count > 0 ? (
          <Button variant="primary" size="lg" onClick={() => setEditing("new")}>
            <Plus size={16} aria-hidden /> Novo simulado
          </Button>
        ) : null}
      </header>

      {notFound ? (
        <EmptyState
          title="Objetivo não encontrado."
          description="Ele pode ter sido excluído."
          action={
            <Button asChild>
              <Link to="/app/objetivos">Ver objetivos</Link>
            </Button>
          }
        />
      ) : mocks.isPending ? (
        <div className="flex justify-center py-20" role="status" aria-label="Carregando simulados">
          <Spinner className="h-6 w-6" />
        </div>
      ) : mocks.isError || !mocks.data ? (
        <EmptyState
          title="Não foi possível carregar os simulados."
          description={online ? "Tente de novo em instantes." : "Sem conexão: os simulados aparecem quando você voltar à internet."}
          action={<Button onClick={() => void mocks.refetch()}>Tentar de novo</Button>}
        />
      ) : mocks.data.count === 0 ? (
        <EmptyState
          title="Nenhum simulado registrado."
          description="Anote o resultado de cada simulado, no total ou por matéria, para acompanhar a evolução e descobrir as matérias mais fracas."
          action={
            <Button variant="primary" size="lg" onClick={() => setEditing("new")}>
              Registrar simulado
            </Button>
          }
        />
      ) : (
        <Overview data={mocks.data} onEdit={setEditing} onDelete={setDeleting} />
      )}

      {editing ? <ExamDialog activityId={id} exam={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Excluir simulado?"
        description={deleting ? `"${deleting.title}" de ${fmtDayShort(deleting.taken_on)} sai do histórico e das médias por matéria. Não dá para desfazer.` : undefined}
        confirmLabel="Excluir"
        danger
        loading={del.isPending}
        onConfirm={remove}
      />
    </div>
  );
}

// ---------------------------------------------------------------- visão geral

function Overview({ data, onEdit, onDelete }: { data: MockOverview; onEdit: (e: MockExam) => void; onDelete: (e: MockExam) => void }) {
  const exams = data.exams; // mais antigo primeiro (ordem do servidor)
  const newestFirst = [...exams].reverse();
  const last = exams[exams.length - 1];
  const change = data.change_from_previous;

  return (
    <>
      <div className="tnum grid grid-cols-3 gap-[10px] desktop:gap-4">
        <Stat label="Último" value={data.last_percent != null ? fmtPct(data.last_percent) : "—"} hint={last ? `${last.correct} de ${last.total_questions}` : undefined} />
        <Stat label="Melhor" value={data.best_percent != null ? fmtPct(data.best_percent) : "—"} hint={`${data.count} ${data.count === 1 ? "simulado" : "simulados"}`} />
        <Stat
          label="Vs. anterior"
          value={change != null ? fmtPP(change) : "—"}
          tone={change == null || change === 0 ? undefined : change > 0 ? "success" : "error"}
          hint={change == null ? "a partir do 2º" : change > 0 ? "melhorou" : change < 0 ? "caiu" : "igual"}
        />
      </div>

      <Card elev="sm" className="gap-3 p-4">
        <span className="kicker">Evolução</span>
        {exams.length < 2 ? (
          <p className="text-[13px] text-neutral-400">A evolução aparece a partir do segundo simulado.</p>
        ) : (
          <EvolutionChart exams={exams} />
        )}
      </Card>

      {data.subjects.length > 0 ? (
        <Card elev="sm" className="gap-3 p-4">
          <span className="kicker">Por matéria · mais fracas primeiro</span>
          <div className="overflow-x-auto">
            <table className="tnum w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-tertiary">
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Matéria
                  </th>
                  <th scope="col" className="py-1 pr-3 font-normal">
                    Acertos
                  </th>
                  <th scope="col" className="w-[35%] py-1 pr-3 font-normal">
                    Geral
                  </th>
                  <th scope="col" className="py-1 font-normal">
                    Último
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((s) => (
                  <tr key={s.subject_id ?? s.subject_title} className="border-t border-divider">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {s.subject_title}
                    </th>
                    <td className="py-2 pr-3 text-neutral-400">
                      {s.correct}/{s.total}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0">{s.percent != null ? fmtPct(s.percent) : "—"}</span>
                        <Bar value={(s.percent ?? 0) / 100} color={(s.percent ?? 0) >= 70 ? "success" : (s.percent ?? 0) >= 50 ? "accent" : "pending"} className="flex-1" label={`${s.subject_title}: ${s.percent ?? 0}% de acertos`} />
                      </div>
                    </td>
                    <td className="py-2">{s.last_percent != null ? fmtPct(s.last_percent) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <p className="text-[13px] text-neutral-400">Registre os acertos por matéria para ver quais estão mais fracas.</p>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="mock-history">
        <h2 id="mock-history" className="kicker font-normal">
          Histórico
        </h2>
        <ul className="flex flex-col gap-2">
          {newestFirst.map((e) => (
            <li key={e.id}>
              <Card elev="sm" className="flex-row flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">{e.title}</span>
                  <span className="text-[12px] text-neutral-400">
                    {[fmtDayShort(e.taken_on), `${e.correct} de ${e.total_questions} questões`, e.duration_minutes ? `${e.duration_minutes} min` : null, e.subjects.length ? `${e.subjects.length} ${e.subjects.length === 1 ? "matéria" : "matérias"}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {e.notes ? <span className="text-[12px] text-neutral-400">{e.notes}</span> : null}
                </div>
                <div className="flex items-center gap-1">
                  <Tag variant="neutral" className="tnum mr-1">
                    {e.percent != null ? fmtPct(e.percent) : "—"}
                  </Tag>
                  <Button variant="ghost-muted" size="icon" onClick={() => onEdit(e)} aria-label={`Editar ${e.title} de ${fmtDayShort(e.taken_on)}`}>
                    <PencilSimple size={16} aria-hidden />
                  </Button>
                  <Button variant="ghost-muted" size="icon" onClick={() => onDelete(e)} aria-label={`Excluir ${e.title} de ${fmtDayShort(e.taken_on)}`}>
                    <Trash size={16} aria-hidden />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "success" | "error" }) {
  return (
    <Card elev="sm" className="gap-0.5 p-3 desktop:p-4">
      <span className="text-[12px] text-neutral-400">{label}</span>
      <span className={cn("text-[20px] font-medium desktop:text-[25px]", tone === "success" && "text-success", tone === "error" && "text-error")}>{value}</span>
      {hint ? <span className="text-[11px] text-neutral-500">{hint}</span> : null}
    </Card>
  );
}

/** "+3,2 p.p." */
function fmtPP(v: number): string {
  const abs = Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${abs} p.p.`;
}

/** Linha simples do percentual de acertos ao longo dos simulados (SVG, sem dependências). */
function EvolutionChart({ exams }: { exams: MockExam[] }) {
  const W = 600;
  const H = 180;
  const pad = { l: 34, r: 12, t: 12, b: 24 };
  const pts = exams.map((e, i) => {
    const pct = e.percent ?? (e.total_questions ? (100 * e.correct) / e.total_questions : 0);
    const x = pad.l + (exams.length === 1 ? 0 : (i * (W - pad.l - pad.r)) / (exams.length - 1));
    const y = pad.t + ((100 - pct) * (H - pad.t - pad.b)) / 100;
    return { x, y, pct, exam: e };
  });
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const first = pts[0];
  const lastP = pts[pts.length - 1];
  const summary = `Acertos por simulado, do mais antigo ao mais recente: ${pts.map((p) => fmtPct(Math.round(p.pct * 10) / 10)).join(", ")}.`;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto h-auto w-full max-w-[720px]" role="img" aria-label={summary}>
        {[0, 50, 100].map((g) => {
          const y = pad.t + ((100 - g) * (H - pad.t - pad.b)) / 100;
          return (
            <g key={g}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--color-divider)" strokeWidth={1} strokeDasharray={g === 0 ? undefined : "3 4"} />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--color-text-tertiary)">
                {g}%
              </text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="var(--color-progress-fill)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <circle key={p.exam.id} cx={p.x} cy={p.y} r={4} fill="var(--color-bg-surface)" stroke="var(--color-progress-fill)" strokeWidth={2}>
            <title>{`${p.exam.title} · ${fmtDayShort(p.exam.taken_on)} · ${fmtPct(Math.round(p.pct * 10) / 10)}`}</title>
          </circle>
        ))}
        <text x={first.x} y={H - 6} fontSize={11} fill="var(--color-text-tertiary)">
          {fmtDayShort(first.exam.taken_on)}
        </text>
        <text x={lastP.x} y={H - 6} textAnchor="end" fontSize={11} fill="var(--color-text-tertiary)">
          {fmtDayShort(lastP.exam.taken_on)}
        </text>
      </svg>
      <details className="text-[13px]">
        <summary className="cursor-pointer text-neutral-400 hover:text-primary">Ver como tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tnum w-full text-left text-[13px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.1em] text-tertiary">
                <th scope="col" className="py-1 pr-3 font-normal">
                  Data
                </th>
                <th scope="col" className="py-1 pr-3 font-normal">
                  Simulado
                </th>
                <th scope="col" className="py-1 font-normal">
                  Acertos
                </th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.exam.id} className="border-t border-divider">
                  <td className="py-1 pr-3">{fmtDayShort(p.exam.taken_on)}</td>
                  <td className="py-1 pr-3">{p.exam.title}</td>
                  <td className="py-1">{fmtPct(Math.round(p.pct * 10) / 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

// ---------------------------------------------------------------- criar / editar

const OTHER = "__outra";

interface RowState {
  key: number;
  subjectId: string; // "" = escolher, OTHER = texto livre
  title: string;
  total: string;
  correct: string;
}

type Mode = "total" | "materias";

function rowsFrom(exam: MockExam | null): RowState[] {
  if (!exam || exam.subjects.length === 0) return [{ key: 1, subjectId: "", title: "", total: "", correct: "" }];
  return exam.subjects.map((s, i) => ({
    key: i + 1,
    subjectId: s.subject_id ?? OTHER,
    title: s.subject_id ? "" : s.subject_title,
    total: String(s.total),
    correct: String(s.correct),
  }));
}

const toInt = (v: string): number | null => (v.trim() === "" || !/^\d+$/.test(v.trim()) ? null : Number(v.trim()));

function ExamDialog({ activityId, exam, onClose }: { activityId: string; exam: MockExam | null; onClose: () => void }) {
  const save = useSaveMockExam(activityId);
  const subjects = useSubjects(activityId);
  const uid = React.useId();
  const [title, setTitle] = React.useState(exam?.title ?? "Simulado");
  const [takenOn, setTakenOn] = React.useState(exam?.taken_on ?? todayIso());
  const [mode, setMode] = React.useState<Mode>(exam && exam.subjects.length > 0 ? "materias" : "total");
  const [total, setTotal] = React.useState(exam && exam.subjects.length === 0 ? String(exam.total_questions) : "");
  const [correct, setCorrect] = React.useState(exam && exam.subjects.length === 0 ? String(exam.correct) : "");
  const [rows, setRows] = React.useState<RowState[]>(() => rowsFrom(exam));
  const [duration, setDuration] = React.useState(exam?.duration_minutes ? String(exam.duration_minutes) : "");
  const [notes, setNotes] = React.useState(exam?.notes ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const subjectList: Subject[] = subjects.data ?? [];
  const setRow = (key: number, patch: Partial<RowState>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: Math.max(0, ...rs.map((r) => r.key)) + 1, subjectId: "", title: "", total: "", correct: "" }]);
  const removeRow = (key: number) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  const rowTotals = rows.reduce((acc, r) => ({ total: acc.total + (toInt(r.total) ?? 0), correct: acc.correct + (toInt(r.correct) ?? 0) }), { total: 0, correct: 0 });

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Dê um nome ao simulado.";
    if (!takenOn) e.takenOn = "Informe a data.";
    if (mode === "total") {
      const t = toInt(total);
      const c = toInt(correct);
      if (t == null || t < 1) e.total = "Informe o total de questões.";
      else if (t > 5000) e.total = "No máximo 5000 questões.";
      if (c == null) e.correct = "Informe os acertos (pode ser 0).";
      else if (t != null && c > t) e.correct = "Os acertos não podem passar do total.";
    } else {
      rows.forEach((r) => {
        const t = toInt(r.total);
        const c = toInt(r.correct);
        if (!r.subjectId) e[`s${r.key}`] = "Escolha a matéria.";
        else if (r.subjectId === OTHER && !r.title.trim()) e[`s${r.key}`] = "Informe o nome da matéria.";
        if (t == null || t < 1) e[`t${r.key}`] = "Total?";
        else if (t > 1000) e[`t${r.key}`] = "Máx. 1000";
        if (c == null) e[`c${r.key}`] = "Acertos?";
        else if (t != null && c > t) e[`c${r.key}`] = "Maior que o total";
      });
    }
    const d = duration.trim();
    if (d && (toInt(d) == null || toInt(d)! < 1 || toInt(d)! > 1440)) e.duration = "Use minutos entre 1 e 1440.";
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    const body: MockExamIn = {
      title: title.trim(),
      taken_on: takenOn,
      duration_minutes: duration.trim() ? toInt(duration) : null,
      notes: exam ? notes.trim() : notes.trim() || null, // "" limpa ao editar (null é ignorado pelo servidor)
    };
    if (mode === "total") {
      body.total_questions = toInt(total);
      body.correct = toInt(correct);
      if (exam) body.subjects = []; // ao editar, limpa as linhas por matéria
    } else {
      body.subjects = rows.map((r) =>
        r.subjectId === OTHER ? { subject_title: r.title.trim(), total: toInt(r.total)!, correct: toInt(r.correct)! } : { subject_id: r.subjectId, total: toInt(r.total)!, correct: toInt(r.correct)! },
      );
    }
    try {
      await save.mutateAsync({ id: exam?.id, body });
      toast.success(exam ? "Simulado atualizado" : "Simulado registrado");
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mode="sheet" title={exam ? "Editar simulado" : "Registrar simulado"} className="tablet:w-[min(600px,calc(100%-32px))]">
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-[14px]" noValidate>
          <div className="grid gap-3 tablet:grid-cols-[minmax(0,1fr)_170px]">
            <Field label="Nome" htmlFor={`${uid}-title`} error={errors.title}>
              <Input id={`${uid}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} invalid={!!errors.title} />
            </Field>
            <Field label="Data" htmlFor={`${uid}-date`} error={errors.takenOn}>
              <Input id={`${uid}-date`} type="date" max={todayIso()} value={takenOn} onChange={(e) => setTakenOn(e.target.value)} invalid={!!errors.takenOn} />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-[color-mix(in_srgb,var(--color-text-primary)_70%,transparent)]">Resultado</span>
            <Seg<Mode>
              label="Como informar o resultado"
              value={mode}
              onChange={setMode}
              block
              options={[
                { value: "total", label: "Total e acertos" },
                { value: "materias", label: "Por matéria" },
              ]}
            />
          </div>

          {mode === "total" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total de questões" htmlFor={`${uid}-total`} error={errors.total}>
                <Input id={`${uid}-total`} type="number" inputMode="numeric" min={1} max={5000} value={total} onChange={(e) => setTotal(e.target.value)} invalid={!!errors.total} />
              </Field>
              <Field label="Acertos" htmlFor={`${uid}-correct`} error={errors.correct}>
                <Input id={`${uid}-correct`} type="number" inputMode="numeric" min={0} max={toInt(total) ?? undefined} value={correct} onChange={(e) => setCorrect(e.target.value)} invalid={!!errors.correct} />
              </Field>
            </div>
          ) : (
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Resultado por matéria</legend>
              {rows.map((r, i) => (
                <div key={r.key} className="flex flex-col gap-2 rounded-md bg-canvas p-3">
                  <div className="flex items-end gap-2">
                    <Field label={`Matéria ${i + 1}`} htmlFor={`${uid}-s${r.key}`} error={errors[`s${r.key}`]} className="min-w-0 flex-1">
                      <Select id={`${uid}-s${r.key}`} value={r.subjectId} onChange={(e) => setRow(r.key, { subjectId: e.target.value })} invalid={!!errors[`s${r.key}`]}>
                        <option value="">Escolha…</option>
                        {subjectList.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                          </option>
                        ))}
                        <option value={OTHER}>Outra matéria (digitar)</option>
                      </Select>
                    </Field>
                    <Button type="button" variant="ghost-muted" size="icon" className="mb-1" onClick={() => removeRow(r.key)} disabled={rows.length === 1} aria-label={`Remover matéria ${i + 1}`}>
                      <X size={16} aria-hidden />
                    </Button>
                  </div>
                  {r.subjectId === OTHER ? (
                    <Field label="Nome da matéria" htmlFor={`${uid}-n${r.key}`}>
                      <Input id={`${uid}-n${r.key}`} value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} maxLength={160} invalid={!!errors[`s${r.key}`]} />
                    </Field>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Questões" htmlFor={`${uid}-t${r.key}`} error={errors[`t${r.key}`]}>
                      <Input id={`${uid}-t${r.key}`} type="number" inputMode="numeric" min={1} max={1000} value={r.total} onChange={(e) => setRow(r.key, { total: e.target.value })} invalid={!!errors[`t${r.key}`]} />
                    </Field>
                    <Field label="Acertos" htmlFor={`${uid}-c${r.key}`} error={errors[`c${r.key}`]}>
                      <Input id={`${uid}-c${r.key}`} type="number" inputMode="numeric" min={0} max={toInt(r.total) ?? undefined} value={r.correct} onChange={(e) => setRow(r.key, { correct: e.target.value })} invalid={!!errors[`c${r.key}`]} />
                    </Field>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={addRow}>
                  <Plus size={14} aria-hidden /> Adicionar matéria
                </Button>
                <span className="tnum text-[13px] text-neutral-400" aria-live="polite">
                  Total: {rowTotals.correct} de {rowTotals.total}
                  {rowTotals.total > 0 && rowTotals.correct <= rowTotals.total ? ` · ${fmtPct(Math.round((1000 * rowTotals.correct) / rowTotals.total) / 10)}` : ""}
                </span>
              </div>
            </fieldset>
          )}

          <Field label="Duração (min, opcional)" htmlFor={`${uid}-dur`} error={errors.duration} className="max-w-[200px]">
            <Input id={`${uid}-dur`} type="number" inputMode="numeric" min={1} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} invalid={!!errors.duration} />
          </Field>
          <Field label="Observações (opcional)" htmlFor={`${uid}-notes`}>
            <Textarea id={`${uid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="min-h-[70px]" />
          </Field>

          {formError ? (
            <p role="alert" className="text-[13px] text-error">
              {formError}
            </p>
          ) : null}
          <DialogActions>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={save.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={save.isPending}>
              {exam ? "Salvar alterações" : "Registrar"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
