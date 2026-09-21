import { t } from "@/i18n";
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
import { usePageTour } from "@/components/tour/use-tours";
import { objetivosTour } from "@/tours/objetivos";
import { NoObjectives } from "@/components/empty/no-objectives";

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
  usePageTour(objetivosTour, activities.isSuccess && !today.isPending);

  const limitRaw = entitlements?.limits?.["max_active_activities"];
  const limit = typeof limitRaw === "number" ? limitRaw : null;
  const atLimit = limit != null && active.length >= limit;

  const setStatus = async (a: Activity, status: Status) => {
    setError(null);
    setLimitMessage(null);
    try {
      await changeStatus.mutateAsync({ id: a.id, status });
      toast.success(
        status === "active"
          ? t('"{{v0}}" ativo de novo', { v0: a.title })
          : status === "paused"
            ? t('"{{v0}}" pausado', { v0: a.title })
            : t('"{{v0}}" arquivado', { v0: a.title }),
        status === "paused" ? t("Enquanto estiver pausado, nada entra como pendência.") : undefined,
      );
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
        title={t("Não foi possível carregar os objetivos.")}
        description={
          online
            ? t("Tente de novo em instantes.")
            : t("Sem conexão: os objetivos aparecem quando você voltar à internet.")
        }
        action={<Button onClick={() => activities.refetch()}>{t("Tentar de novo")}</Button>}
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
            {limit != null
              ? (
                  " " + t("de {{v0}} no plano {{v1}}", { v0: limit, v1: entitlements?.plan_name ?? "" })
                ).trimEnd()
              : ""}
          </span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">
            {t("Objetivos")}
          </h1>
        </div>
        {/* sem objetivos, o convite logo abaixo já traz o botão */}
        <Button
          asChild
          variant="primary"
          size="lg"
          className={all.length > 0 ? "hidden desktop:inline-flex" : "hidden"}
          data-tour="objetivos-novo"
        >
          <Link to="/app/objetivos/novo">{t("+ Criar objetivo")}</Link>
        </Button>
      </header>

      {limitMessage ? (
        <Banner
          kind="info"
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link to="/app/planos">{t("Ver planos")}</Link>
            </Button>
          }
        >
          {limitMessage}
        </Banner>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {today.data?.offline ? (
        <Banner kind="offline">{t("Saldo provisório: mostrando a última semana sincronizada.")}</Banner>
      ) : null}

      {all.length === 0 ? (
        <NoObjectives />
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
              p ? `${p.topics_total} ${p.topics_total === 1 ? t("tópico") : t("tópicos")}` : null,
              materials.data ? `${mats} ${mats === 1 ? "material" : "materiais"}` : null,
              a.tracking_mode === "checklist" ? "checklist" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const objectiveCard = (
              <ObjectiveCard
                key={a.id}
                to={`/app/objetivos/${a.id}`}
                title={a.title}
                cadence={days > 0 ? t("{{v0}}×/sem", { v0: days }) : undefined}
                progress={target > 0 ? logged / target : 0}
                progressLabel={
                  a.tracking_mode === "checklist" && target === 0
                    ? t("sem meta de tempo")
                    : t("{{v0}} de {{v1}}", { v0: fmtMinutes(logged), v1: fmtMinutes(target) })
                }
                pendingSeconds={card?.summary?.pending_prior ?? 0}
                status={
                  card?.pause
                    ? { label: t("pausa planejada"), tone: "neutral" }
                    : !card
                      ? { label: categoryLabel(a.category, a.language), tone: "neutral" }
                      : undefined
                }
                meta={meta || undefined}
              />
            );
            // o primeiro cartão é o alvo do tour; o invólucro em grid mantém a altura igual à dos vizinhos
            return i === 0 ? (
              <div key={a.id} className="grid" data-tour="objetivos-lista">
                {objectiveCard}
              </div>
            ) : (
              objectiveCard
            );
          })}
          <div data-tour="objetivos-novo" className="grid">
            <NewObjectiveCard
              disabledReason={
                atLimit ? (
                  <>
                    {t("Seu plano permite {{v0}} {{v1}}. Pause outro ou", {
                      v0: limit,
                      v1: limit === 1 ? t("objetivo ativo") : t("objetivos ativos"),
                    })}{" "}
                    <Link to="/app/planos" className="text-accent">
                      {t("veja os planos")}
                    </Link>
                    .
                  </>
                ) : undefined
              }
            />
          </div>
        </div>
      )}

      {paused.length > 0 ? (
        <Section title={t("Pausados")} hint={t("Objetivos pausados não geram pendência nem lembretes.")}>
          {paused.map((a) => (
            <InactiveRow
              key={a.id}
              activity={a}
              busy={changeStatus.isPending}
              onActivate={() => setStatus(a, "active")}
              onArchive={() => setConfirm({ activity: a, action: "archive" })}
              onDelete={() => setConfirm({ activity: a, action: "delete" })}
            />
          ))}
        </Section>
      ) : null}
      {archived.length > 0 ? (
        <Section title={t("Arquivados")} hint={t("O histórico continua nos relatórios.")}>
          {archived.map((a) => (
            <InactiveRow
              key={a.id}
              activity={a}
              busy={changeStatus.isPending}
              onActivate={() => setStatus(a, "active")}
              onDelete={() => setConfirm({ activity: a, action: "delete" })}
            />
          ))}
        </Section>
      ) : null}

      {active.length > 0 ? (
        <Section title={t("Gerenciar ativos")} tour="objetivos-gerenciar">
          {active.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <Link
                to={`/app/objetivos/${a.id}`}
                className="min-w-0 flex-1 truncate text-primary no-underline"
              >
                {a.title}
              </Link>
              <span className="flex gap-1">
                <Button
                  variant="ghost-muted"
                  size="sm"
                  className="min-h-[44px] px-2"
                  disabled={changeStatus.isPending}
                  onClick={() => setStatus(a, "paused")}
                >
                  {t("Pausar")}
                </Button>
                <Button
                  variant="ghost-muted"
                  size="sm"
                  className="min-h-[44px] px-2"
                  onClick={() => setConfirm({ activity: a, action: "archive" })}
                >
                  {t("Arquivar")}
                </Button>
              </span>
            </div>
          ))}
        </Section>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={
          confirm?.action === "delete"
            ? t('Excluir "{{v0}}"?', { v0: confirm.activity.title })
            : t('Arquivar "{{v0}}"?', { v0: confirm?.activity.title ?? "" })
        }
        description={
          confirm?.action === "delete"
            ? t(
                "O objetivo, suas metas, tarefas e sessões registradas são removidos. Essa ação não pode ser desfeita. Para guardar o histórico, prefira arquivar.",
              )
            : t(
                "O objetivo sai de Hoje e do plano, e para de gerar pendência. O histórico continua nos relatórios e você pode reativar depois.",
              )
        }
        confirmLabel={confirm?.action === "delete" ? t("Excluir") : t("Arquivar")}
        danger={confirm?.action === "delete"}
        loading={remove.isPending || changeStatus.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.action === "archive") {
            await setStatus(confirm.activity, "archived");
          } else {
            try {
              await remove.mutateAsync(confirm.activity.id);
              toast.success(t("Objetivo excluído"));
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

function Section({
  title,
  hint,
  tour,
  children,
}: {
  title: string;
  hint?: string;
  tour?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" data-tour={tour}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="kicker m-0 font-normal">{title}</h2>
        {hint ? <span className="text-[12px] text-neutral-400">{hint}</span> : null}
      </div>
      <Card className="gap-1 px-4 py-2">{children}</Card>
    </section>
  );
}

function InactiveRow({
  activity,
  busy,
  onActivate,
  onArchive,
  onDelete,
}: {
  activity: Activity;
  busy: boolean;
  onActivate: () => void;
  onArchive?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
      <Link
        to={`/app/objetivos/${activity.id}`}
        className="flex min-w-0 flex-1 items-center gap-2 text-primary no-underline"
      >
        <span className="truncate">{activity.title}</span>
        <Tag variant="neutral">{activity.status === "paused" ? "pausado" : "arquivado"}</Tag>
      </Link>
      <span className="flex gap-1">
        <Button variant="ghost" size="sm" className="min-h-[44px] px-2" disabled={busy} onClick={onActivate}>
          {t("Ativar")}
        </Button>
        {onArchive ? (
          <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2" onClick={onArchive}>
            {t("Arquivar")}
          </Button>
        ) : null}
        <Button variant="ghost-muted" size="sm" className="min-h-[44px] px-2 text-error" onClick={onDelete}>
          {t("Excluir")}
        </Button>
      </span>
    </div>
  );
}
