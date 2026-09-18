/** Formatação e rótulos do painel administrativo (sem JSX). */
import type * as React from "react";
import type { Tag } from "@/components/ui";
import { fmtDateTimeShort } from "@/lib/format";

export type TagVariant = NonNullable<React.ComponentProps<typeof Tag>["variant"]>;

/** "active_7d" → "active 7d" */
export function humanize(key: string): string {
  return key.replace(/_/g, " ");
}

const STATUS_LABEL: Record<string, string> = {
  active: "ativa",
  trialing: "em teste",
  past_due: "em atraso",
  canceled: "cancelada",
  cancelled: "cancelada",
  expired: "expirada",
  ended: "encerrada",
  incomplete: "incompleta",
  unpaid: "não paga",
  paused: "pausada",
  pending: "pendente",
  processing: "processando",
  sent: "enviada",
  partial: "parcial",
  failed: "falhou",
  received: "recebido",
  processed: "processado",
  ignored: "ignorado",
  ambiguous: "ambígua",
  finished: "concluída",
  done: "concluída",
  running: "em andamento",
  queued: "na fila",
  archived: "arquivado",
};

export function statusLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return STATUS_LABEL[s] ?? humanize(s);
}

export function statusVariant(s: string | null | undefined): TagVariant {
  switch (s) {
    case "active":
    case "sent":
    case "processed":
    case "finished":
    case "done":
      return "success";
    case "pending":
    case "processing":
    case "partial":
    case "received":
    case "trialing":
    case "past_due":
    case "queued":
    case "running":
      return "pending";
    case "failed":
    case "error":
    case "ambiguous":
    case "unpaid":
    case "incomplete":
      return "error";
    default:
      return "neutral";
  }
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Valor livre → texto: números pt-BR, booleanos "sim/não", datas ISO curtas, vazio "—". */
export function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString("pt-BR");
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string") return ISO_RE.test(v) ? fmtDateTimeShort(v) : v;
  if (Array.isArray(v)) return v.length ? v.map(fmtValue).join(", ") : "—";
  return JSON.stringify(v);
}

export function fmtDate(d: string | null | undefined): string {
  return d ? fmtDateTimeShort(d) : "—";
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : "—";
}

/** JSON com chaves ordenadas (para comparar objetos sem depender da ordem). */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (isPlainObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** "12,90" | "1.234,56" | "12.9" → centavos. `null` = vazio; `undefined` = inválido. */
export function parseReais(input: string): number | null | undefined {
  const raw = input.replace(/R\$/i, "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) ? cents : undefined;
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export const INTERVAL_LABEL: Record<string, string> = { month: "mês", year: "ano" };

export function intervalLabel(i: string | null | undefined): string {
  if (!i) return "—";
  return INTERVAL_LABEL[i] ?? i;
}
