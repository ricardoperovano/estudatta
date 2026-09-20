/**
 * Conversa com o Tatá: folha (sheet) com a lista de mensagens, perguntas rápidas, campo e envio.
 * Cada mensagem gasta uma ação de IA do plano; a folha mostra as conversas restantes e, quando
 * acabam (ou o plano não inclui), diz isso com honestidade. A conversa fica em sessionStorage
 * (últimas 20 mensagens), para reabrir e continuar. Respostas são ditas em voz quando ela está ligada.
 */
import * as React from "react";
import { Broom, PaperPlaneRight } from "@phosphor-icons/react";
import { ApiError } from "@/api/client";
import { tataChatReasonText, useTataChat, useTataStatus, type TataHistoryItem } from "@/api/tata";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { Button, Dialog, DialogContent, Input } from "@/components/ui";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { TataSvg, type TataMood } from "./TataSvg";
import { useTataVoice } from "./voice";

export interface ChatMessage {
  id: string;
  role: "user" | "tata";
  text: string;
  mood?: TataMood;
}

const STORE_KEY = "estudatta.tata.chat";
const KEEP = 20;
const HISTORY = 8;
const MAX_CHARS = 1000;
const MOODS: readonly TataMood[] = ["idle", "cheer", "encourage", "think", "love", "focus"];

export const QUICK_QUESTIONS = ["Como está meu dia?", "O que eu estudo agora?", "Tenho revisões hoje?", "Estou sem ânimo", "Como funciona a recuperação?"];

function readStored(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(list) ? list.filter((m) => m && (m.role === "user" || m.role === "tata") && typeof m.text === "string").slice(-KEEP) : [];
  } catch {
    return [];
  }
}

function writeStored(list: ChatMessage[]) {
  try {
    if (list.length) sessionStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-KEEP)));
    else sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* sem armazenamento: vale só enquanto a folha estiver aberta */
  }
}

function asMood(m: string | undefined): TataMood {
  return (MOODS as readonly string[]).includes(m ?? "") ? (m as TataMood) : "idle";
}

/** Linha com as conversas restantes (hoje · mês). */
export function creditsLine(remainingToday: number, remainingMonth: number | null): string {
  const today = `${remainingToday} ${remainingToday === 1 ? "conversa restante" : "conversas restantes"} hoje`;
  return remainingMonth === null ? today : `${today} · ${remainingMonth} no mês`;
}

function errorToReason(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  if (["ai_plan", "ai_quota", "ai_monthly_quota", "ai_budget", "ai_disabled"].includes(e.code)) return e.code;
  return null;
}

export function TataChat({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const online = useOnline();
  const status = useTataStatus(open);
  const chat = useTataChat();
  const voice = useTataVoice();
  const [messages, setMessages] = React.useState<ChatMessage[]>(readStored);
  const [draft, setDraft] = React.useState("");
  const [failed, setFailed] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const lastTata = [...messages].reverse().find((m) => m.role === "tata");
  const mood: TataMood = chat.isPending ? "think" : (lastTata?.mood ?? (messages.length ? "idle" : "wave"));
  const reason = status.data && !status.data.chat_enabled ? status.data.chat_reason : null;
  const reasonText = tataChatReasonText(reason);
  const upsell = reason === "ai_plan" || reason === "ai_quota" || reason === "ai_monthly_quota";
  const canSend = online && !chat.isPending && !reason && draft.trim().length > 0 && draft.length <= MAX_CHARS;

  // rola para a última mensagem
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chat.isPending]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending || !online || reason) return;
    const history: TataHistoryItem[] = messages.slice(-HISTORY).map((m) => ({ role: m.role, text: m.text }));
    const next = [...messages, { id: `${Date.now()}-u`, role: "user" as const, text }];
    setMessages(next);
    writeStored(next);
    setDraft("");
    setFailed(null);
    chat.mutate(
      { message: text, history },
      {
        onSuccess: (data) => {
          const reply: ChatMessage = { id: `${Date.now()}-t`, role: "tata", text: data.reply, mood: asMood(data.mood) };
          setMessages((cur) => {
            const list = [...cur, reply];
            writeStored(list);
            return list;
          });
          voice.say(data.reply);
          inputRef.current?.focus();
        },
        onError: (e) => {
          const code = errorToReason(e);
          if (code) return; // o status atualizado explica (plano, cota, ambiente)
          setFailed(e instanceof ApiError && e.status === 0 ? "Sem conexão agora. Tente quando a internet voltar." : "O Tatá não conseguiu responder agora. Tente de novo em instantes.");
        },
      },
    );
  };

  const clear = () => {
    setMessages([]);
    writeStored([]);
    setFailed(null);
    inputRef.current?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mode="sheet"
        title="Conversa com o Tatá"
        description={
          status.data && status.data.chat_enabled ? (
            <span className="tnum">{creditsLine(status.data.chat_remaining_today, status.data.chat_remaining_month)}</span>
          ) : (
            "Pergunte sobre o seu dia, o que estudar agora ou como funciona o app."
          )
        }
        className="gap-3 tablet:w-[min(560px,calc(100%-32px))]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex h-[min(560px,66dvh)] flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <TataSvg mood={mood} size={56} title={`Tatá ${chat.isPending ? "pensando" : ""}`.trim()} />
            {messages.length ? (
              <Button variant="ghost-muted" size="sm" onClick={clear}>
                <Broom size={14} aria-hidden />
                Limpar conversa
              </Button>
            ) : null}
          </div>

          <div ref={listRef} role="log" aria-live="polite" aria-label="Mensagens" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-canvas p-3">
            {messages.length === 0 && !reasonText ? (
              <div className="my-auto flex flex-col items-center gap-3 text-center">
                <p className="m-0 text-[14px] text-neutral-400">Oi! Sobre o que a gente conversa hoje?</p>
                <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0" aria-label="Perguntas rápidas">
                  {QUICK_QUESTIONS.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => send(q)}
                        disabled={!online || chat.isPending}
                        className="min-h-[36px] rounded-full border border-divider bg-surface px-3 text-[13px] text-primary transition-colors duration-fast hover:border-accent hover:text-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-45"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={cn(
                    "m-0 max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[14px] leading-[1.4]",
                    m.role === "user" ? "rounded-br-sm bg-accent-900 text-primary" : "rounded-bl-sm border border-divider bg-surface text-primary shadow-sm",
                  )}
                >
                  <span className="sr-only">{m.role === "user" ? "Você: " : "Tatá: "}</span>
                  {m.text}
                </p>
              </div>
            ))}
            {chat.isPending ? (
              <div className="flex justify-start">
                <p className="tata-typing m-0 flex items-center gap-1 rounded-lg rounded-bl-sm border border-divider bg-surface px-3 py-2.5 text-neutral-400" aria-label="Tatá está digitando">
                  <span /> <span /> <span />
                </p>
              </div>
            ) : null}
            {failed ? (
              <p role="alert" className="m-0 text-center text-[13px] text-error">
                {failed}
              </p>
            ) : null}
            {reasonText ? (
              <div className="mt-auto flex flex-col items-center gap-2 pt-2 text-center">
                <p className="m-0 text-[14px] text-neutral-300">{reasonText}</p>
                {upsell ? <PlanUpsell compact text="Mais conversas com o Tatá nos planos Essencial e Completo." className="justify-center" /> : null}
              </div>
            ) : null}
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={MAX_CHARS}
              disabled={!online || !!reason}
              placeholder={!online ? "Sem conexão: a conversa volta com a internet." : reason ? "A conversa está pausada por enquanto." : "Escreva para o Tatá…"}
              aria-label="Mensagem para o Tatá"
              autoComplete="off"
              enterKeyHint="send"
            />
            <Button type="submit" variant="primary" size="icon" aria-label="Enviar" disabled={!canSend} loading={chat.isPending}>
              <PaperPlaneRight size={18} weight="fill" aria-hidden />
            </Button>
          </form>
          {!online ? <p className="m-0 text-center text-[12px] text-neutral-400">Sem conexão. O Tatá responde quando a internet voltar.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
