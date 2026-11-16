/**
 * Aviso de cronômetro esquecido na tela Hoje. Aparece para quem volta ao app com uma sessão
 * aberta há muitas horas, neste aparelho ou em outro, e oferece as duas saídas: encerrar
 * ajustando a duração para o que foi estudo de verdade, ou descartar. Nada é decidido sozinho.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ClockCountdown } from "@phosphor-icons/react";
import { api } from "@/api/client";
import { keys, useInvalidateAll } from "@/api/queries";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Button, Card, toast } from "@/components/ui";
import { t } from "@/i18n";
import { fmtDateTimeShort } from "@/lib/format";

interface Props {
  sessionId: string | null;
  startedAt: string;
  activityTitle?: string | null;
  online: boolean;
  /** limpa o cronômetro guardado neste aparelho, se houver */
  onDiscarded: () => Promise<void> | void;
}

export function ForgottenTimerCard({ sessionId, startedAt, activityTitle, online, onDiscarded }: Props) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidateAll();
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const discard = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await api.POST("/api/v1/sessions/{session_id}/discard", {
        params: { path: { session_id: sessionId } },
      });
      if (res.error) throw new Error("discard_failed");
      await qc.cancelQueries({ queryKey: keys.activeSession });
      qc.setQueryData(keys.activeSession, null);
      await onDiscarded();
      invalidate();
      setConfirm(false);
      toast("success", t("Cronômetro descartado"), t("Nada foi contado no seu saldo."));
    } catch {
      toast("error", t("Não foi possível descartar agora"), t("Tente de novo em instantes."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" aria-label={t("Cronômetro esquecido")} className="tint-soft gap-3 rounded-[20px] p-4">
      <div className="flex items-start gap-3">
        <ClockCountdown size={20} className="mt-[2px] shrink-0 text-pending" aria-hidden />
        <p className="min-w-0 text-[14px] leading-[1.5]">
          <strong className="font-medium">
            {activityTitle
              ? t("O cronômetro de {{v0}} está aberto desde {{v1}}.", {
                  v0: activityTitle,
                  v1: fmtDateTimeShort(startedAt),
                })
              : t("Seu cronômetro está aberto desde {{v0}}.", { v0: fmtDateTimeShort(startedAt) })}
          </strong>{" "}
          <span className="text-neutral-400">
            {t(
              "Se você esqueceu de encerrar, encerre e ajuste a duração para o que foi estudo de verdade — ou descarte.",
            )}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" className="bg-surface" onClick={() => nav("/app/sessao")}>
          {t("Encerrar e ajustar")}
        </Button>
        {sessionId ? (
          <Button variant="ghost-muted" size="lg" disabled={!online || busy} onClick={() => setConfirm(true)}>
            {t("Descartar")}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("Descartar este cronômetro?")}
        description={t(
          "A sessão aberta desde {{v0}} é apagada e nada entra no saldo. Se você estudou parte desse tempo, prefira encerrar e ajustar.",
          { v0: fmtDateTimeShort(startedAt) },
        )}
        confirmLabel={t("Descartar")}
        cancelLabel={t("Voltar")}
        danger
        loading={busy}
        onConfirm={discard}
      />
    </Card>
  );
}
