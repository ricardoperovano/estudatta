/** Estado da conversa com o Tatá fora do componente: mensagens em sessionStorage, perguntas rápidas e a linha de cotas. */
import { t } from "@/i18n";
import type { TataMood } from "./TataSvg";

export interface ChatMessage {
  id: string;
  role: "user" | "tata";
  text: string;
  mood?: TataMood;
}

export const CHAT_STORE_KEY = "estudatta.tata.chat";
export const CHAT_KEEP = 20;

export const QUICK_QUESTIONS = [
  t("Como está meu dia?"),
  t("O que eu estudo agora?"),
  t("Tenho revisões hoje?"),
  t("Estou sem ânimo"),
  t("Como funciona a recuperação?"),
];

export function readStored(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(CHAT_STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(list)
      ? list
          .filter((m) => m && (m.role === "user" || m.role === "tata") && typeof m.text === "string")
          .slice(-CHAT_KEEP)
      : [];
  } catch {
    return [];
  }
}

export function writeStored(list: ChatMessage[]) {
  try {
    if (list.length) sessionStorage.setItem(CHAT_STORE_KEY, JSON.stringify(list.slice(-CHAT_KEEP)));
    else sessionStorage.removeItem(CHAT_STORE_KEY);
  } catch {
    /* sem armazenamento: vale só enquanto a folha estiver aberta */
  }
}

/** "N conversas restantes hoje · M no mês" (sem o mês quando o plano não limita por mês). */
export function creditsLine(remainingToday: number, remainingMonth: number | null): string {
  const today = t("{{v0}} {{v1}} hoje", {
    v0: remainingToday,
    v1: remainingToday === 1 ? t("conversa restante") : t("conversas restantes"),
  });
  return remainingMonth === null ? today : t("{{v0}} · {{v1}} no mês", { v0: today, v1: remainingMonth });
}
