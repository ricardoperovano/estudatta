/**
 * "Livro atual" do objetivo: qual material está em andamento e em que página está o marcador.
 * Cada sessão registrada com "li N páginas" avança o marcador sozinho; aqui a pessoa escolhe o
 * livro (ou cadastra um novo) e corrige a página quando precisar.
 */
import * as React from "react";
import { BookOpen, PencilSimple } from "@phosphor-icons/react";
import {
  Banner,
  Bar,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  Field,
  Input,
  Select,
  toast,
} from "@/components/ui";
import { errorMessage } from "@/api/client";
import { useUpdateActivity } from "@/api/activity-settings";
import { useCreatePhysicalMaterial, useMaterials } from "@/api/content";
import { useUpdateMaterial } from "@/api/materials";
import type { ActivityDetail } from "@/api/types";
import { cn } from "@/lib/utils";

const NEW = "__new__";

export function CurrentMaterialCard({
  activity,
  className,
}: {
  activity: ActivityDetail;
  className?: string;
}) {
  const reading = activity.category === "leitura";
  const cur = activity.current_material ?? null;
  const [open, setOpen] = React.useState(false);
  const noun = reading ? "livro" : "material";

  return (
    <Card className={cn("gap-3 p-4", className)} data-tour="objetivo-livro-atual">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-900 text-accent"
            aria-hidden
          >
            <BookOpen size={18} weight="duotone" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="kicker">{reading ? "Lendo agora" : "Material em andamento"}</span>
            {cur ? (
              <>
                <span className="truncate text-[17px] font-medium leading-[1.2]">{cur.title}</span>
                <span className="tnum text-[12px] text-neutral-400">
                  {cur.current_page ? `p. ${cur.current_page}` : "ainda sem marcador"}
                  {cur.pages_total ? ` de ${cur.pages_total}` : ""}
                  {cur.percent != null ? ` · ${cur.percent}%` : ""}
                </span>
              </>
            ) : (
              <span className="text-[14px] text-neutral-300">
                {reading
                  ? "Qual livro você está lendo? O marcador de página avança a cada sessão registrada."
                  : "Escolha a apostila ou livro em uso: as sessões herdam o material e o marcador avança sozinho."}
              </span>
            )}
          </div>
        </div>
        <Button
          variant={cur ? "ghost" : "secondary"}
          size="sm"
          className="shrink-0"
          onClick={() => setOpen(true)}
        >
          {cur ? (
            <>
              <PencilSimple size={14} aria-hidden /> Ajustar
            </>
          ) : (
            `Definir ${noun}`
          )}
        </Button>
      </div>
      {cur?.pages_total ? (
        <Bar
          value={(cur.current_page ?? 0) / cur.pages_total}
          height={6}
          label={`${cur.current_page ?? 0} de ${cur.pages_total} páginas`}
        />
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          mode="sheet"
          title={reading ? "Livro atual" : "Material atual"}
          description={
            reading
              ? "Diga em que página está. A cada sessão, informe quantas páginas leu e o marcador avança sozinho."
              : "As sessões deste objetivo herdam este material; informe as páginas lidas e o marcador avança."
          }
        >
          {/* montado só enquanto aberto: cada abertura parte do estado atual do objetivo */}
          {open ? <BookmarkForm activity={activity} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/** Escolher/cadastrar o material atual e corrigir a página do marcador. */
function BookmarkForm({ activity, onClose }: { activity: ActivityDetail; onClose: () => void }) {
  const reading = activity.category === "leitura";
  const cur = activity.current_material ?? null;
  const materials = useMaterials(activity.id);
  const updateActivity = useUpdateActivity(activity.id);
  const updateMaterial = useUpdateMaterial();
  const createPhysical = useCreatePhysicalMaterial(activity.id);
  const [materialId, setMaterialId] = React.useState<string>(cur?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [total, setTotal] = React.useState("");
  const [page, setPage] = React.useState(cur?.current_page != null ? String(cur.current_page) : "");
  const [error, setError] = React.useState<string | null>(null);

  const list = materials.data ?? [];
  // sem nenhum material cadastrado, a folha já abre no cadastro
  const creating = materialId === NEW || (!materials.isPending && list.length === 0 && !materialId);
  const selected = list.find((m) => m.id === materialId);
  const pagesTotal = creating
    ? total.trim()
      ? Number(total)
      : null
    : (selected?.pages_total ?? cur?.pages_total ?? null);
  const busy = updateActivity.isPending || updateMaterial.isPending || createPhysical.isPending;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pageNum = page.trim() === "" ? null : Number(page);
    if (pageNum != null && (!Number.isInteger(pageNum) || pageNum < 0))
      return setError("Página atual: use só números.");
    if (pagesTotal != null && pageNum != null && pageNum > pagesTotal)
      return setError("A página atual não pode passar do total de páginas.");
    try {
      let id = materialId;
      if (creating) {
        if (!title.trim()) return setError(`Dê um nome ao ${reading ? "livro" : "material"}.`);
        if (total.trim() && (!Number.isInteger(Number(total)) || Number(total) < 1))
          return setError("Total de páginas: use um número inteiro maior que zero.");
        const m = await createPhysical.mutateAsync({
          activity_id: activity.id,
          title: title.trim(),
          pages_total: total.trim() ? Number(total) : null,
        });
        id = m.id;
      }
      if (!id) {
        await updateActivity.mutateAsync({ clear_current_material: true });
        toast.success(reading ? "Livro atual removido" : "Material atual removido");
        onClose();
        return;
      }
      // página primeiro: se falhar, o objetivo continua como estava
      const prevPage = id === cur?.id ? (cur?.current_page ?? null) : (selected?.current_page ?? null);
      if (pageNum !== prevPage) {
        await updateMaterial.mutateAsync({
          id,
          body: pageNum == null ? { clear_current_page: true } : { current_page: pageNum },
        });
      }
      if (id !== cur?.id) await updateActivity.mutateAsync({ current_material_id: id });
      toast.success(
        reading ? "Marcador atualizado" : "Material atual salvo",
        pageNum != null ? `Você está na página ${pageNum}.` : undefined,
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-[14px]" noValidate>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {materials.isError ? <Banner kind="error">Não foi possível carregar os materiais.</Banner> : null}
      {list.length > 0 ? (
        <Field label={reading ? "Livro" : "Material"} htmlFor="bm-material">
          <Select
            id="bm-material"
            value={creating ? NEW : materialId}
            onChange={(e) => {
              const v = e.target.value;
              setMaterialId(v);
              const m = list.find((x) => x.id === v);
              setPage(m?.current_page != null ? String(m.current_page) : "");
            }}
          >
            <option value="">{cur ? "Nenhum (remover)" : "Escolha…"}</option>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
                {m.pages_total ? ` · ${m.pages_total} p.` : ""}
              </option>
            ))}
            <option value={NEW}>{reading ? "+ Novo livro" : "+ Novo material físico"}</option>
          </Select>
        </Field>
      ) : null}
      {creating ? (
        <>
          <Field label={reading ? "Título do livro" : "Nome do material"} htmlFor="bm-title">
            <Input
              id="bm-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={reading ? "Ex.: Dom Casmurro" : "Ex.: Apostila de Direito Constitucional"}
              autoFocus
            />
          </Field>
          <Field
            label="Total de páginas (opcional)"
            htmlFor="bm-total"
            hint="Com o total, mostramos a porcentagem lida."
          >
            <Input
              id="bm-total"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              className="tnum"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
        </>
      ) : null}
      {creating || materialId ? (
        <Field
          label="Página atual"
          htmlFor="bm-page"
          hint={
            pagesTotal
              ? `De 0 a ${pagesTotal}. Deixe em branco para começar do início.`
              : "Onde o marcador está agora."
          }
        >
          <Input
            id="bm-page"
            type="number"
            inputMode="numeric"
            min={0}
            max={pagesTotal ?? 100000}
            className="tnum"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="ex.: 42"
          />
        </Field>
      ) : null}
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          Salvar
        </Button>
      </DialogActions>
    </form>
  );
}
