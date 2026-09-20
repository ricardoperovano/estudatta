/**
 * Painel administrativo — crescimento: assinaturas (métricas e gestão), cupons e campanhas.
 * Chaves sob "admin"; mutações invalidam o escopo afetado (e usuários quando mexem em acesso).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminKeys, type PageFilter } from "./admin";
import { api, unwrap } from "./client";
import type { components } from "./schema";

type S = components["schemas"];

export type SubscriptionMetrics = S["SubscriptionMetricsOut"];
export type AdminSubscriptionRow = S["AdminSubscriptionOut"];
export type Coupon = S["CouponOut"];
export type CouponIn = S["CouponIn"];
export type Campaign = S["CampaignOut"];
export type CampaignIn = S["CampaignIn"];
export type CampaignUpdate = S["CampaignUpdate"];
export type Segment = S["SegmentOut"];
export type SendOut = S["SendOut"];

export interface SubscriptionsFilter extends PageFilter {
  status?: string;
  plan_code?: string;
  q?: string;
}

export const growthKeys = {
  subscriptionsScope: ["admin", "subscriptions"] as const,
  subscriptionMetrics: ["admin", "subscriptions", "metrics"] as const,
  subscriptions: (f: SubscriptionsFilter) => ["admin", "subscriptions", "list", f] as const,
  coupons: ["admin", "coupons"] as const,
  campaignsScope: ["admin", "campaigns"] as const,
  campaigns: ["admin", "campaigns", "list"] as const,
  segments: ["admin", "campaigns", "segments"] as const,
};

function useInvalidate() {
  const qc = useQueryClient();
  return (...scopes: readonly (readonly unknown[])[]) => {
    for (const key of scopes) qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: adminKeys.auditScope });
  };
}

// --- Assinaturas ------------------------------------------------------------------------------

export function useSubscriptionMetrics() {
  return useQuery({
    queryKey: growthKeys.subscriptionMetrics,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/subscriptions/metrics")),
    staleTime: 30_000,
  });
}

export function useAdminSubscriptions(f: SubscriptionsFilter) {
  return useQuery({
    queryKey: growthKeys.subscriptions(f),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/admin/subscriptions", {
          params: {
            query: {
              status: f.status || undefined,
              plan_code: f.plan_code || undefined,
              q: f.q || undefined,
              limit: f.limit ?? 25,
              offset: f.offset ?? 0,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useCancelUserSubscription() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await api.POST("/api/v1/admin/users/{user_id}/subscription/cancel", {
          params: { path: { user_id: userId } },
        }),
      ),
    onSuccess: () => invalidate(growthKeys.subscriptionsScope, adminKeys.usersScope, adminKeys.overview),
  });
}

// --- Cupons -----------------------------------------------------------------------------------

export function useAdminCoupons() {
  return useQuery({
    queryKey: growthKeys.coupons,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/coupons")),
    staleTime: 30_000,
  });
}

export function useCreateCoupon() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: CouponIn) => unwrap(await api.POST("/api/v1/admin/coupons", { body })),
    onSuccess: () => invalidate(growthKeys.coupons),
  });
}

export function useToggleCoupon() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (couponId: string) =>
      unwrap(
        await api.POST("/api/v1/admin/coupons/{coupon_id}/toggle", {
          params: { path: { coupon_id: couponId } },
        }),
      ),
    onSuccess: () => invalidate(growthKeys.coupons),
  });
}

// --- Campanhas --------------------------------------------------------------------------------

export function useCampaignSegments() {
  return useQuery({
    queryKey: growthKeys.segments,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/campaigns/segments")),
    staleTime: 60_000,
  });
}

export function useAdminCampaigns() {
  return useQuery({
    queryKey: growthKeys.campaigns,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/campaigns")),
    staleTime: 15_000,
  });
}

export function useCreateCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (body: CampaignIn) => unwrap(await api.POST("/api/v1/admin/campaigns", { body })),
    onSuccess: () => invalidate(growthKeys.campaignsScope),
  });
}

export function useUpdateCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: CampaignUpdate }) =>
      unwrap(
        await api.PATCH("/api/v1/admin/campaigns/{campaign_id}", {
          params: { path: { campaign_id: id } },
          body,
        }),
      ),
    onSuccess: () => invalidate(growthKeys.campaignsScope),
  });
}

export function useTestCampaign() {
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.POST("/api/v1/admin/campaigns/{campaign_id}/test", {
          params: { path: { campaign_id: id } },
        }),
      ),
  });
}

export function useSendCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.POST("/api/v1/admin/campaigns/{campaign_id}/send", {
          params: { path: { campaign_id: id } },
        }),
      ),
    onSuccess: () => invalidate(growthKeys.campaignsScope, adminKeys.queuesScope, adminKeys.overview),
  });
}

export function useDeleteCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(
        await api.DELETE("/api/v1/admin/campaigns/{campaign_id}", { params: { path: { campaign_id: id } } }),
      ),
    onSuccess: () => invalidate(growthKeys.campaignsScope),
  });
}
