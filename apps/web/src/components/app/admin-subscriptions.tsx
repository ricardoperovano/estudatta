/** Painel administrativo — assinaturas: métricas e gestão (cancelar renovação, conceder acesso). */
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
        title="Assinaturas"
        subtitle="Quem paga, quem está em atraso e quem tem acesso promocional. Cancelar aqui só interrompe a renovação: o acesso segue até o fim do período."
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
            <ArrowsClockwise size={16} aria-hidden /> Atualizar
          </Button>
        }
      />

      <QueryGate query={metrics}>{(m) => <MetricsGrid m={m} />}</QueryGate>

      <AdminSection
        title="Todas as assinaturas"
        meta={
          subs.data?.total != null ? (
            <span className="tnum">{subs.data.total.toLocaleString("pt-BR")} no total</span>
          ) : null
        }
      >
        <div className="flex flex-col gap-3 tablet:flex-row tablet:flex-wrap tablet:items-end">
          <SearchInput label="Buscar por nome ou e-mail" placeholder="Nome ou e-mail" onCommit={commit} />
          <Field label="Situação" htmlFor="sub-status" className="w-full tablet:w-[180px]">
            <Select
              id="sub-status"
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value, offset: 0 }))}
            >
              <option value="">Todas</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {SUB_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plano" htmlFor="sub-plan" className="w-full tablet:w-[200px]">
            <Select
              id="sub-plan"
              value={filter.plan_code}
              onChange={(e) => setFilter((f) => ({ ...f, plan_code: e.target.value, offset: 0 }))}
            >
              <option value="">Todos</option>
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
                title="Nenhuma assinatura encontrada."
                description={
                  filter.q || filter.status || filter.plan_code
                    ? "Tente outros filtros."
                    : "Quando alguém assinar, aparece aqui."
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">
                        <th scope="col" className="py-2 pr-3 font-normal">
                          Pessoa
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          Plano
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          Situação
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          Valor
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          Período atual
                        </th>
                        <th scope="col" className="py-2 pr-3 font-normal">
                          Renovação
                        </th>
                        <th scope="col" className="py-2 font-normal">
                          <span className="sr-only">Ações</span>
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
      <StatCard label="Usuários" value={n(m.users_total)} />
      <StatCard label="Assinantes ativos" value={n(m.active)}>
        <span className="text-[12px] text-neutral-400">inclui em atraso</span>
      </StatCard>
      <StatCard label="MRR" value={fmtBRL(m.mrr_cents)}>
        <span className="text-[12px] text-neutral-400">receita mensal recorrente (anuais ÷ 12)</span>
      </StatCard>
      <StatCard label="Novas em 30 dias" value={n(m.new_30d)} />
      <StatCard label="Canceladas em 30 dias" value={n(m.churned_30d)} />
      <StatCard label="Em atraso" value={n(m.past_due)} />
      <StatCard label="Pendentes" value={n(m.pending)}>
        <span className="text-[12px] text-neutral-400">checkout iniciado, sem pagamento</span>
      </StatCard>
      <StatCard label="Com acesso promocional" value={n(m.promo_active)} />
      <StatCard label="Por plano">
        {plans.length === 0 ? (
          <span className="text-[13px] text-neutral-400">Nenhum assinante ativo.</span>
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
        <StatCard label="Canceladas com acesso" value={n(m.cancelled_access)}>
          <span className="text-[12px] text-neutral-400">ainda dentro do período pago</span>
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
      toast("success", "Renovação cancelada", r.message ?? undefined);
    } catch (e) {
      toast("error", "Não foi possível cancelar", errorMessage(e));
    }
    setConfirmCancel(false);
  };

  const renewal = s.cancel_at_period_end
    ? "Não renova"
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
          <span className="block text-[12px] text-neutral-400">cupom {s.coupon_code}</span>
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
            Conceder acesso
          </Button>
          {canCancel ? (
            <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
              Cancelar renovação
            </Button>
          ) : null}
        </div>
        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title="Cancelar a renovação?"
          description={`A assinatura de ${s.user_email} não será renovada. O acesso ao ${s.plan_name} continua até ${fmtDate(s.current_period_end)}. A ação fica registrada na auditoria.`}
          confirmLabel="Cancelar renovação"
          cancelLabel="Voltar"
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
