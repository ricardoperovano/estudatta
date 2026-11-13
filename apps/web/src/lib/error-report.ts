/**
 * Relato de erros do app para a página Saúde do painel admin.
 *
 * Quando uma tela quebra no aparelho de alguém, ninguém ficava sabendo: o defeito só aparecia se
 * a pessoa reclamasse. Isto envia o erro técnico (mensagem, pilha, tela, versão) para a API.
 * Nada do que a pessoa digitou vai junto, e o endereço da tela segue sem a parte da consulta.
 *
 * Contido de propósito: no máximo MAX_PER_VISIT relatos por visita e nunca o mesmo duas vezes,
 * para um erro em laço não virar uma enxurrada. Falhar ao relatar é silencioso.
 */
import { API_BASE } from "@/api/client";

export type ClientErrorKind = "js_error" | "unhandled_rejection" | "render_error" | "chunk_error";

const MAX_PER_VISIT = 8;
const sent = new Set<string>();

/** Erros que não dizem nada sobre o app: extensões do navegador, rede caindo, ruído conhecido. */
export function isNoise(message: string, stack?: string | null): boolean {
  const m = message.toLowerCase();
  if (!m.trim() || m === "script error." || m === "script error") return true; // script de outro domínio
  if (m.includes("resizeobserver loop")) return true; // aviso benigno do navegador
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed")) return true;
  if (m.includes("the user aborted") || m.includes("aborterror")) return true;
  const s = (stack || "").toLowerCase();
  return s.includes("chrome-extension://") || s.includes("moz-extension://") || s.includes("safari-extension://");
}

/** Código novo publicado enquanto a aba estava aberta: o pedaço antigo não existe mais. */
export function isChunkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("failed to fetch dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("error loading dynamically imported module")
  );
}

function describe(err: unknown): { message: string; stack: string | null } {
  if (err instanceof Error) return { message: `${err.name}: ${err.message}`, stack: err.stack ?? null };
  if (typeof err === "string") return { message: err, stack: null };
  try {
    return { message: JSON.stringify(err).slice(0, 300), stack: null };
  } catch {
    return { message: String(err), stack: null };
  }
}

export function reportError(kind: ClientErrorKind, err: unknown): void {
  try {
    const { message, stack } = describe(err);
    const chunk = isChunkError(message);
    if (!chunk && isNoise(message, stack)) return;
    const key = `${kind}|${message}`;
    if (sent.has(key) || sent.size >= MAX_PER_VISIT) return;
    sent.add(key);
    const body = JSON.stringify({
      kind: chunk ? "chunk_error" : kind,
      message: message.slice(0, 500),
      stack: stack ? stack.slice(0, 6000) : null,
      path: location.pathname.slice(0, 300),
      app_version: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    void fetch(`${API_BASE}/api/v1/public/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true, // o relato sobrevive à troca de página
      body,
    }).catch(() => {});
  } catch {
    /* relatar nunca pode quebrar o app */
  }
}

let installed = false;

/** Liga a captura global: erros de script e promessas rejeitadas sem tratamento. */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    // erro de carregamento de recurso (imagem, script) chega sem `error`: não é defeito do app
    if (e.error || e.message) reportError("js_error", e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => reportError("unhandled_rejection", e.reason));
}
