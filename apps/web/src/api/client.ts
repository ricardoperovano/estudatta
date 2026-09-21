/**
 * Cliente HTTP da API (/api/v1). Cookies HttpOnly carregam a sessão; mutações enviam
 * o token CSRF (recebido no login) e o identificador do aparelho.
 */
import { t } from "@/i18n";
import type { paths } from "./schema";
import createClient, { type Middleware } from "openapi-fetch";
import { deviceId } from "@/lib/device";
import { locale as uiLocale } from "@/i18n";

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

let csrfToken: string | null = null;
export function setCsrfToken(token: string | null) {
  csrfToken = token;
}
export function getCsrfToken() {
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;
  requestId?: string;
  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export const NETWORK_ERROR_MESSAGE = t("Sem conexão. Sua ação foi salva neste aparelho e será sincronizada.");

const headersMiddleware: Middleware = {
  async onRequest({ request }) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (csrfToken) request.headers.set("X-CSRF-Token", csrfToken);
    }
    request.headers.set("X-Device-Id", deviceId());
    request.headers.set("Accept", "application/json");
    request.headers.set("Accept-Language", uiLocale);
    return request;
  },
};

export const api = createClient<paths>({ baseUrl: API_BASE, credentials: "include" });
api.use(headersMiddleware);

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown; request_id?: string } };

/** Converte a resposta do openapi-fetch em dado ou lança ApiError. */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    const body = (res.error ?? {}) as ErrorBody;
    const err = body?.error;
    throw new ApiError(
      res.response.status,
      err?.code || "http_error",
      err?.message || t("Erro {{v0}}", { v0: res.response.status }),
      err?.details,
      err?.request_id,
    );
  }
  return res.data as T;
}

/** fetch bruto para endpoints multipart/CSV. */
export async function rawFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()) && csrfToken)
    headers.set("X-CSRF-Token", csrfToken);
  headers.set("X-Device-Id", deviceId());
  headers.set("Accept-Language", uiLocale);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new ApiError(0, "network", NETWORK_ERROR_MESSAGE);
  }
}

export async function rawJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, init);
  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = await res.json();
    } catch {
      /* corpo vazio */
    }
    throw new ApiError(
      res.status,
      body.error?.code || "http_error",
      body.error?.message || t("Erro {{v0}}", { v0: res.status }),
      body.error?.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError ? e.status === 0 : e instanceof TypeError;
}

export function errorMessage(e: unknown, fallback = t("Algo deu errado. Tente de novo.")): string {
  if (e instanceof ApiError) return e.status === 0 ? NETWORK_ERROR_MESSAGE : e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
