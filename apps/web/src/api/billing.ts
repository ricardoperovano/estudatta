/** Planos e assinatura: catálogo público, estado da assinatura, checkout, cancelamento e verificação. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import { sessionKey } from "./session";
import type { components } from "./schema";

type S = components["schemas"];
export type PublicPlans = S["PublicPlansOut"];
export type PublicPlan = S["PublicPlanOut"];
export type PlanPrice = S["PlanPriceOut"];
export type SubscriptionState = S["SubscriptionStateOut"];
export type Subscription = S["SubscriptionOut"];
export type BillingInterval = "month" | "year";

export const billingKeys = {
  plans: ["public", "plans"] as const,
  subscription: ["billing", "subscription"] as const,
};

export function usePublicPlans() {
  return useQuery({
    queryKey: billingKeys.plans,
    queryFn: async () => unwrap(await api.GET("/api/v1/public/plans")) as PublicPlans,
    staleTime: 5 * 60_000,
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: billingKeys.subscription,
    queryFn: async () => unwrap(await api.GET("/api/v1/billing/subscription")) as SubscriptionState,
    staleTime: 30_000,
  });
}

/** Cria a assinatura pendente e devolve o link de pagamento. Não ativa nada por si só. */
export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { plan_code: string; interval: BillingInterval; coupon_code?: string | null }) => unwrap(await api.POST("/api/v1/billing/checkout", { body })),
    onSettled: () => qc.invalidateQueries({ queryKey: billingKeys.subscription }),
  });
}

function useApplyState() {
  const qc = useQueryClient();
  return (state: SubscriptionState) => {
    qc.setQueryData(billingKeys.subscription, state);
    // direitos de acesso vêm da sessão: recarrega para refletir o estado confirmado pelo servidor
    qc.invalidateQueries({ queryKey: sessionKey });
  };
}

export function useCancelSubscription() {
  const apply = useApplyState();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/billing/cancel")) as SubscriptionState,
    onSuccess: apply,
  });
}

/** "Verificar situação": consulta o provedor de pagamento e atualiza o estado. */
export function useVerifySubscription() {
  const apply = useApplyState();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/billing/sync")) as SubscriptionState,
    onSuccess: apply,
  });
}

export type CouponInfo = components["schemas"]["CouponInfoOut"];

/** Valida um cupom para este usuário (sem consumir). */
export function useCheckCoupon() {
  return useMutation({
    mutationFn: async (body: { code: string; plan_code?: string | null }) => unwrap(await api.POST("/api/v1/billing/coupons/check", { body })) as CouponInfo,
  });
}

/** Cupom de dias grátis: libera o plano na hora. */
export function useRedeemCoupon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => unwrap(await api.POST("/api/v1/billing/coupons/redeem", { body: { code } })) as SubscriptionState,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.subscription });
      qc.invalidateQueries({ queryKey: sessionKey });
    },
  });
}

export function priceFor(plan: PublicPlan, interval: BillingInterval): PlanPrice | undefined {
  return plan.prices.find((p) => p.interval === interval);
}

/** Gratuito: código "free" ou nenhum preço cadastrado acima de zero (lista vazia inclusive). */
export function isFreePlan(plan: PublicPlan): boolean {
  return plan.code === "free" || plan.prices.every((p) => p.amount_cents === 0);
}

const SUB_STATUS: Record<string, string> = {
  pending: "Pagamento em confirmação",
  active: "Ativa",
  past_due: "Pagamento em atraso",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  expired: "Encerrada",
  ended: "Encerrada",
  paused: "Pausada",
};

export function subscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return "Sem assinatura";
  return SUB_STATUS[status] ?? status.replace(/_/g, " ");
}
