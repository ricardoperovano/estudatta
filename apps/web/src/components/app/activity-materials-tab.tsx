import * as React from "react";
import { Link } from "react-router";
import { ArrowSquareOut, X } from "@phosphor-icons/react";
import {
  Banner,
  Button,
  Card,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Tag,
  toast,
} from "@/components/ui";
import { errorMessage } from "@/api/client";
import {
  fetchMaterialDetail,
  flattenTopics,
  useLinkMaterialTopic,
  useMaterials,
  useSubjects,
  useUnlinkMaterialTopic,
  type Material,
} from "@/api/content";
import { useOnline } from "@/lib/online";
import type { ActivityDetail } from "@/api/types";
import { CurrentMaterialCard } from "./current-material-card";
import { fmtPages, materialKindLabel, parsePages } from "./week-utils";

/** Aba Materiais do objetivo: lista, abrir (URL assinada), vincular a tópico com páginas e atalhos. */
export function ActivityMaterialsTab({
  activityId,
  activity,
}: {
  activityId: string;
  activity?: ActivityDetail;
}) {
  const online = useOnline();
  const materials = useMaterials(activityId);
  const unlink = useUnlinkMaterialTopic(activityId);
  const [linkFor, setLinkFor] = React.useState<Material | null>(null);
  const [opening, setOpening] = React.useState<string | null>(null);

  const open = async (m: Material) => {
    if (m.kind === "link" && m.url) {
      window.open(m.url, "_blank", "noopener,noreferrer");
      return;
    }
    // abre a aba antes do await para não ser bloqueada como pop-up
    const tab = window.open("about:blank", "_blank");
    setOpening(m.id);
    try {
      const detail = await fetchMaterialDetail(m.id);
      const target = detail.download_url || detail.url;
      if (!target) {
        tab?.close();
        toast.info(
          "Este material não tem arquivo para abrir",
          m.kind === "physical" ? "É um material físico: use as páginas como referência." : undefined,
        );
        return;
      }
      if (tab) tab.location.href = target;
      else window.location.assign(target);
    } catch (err) {
      tab?.close();
      toast.error("Não foi possível abrir o material", errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  const shortcuts = (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="secondary" size="lg" className="flex-1">
        <Link to={`/app/materiais?objetivo=${activityId}`}>Gerenciar materiais</Link>
      </Button>
      <Button asChild variant="secondary" size="lg" className="flex-1">
        <Link to={`/app/importar?objetivo=${activityId}`}>Importar edital ou plano</Link>
      </Button>
    </div>
  );

  if (materials.isPending) {
    return (
      <div className="flex justify-center py-10" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (materials.isError) {
    return (
      <Banner
        kind={online ? "error" : "offline"}
        actions={
          <Button size="sm" variant="secondary" onClick={() => materials.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {online
          ? "Não foi possível carregar os materiais."
          : "Sem conexão: os materiais aparecem quando você voltar à internet."}
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-[6px] text-[14px]">
      {/* em leitura o livro atual já fica no topo da página */}
      {activity &&
      activity.category !== "leitura" &&
      (materials.data.length > 0 || activity.current_material) ? (
        <CurrentMaterialCard activity={activity} className="mb-2" />
      ) : null}
      {materials.data.length === 0 ? (
        <EmptyState
          title="Nenhum material neste objetivo."
          description="Adicione PDFs, links ou livros e vincule cada um ao tópico, com as páginas."
        />
      ) : (
        materials.data.map((m) => (
          <Card key={m.id} className="gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{m.title}</span>
                <span className="tnum text-[12px] text-neutral-400">
                  {[
                    materialKindLabel(m.kind, m.url),
                    m.pages_total ? `${m.pages_total} páginas` : null,
                    m.last_position ? `parou em ${m.last_position}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              {m.kind !== "physical" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] shrink-0 px-2"
                  loading={opening === m.id}
                  onClick={() => void open(m)}
                >
                  Abrir <ArrowSquareOut size={14} aria-hidden />
                </Button>
              ) : null}
            </div>
            {(m.topics ?? []).length > 0 ? (
              <div className="flex flex-col gap-1 pl-3">
                {(m.topics ?? []).map((t) => (
                  <div key={t.topic_id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{t.topic_title ?? "Tópico"}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {fmtPages(t.page_from, t.page_to) ? (
                        <Tag variant="neutral">{fmtPages(t.page_from, t.page_to)}</Tag>
                      ) : null}
                      <button
                        type="button"
                        className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 hover:text-primary"
                        aria-label={`Desvincular ${m.title} de ${t.topic_title ?? "tópico"}`}
                        disabled={unlink.isPending}
                        onClick={async () => {
                          try {
                            await unlink.mutateAsync({ materialId: m.id, topicId: t.topic_id });
                            toast.success("Vínculo removido");
                          } catch (err) {
                            toast.error("Não foi possível desvincular", errorMessage(err));
                          }
                        }}
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="pl-3 text-[12px] text-neutral-400">sem tópico vinculado</span>
            )}
            <Button variant="ghost" size="sm" className="self-start pl-3" onClick={() => setLinkFor(m)}>
              + Vincular a tópico
            </Button>
          </Card>
        ))
      )}
      <div className="mt-2">{shortcuts}</div>
      {linkFor ? (
        <LinkTopicSheet
          key={linkFor.id}
          activityId={activityId}
          material={linkFor}
          onOpenChange={(o) => !o && setLinkFor(null)}
        />
      ) : null}
    </div>
  );
}

function LinkTopicSheet({
  activityId,
  material,
  onOpenChange,
}: {
  activityId: string;
  material: Material;
  onOpenChange: (o: boolean) => void;
}) {
  const subjects = useSubjects(activityId);
  const link = useLinkMaterialTopic(activityId);
  const [topicId, setTopicId] = React.useState("");
  const [pages, setPages] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const groups = (subjects.data ?? [])
    .map((s) => ({ subject: s, topics: flattenTopics(s.topics) }))
    .filter((g) => g.topics.length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!topicId) return setError("Escolha o tópico.");
    const [from, to] = parsePages(pages);
    if (from != null && to != null && to < from)
      return setError("A página final precisa ser maior que a inicial.");
    try {
      await link.mutateAsync({
        materialId: material.id,
        body: { topic_id: topicId, page_from: from, page_to: to, note: note.trim() || null },
      });
      toast.success("Material vinculado ao tópico");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent mode="sheet" title="Vincular a tópico" description={material.title}>
        <form onSubmit={submit} className="flex flex-col gap-[14px]">
          {error ? <Banner kind="error">{error}</Banner> : null}
          {subjects.isPending ? (
            <div className="flex justify-center py-4" role="status">
              <Spinner />
            </div>
          ) : groups.length === 0 ? (
            <Banner kind="info">
              Este objetivo ainda não tem tópicos. Crie matérias e tópicos na aba Matérias para vincular
              materiais.
            </Banner>
          ) : (
            <>
              <Field label="Tópico" htmlFor="lk-topic">
                <Select id="lk-topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                  <option value="">— escolher —</option>
                  {groups.map((g) => (
                    <optgroup key={g.subject.id} label={g.subject.title}>
                      {g.topics.map(({ topic, depth }) => (
                        <option key={topic.id} value={topic.id}>
                          {"· ".repeat(depth)}
                          {topic.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Field label="Páginas (opcional)" htmlFor="lk-pages">
                <Input
                  id="lk-pages"
                  placeholder="p. 12–34"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                />
              </Field>
              <Field label="Observação (opcional)" htmlFor="lk-note">
                <Input
                  id="lk-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="Capítulo 3, exercícios ímpares"
                />
              </Field>
              <Button type="submit" size="xl" block loading={link.isPending}>
                Vincular
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
