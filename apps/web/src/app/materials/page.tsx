import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowSquareOut, DownloadSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { ApiError, errorMessage } from "@/api/client";
import {
  flattenTopics,
  useCreateLinkMaterial,
  useCreatePhysicalMaterial,
  useLinkMaterialTopic,
  useMaterials,
  useSubjects,
  useUnlinkMaterialTopic,
  type Material,
  type MaterialDetail,
} from "@/api/content";
import {
  materialKindLabel,
  materialPagesLabel,
  useDeleteMaterial,
  useMaterialDetail,
  useUpdateMaterial,
  useUploadMaterial,
  viewerUrl,
} from "@/api/materials";
import { useActivities } from "@/api/queries";
import { usePublicConfig } from "@/api/session";
import type { Activity } from "@/api/types";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ImportErrorCard } from "@/components/app/import-error-card";
import {
  Banner,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  Field,
  Input,
  Seg,
  Select,
  Spinner,
  Tag,
  Textarea,
  toast,
} from "@/components/ui";
import { useOnline } from "@/lib/online";
import { usePageTour } from "@/components/tour/use-tours";
import { NoMaterials } from "@/components/empty/no-materials";
import { materiaisTour } from "@/tours/materiais";

type AddKind = "pdf" | "link" | "physical";

interface UploadFailure {
  fileName: string;
  message: string;
  code: string | null;
}

function parsePage(v: string): number | null | undefined {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{1,6}$/.test(t)) return undefined;
  return Number(t);
}

/** Mesma redação do servidor, para o erro ser igual com ou sem envio. */
function checkPdf(file: File, maxMb: number): { message: string; code: string } | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf)
    return { message: "O arquivo não é um PDF válido. Envie um PDF ou adicione só o link.", code: "not_pdf" };
  if (file.size === 0) return { message: "Arquivo vazio.", code: "empty_file" };
  if (file.size > maxMb * 1024 * 1024)
    return {
      message: `O arquivo tem ${Math.round(file.size / 1024 / 1024)} MB; o limite é ${maxMb} MB.`,
      code: "file_too_large",
    };
  return null;
}

/** Materiais: PDFs, links e livros físicos, vinculados a tópicos. Falha de envio nunca altera o plano. */
export default function MaterialsPage() {
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const activityFilter = params.get("objetivo");
  const activities = useActivities();
  const materials = useMaterials(activityFilter);
  const config = usePublicConfig();
  const upload = useUploadMaterial();
  const maxMb = config.data?.max_upload_mb ?? 25;

  const [add, setAdd] = React.useState<{ kind: AddKind; title?: string } | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<UploadFailure | null>(null);
  const [uploadingName, setUploadingName] = React.useState<string | null>(null);
  const retryInput = React.useRef<HTMLInputElement>(null);
  usePageTour(materiaisTour, materials.isSuccess && activities.isSuccess);

  const setFilter = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set("objetivo", id);
    else next.delete("objetivo");
    setParams(next, { replace: true });
  };

  const sendPdf = (file: File, title: string | undefined, activityId: string | null) => {
    const problem = checkPdf(file, maxMb);
    if (problem) {
      setFailure({ fileName: file.name, ...problem });
      return;
    }
    setFailure(null);
    setUploadingName(file.name);
    upload.mutate(
      { file, title, activityId },
      {
        onSuccess: (m) => {
          toast("success", "Material adicionado", m.title);
          setOpenId(m.id);
        },
        onError: (e) =>
          setFailure({
            fileName: file.name,
            message: errorMessage(e),
            code: e instanceof ApiError ? e.code : null,
          }),
        onSettled: () => setUploadingName(null),
      },
    );
  };

  const activityTitle = (id: string | null) => activities.data?.find((a) => a.id === id)?.title ?? null;

  return (
    <div className="flex flex-col gap-[14px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Materiais</h1>
        <Button
          variant="primary"
          size="lg"
          onClick={() => setAdd({ kind: "pdf" })}
          data-tour="materiais-adicionar"
        >
          <Plus size={16} aria-hidden /> Adicionar material
        </Button>
      </header>

      {!online ? (
        <Banner kind="offline">
          Sem conexão: adicionar, editar e abrir materiais precisa de internet. A lista mostra o que já estava
          carregado.
        </Banner>
      ) : null}

      <input
        ref={retryInput}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) sendPdf(f, undefined, activityFilter);
        }}
      />

      {failure ? (
        <ImportErrorCard
          fileName={failure.fileName}
          message={failure.message}
          code={failure.code}
          retryLabel="Tentar outro arquivo"
          onRetry={() => retryInput.current?.click()}
          pasteLabel="Adicionar só o link"
          onPasteText={() => {
            setAdd({ kind: "link", title: failure.fileName.replace(/\.pdf$/i, "") });
            setFailure(null);
          }}
        />
      ) : null}

      {activities.data && activities.data.length > 1 ? (
        <Field
          label="Objetivo"
          htmlFor="materials-filter"
          className="desktop:max-w-[320px]"
          data-tour="materiais-filtro"
        >
          <Select
            id="materials-filter"
            value={activityFilter ?? ""}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">Todos os objetivos</option>
            {activities.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {uploadingName ? (
        <Card className="gap-1 px-[14px] py-3 text-[14px] opacity-70" role="status">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{uploadingName} · PDF</span>
            <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-neutral-400">
              <Spinner /> enviando
            </span>
          </div>
        </Card>
      ) : null}

      {materials.isPending ? (
        <div className="flex justify-center py-16" role="status">
          <Spinner className="h-6 w-6" label="Carregando materiais" />
        </div>
      ) : materials.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => materials.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar os materiais. {errorMessage(materials.error, "")}
        </Banner>
      ) : materials.data.length === 0 && !uploadingName ? (
        <NoMaterials filtered={!!activityFilter} onAdd={(kind) => setAdd({ kind })} />
      ) : (
        <ul className="grid gap-[14px] tablet:grid-cols-2 desktop:grid-cols-3" data-tour="materiais-lista">
          {materials.data.map((m) => (
            <li key={m.id}>
              <MaterialCard
                material={m}
                activityTitle={activityTitle(m.activity_id)}
                onOpen={() => setOpenId(m.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {add ? (
        <AddMaterialSheet
          key={`${add.kind}:${add.title ?? ""}`}
          initialKind={add.kind}
          initialTitle={add.title ?? ""}
          activities={activities.data ?? []}
          defaultActivityId={activityFilter}
          maxMb={maxMb}
          online={online}
          onClose={() => setAdd(null)}
          onPdf={(file, title, activityId) => {
            setAdd(null);
            sendPdf(file, title, activityId);
          }}
          onCreated={(m) => {
            setAdd(null);
            setFailure(null);
            setOpenId(m.id);
          }}
        />
      ) : null}

      {openId ? (
        <MaterialSheet
          id={openId}
          activities={activities.data ?? []}
          online={online}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function MaterialCard({
  material: m,
  activityTitle,
  onOpen,
}: {
  material: Material;
  activityTitle: string | null;
  onOpen: () => void;
}) {
  const pages = materialPagesLabel(m);
  const n = (m.topics ?? []).length;
  const sub = [
    activityTitle,
    n === 0 ? "sem tópicos vinculados" : `${n} ${n === 1 ? "tópico vinculado" : "tópicos vinculados"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full cursor-pointer rounded-md text-left"
      aria-label={`Abrir ${m.title}`}
    >
      <Card className="gap-1 px-[14px] py-3 text-[14px] transition-colors duration-base hover:shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate">
            {m.title} · {materialKindLabel(m.kind)}
          </span>
          {pages ? (
            <Tag variant="neutral" className="tnum shrink-0">
              {pages}
            </Tag>
          ) : null}
        </div>
        <span className="text-[12px] text-neutral-400">{sub}</span>
        {m.last_position ? (
          <span className="text-[12px] text-neutral-400">Parei em: {m.last_position}</span>
        ) : null}
      </Card>
    </button>
  );
}

// --- Adicionar ------------------------------------------------------------------------------

interface AddProps {
  initialKind: AddKind;
  initialTitle: string;
  activities: Activity[];
  defaultActivityId: string | null;
  maxMb: number;
  online: boolean;
  onClose: () => void;
  onPdf: (file: File, title: string | undefined, activityId: string | null) => void;
  onCreated: (m: MaterialDetail) => void;
}

function AddMaterialSheet({
  initialKind,
  initialTitle,
  activities,
  defaultActivityId,
  maxMb,
  online,
  onClose,
  onPdf,
  onCreated,
}: AddProps) {
  const [kind, setKind] = React.useState<AddKind>(initialKind);
  const [title, setTitle] = React.useState(initialTitle);
  const [activityId, setActivityId] = React.useState(
    defaultActivityId ?? (activities.length === 1 ? activities[0].id : ""),
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pagesTotal, setPagesTotal] = React.useState("");
  const [errors, setErrors] = React.useState<{
    title?: string;
    url?: string;
    file?: string;
    pages?: string;
    form?: string;
  }>({});
  const createLink = useCreateLinkMaterial(activityId || null);
  const createPhysical = useCreatePhysicalMaterial(activityId || null);
  const busy = createLink.isPending || createPhysical.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (kind === "pdf") {
      if (!file) next.file = "Escolha um arquivo PDF.";
      setErrors(next);
      if (file) onPdf(file, title.trim() || undefined, activityId || null);
      return;
    }
    if (!title.trim()) next.title = "Dê um nome ao material.";
    if (kind === "link") {
      if (!url.trim()) next.url = "Informe o link.";
      setErrors(next);
      if (Object.keys(next).length) return;
      createLink.mutate(
        {
          title: title.trim(),
          url: url.trim(),
          description: description.trim() || null,
          activity_id: activityId || null,
        },
        {
          onSuccess: (m) => {
            toast("success", "Material adicionado", m.title);
            onCreated(m);
          },
          onError: (err) => {
            // local_path / bad_url: a explicação do servidor vai no próprio campo
            if (err instanceof ApiError && (err.code === "local_path" || err.code === "bad_url"))
              setErrors({ url: err.message });
            else setErrors({ form: errorMessage(err) });
          },
        },
      );
      return;
    }
    const total = parsePage(pagesTotal);
    if (total === undefined || total === 0) next.pages = "Use só números (ex.: 380).";
    setErrors(next);
    if (Object.keys(next).length) return;
    createPhysical.mutate(
      {
        title: title.trim(),
        description: description.trim() || null,
        pages_total: total ?? null,
        activity_id: activityId || null,
      },
      {
        onSuccess: (m) => {
          toast("success", "Material adicionado", m.title);
          onCreated(m);
        },
        onError: (err) => setErrors({ form: errorMessage(err) }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mode="sheet" title="Adicionar material">
        <form className="flex flex-col gap-[14px]" onSubmit={submit} noValidate>
          <Seg<AddKind>
            label="Tipo de material"
            block
            size="lg"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setErrors({});
            }}
            options={[
              { value: "pdf", label: "PDF" },
              { value: "link", label: "Link" },
              { value: "physical", label: "Físico" },
            ]}
          />

          {kind === "pdf" ? (
            <Field
              label="Arquivo PDF"
              htmlFor="material-file"
              error={errors.file}
              hint={`Até ${maxMb} MB. O arquivo fica guardado só na sua conta.`}
            >
              <Input
                id="material-file"
                type="file"
                accept="application/pdf,.pdf"
                invalid={!!errors.file}
                className="py-[9px]"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
          ) : null}

          <Field
            label={kind === "pdf" ? "Nome (opcional)" : "Nome"}
            htmlFor="material-title"
            error={errors.title}
            hint={kind === "pdf" ? "Sem nome, usamos o nome do arquivo." : undefined}
          >
            <Input
              id="material-title"
              value={title}
              maxLength={200}
              invalid={!!errors.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "physical" ? "Ex.: English Grammar in Use" : undefined}
            />
          </Field>

          {kind === "link" ? (
            <Field
              label="Link"
              htmlFor="material-url"
              error={errors.url}
              hint="Precisa começar com https:// para abrir em qualquer aparelho."
            >
              <Input
                id="material-url"
                type="url"
                inputMode="url"
                value={url}
                maxLength={2100}
                invalid={!!errors.url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </Field>
          ) : null}

          {kind === "physical" ? (
            <Field label="Total de páginas (opcional)" htmlFor="material-pages" error={errors.pages}>
              <Input
                id="material-pages"
                inputMode="numeric"
                value={pagesTotal}
                invalid={!!errors.pages}
                onChange={(e) => setPagesTotal(e.target.value)}
                className="tnum"
              />
            </Field>
          ) : null}

          {kind !== "pdf" ? (
            <Field label="Anotação (opcional)" htmlFor="material-desc">
              <Textarea
                id="material-desc"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[64px]"
              />
            </Field>
          ) : null}

          {activities.length ? (
            <Field
              label="Objetivo"
              htmlFor="material-activity"
              hint="Vincular a um objetivo permite ligar o material aos tópicos dele."
            >
              <Select
                id="material-activity"
                value={activityId}
                onChange={(e) => setActivityId(e.target.value)}
              >
                <option value="">Sem objetivo</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {errors.form ? <Banner kind="error">{errors.form}</Banner> : null}
          {!online ? <Banner kind="offline">Adicionar material precisa de conexão.</Banner> : null}

          <DialogActions>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!online}>
              {kind === "pdf" ? "Enviar PDF" : "Adicionar"}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Detalhe: leitor, edição, tópicos, exclusão ---------------------------------------------

function MaterialSheet({
  id,
  activities,
  online,
  onClose,
}: {
  id: string;
  activities: Activity[];
  online: boolean;
  onClose: () => void;
}) {
  const detail = useMaterialDetail(id);
  const [viewerNonce, setViewerNonce] = React.useState(0);
  const [reloading, setReloading] = React.useState(false);
  const m = detail.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        mode="sheet"
        title={m?.title ?? "Material"}
        description={m ? materialSubtitle(m) : undefined}
        className="tablet:w-[min(920px,calc(100%-32px))]"
      >
        {detail.isPending ? (
          <div className="flex justify-center py-12" role="status">
            <Spinner className="h-6 w-6" label="Abrindo material" />
          </div>
        ) : detail.isError || !m ? (
          <Banner
            kind="error"
            actions={
              <Button size="sm" variant="secondary" onClick={() => detail.refetch()}>
                Tentar de novo
              </Button>
            }
          >
            Não foi possível abrir este material. {errorMessage(detail.error, "")}
          </Banner>
        ) : (
          <>
            {m.kind === "pdf" ? (
              <PdfViewer
                key={`${m.id}:${viewerNonce}`}
                material={m}
                online={online}
                reloading={reloading}
                onReload={() => {
                  setReloading(true);
                  void detail.refetch().finally(() => {
                    setReloading(false);
                    setViewerNonce((n) => n + 1);
                  });
                }}
              />
            ) : null}
            <MaterialBody
              key={`${m.id}:${m.updated_at ?? ""}`}
              material={m}
              activities={activities}
              online={online}
              onDeleted={onClose}
            />
          </>
        )}
        <DialogActions>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Fechar
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function materialSubtitle(m: MaterialDetail): string {
  const parts = [
    materialKindLabel(m.kind) === "PDF"
      ? "PDF"
      : materialKindLabel(m.kind) === "link"
        ? "Link"
        : "Material físico",
  ];
  const pages = materialPagesLabel(m);
  if (pages) parts.push(pages);
  if (m.size_bytes)
    parts.push(`${(m.size_bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`);
  return parts.join(" · ");
}

interface BodyProps {
  material: MaterialDetail;
  activities: Activity[];
  online: boolean;
  onDeleted: () => void;
}

/**
 * Leitor de PDF. O endereço é fixado na montagem: salvar ou vincular tópicos renova o link no
 * servidor, mas não deve recarregar o PDF no meio da leitura. "Recarregar leitor" remonta.
 */
function PdfViewer({
  material: m,
  online,
  onReload,
  reloading,
}: {
  material: MaterialDetail;
  online: boolean;
  onReload: () => void;
  reloading: boolean;
}) {
  const [src] = React.useState(() => viewerUrl(m.download_url));
  if (!src)
    return (
      <Banner kind="error">
        O arquivo deste material não está disponível agora. Seus vínculos e anotações continuam salvos.
      </Banner>
    );
  return (
    <div className="flex flex-col gap-2">
      <iframe
        src={src}
        title={`Leitor: ${m.title}`}
        className="h-[52dvh] w-full rounded-md border border-divider bg-canvas desktop:h-[60dvh]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="primary" size="lg">
          <a href={src} download={m.file_name ?? "material.pdf"}>
            <DownloadSimple size={16} aria-hidden /> Baixar PDF
          </a>
        </Button>
        <Button asChild variant="secondary" size="lg">
          <a href={src} target="_blank" rel="noopener noreferrer">
            <ArrowSquareOut size={16} aria-hidden /> Abrir em nova aba
          </a>
        </Button>
        <Button
          variant="ghost-muted"
          size="lg"
          className="px-3"
          loading={reloading}
          disabled={!online}
          onClick={onReload}
        >
          Recarregar leitor
        </Button>
      </div>
      <p className="text-[12px] text-neutral-400">
        Se o PDF não aparecer aqui, abra em nova aba. Por segurança, o acesso ao arquivo expira
        {m.download_expires_in
          ? ` em ${Math.max(1, Math.round(m.download_expires_in / 60))} min`
          : " depois de um tempo"}
        ; “Recarregar leitor” renova.
      </p>
    </div>
  );
}

function MaterialBody({ material: m, activities, online, onDeleted }: BodyProps) {
  const update = useUpdateMaterial();
  const del = useDeleteMaterial();
  const [title, setTitle] = React.useState(m.title);
  const [description, setDescription] = React.useState(m.description ?? "");
  const [pageFrom, setPageFrom] = React.useState(m.page_from != null ? String(m.page_from) : "");
  const [pageTo, setPageTo] = React.useState(m.page_to != null ? String(m.page_to) : "");
  const [lastPosition, setLastPosition] = React.useState(m.last_position ?? "");
  const [currentPage, setCurrentPage] = React.useState(m.current_page != null ? String(m.current_page) : "");
  const [activityId, setActivityId] = React.useState(m.activity_id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const dirty =
    title !== m.title ||
    description !== (m.description ?? "") ||
    pageFrom !== (m.page_from != null ? String(m.page_from) : "") ||
    pageTo !== (m.page_to != null ? String(m.page_to) : "") ||
    lastPosition !== (m.last_position ?? "") ||
    currentPage !== (m.current_page != null ? String(m.current_page) : "") ||
    activityId !== (m.activity_id ?? "");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const from = parsePage(pageFrom);
    const to = parsePage(pageTo);
    if (!title.trim()) return setError("O material precisa de um nome.");
    if (from === undefined || to === undefined) return setError("Páginas: use só números.");
    if (from != null && to != null && to < from) return setError("A página final vem antes da inicial.");
    const cur = parsePage(currentPage);
    if (cur === undefined) return setError("Página atual: use só números.");
    if (cur != null && m.pages_total && cur > m.pages_total)
      return setError("A página atual não pode passar do total de páginas.");
    setError(null);
    update.mutate(
      {
        id: m.id,
        body: {
          title: title.trim(),
          description,
          page_from: from,
          page_to: to,
          last_position: lastPosition,
          current_page: cur ?? null,
          clear_current_page: cur == null && m.current_page != null,
          activity_id: activityId || null,
          clear_activity: !activityId && !!m.activity_id,
        },
      },
      {
        onSuccess: () => toast("success", "Material atualizado"),
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {m.kind === "link" && m.url ? (
        <div className="flex flex-col gap-1">
          <Button asChild variant="primary" size="lg" className="self-start">
            <a href={m.url} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut size={16} aria-hidden /> Abrir link
            </a>
          </Button>
          <span className="break-all text-[12px] text-neutral-400">{m.url}</span>
        </div>
      ) : null}

      <TopicLinks material={m} online={online} />

      <form className="flex flex-col gap-3" onSubmit={save} noValidate>
        <span className="kicker">Detalhes</span>
        <Field label="Nome" htmlFor="m-title">
          <Input id="m-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Página inicial" htmlFor="m-from">
            <Input
              id="m-from"
              inputMode="numeric"
              className="tnum"
              value={pageFrom}
              onChange={(e) => setPageFrom(e.target.value)}
            />
          </Field>
          <Field label="Página final" htmlFor="m-to">
            <Input
              id="m-to"
              inputMode="numeric"
              className="tnum"
              value={pageTo}
              onChange={(e) => setPageTo(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Página atual"
            htmlFor="m-cur"
            hint="Marcador: avança quando você registra páginas lidas."
          >
            <Input
              id="m-cur"
              inputMode="numeric"
              className="tnum"
              value={currentPage}
              onChange={(e) => setCurrentPage(e.target.value)}
            />
          </Field>
          <Field label="Onde parei" htmlFor="m-pos" hint="Ex.: unidade 12, aula 7.">
            <Input
              id="m-pos"
              value={lastPosition}
              maxLength={120}
              onChange={(e) => setLastPosition(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Anotação" htmlFor="m-desc">
          <Textarea
            id="m-desc"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[64px]"
          />
        </Field>
        {activities.length ? (
          <Field
            label="Objetivo"
            htmlFor="m-activity"
            hint={
              (m.topics ?? []).length && activityId !== (m.activity_id ?? "")
                ? "Os tópicos já vinculados continuam vinculados."
                : undefined
            }
          >
            <Select id="m-activity" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              <option value="">Sem objetivo</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {error ? <Banner kind="error">{error}</Banner> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="danger"
            size="lg"
            disabled={!online}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash size={16} aria-hidden /> Excluir material
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={update.isPending}
            disabled={!dirty || !online}
          >
            Salvar alterações
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        danger
        title="Excluir este material?"
        description={`${m.kind === "pdf" ? "O arquivo é apagado da sua conta. " : ""}Os vínculos com tópicos são removidos. Seu tempo registrado e seu plano não mudam.`}
        confirmLabel="Excluir"
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(m.id, {
            onSuccess: () => {
              toast("success", "Material removido");
              onDeleted();
            },
            onError: (e) => toast("error", "Não foi possível excluir", errorMessage(e)),
          })
        }
      />
    </div>
  );
}

function TopicLinks({ material: m, online }: { material: MaterialDetail; online: boolean }) {
  const subjects = useSubjects(m.activity_id ?? undefined);
  const link = useLinkMaterialTopic(m.activity_id);
  const unlink = useUnlinkMaterialTopic(m.activity_id);
  const [topicId, setTopicId] = React.useState("");
  const [pages, setPages] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const topics = m.topics ?? [];
  const linked = new Set(topics.map((t) => t.topic_id));

  const addLink = () => {
    if (!topicId) return setError("Escolha um tópico.");
    const nums = (pages.match(/\d{1,6}/g) ?? []).map(Number);
    if (pages.trim() && nums.length === 0) return setError("Páginas: use “12” ou “12–30”.");
    const from = nums[0] ?? null;
    const to = nums[1] ?? null;
    if (from != null && to != null && to < from) return setError("A página final vem antes da inicial.");
    const cur = parsePage(currentPage);
    if (cur === undefined) return setError("Página atual: use só números.");
    if (cur != null && m.pages_total && cur > m.pages_total)
      return setError("A página atual não pode passar do total de páginas.");
    setError(null);
    link.mutate(
      { materialId: m.id, body: { topic_id: topicId, page_from: from, page_to: to } },
      {
        onSuccess: () => {
          setTopicId("");
          setPages("");
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <section className="flex flex-col gap-2" aria-label="Tópicos vinculados">
      <span className="kicker">Tópicos vinculados</span>
      {topics.length === 0 ? (
        <span className="text-[13px] text-neutral-400">Nenhum tópico vinculado ainda.</span>
      ) : (
        <ul className="flex flex-col divide-y divide-divider">
          {topics.map((t) => (
            <li key={t.topic_id} className="flex min-h-[44px] items-center justify-between gap-2 text-[14px]">
              <span className="min-w-0 truncate">{t.topic_title ?? "Tópico"}</span>
              <span className="flex shrink-0 items-center gap-1">
                {t.page_from != null ? (
                  <Tag variant="neutral" className="tnum">
                    p. {t.page_from}
                    {t.page_to != null && t.page_to !== t.page_from ? `–${t.page_to}` : ""}
                  </Tag>
                ) : null}
                <Button
                  variant="ghost-muted"
                  size="icon"
                  aria-label={`Desvincular ${t.topic_title ?? "tópico"}`}
                  disabled={!online || unlink.isPending}
                  onClick={() =>
                    unlink.mutate(
                      { materialId: m.id, topicId: t.topic_id },
                      { onError: (e) => toast("error", "Não foi possível desvincular", errorMessage(e)) },
                    )
                  }
                >
                  <X size={16} aria-hidden />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!m.activity_id ? (
        <span className="text-[13px] text-neutral-400">
          Para vincular a tópicos, escolha um objetivo em Detalhes e salve.
        </span>
      ) : subjects.isPending ? (
        <Spinner label="Carregando tópicos" />
      ) : subjects.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => subjects.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar os tópicos deste objetivo.
        </Banner>
      ) : subjects.data.every((s) => (s.topics ?? []).length === 0) ? (
        <span className="text-[13px] text-neutral-400">
          Este objetivo ainda não tem tópicos.{" "}
          <Link
            to={`/app/objetivos/${m.activity_id}`}
            className="text-accent underline-offset-2 hover:underline"
          >
            Abrir objetivo
          </Link>
        </span>
      ) : (
        <div className="grid gap-2 tablet:grid-cols-[minmax(0,1fr)_120px_auto] tablet:items-end">
          <Field label="Vincular a um tópico" htmlFor="m-topic">
            <Select id="m-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Escolher tópico…</option>
              {subjects.data.map((s) => (
                <optgroup key={s.id} label={s.title}>
                  {flattenTopics(s.topics).map(({ topic, depth }) => (
                    <option key={topic.id} value={topic.id} disabled={linked.has(topic.id)}>
                      {`${"— ".repeat(depth)}${topic.title}${linked.has(topic.id) ? " (vinculado)" : ""}`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Páginas" htmlFor="m-topic-pages">
            <Input
              id="m-topic-pages"
              className="tnum"
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              placeholder="12–30"
            />
          </Field>
          <Button variant="primary" size="lg" loading={link.isPending} disabled={!online} onClick={addLink}>
            Vincular
          </Button>
        </div>
      )}
      {error ? (
        <span role="alert" className="text-[12px] text-error">
          {error}
        </span>
      ) : null}
    </section>
  );
}
