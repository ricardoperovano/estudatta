/**
 * Fila de sincronização: operações pendentes em IndexedDB (por usuário/aparelho, UUID, versão),
 * enviadas em lote idempotente para /api/v1/sync/batch ao abrir o app, ao recuperar conexão
 * e por ação "Sincronizar agora". Background Sync é complemento, não pré-requisito.
 */
import { create } from "zustand";
import { db, type PendingOp } from "./db";
import { deviceId } from "@/lib/device";
import { rawJson, isNetworkError } from "@/api/client";
import { uuid } from "@/lib/utils";

interface SyncState {
  status: "idle" | "syncing" | "offline" | "error";
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
  lastError: string | null;
  set: (p: Partial<SyncState>) => void;
}

const LAST_KEY = "estudatta.last_sync";

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  pending: 0,
  conflicts: 0,
  lastSyncAt: (() => {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  })(),
  lastError: null,
  set: (p) => set(p),
}));

export async function enqueueOp(
  userId: string,
  kind: string,
  payload: Record<string, unknown>,
  opId?: string,
): Promise<PendingOp> {
  const op: PendingOp = {
    op_id: opId || uuid(),
    user_id: userId,
    device_id: deviceId(),
    kind,
    payload,
    client_created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    version: 1,
  };
  await db.pendingOps.put(op);
  await refreshCounts(userId);
  return op;
}

export async function refreshCounts(userId: string) {
  try {
    const all = await db.pendingOps.where({ user_id: userId }).toArray();
    useSyncStore.getState().set({
      pending: all.filter((o) => o.status === "pending").length,
      conflicts: all.filter((o) => o.status === "conflict").length,
    });
  } catch {
    /* ignore */
  }
}

interface BatchResult {
  results: {
    op_id: string;
    status: "applied" | "duplicate" | "rejected" | "conflict";
    result?: unknown;
    error?: string;
  }[];
  server_time: string;
}

let inFlight: Promise<boolean> | null = null;

/** Envia a fila. Retorna true se tudo foi processado (ou nada havia). */
export async function syncNow(userId: string): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const store = useSyncStore.getState();
    let ops: PendingOp[] = [];
    try {
      ops = await db.pendingOps
        .where({ user_id: userId })
        .filter((o) => o.status === "pending")
        .sortBy("client_created_at");
    } catch {
      return true;
    }
    if (ops.length === 0) {
      store.set({ status: navigator.onLine ? "idle" : "offline" });
      return true;
    }
    if (!navigator.onLine) {
      store.set({ status: "offline" });
      return false;
    }
    store.set({ status: "syncing", lastError: null });
    try {
      const res = await rawJson<BatchResult>("/api/v1/sync/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          device_id: deviceId(),
          operations: ops.map((o) => ({
            op_id: o.op_id,
            kind: o.kind,
            payload: o.payload,
            client_created_at: o.client_created_at,
          })),
        }),
      });
      for (const r of res.results) {
        if (r.status === "applied" || r.status === "duplicate") await db.pendingOps.delete(r.op_id);
        else
          await db.pendingOps.update(r.op_id, {
            status: r.status,
            error: r.error,
            attempts: (ops.find((o) => o.op_id === r.op_id)?.attempts ?? 0) + 1,
          });
      }
      const now = new Date().toISOString();
      try {
        localStorage.setItem(LAST_KEY, now);
      } catch {
        /* ignore */
      }
      store.set({ status: "idle", lastSyncAt: now });
      await refreshCounts(userId);
      return res.results.every((r) => r.status === "applied" || r.status === "duplicate");
    } catch (e) {
      store.set({
        status: isNetworkError(e) ? "offline" : "error",
        lastError: e instanceof Error ? e.message : "erro",
      });
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export async function listConflicts(userId: string) {
  try {
    return await db.pendingOps
      .where({ user_id: userId })
      .filter((o) => o.status !== "pending")
      .toArray();
  } catch {
    return [];
  }
}

export async function discardOp(userId: string, opId: string) {
  await db.pendingOps.delete(opId);
  await refreshCounts(userId);
}

export async function retryOp(userId: string, opId: string) {
  await db.pendingOps.update(opId, { status: "pending", error: undefined });
  await refreshCounts(userId);
}
