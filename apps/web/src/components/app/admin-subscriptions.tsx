/** Painel administrativo — assinaturas: métricas e gestão (cancelar renovação, conceder acesso). */
import { t } from "@/i18n";
import * as React from "react";
import { Link } from "react-router";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useAdminPlans } from "@/api/admin";
import {
  useAdminSubscriptions,
  useCancelUserSubscription,
  useSubscriptionMetrics,
  type AdminSubscriptionRow,
  type SubscriptionMetrics,
} from "@/api/admin-growth";
import { errorMessage } from "@/api/client";
import { fmtDate, intervalLabel } from "@/components/app/admin-format";
import { SUB_STATUS, fmtDay, subscriptionStatusLabel } from "@/components/app/admin-growth-format";
import {
  AdminSection,
  AdminTitle,
  Pager,
  QueryGate,
  SearchInput,
  StatCard,
} from "@/components/app/admin-shared";
import { PromoDialog } from "@/components/app/admin-users";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button, EmptyState, Field, Select, Tag, toast } from "@/components/ui";
import { fmtBRL } from "@/lib/format";

const PAGE = 25;

const STATUS_OPTIONS = ["pending", "active", "past_due", "paused", "cancelled", "expired"] as const;

function SubscriptionStatusTag({ status, periodEnd }: { status: string; periodEnd?: string | null }) {
  return (
    <Tag variant={SUB_STATUS[status]?.variant ?? "neutral"}>{subscriptionStatusLabel(status, periodEnd)}</Tag>
  );
}

interface Filter {
  status: string;
  plan_code: string;
  q: string;
  offset: number;
}

export function AdminSubscriptionsPage() {
  const metrics = useSubscriptionMetrics();
  const plans = useAdminPlans();
  const [filter, setFilter] = React.useState<Filter>({ status: "", plan_code: "", q: "", offset: 0 });
  const subs = useAdminSubscriptions({ ...filter, limit: PAGE });
  const commit = React.useCallback(
    (q: string) => setFilter((f) => (f.q === q ? f : { ...f, q, offset: 0 })),
    [],
  );
  const planOptions = (plans.data ?? []).filter((p) => p.code !== "free");

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Assinaturas")}
        subtitle={t(
          "Quem paga, quem está em atraso e quem tem acesso promocional. Cancelar aqui só interrompe a renovação: o acesso segue até o fim do período.",
        )}
        actions={
          <Button
            variant="secondary"
            size="lg"
            loading={metrics.isFetching || subs.isFetching}
            onClick={() => {
              void metrics.refetch();
              void subs.refetch();
            }}
          >
            <ArrowsClockwise size={16} aria-hidden /> {t("Atualizar")}
          </Button>
        }
      />

      <QueryGate query={metrics}>{(m) => <MetricsGrid m={m} />}</QueryGate>

      <AdminSection
        title={t("Todas as assinaturas")}
        meta={
          subs.data?.total != null ? (
            <span className="tnum">
              {t("{{v0}} no total", { v0: subs.data.total.toLocaleString("pt-BR") })}
            </span>
          ) : null
        }
      >
        <div className="flex flex-col gap-3 tablet:flex-row tablet:flex-wrap tablet:items-end">
          <SearchInput
            label={t("Buscar por nome ou e-mail")}
            placeholder={t("Nome ou e-mail")}
            onCommit={commit}
          />
          <Field label={t("Situação")} htmlFor="sub-status" className="w-full tablet:w-[180px]">
            <Select
              id="sub-status"
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value, offset: 0 }))}
            >
              <option value="">{t("Todas")}</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SUB_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Plano")} htmlFor="sub-plan" className="w-full tablet:w-[200px]">
            <Select
              id="sub-plan"
              value={filter.plan_code}
              onChange={(e) => setFilter((f) => ({ ...f, plan_code: e.target.value, offset: 0 }))}
            >
              <option value="">{t("Todos")}</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <QueryGate query={subs}>
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                title={t("Nenhuma assinatura encontrada.")}
                description={
                  filter.q || filter.status || filter.plan_code
                    ? t("Tente outros filtros.")
                    : t("Quando alguém assinar, aparece aqui.")
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">
                        <th scope="col" className="py-2 pr-3 font-normal">
                          {t("Pessoa")}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          {t("Plano")}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          {t("Situação")}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          {t("Valor")}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          {t("Período atual")}
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          {t("Renovação")}
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          <span className="sr-only">{t("Ações")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.items.map((s) => (
                        <SubscriptionRow key={s.id} s={s} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  total={page.total}
                  limit={page.limit}
                  offset={page.offset}
                  count={page.items.length}
                  busy={subs.isFetching}
                  onChange={(offset) => setFilter((f) => ({ ...f, offset }))}
                />
              </>
            )
          }
        </QueryGate>
      </AdminSection>
    </div>
  );
}

function MetricsGrid({ m }: { m: SubscriptionMetrics }) {
  const n = (v: number) => v.toLocaleString("pt-BR");
  const plans = Object.entries(m.by_plan);
  return (
    <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3 desktop:grid-cols-4">
      <StatCard label={t("Usuários")} value={n(m.users_total)} />
      <StatCard label={t("Assinantes ativos")} value={n(m.active)}>
        <span className="text-[12px] text-neutral-400">{t("inclui em atraso")}</span>
      </StatCard>
      <StatCard label="MRR" value={fmtBRL(m.mrr_cents)}>
        <span className="text-[12px] text-neutral-400">{t("receita mensal recorrente (anuais ÷ 12)")}</span>
      </StatCard>
      <StatCard label={t("Novas em 30 dias")} value={n(m.new_30d)} />
      <StatCard label={t("Canceladas em 30 dias")} value={n(m.churned_30d)} />
      <StatCard label={t("Em atraso")} value={n(m.past_due)} />
      <StatCard label={t("Pendentes")} value={n(m.pending)}>
        <span className="text-[12px] text-neutral-400">{t("checkout iniciado, sem pagamento")}</span>
      </StatCard>
      <StatCard label={t("Com acesso promocional")} value={n(m.promo_active)} />
      <StatCard label={t("Por plano")}>
        {plans.length === 0 ? (
          <span className="text-[13px] text-neutral-400">{t("Nenhum assinante ativo.")}</span>
        ) : (
          <dl className="flex flex-col gap-1 text-[13px]">
            {plans.map(([code, count]) => (
              <div key={code} className="flex justify-between gap-3">
                <dt className="text-neutral-400">{code}</dt>
                <dd className="tnum">{n(count)}</dd>
              </div>
            ))}
          </dl>
        )}
      </StatCard>
      {m.cancelled_access > 0 ? (
        <StatCard label={t("Canceladas com acesso")} value={n(m.cancelled_access)}>
          <span className="text-[12px] text-neutral-400">{t("ainda dentro do período pago")}</span>
        </StatCard>
      ) : null}
    </div>
  );
}

function SubscriptionRow({ s }: { s: AdminSubscriptionRow }) {
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [promoOpen, setPromoOpen] = React.useState(false);
  const cancel = useCancelUserSubscription();
  const canCancel =
    (s.status === "active" || s.status === "past_due" || s.status === "pending") && !s.cancel_at_period_end;

  const doCancel = async () => {
    try {
      const r = await cancel.mutateAsync(s.user_id);
      toast("success", t("Renovação cancelada"), r.message ?? undefined);
    } catch (e) {
      toast("error", t("Não foi possível cancelar"), errorMessage(e));
    }
    setConfirmCancel(false);
  };

  const renewal = s.cancel_at_period_end
    ? t("Não renova")
    : s.status === "active" || s.status === "past_due"
      ? fmtDay(s.current_period_end)
      : "—";

  return (
    <tr className="border-t border-divider align-top">
      <td className="max-w-[240px] py-2 pr-3">
        <Link to={`/admin/usuarios/${s.user_id}`} className="flex min-w-0 flex-col text-accent">
          <span className="truncate">{s.user_email}</span>
          {s.user_name ? <span className="truncate text-[12px] text-neutral-400">{s.user_name}</span> : null}
        </Link>
      </td>
      <td className="py-2 pr-3">
        <span>{s.plan_name}</span>
        <span className="block text-[12px] text-neutral-400">{s.provider}</span>
      </td>
      <td className="py-2 pr-3">
        <SubscriptionStatusTag status={s.status} periodEnd={s.current_period_end} />
      </td>
      <td className="tnum whitespace-nowrap py-2 pr-3">
        {s.amount_cents != null
          ? `${fmtBRL(s.amount_cents)}${s.interval ? ` / ${intervalLabel(s.interval)}` : ""}`
          : "—"}
        {s.coupon_code ? (
          <span className="block text-[12px] text-neutral-400">
            {t("cupom {{v0}}", { v0: s.coupon_code })}
          </span>
        ) : null}
      </td>
      <td className="tnum whitespace-nowrap py-2 pr-3">
        {s.current_period_start || s.current_period_end
          ? `${fmtDay(s.current_period_start)} → ${fmtDay(s.current_period_end)}`
          : "—"}
      </td>
      <td className="tnum whitespace-nowrap py-2 pr-3">{renewal}</td>
      <td className="py-2">
        <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
          <Button variant="secondary" size="sm" onClick={() => setPromoOpen(true)}>
            {t("Conceder acesso")}
          </Button>
          {canCancel ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
              {t("Cancelar renovação")}
            </Button>
          ) : null}
        </div>
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title={t("Cancelar a renovação?")}
          description={t(
            "A assinatura de {{v0}} não será renovada. O acesso ao {{v1}} continua até {{v2}}. A ação fica registrada na auditoria.",
            { v0: s.user_email, v1: s.plan_name, v2: fmtDate(s.current_period_end) },
          )}
          confirmLabel={t("Cancelar renovação")}
          cancelLabel={t("Voltar")}
          danger
          loading={cancel.isPending}
          onConfirm={doCancel}
        />
        <PromoDialog
          open={promoOpen}
          onOpenChange={setPromoOpen}
          userId={s.user_id}
          userLabel={s.user_name || s.user_email}
        />
      </td>
    </tr>
  );
}
