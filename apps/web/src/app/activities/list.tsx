import * as React from "react";
import { Link } from "react-router";
import { Banner, Button, Card, EmptyState, Spinner, Tag, toast } from "@/components/ui";
import { ApiError, errorMessage } from "@/api/client";
import { useActivities, useToday } from "@/api/queries";
import { useEntitlements } from "@/api/session";
import { categoryLabel, useChangeAnyStatus, useDeleteActivity } from "@/api/activity-settings";
import { useContentProgressMany, useMaterials } from "@/api/content";
import type { Activity } from "@/api/types";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { NewObjectiveCard, ObjectiveCard } from "@/components/app/objective-card";
import { activeDaysCount, weekTargetSeconds } from "@/components/app/week-utils";
import { fmtMinutes } from "@/lib/format";
import { useOnline } from "@/lib/online";

type Status = "active" | "paused" | "archived";
type Pending = { activity: Activity; action: "archive" | "delete" };

/** Objetivos (D1): cartões com semana × meta, pendência em damasco e conteúdo; pausados e arquivados à parte. */
export default function ActivitiesListPage() {
  const online = useOnline();
  const activities = useActivities(true);
  const today = useToday();
  const entitlements = useEntitlements();
  const materials = useMaterials(null);
  const changeStatus = useChangeAnyStatus();
  const remove = useDeleteActivity();
  const [confirm, setConfirm] = React.useState<Pending | null>(null);
  const [limitMessage, setLimitMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const all = React.useMemo(() => activities.data ?? [], [activities.data]);
  const active = all.filter((a) => a.status === "active");
  const paused = all.filter((a) => a.status === "paused");
  const archived = all.filter((a) => a.status === "archived");
  const activeIds = React.useMemo(() => all.filter((a) => a.status === "active").map((a) => a.id), [all]);
  const progress = useContentProgressMany(activeIds);

  const limitRaw = entitlements?.limits?.["max_active_activities"];
  const limit = typeof limitRaw === "number" ? limitRaw : null;
  const atLimit = limit != null && active.length >= limit;

  const setStatus = async (a: Activity, status: Status) => {
    setError(null);
    setLimitMessage(null);
    try {
      await changeStatus.mutateAsync({ id: a.id, status });
      toast.success(status === "active" ? `"${a.title}" ativo de novo` : status === "paused" ? `"${a.title}" pausado` : `"${a.title}" arquivado`, status === "paused" ? "Enquanto estiver pausado, nada entra como pendência." : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === "activity_limit") setLimitMessage(err.message);
      else setError(errorMessage(err));
    }
  };

  if (activities.isPending) {
    return (
      <div className="flex justify-center py-20" role="status">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }
  if (activities.isError) {
    return (
      <EmptyState
        title="Não foi possível carregar os objetivos."
        description={online ? "Tente de novo em instantes." : "Sem conexão: os objetivos aparecem quando você voltar à internet."}
        action={<Button onClick={() => activities.refetch()}>Tentar de novo</Button>}
      />
    );
  }

  const cards = today.data?.data.cards ?? [];
  const materialCount = (id: string) => (materials.data ?? []).filter((m) => m.activity_id === id).length;

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="tnum text-[13px] text-neutral-400">
            {active.length} {active.length === 1 ? "ativo" : "ativos"}
            {limit != null ? ` de ${limit} no plano ${entitlements?.plan_name ?? ""}`.trimEnd() : ""}
          </span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Objetivos</h1>
        </div>
        <Button asChild variant="primary" size="lg" className="hidden desktop:inline-flex">
          <Link to="/app/objetivos/novo">+ Criar objetivo</Link>
        </Button>
      </header>

      {limitMessage ? (
        <Banner
          kind="info"
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link to="/app/planos">Ver planos</Link>
            </Button>
          }
        >
          {limitMessage}
        </Banner>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {today.data?.offline ? <Banner kind="offline">Saldo provisório: mostrando a última semana sincronizada.</Banner> : null}

      {all.length === 0 ? (
        <EmptyState
          title="Nenhum objetivo ainda."
          description="Defina o que quer acompanhar, os dias e a meta diária. O plano mostra o que fazer hoje."
          action={
            <Button asChild variant="primary" size="lg">
              <Link to="/app/objetivos/novo">+ Criar objetivo</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-[14px] tablet:grid-cols-2 desktop:grid-cols-3 desktop:gap-4">
          {active.map((a, i) => {
            const card = cards.find((c) => c.activity.id === a.id);
            const target = card?.week_target ?? weekTargetSeconds(a.current_rule);
            const logged = card?.week_logged ?? 0;
            const p = progress[i]?.data;
            const days = activeDaysCount(a.current_rule);
            const mats = materialCount(a.id);
            const meta = [
              p ? `${p.topics_total} ${p.topics_total === 1 ? "tópico" : "tópicos"}` : null,
              materials.data ? `${mats} ${mats === 1 ? "material" : "materiais"}` : null,
              a.tracking_mode === "checklist" ? "checklist" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <ObjectiveCard
                key={a.id}
                to={`/app/objetivos/${a.id}`}
                title={a.title}
                cadence={days > 0 ? `${days}×/sem` : undefined}
                progress={target > 0 ? logged / target : 0}
                progressLabel={a.tracking_mode === "checklist" && target === 0 ? "sem meta de tempo" : `${fmtMinutes(logged)} de ${fmtMinutes(target)}`}
                pendingSeconds={card?.summary?.pending_prior ?? 0}
                status={card?.pause ? { label: "pausa planejada", tone: "neutral" } : !card ? { label: categoryLabel(a.category, a.language), tone: "neutral" } : undefined}
                meta={meta || undefined}
              />
            );
          })}
          <NewObjectiveCard
            disabledReason={
              atLimit ? (
                <>
                  Seu plano permite {limit} {limit === 1 ? "objetivo ativo" : "objetivos ativos"}. Pause outro ou{" "}
                  <Link to="/app/planos" className="text-accent">
                    veja os planos
                  </Link>
                  .
                </>
              ) : undefined
            }
          />
        </div>
      )}

      {paused.length > 0 ? (
        <Section title="Pausados" hint="Objetivos pausados não geram pendência nem lembretes.">
          {paused.map((a) => (
            <InactiveRow key={a.id} activity={a} busy={changeStatus.isPending} onActivate={() => setStatus(a, "active")} onArchive={() => setConfirm({ activity: a, action: "archive" })} onDelete={() => setConfirm({ activity: a, action: "delete" })} />
          ))}
        </Section>
      ) : null}
      {archived.length > 0 ? (
        <Section title="Arquivados" hint="O histórico continua nos relatórios.">
          {archived.map((a) => (
            <InactiveRow key={a.id} activity={a} busy={changeStatus.isPending} onActivate={() => setStatus(a, "active")} onDelete={() => setConfirm({ activity: a, action: "delete" })} />
          ))}
        </Section>
      ) : null}

      {active.length > 0 ? (
        <Section title="Gerenciar ativos">
          {active.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <Link to={`/app/objetivos/${a.id}`} className="min-w-0 flex-1 truncate text-primary no-underline">
                {a.title}
              </Link>
              <span className="flex gap-1">
                <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2" disabled={changeStatus.isPending} onClick={() => setStatus(a, "paused")}>
                  Pausar
                </Button>
                <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2" onClick={() => setConfirm({ activity: a, action: "archive" })}>
                  Arquivar
                </Button>
              </span>
            </div>
          ))}
        </Section>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "delete" ? `Excluir "${confirm.activity.title}"?` : `Arquivar "${confirm?.activity.title ?? ""}"?`}
        description={
          confirm?.action === "delete"
            ? "O objetivo, suas metas, tarefas e sessões registradas são removidos. Essa ação não pode ser desfeita. Para guardar o histórico, prefira arquivar."
            : "O objetivo sai de Hoje e do plano, e para de gerar pendência. O histórico continua nos relatórios e você pode reativar depois."
        }
        confirmLabel={confirm?.action === "delete" ? "Excluir" : "Arquivar"}
        danger={confirm?.action === "delete"}
        loading={remove.isPending || changeStatus.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.action === "archive") {
            await setStatus(confirm.activity, "archived");
          } else {
            try {
              await remove.mutateAsync(confirm.activity.id);
              toast.success("Objetivo excluído");
            } catch (err) {
              setError(errorMessage(err));
            }
          }
          setConfirm(null);
        }}
      />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="kicker m-0 font-normal">{title}</h2>
        {hint ? <span className="text-[12px] text-neutral-400">{hint}</span> : null}
      </div>
      <Card className="gap-1 px-4 py-2">{children}</Card>
    </section>
  );
}

function InactiveRow({ activity, busy, onActivate, onArchive, onDelete }: { activity: Activity; busy: boolean; onActivate: () => void; onArchive?: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
      <Link to={`/app/objetivos/${activity.id}`} className="flex min-w-0 flex-1 items-center gap-2 text-primary no-underline">
        <span className="truncate">{activity.title}</span>
        <Tag variant="neutral">{activity.status === "paused" ? "pausado" : "arquivado"}</Tag>
      </Link>
      <span className="flex gap-1">
        <Button variant="ghost" size="sm" className="min-h-[44px] px-2" disabled={busy} onClick={onActivate}>
          Ativar
        </Button>
        {onArchive ? (
          <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2" onClick={onArchive}>
            Arquivar
          </Button>
        ) : null}
        <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2 text-error" onClick={onDelete}>
          Excluir
        </Button>
      </span>
    </div>
  );
}
