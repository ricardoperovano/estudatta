/**
 * Conversa com o Tatá: folha (sheet) com a lista de mensagens, perguntas rápidas, campo e envio.
 * Cada mensagem gasta uma ação de IA do plano; a folha mostra as conversas restantes e, quando
 * acabam (ou o plano não inclui), diz isso com honestidade. A conversa fica em sessionStorage
 * (últimas 20 mensagens), para reabrir e continuar. Respostas são ditas em voz quando ela está ligada.
 */
import { t } from "@/i18n";
import * as React from "react";
import { Broom, PaperPlaneRight } from "@phosphor-icons/react";
import { ApiError } from "@/api/client";
import { tataChatReasonText, useTataChat, useTataStatus, type TataHistoryItem } from "@/api/tata";
import { PlanUpsell } from "@/components/app/plan-upsell";
import { Button, Dialog, DialogContent, Input } from "@/components/ui";
import { useOnline } from "@/lib/online";
import { cn, uuid } from "@/lib/utils";
import { TataSvg, type TataMood } from "./TataSvg";
import { QUICK_QUESTIONS, creditsLine, readStored, writeStored, type ChatMessage } from "./tata-chat-state";
import { useTataVoice } from "./voice";

const HISTORY = 8;
const MAX_CHARS = 1000;
const MOODS: readonly TataMood[] = ["idle", "cheer", "encourage", "think", "love", "focus"];

function asMood(m: string | undefined): TataMood {
  return (MOODS as readonly string[]).includes(m ?? "") ? (m as TataMood) : "idle";
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
  const reason = status.data && !status.data.chat_enabled ? status.data.chat_reason : null;
  const mood: TataMood = chat.isPending
    ? "think"
    : (lastTata?.mood ?? (reason ? "sleep" : messages.length ? "idle" : "wave"));
  const reasonText = tataChatReasonText(reason);
  const upsell = reason === "ai_plan" || reason === "ai_quota" || reason === "ai_monthly_quota";
  const canSend =
    online && !chat.isPending && !reason && draft.trim().length > 0 && draft.length <= MAX_CHARS;

  // rola para a última mensagem
  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, chat.isPending]);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || chat.isPending || !online || reason) return;
    const history: TataHistoryItem[] = messages.slice(-HISTORY).map((m) => ({ role: m.role, text: m.text }));
    const next = [...messages, { id: uuid(), role: "user" as const, text }];
    setMessages(next);
    writeStored(next);
    setDraft("");
    setFailed(null);
    chat.mutate(
      { message: text, history },
      {
        onSuccess: (data) => {
          const reply: ChatMessage = { id: uuid(), role: "tata", text: data.reply, mood: asMood(data.mood) };
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
          setFailed(
            e instanceof ApiError && e.status === 0
              ? t("Sem conexão agora. Tente quando a internet voltar.")
              : t("O Tatá não conseguiu responder agora. Tente de novo em instantes."),
          );
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
        title={t("Conversa com o Tatá")}
        description={
          status.data && status.data.chat_enabled ? (
            <span className="tnum">
              {creditsLine(status.data.chat_remaining_today, status.data.chat_remaining_month)}
            </span>
          ) : (
            t("Pergunte sobre o seu dia, o que estudar agora ou como funciona o app.")
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
            <TataSvg
              mood={mood}
              size={56}
              title={t("Tatá {{v0}}", { v0: chat.isPending ? "pensando" : "" }).trim()}
            />
            {messages.length ? (
              <Button variant="ghost-muted" size="sm" onClick={clear}>
                <Broom size={14} aria-hidden />
                {t("Limpar conversa")}
              </Button>
            ) : null}
          </div>

          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-label={t("Mensagens")}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-canvas p-3"
          >
            {messages.length === 0 && !reasonText ? (
              <div className="my-auto flex flex-col items-center gap-3 text-center">
                <p className="m-0 text-[14px] text-neutral-400">
                  {t("Oi! Sobre o que a gente conversa hoje?")}
                </p>
                <ul
                  className="m-0 flex list-none flex-wrap justify-center gap-2 p-0"
                  aria-label={t("Perguntas rápidas")}
                >
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
                    m.role === "user"
                      ? "rounded-br-sm bg-accent-900 text-primary"
                      : "rounded-bl-sm border border-divider bg-surface text-primary shadow-sm",
                  )}
                >
                  <span className="sr-only">{m.role === "user" ? t("Você:") : t("Tatá:")}</span>
                  {m.text}
                </p>
              </div>
            ))}
            {chat.isPending ? (
              <div className="flex justify-start">
                <p
                  className="tata-typing m-0 flex items-center gap-1 rounded-lg rounded-bl-sm border border-divider bg-surface px-3 py-2.5 text-neutral-400"
                  aria-label={t("Tatá está digitando")}
                >
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
              <div
                className={cn(
                  "flex flex-col items-center gap-2 text-center",
                  messages.length ? "mt-auto pt-2" : "my-auto",
                )}
              >
                <p className="m-0 text-[14px] text-neutral-300">{reasonText}</p>
                {upsell ? (
                  <PlanUpsell
                    compact
                    text={t("Mais conversas com o Tatá nos planos Essencial e Completo.")}
                    className="justify-center"
                  />
                ) : null}
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
              placeholder={
                !online
                  ? t("Sem conexão: a conversa volta com a internet.")
                  : reason
                    ? t("A conversa está pausada por enquanto.")
                    : t("Escreva para o Tatá…")
              }
              aria-label={t("Mensagem para o Tatá")}
              autoComplete="off"
              enterKeyHint="send"
            />
            <Button
              type="submit"
              variant="primary"
              size="icon"
              aria-label={t("Enviar")}
              disabled={!canSend}
              loading={chat.isPending}
            >
              <PaperPlaneRight size={18} weight="fill" aria-hidden />
            </Button>
          </form>
          {!online ? (
            <p className="m-0 text-center text-[12px] text-neutral-400">
              {t("Sem conexão. O Tatá responde quando a internet voltar.")}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
