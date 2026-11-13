/**
 * Desafio de começo na tela Hoje: convite ("quer um desafio?"), progresso e comemoração.
 * Só vale se a pessoa aceitar; recusar some com o convite por uma semana. O estado vem do
 * servidor (vale em todos os aparelhos).
 */
import { Flag, Trophy } from "@phosphor-icons/react";
import { useAnswerStarterChallenge, useStarterChallenge } from "@/api/study";
import { Button, Card, toast } from "@/components/ui";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function StarterChallengeCard() {
  const q = useStarterChallenge();
  const answer = useAnswerStarterChallenge();
  const c = q.data;
  if (!c || c.state === "none") return null;

  if (c.state === "offer") {
    return (
      <Card as="section" aria-label={t("Desafio")} className="flex-row flex-wrap items-center gap-x-3 gap-y-2 p-[14px] text-[14px]">
        <Flag size={18} className="shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1 basis-[220px]">
          <strong className="font-medium">{t("Quer um desafio para começar?")}</strong>{" "}
          <span className="text-neutral-400">
            {t("Estude em {{v0}} dias nos próximos {{v1}}, no tempo que der. Vale {{v2}} XP.", {
              v0: c.target,
              v1: c.window_days,
              v2: c.xp,
            })}
          </span>
        </p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            loading={answer.isPending}
            onClick={() =>
              answer.mutate(true, {
                onSuccess: () => toast("success", t("Desafio aceito"), t("O primeiro dia pode ser hoje.")),
              })
            }
          >
            {t("Aceitar")}
          </Button>
          <Button variant="ghost" size="sm" disabled={answer.isPending} onClick={() => answer.mutate(false)}>
            {t("Agora não")}
          </Button>
        </div>
      </Card>
    );
  }

  const done = c.state === "done";
  return (
    <Card
      as="section"
      aria-label={t("Desafio")}
      className={cn("flex-row flex-wrap items-center gap-x-3 gap-y-2 p-[14px] text-[14px]", done && "tint-soft")}
    >
      {done ? (
        <Trophy size={18} className="shrink-0 text-accent" aria-hidden />
      ) : (
        <Flag size={18} className="shrink-0 text-accent" aria-hidden />
      )}
      <p className="min-w-0 flex-1 basis-[200px]">
        <strong className="font-medium">
          {done
            ? t("Desafio concluído: {{v0}} dias de estudo.", { v0: c.target })
            : t("Desafio: {{v0}} de {{v1}} dias.", { v0: c.progress, v1: c.target })}
        </strong>{" "}
        <span className="text-neutral-400">
          {done
            ? t("+{{v0}} XP. Voltar era a parte difícil.", { v0: c.xp })
            : c.progress === 0
              ? t("Qualquer sessão de hoje já conta o primeiro dia.")
              : t("Faltam {{v0}}. Qualquer sessão no dia conta.", { v0: c.target - c.progress })}
        </span>
      </p>
      <div className="flex gap-1" aria-hidden>
        {Array.from({ length: c.target }, (_, i) => (
          <span
            key={i}
            className={cn("h-2 w-6 rounded-full", i < c.progress ? "bg-accent" : "bg-[color-mix(in_srgb,var(--color-text-primary)_12%,transparent)]")}
          />
        ))}
      </div>
    </Card>
  );
}
