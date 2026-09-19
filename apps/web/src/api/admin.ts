/**
 * Consultas e mutações do painel administrativo (/api/v1/admin).
 * Todas as chaves começam com "admin"; toda mutação invalida o escopo afetado.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "./client";
import type { components } from "./schema";

type S = components["schemas"];

export type AdminOverview = S["OverviewOut"];
export type AdminUser = S["AdminUserOut"];
export type AdminUserDetail = S["AdminUserDetailOut"];
export type AdminEntitlements = S["EntitlementsOut"];
export type AdminSubscription = S["SubscriptionOut"];
export type PromoGrant = S["PromoGrantOut"];
export type PlanAdmin = S["PlanAdminOut"];
export type PlanPriceAdmin = S["PlanPriceAdminOut"];
export type PlanCreateIn = S["PlanCreateIn"];
export type PlanUpdateIn = S["PlanUpdateIn"];
export type PlanPriceIn = S["PlanPriceIn"];
export type SettingOut = S["SettingOut"];
export type QueuesOut = S["QueuesOut"];
export type OutboxRow = S["OutboxOut"];
export type DeliveryRow = S["DeliveryOut"];
export type ImportJobRow = S["ImportJobAdminOut"];
export type BillingEvent = S["BillingEventOut"];
export type AuditRow = S["AuditOut"];
export type ReconcileOut = S["ReconcileOut"];
export type UserRole = S["RoleIn"]["role"];

export interface Page<T> {
  items: T[];
  total?: number | null;
  limit: number;
  offset: number;
}

export type SettingKey = "brand" | "feature_flags" | "limits";
export const SETTING_KEYS: readonly SettingKey[] = ["brand", "feature_flags", "limits"];

/** Limites conhecidos do catálogo (espelho de KNOWN_LIMITS no backend). */
export const KNOWN_LIMIT_KEYS = [
  "max_active_activities",
  "materials_storage_mb",
  "max_materials",
  "ai_daily_actions",
  "ai_monthly_actions",
  "auto_planning",
  "reports",
  "recovery_distribution",
  "csv_export",
  "reminders",
] as const;

export interface PageFilter {
  limit?: number;
  offset?: number;
}
export interface UsersFilter extends PageFilter {
  q?: string;
}
export interface BillingFilter extends PageFilter {
  status?: string;
}
export interface AuditFilter extends PageFilter {
  action?: string;
  actor_id?: string;
}

export const adminKeys = {
  all: ["admin"] as const,
  overview: ["admin", "overview"] as const,
  usersScope: ["admin", "users"] as const,
  users: (f: UsersFilter) => ["admin", "users", "list", f] as const,
  user: (id: string) => ["admin", "users", "detail", id] as const,
  plans: ["admin", "plans"] as const,
  settingsScope: ["admin", "settings"] as const,
  setting: (key: SettingKey) => ["admin", "settings", key] as const,
  queuesScope: ["admin", "queues"] as const,
  queues: (f: PageFilter) => ["admin", "queues", f] as const,
  billingScope: ["admin", "billing"] as const,
  billingEvents: (f: BillingFilter) => ["admin", "billing", "events", f] as const,
  auditScope: ["admin", "audit"] as const,
  audit: (f: AuditFilter) => ["admin", "audit", f] as const,
};

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return (...scopes: readonly (readonly unknown[])[]) => {
    const list = scopes.length ? scopes : [adminKeys.all];
    for (const key of list) qc.invalidateQueries({ queryKey: key });
    // qualquer mutação muda a trilha de auditoria
    qc.invalidateQueries({ queryKey: adminKeys.auditScope });
  };
}

// --- Visão geral -----------------------------------------------------------------------

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/overview")),
    staleTime: 30_000,
  });
}

// --- Usuários --------------------------------------------------------------------------------

export function useAdminUsers(f: UsersFilter) {
  return useQuery({
    queryKey: adminKeys.users(f),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/admin/users", {
          params: { query: { q: f.q || undefined, limit: f.limit ?? 25, offset: f.offset ?? 0 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useAdminUser(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.user(id || ""),
    enabled: !!id,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/users/{user_id}", { params: { path: { user_id: id! } } })),
  });
}

export function useSetUserRole() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: UserRole }) =>
      unwrap(await api.POST("/api/v1/admin/users/{user_id}/role", { params: { path: { user_id: id } }, body: { role } })),
    onSuccess: () => invalidate(adminKeys.usersScope, adminKeys.overview),
  });
}

export function useSetUserActive() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      active
        ? unwrap(await api.POST("/api/v1/admin/users/{user_id}/reactivate", { params: { path: { user_id: id } } }))
        : unwrap(await api.POST("/api/v1/admin/users/{user_id}/deactivate", { params: { path: { user_id: id } } })),
    onSuccess: () => invalidate(adminKeys.usersScope, adminKeys.overview),
  });
}

export function useGrantPromo() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ id, plan_code, days, reason }: { id: string; plan_code: string; days: number; reason: string }) =>
      unwrap(
        await api.POST("/api/v1/admin/users/{user_id}/promo", {
          params: { path: { user_id: id } },
          body: { plan_code, days, reason },
        }),
      ),
    onSuccess: () => invalidate(adminKeys.usersScope, adminKeys.overview),
  });
}

export function useRevokePromo() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (grantId: string) => unwrap(await api.DELETE("/api/v1/admin/promo/{grant_id}", { params: { path: { grant_id: grantId } } })),
    onSuccess: () => invalidate(adminKeys.usersScope, adminKeys.overview),
  });
}

// --- Catálogo ----------------------------------------------------------------------------------

export function useAdminPlans() {
  return useQuery({
    queryKey: adminKeys.plans,
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/plans")),
    staleTime: 60_000,
  });
}

export function useCreatePlan() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (body: PlanCreateIn) => unwrap(await api.POST("/api/v1/admin/plans", { body })),
    onSuccess: () => invalidate(adminKeys.plans),
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PlanUpdateIn }) =>
      unwrap(await api.PATCH("/api/v1/admin/plans/{plan_id}", { params: { path: { plan_id: id } }, body })),
    onSuccess: () => invalidate(adminKeys.plans),
  });
}

export function useSetPlanPrices() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ id, prices }: { id: string; prices: PlanPriceIn[] }) =>
      unwrap(await api.PUT("/api/v1/admin/plans/{plan_id}/prices", { params: { path: { plan_id: id } }, body: { prices } })),
    onSuccess: () => invalidate(adminKeys.plans),
  });
}

// --- Configurações -------------------------------------------------------------------------------

export function useAdminSetting(key: SettingKey) {
  return useQuery({
    queryKey: adminKeys.setting(key),
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/settings/{key}", { params: { path: { key } } })),
  });
}

export function useSaveSetting() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async ({ key, value }: { key: SettingKey; value: Record<string, unknown> }) =>
      unwrap(await api.PUT("/api/v1/admin/settings/{key}", { params: { path: { key } }, body: { value } })),
    onSuccess: (_d, v) => invalidate(adminKeys.setting(v.key)),
  });
}

// --- Filas ----------------------------------------------------------------------------------

export function useAdminQueues(f: PageFilter) {
  return useQuery({
    queryKey: adminKeys.queues(f),
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/queues", { params: { query: { limit: f.limit ?? 20, offset: f.offset ?? 0 } } })),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useRetryOutbox() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async (outboxId: string) =>
      unwrap(await api.POST("/api/v1/admin/outbox/{outbox_id}/retry", { params: { path: { outbox_id: outboxId } } })),
    onSuccess: () => invalidate(adminKeys.queuesScope, adminKeys.overview),
  });
}

// --- Cobrança -------------------------------------------------------------------------------

export function useBillingEvents(f: BillingFilter) {
  return useQuery({
    queryKey: adminKeys.billingEvents(f),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/admin/billing/events", {
          params: { query: { limit: f.limit ?? 25, offset: f.offset ?? 0, status: f.status || undefined } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useReconcileBilling() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/v1/admin/billing/reconcile")),
    onSuccess: () => invalidate(adminKeys.billingScope, adminKeys.usersScope, adminKeys.overview),
  });
}

// --- Auditoria -------------------------------------------------------------------------------

export function useAuditLog(f: AuditFilter) {
  return useQuery({
    queryKey: adminKeys.audit(f),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/admin/audit", {
          params: {
            query: { limit: f.limit ?? 50, offset: f.offset ?? 0, action: f.action || undefined, actor_id: f.actor_id || undefined },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}
