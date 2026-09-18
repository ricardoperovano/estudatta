/**
 * Dados locais (IndexedDB via Dexie), organizados por usuário.
 * Guarda: snapshot da tela Hoje, plano sincronizado, fila de operações pendentes e
 * estado do cronômetro. Nunca guarda credenciais.
 */
import Dexie, { type Table } from "dexie";

export interface PendingOp {
  op_id: string; // UUID
  user_id: string;
  device_id: string;
  kind: string;
  payload: Record<string, unknown>;
  client_created_at: string;
  status: "pending" | "conflict" | "rejected";
  error?: string;
  attempts: number;
  version: number;
}

export interface Snapshot {
  key: string; // `${user_id}:${name}`
  user_id: string;
  data: unknown;
  saved_at: string;
}

export interface LocalTimer {
  user_id: string; // uma por usuário
  session_id: string | null;
  client_uuid: string;
  activity_id: string;
  activity_title: string;
  subject_id?: string | null;
  topic_id?: string | null;
  label?: string;
  kind: "timer" | "pomodoro";
  status: "active" | "paused";
  started_at: string; // ISO
  intervals: { kind: "focus" | "pause"; started_at: string; ended_at: string | null }[];
  version: number;
  synced: boolean;
  target_seconds?: number;
  pomodoro?: { focus: number; break: number };
}

class EstudattaDB extends Dexie {
  pendingOps!: Table<PendingOp, string>;
  snapshots!: Table<Snapshot, string>;
  timers!: Table<LocalTimer, string>;

  constructor() {
    super("estudatta");
    this.version(1).stores({
      pendingOps: "op_id, user_id, status, client_created_at",
      snapshots: "key, user_id",
      timers: "user_id",
    });
  }
}

export const db = new EstudattaDB();

export async function saveSnapshot(userId: string, name: string, data: unknown) {
  try {
    await db.snapshots.put({ key: `${userId}:${name}`, user_id: userId, data, saved_at: new Date().toISOString() });
  } catch {
    /* IndexedDB indisponível (modo privado) */
  }
}

export async function loadSnapshot<T>(userId: string, name: string): Promise<{ data: T; saved_at: string } | null> {
  try {
    const row = await db.snapshots.get(`${userId}:${name}`);
    return row ? { data: row.data as T, saved_at: row.saved_at } : null;
  } catch {
    return null;
  }
}

export async function pendingCount(userId: string): Promise<number> {
  try {
    return await db.pendingOps.where({ user_id: userId }).filter((o) => o.status === "pending").count();
  } catch {
    return 0;
  }
}

/** Após logout: elimina cache privado para impedir acesso por outra conta. */
export async function clearPrivateData() {
  try {
    await db.transaction("rw", db.pendingOps, db.snapshots, db.timers, async () => {
      await db.pendingOps.clear();
      await db.snapshots.clear();
      await db.timers.clear();
    });
  } catch {
    /* ignore */
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("estudatta-api")).map((k) => caches.delete(k)));
  } catch {
    /* ignore */
  }
}
