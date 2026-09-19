import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { DownloadSimple, FileArrowUp, WifiSlash, X } from "@phosphor-icons/react";
import { useActivities } from "@/api/queries";
import { ApiError, errorMessage, isNetworkError } from "@/api/client";
import { usePublicConfig } from "@/api/session";
import {
  countProposal,
  downloadImportTemplate,
  fmtFileSize,
  MAX_TEXT_CHARS,
  normalizeProposal,
  sourceLabel,
  useCancelImport,
  useCreateImport,
  useImport,
  useImports,
  type ImportConfirmOut,
  type ImportOut,
  type ImportSource,
} from "@/api/imports";
import { ImportErrorCard } from "@/components/app/import-error-card";
import { ImportProposalEditor } from "@/components/app/import-proposal-editor";
import { Banner, Button, Card, Checkbox, EmptyState, Field, Seg, Select, Spinner, Tag, Textarea, toast, type TagProps } from "@/components/ui";
import { fmtDateTimeShort } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { usePageTour } from "@/components/tour/use-tours";
import { importarTour } from "@/tours/importar";
import { cn } from "@/lib/utils";

const NEEDS_CONNECTION = "Importar precisa de conexão. Quando a internet voltar, envie de novo.";
const DEFAULT_MAX_UPLOAD_MB = 25;

const STATUS: Record<string, { label: string; variant: NonNullable<TagProps["variant"]> }> = {
  queued: { label: "Na fila", variant: "neutral" },
  processing: { label: "Processando", variant: "outline" },
  needs_review: { label: "Aguardando revisão", variant: "pending" },
  failed: { label: "Falhou", variant: "error" },
  confirmed: { label: "Confirmada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "neutral" },
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

interface FormError {
  fileName: string | null;
  message: string;
  code: string | null;
}

/** A mensagem do servidor cita o caminho do modelo; na tela o botão "Baixar modelo" já cumpre esse papel. */
function cleanServerMessage(message: string): string {
  return message.replace(/\s*\(baixe o modelo[^)]*\)/i, "");
}

function toFormError(e: unknown, fileName: string | null): FormError {
  if (isNetworkError(e)) return { fileName, message: "Sem conexão com o servidor. O conteúdo não foi enviado.", code: null };
  if (e instanceof ApiError) return { fileName, message: cleanServerMessage(e.message), code: e.code };
  return { fileName, message: errorMessage(e, "Não foi possível processar o conteúdo."), code: null };
}

/** Importar conteúdo programático: texto colado, CSV ou PDF → proposta revisável → confirmação. */
export default function ImportsPage() {
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const activities = useActivities();
  const importId = params.get("importacao");
  const job = useImport(importId);
  const [source, setSource] = React.useState<ImportSource>("text");
  const [confirmed, setConfirmed] = React.useState<ImportConfirmOut | null>(null);
  usePageTour(importarTour, activities.isSuccess);

  const acts = activities.data ?? [];
  const wanted = params.get("objetivo") ?? job.data?.activity_id ?? null;
  const activity = acts.find((a) => a.id === wanted) ?? acts[0] ?? null;
  const activityId = activity?.id ?? null;

  const patchParams = (patch: Record<string, string | null>) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v == null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );
  };
  const openJob = (j: ImportOut) => patchParams({ importacao: j.id, objetivo: j.activity_id });
  const closeJob = (nextSource?: ImportSource) => {
    if (nextSource) setSource(nextSource);
    patchParams({ importacao: null });
  };

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Importar conteúdo</h1>
      <p className="m-0 max-w-[60ch] text-[14px] text-neutral-400">
        Traga o edital, o sumário ou a sua lista de matérias. Você revisa a proposta e nada é criado no seu plano antes de confirmar.
      </p>
    </header>
  );

  if (activities.isPending) {
    return (
      <div className="flex flex-col gap-[14px] desktop:gap-6">
        {header}
        <div className="flex justify-center p-8">
          <Spinner label="Carregando objetivos" />
        </div>
      </div>
    );
  }
  if (activities.isError) {
    return (
      <div className="flex flex-col gap-[14px] desktop:gap-6">
        {header}
        <Banner kind="error" actions={<Button size="sm" onClick={() => void activities.refetch()}>Tentar de novo</Button>}>
          {online ? errorMessage(activities.error, "Não foi possível carregar seus objetivos.") : "Sem conexão: não foi possível carregar seus objetivos."}
        </Banner>
      </div>
    );
  }
  if (!activity || !activityId) {
    return (
      <div className="flex flex-col gap-[14px] desktop:gap-6">
        {header}
        <Card className="p-4">
          <EmptyState
            title="Você ainda não tem um objetivo"
            description="O conteúdo importado vira matérias e tópicos dentro de um objetivo. Crie o primeiro para começar."
            action={
              <Button asChild size="lg">
                <Link to="/app/objetivos/novo">Criar objetivo</Link>
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      {header}
      <div className="grid gap-[14px] desktop:grid-cols-[7fr_5fr] desktop:items-start desktop:gap-6">
        <div className="flex min-w-0 flex-col gap-[14px]">
          <Card className="p-[14px] desktop:p-4" data-tour="importar-objetivo">
            <Field label="Objetivo que vai receber o conteúdo" htmlFor="import-activity" hint={importId ? "Trocar de objetivo fecha a importação aberta; ela continua em Importações recentes." : undefined}>
              <Select id="import-activity" value={activityId} onChange={(e) => patchParams({ objetivo: e.target.value, importacao: null })}>
                {acts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          {importId ? (
            <JobPanel
              importId={importId}
              query={job}
              online={online}
              activityName={acts.find((a) => a.id === job.data?.activity_id)?.title ?? null}
              confirmed={confirmed && confirmed.import.id === importId ? confirmed : null}
              onConfirmed={setConfirmed}
              onClose={closeJob}
            />
          ) : (
            <NewImportForm activityId={activityId} source={source} onSourceChange={setSource} online={online} onCreated={openJob} />
          )}
        </div>

        <RecentImports activityId={activityId} openId={importId} onOpen={openJob} />
      </div>
    </div>
  );
}

// --- Nova importação -------------------------------------------------------------------------

interface FormProps {
  activityId: string;
  source: ImportSource;
  onSourceChange: (s: ImportSource) => void;
  online: boolean;
  onCreated: (job: ImportOut) => void;
}

function NewImportForm({ activityId, source, onSourceChange, online, onCreated }: FormProps) {
  const config = usePublicConfig();
  const maxMb = config.data?.max_upload_mb ?? DEFAULT_MAX_UPLOAD_MB;
  const create = useCreateImport();
  const [text, setText] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [createMaterial, setCreateMaterial] = React.useState(false);
  const [error, setError] = React.useState<FormError | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  const changeSource = (s: ImportSource) => {
    onSourceChange(s);
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    const kind = source === "pdf" ? "pdf" : "csv";
    const name = f.name.toLowerCase();
    const okType = kind === "pdf" ? name.endsWith(".pdf") || f.type === "application/pdf" : name.endsWith(".csv") || f.type === "text/csv";
    let message: string | null = null;
    let code: string | null = null;
    if (!okType) {
      message = kind === "pdf" ? "Este arquivo não é um PDF. Escolha um arquivo .pdf ou use outra origem." : "Este arquivo não é um CSV. Escolha um arquivo .csv no formato do modelo.";
      code = "unsupported_file";
    } else if (f.size === 0) {
      message = "Arquivo vazio.";
      code = "empty_file";
    } else if (f.size > maxMb * 1024 * 1024) {
      message = `O arquivo tem ${Math.round(f.size / 1024 / 1024)} MB; o limite é ${maxMb} MB.`;
      code = "file_too_large";
    }
    if (message) {
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setError({ fileName: f.name, message, code });
      return;
    }
    setFile(f);
  };

  const submit = () => {
    if (!online || create.isPending) return;
    setError(null);
    if (source === "text") {
      const content = text.trim();
      if (!content || text.length > MAX_TEXT_CHARS) return;
      create.mutate(
        { kind: "text", activity_id: activityId, content: text },
        {
          onSuccess: (j) => {
            setText("");
            onCreated(j);
          },
          onError: (e) => setError(toFormError(e, null)),
        },
      );
      return;
    }
    if (!file) return;
    create.mutate(
      { kind: "file", activity_id: activityId, file, source, create_material: source === "pdf" ? createMaterial : undefined },
      {
        onSuccess: (j) => {
          setFile(null);
          onCreated(j);
        },
        onError: (e) => setError(toFormError(e, file.name)),
      },
    );
  };

  const onDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadImportTemplate();
    } catch (e) {
      toast.error("Não foi possível baixar o modelo", isNetworkError(e) ? "Você está sem conexão." : errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  const tooLong = text.length > MAX_TEXT_CHARS;

  return (
    <Card as="section" aria-label="Nova importação" className="gap-[14px] p-[14px] desktop:p-4">
      <div className="flex flex-col gap-2" data-tour="importar-origem">
        <span className="kicker">De onde vem o conteúdo</span>
        <Seg<ImportSource>
          label="Origem do conteúdo"
          size="lg"
          block
          value={source}
          onChange={changeSource}
          options={[
            { value: "text", label: "Texto colado" },
            { value: "csv", label: "CSV" },
            { value: "pdf", label: "PDF" },
          ]}
        />
      </div>

      {error ? (
        <ImportErrorCard
          fileName={error.fileName}
          message={error.message}
          code={error.code}
          retryLabel={source === "text" ? "Revisar o texto" : "Tentar outro arquivo"}
          onRetry={() => {
            setError(null);
            if (source === "text") textRef.current?.focus();
            else fileRef.current?.click();
          }}
          onPasteText={source === "text" ? undefined : () => changeSource("text")}
          className="bg-canvas"
        />
      ) : null}

      {source === "text" ? (
        <Field
          label="Cole o sumário, o edital ou a sua lista"
          htmlFor="import-text"
          error={tooLong ? `O texto passou do limite de ${MAX_TEXT_CHARS.toLocaleString("pt-BR")} caracteres.` : undefined}
          hint={
            <span className="flex flex-wrap justify-between gap-x-3">
              <span>Uma linha por item.</span>
              <span className="tnum">
                {text.length.toLocaleString("pt-BR")} / {MAX_TEXT_CHARS.toLocaleString("pt-BR")}
              </span>
            </span>
          }
        >
          <Textarea
            id="import-text"
            ref={textRef}
            value={text}
            invalid={tooLong}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            spellCheck={false}
            className="min-h-[240px] font-mono text-[13px] leading-[1.5]"
            placeholder={"Direito Constitucional\n  Direitos fundamentais ..... 12\n      Remédios constitucionais p. 18\n  Organização do Estado\nPortuguês\n  - Concordância verbal"}
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <input
            ref={fileRef}
            id="import-file"
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            accept={source === "pdf" ? ".pdf,application/pdf" : ".csv,text/csv"}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-md border border-divider p-[10px]">
              <FileArrowUp size={20} className="shrink-0 text-accent" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[14px]">{file.name}</span>
                <span className="tnum text-[12px] text-neutral-400">{fmtFileSize(file.size)}</span>
              </div>
              <Button
                variant="ghost-muted"
                size="icon-lg"
                aria-label={`Remover ${file.name}`}
                disabled={create.isPending}
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <X size={16} aria-hidden />
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="lg" disabled={create.isPending} onClick={() => fileRef.current?.click()}>
              <FileArrowUp size={16} aria-hidden />
              {file ? "Trocar arquivo" : source === "pdf" ? "Escolher PDF" : "Escolher CSV"}
            </Button>
            {source === "csv" ? (
              <Button variant="ghost" size="lg" className="px-2" loading={downloading} disabled={!online} onClick={() => void onDownloadTemplate()}>
                {downloading ? null : <DownloadSimple size={16} aria-hidden />}
                Baixar modelo
              </Button>
            ) : null}
          </div>
          {source === "pdf" ? (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-[10px] text-[14px]">
              <Checkbox checked={createMaterial} onCheckedChange={(v) => setCreateMaterial(v === true)} disabled={create.isPending} />
              <span>
                Guardar também como material
                <span className="block text-[12px] text-neutral-400">O PDF fica nos materiais do objetivo e os tópicos apontam para as páginas.</span>
              </span>
            </label>
          ) : null}
        </div>
      )}

      <FormatHint source={source} maxMb={maxMb} />

      {!online ? (
        <span className="flex items-start gap-2 text-[13px] text-neutral-400">
          <WifiSlash size={16} className="mt-0.5 shrink-0 text-info" aria-hidden />
          {NEEDS_CONNECTION}
        </span>
      ) : null}

      <Button
        size="lg"
        block
        className="tablet:w-auto tablet:self-start"
        loading={create.isPending}
        disabled={!online || (source === "text" ? !text.trim() || tooLong : !file)}
        onClick={submit}
      >
        {source === "text" ? "Analisar texto" : source === "csv" ? "Enviar CSV" : "Enviar PDF"}
      </Button>
    </Card>
  );
}

function FormatHint({ source, maxMb }: { source: ImportSource; maxMb: number }) {
  const cls = "m-0 flex list-disc flex-col gap-1 pl-[18px] text-[13px] text-neutral-400";
  if (source === "text") {
    return (
      <ul className={cls}>
        <li>Linha sem recuo vira matéria; com recuo vira tópico; com recuo maior (6 espaços ou mais) vira subtópico.</li>
        <li>Numeração também vale: “1.” matéria, “1.1” tópico, “1.1.1” subtópico. Marcadores como “-” ou “•” viram tópicos.</li>
        <li>Página no fim da linha é reconhecida: “Crase ..... 42” ou “Crase p. 42”.</li>
      </ul>
    );
  }
  if (source === "csv") {
    return (
      <ul className={cls}>
        <li>
          Colunas: <span className="break-all font-mono text-[12px]">materia;topico;subtopico;paginas;minutos_estimados</span>
        </li>
        <li>Separador “;” ou “,”. Páginas como “12” ou “12-30”. Baixe o modelo para começar com o cabeçalho certo.</li>
      </ul>
    );
  }
  return (
    <ul className={cls}>
      <li className="tnum">PDF de até {maxMb} MB, com texto selecionável (sumário, edital, índice).</li>
      <li>A leitura acontece em segundo plano e pode levar alguns instantes. PDF só de imagem não é lido.</li>
    </ul>
  );
}

// --- Job aberto ------------------------------------------------------------------------------

interface JobPanelProps {
  importId: string;
  query: ReturnType<typeof useImport>;
  online: boolean;
  activityName: string | null;
  confirmed: ImportConfirmOut | null;
  onConfirmed: (out: ImportConfirmOut) => void;
  onClose: (nextSource?: ImportSource) => void;
}

function JobPanel({ importId, query, online, activityName, confirmed, onConfirmed, onClose }: JobPanelProps) {
  const cancel = useCancelImport();
  const job = query.data;

  if (!job) {
    if (query.isError) {
      const notFound = query.error instanceof ApiError && query.error.status === 404;
      return (
        <Banner
          kind="error"
          actions={
            <>
              {notFound ? null : (
                <Button size="sm" onClick={() => void query.refetch()}>
                  Tentar de novo
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => onClose()}>
                Nova importação
              </Button>
            </>
          }
        >
          {notFound ? "Esta importação não existe mais." : online ? errorMessage(query.error, "Não foi possível carregar a importação.") : "Sem conexão: não foi possível carregar a importação."}
        </Banner>
      );
    }
    return (
      <Card className="items-center p-8">
        <Spinner label="Carregando importação" />
      </Card>
    );
  }

  const what = job.file_name ?? "Texto colado";
  const meta = [sourceLabel(job.source), fmtFileSize(job.size_bytes), job.pages_total ? plural(job.pages_total, "página", "páginas") : ""].filter(Boolean).join(" · ");
  const newButton = (
    <Button variant="secondary" size="lg" onClick={() => onClose()}>
      Nova importação
    </Button>
  );

  if (job.status === "queued" || job.status === "processing") {
    const processing = job.status === "processing";
    return (
      <Card as="section" aria-label="Importação em andamento" aria-live="polite" className="gap-[10px] p-[14px] desktop:p-4">
        <div className="flex items-start gap-[10px]">
          <Spinner className="mt-1 shrink-0" label={processing ? "Processando" : "Na fila"} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[15px] font-medium">{processing ? "Processando" : "Na fila"}</span>
            <span className="break-words text-[13px]">{what}</span>
            <span className="tnum text-[12px] text-neutral-400">{meta}</span>
          </div>
          <Tag variant={STATUS[job.status].variant}>{STATUS[job.status].label}</Tag>
        </div>
        <p className="m-0 text-[13px] text-neutral-400">
          {processing ? "Lendo o arquivo e montando a proposta." : "Aguardando a vez de ser lido."} Você pode sair desta tela: a importação continua e aparece em Importações recentes.
        </p>
        {!online ? <span className="text-[13px] text-neutral-400">Sem conexão: o andamento volta a atualizar quando a internet voltar.</span> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            loading={cancel.isPending}
            disabled={!online}
            onClick={() =>
              cancel.mutate(importId, {
                onSuccess: () => toast.info("Importação cancelada", "Nada do seu plano foi alterado."),
                onError: (e) => toast.error("Não foi possível cancelar", errorMessage(e)),
              })
            }
          >
            Cancelar
          </Button>
        </div>
      </Card>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="flex flex-col gap-[14px]">
        <ImportErrorCard
          fileName={job.file_name}
          message={job.error_message ? cleanServerMessage(job.error_message) : null}
          code={job.error_code}
          retryLabel={job.source === "text" ? "Tentar de novo" : "Tentar outro arquivo"}
          onRetry={() => onClose(job.source === "pdf" || job.source === "csv" ? job.source : "text")}
          onPasteText={job.source === "text" ? undefined : () => onClose("text")}
        />
      </div>
    );
  }

  if (job.status === "needs_review") {
    return (
      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-[2px]">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[14px]">{what}</span>
            <span className="tnum text-[12px] text-neutral-400">{meta}</span>
          </div>
          <Button variant="ghost" className="min-h-[44px]" onClick={() => onClose()}>
            Nova importação
          </Button>
        </div>
        <ImportProposalEditor key={job.id} job={job} activityName={activityName} online={online} onConfirmed={onConfirmed} />
      </div>
    );
  }

  if (job.status === "confirmed") {
    const counts = countProposal(normalizeProposal(job.proposal));
    return (
      <Card as="section" aria-label="Importação confirmada" className="gap-[10px] p-[14px] desktop:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="kicker">Conteúdo criado</span>
            <span className="tnum text-[17px] font-medium leading-[1.2]">
              {confirmed
                ? `${plural(confirmed.created_subjects, "matéria criada", "matérias criadas")} e ${plural(confirmed.created_topics, "tópico criado", "tópicos criados")}`
                : `${plural(counts.subjects, "matéria", "matérias")} e ${plural(counts.topics, "tópico", "tópicos")} importados`}
            </span>
          </div>
          <Tag variant="success">Confirmada</Tag>
        </div>
        <span className="tnum text-[13px] text-neutral-400">
          {what} · {meta}
          {job.confirmed_at ? ` · ${fmtDateTimeShort(job.confirmed_at)}` : ""}
        </span>
        {confirmed && confirmed.created_subjects < counts.subjects ? (
          <span className="text-[13px] text-neutral-400">Matérias que já existiam no objetivo foram reaproveitadas.</span>
        ) : null}
        {confirmed && confirmed.linked_topics > 0 ? (
          <span className="tnum text-[13px] text-neutral-400">{plural(confirmed.linked_topics, "tópico vinculado", "tópicos vinculados")} às páginas do material.</span>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="lg">
            <Link to={`/app/objetivos/${job.activity_id}`}>{activityName ? `Ver “${activityName}”` : "Ver objetivo"}</Link>
          </Button>
          {newButton}
        </div>
      </Card>
    );
  }

  // cancelled (ou estado desconhecido): nada a fazer além de começar outra
  return (
    <Card as="section" aria-label="Importação cancelada" className="gap-[10px] p-[14px] desktop:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="text-[15px] font-medium">{job.status === "cancelled" ? "Importação cancelada" : "Importação encerrada"}</span>
        <Tag variant="neutral">{STATUS[job.status]?.label ?? job.status}</Tag>
      </div>
      <span className="tnum text-[13px] text-neutral-400">
        {what} · {meta}
      </span>
      <p className="m-0 text-[13px] text-neutral-400">A proposta foi descartada. Nada do seu plano foi alterado.</p>
      <div className="flex flex-wrap gap-2 pt-1">{newButton}</div>
    </Card>
  );
}

// --- Importações recentes ---------------------------------------------------------------------

function RecentImports({ activityId, openId, onOpen }: { activityId: string; openId: string | null; onOpen: (j: ImportOut) => void }) {
  const list = useImports(activityId);
  const online = useOnline();
  const items = list.data ?? [];
  return (
    <Card as="section" aria-labelledby="recent-imports" className="gap-[10px] p-[14px] desktop:p-4" data-tour="importar-recentes">
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-imports" className="kicker m-0">
          Importações recentes
        </h2>
        {list.isFetching && !list.isPending ? <Spinner label="Atualizando" /> : null}
      </div>
      {list.isPending ? (
        <div className="flex justify-center p-6">
          <Spinner label="Carregando importações" />
        </div>
      ) : list.isError ? (
        <Banner kind="error" actions={<Button size="sm" onClick={() => void list.refetch()}>Tentar de novo</Button>}>
          {online ? errorMessage(list.error, "Não foi possível carregar as importações.") : "Sem conexão: não foi possível carregar as importações."}
        </Banner>
      ) : items.length === 0 ? (
        <EmptyState title="Nenhuma importação neste objetivo" description="O que você enviar aparece aqui, com o andamento e o resultado." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((j) => {
            const st = STATUS[j.status] ?? { label: j.status, variant: "neutral" as const };
            const counts = j.status === "needs_review" || j.status === "confirmed" ? countProposal(normalizeProposal(j.proposal)) : null;
            const active = j.id === openId;
            return (
              <li key={j.id} className="border-t border-divider first:border-t-0">
                <button
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => onOpen(j)}
                  className={cn(
                    "flex min-h-[56px] w-full cursor-pointer items-center gap-[10px] rounded-md px-2 py-[10px] text-left transition-colors duration-base",
                    "hover:bg-[color-mix(in_srgb,var(--color-text-primary)_7%,transparent)]",
                    active && "shadow-inset-accent",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <span className="truncate text-[14px]">{j.file_name ?? "Texto colado"}</span>
                    <span className="tnum text-[12px] text-neutral-400">
                      {sourceLabel(j.source)} · {fmtDateTimeShort(j.created_at)}
                      {counts ? ` · ${plural(counts.topics, "tópico", "tópicos")}` : ""}
                    </span>
                  </div>
                  <Tag variant={st.variant}>{st.label}</Tag>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
