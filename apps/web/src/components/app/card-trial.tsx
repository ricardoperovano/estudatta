/**
 * Teste grátis com cartão: a pessoa cadastra o cartão, usa o plano por alguns dias sem pagar e,
 * se não cancelar, passa a ser cobrada todo mês.
 *
 * A regra da cobrança é a parte que não pode deixar dúvida, então ela aparece sempre por extenso
 * e em linhas separadas (`CardTrialTerms`): quanto sai hoje, quanto e quando sai a primeira
 * mensalidade, que a cobrança se repete todo mês até o cancelamento, e onde cancelar. O convite
 * (`CardTrialPitch`) mostra o que o plano libera. `CardTrialOpening` leva quem escolheu o teste
 * no cadastro até a página do provedor, e `CardTrialReturn` recebe a pessoa de volta: o plano só
 * muda quando o servidor confirma o cartão com o provedor.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Check, Sparkle } from "@phosphor-icons/react";
import {
  useCheckout,
  usePublicPlans,
  useSubscription,
  type CardTrialOffer,
  type PublicPlan,
} from "@/api/billing";
import { sessionKey } from "@/api/session";
import { Banner, Button, Spinner } from "@/components/ui";
import { fmtBRL, parseDate } from "@/lib/format";
import { intlLocale, t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Dia da primeira cobrança para um teste que começa hoje (mesma conta do servidor). */
export function trialChargeDate(days: number, now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** "24 de novembro" (ou "November 24"). */
export function fmtChargeDay(d: Date | string): string {
  const date = typeof d === "string" ? parseDate(d) : d;
  return date.toLocaleDateString(intlLocale, { day: "numeric", month: "long" });
}

/** A regra da cobrança, linha a linha. `chargeAt` vem do servidor quando o teste já começou. */
export function CardTrialTerms({
  offer,
  chargeAt,
  className,
}: {
  offer: Pick<CardTrialOffer, "days" | "amount_cents">;
  chargeAt?: Date | string | null;
  className?: string;
}) {
  const day = fmtChargeDay(chargeAt ?? trialChargeDate(offer.days));
  const price = fmtBRL(offer.amount_cents);
  return (
    <ul
      className={cn("m-0 flex list-none flex-col gap-1.5 p-0 text-[13px] leading-[1.45]", className)}
      aria-label={t("Como funciona a cobrança")}
    >
      <li>
        <strong className="font-medium">{t("Hoje: {{v0}}.", { v0: fmtBRL(0) })}</strong>{" "}
        {t("Você só cadastra o cartão. Nada é cobrado.")}
      </li>
      <li>
        <strong className="font-medium">{t("Em {{v0}}: {{v1}}.", { v0: day, v1: price })}</strong>{" "}
        {t("Cobrado no cartão, se você não tiver cancelado antes.")}
      </li>
      <li>
        <strong className="font-medium">{t("Depois: {{v0}} todo mês.", { v0: price })}</strong>{" "}
        {t("Na fatura do cartão, automaticamente, até você cancelar.")}
      </li>
      <li className="text-neutral-400">
        {t("Cancelar é em Planos, a qualquer momento. Cancelando antes de {{v0}}, nada é cobrado.", {
          v0: day,
        })}
      </li>
    </ul>
  );
}

/** O convite: o que o plano libera durante o teste (os primeiros itens do catálogo). */
export function CardTrialPitch({
  offer,
  plan,
  max = 4,
  className,
}: {
  offer: CardTrialOffer;
  plan?: PublicPlan | null;
  max?: number;
  className?: string;
}) {
  const features = (plan?.features ?? []).filter((f): f is string => typeof f === "string").slice(0, max);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <span className="flex items-start gap-1.5 text-[15px] font-medium leading-[1.3]">
        <Sparkle size={18} weight="fill" className="mt-[1px] shrink-0 text-accent" aria-hidden />
        {t("Teste os benefícios do {{v0}} por {{v1}} dias", { v0: offer.plan_name, v1: offer.days })}
      </span>
      {features.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-neutral-300">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-1.5">
              <Check size={14} weight="bold" className="mt-[3px] shrink-0 text-success" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const POLL_MS = 3_000;
const POLL_TRIES = 15;

/**
 * Volta do checkout do teste (`?retorno=checkout&teste=1&status=…`) ou tentativa que não abriu
 * (`?teste=falhou`). Enquanto o cartão não é confirmado, consulta a assinatura de tempos em
 * tempos; quando o teste aparece, recarrega a sessão para os recursos do plano entrarem.
 */
export function CardTrialReturn({ className }: { className?: string }) {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const back = params.get("retorno") === "checkout" && params.get("teste") === "1";
  const notOpened = params.get("teste") === "falhou";
  const status = params.get("status");
  const gaveUp = back && (status === "cancelado" || status === "expirado");
  const waitingFor = back && !gaveUp;
  const sub = useSubscription();
  const current = sub.data?.subscription;
  const started = current?.status === "trialing";
  const [tries, setTries] = React.useState(0);
  const { refetch } = sub;

  React.useEffect(() => {
    if (!waitingFor || started || tries >= POLL_TRIES) return;
    const id = window.setTimeout(() => {
      setTries((n) => n + 1);
      void refetch();
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [waitingFor, started, tries, refetch]);

  React.useEffect(() => {
    if (waitingFor && started) void qc.invalidateQueries({ queryKey: sessionKey });
  }, [waitingFor, started, qc]);

  if (!back && !notOpened) return null;

  const close = () => {
    const next = new URLSearchParams(params);
    for (const k of ["retorno", "teste", "status"]) next.delete(k);
    setParams(next, { replace: true });
  };
  const closeButton = (
    <Button size="sm" variant="ghost-muted" onClick={close}>
      {t("Fechar")}
    </Button>
  );

  if (notOpened)
    return (
      <Banner kind="info" className={className} actions={closeButton}>
        <strong className="font-medium">{t("Sua conta foi criada no plano gratuito.")}</strong>{" "}
        {t(
          "Não foi possível abrir o cadastro do cartão agora, então o teste não começou e nada foi cobrado. Você pode começar o teste quando quiser, em Planos.",
        )}
      </Banner>
    );
  if (gaveUp)
    return (
      <Banner kind="info" className={className} actions={closeButton}>
        <strong className="font-medium">{t("O cartão não foi cadastrado.")}</strong>{" "}
        {t(
          "O teste não começou, nada foi cobrado e sua conta está no plano gratuito. Você pode começar o teste quando quiser, em Planos.",
        )}
      </Banner>
    );
  if (started && current)
    return (
      <Banner kind="synced" className={className} actions={closeButton}>
        <strong className="font-medium">
          {t("Teste do {{v0}} liberado.", { v0: current.plan_name })}
        </strong>{" "}
        {current.current_period_end && current.amount_cents != null
          ? t(
              "Você não paga nada até {{v0}}. Nesse dia, se não tiver cancelado, cobramos {{v1}} no cartão, e depois o mesmo valor todo mês, até você cancelar em Planos.",
              { v0: fmtChargeDay(current.current_period_end), v1: fmtBRL(current.amount_cents) },
            )
          : null}
      </Banner>
    );
  if (tries >= POLL_TRIES)
    return (
      <Banner kind="info" className={className} actions={closeButton}>
        <strong className="font-medium">{t("A confirmação do cartão está demorando.")}</strong>{" "}
        {t(
          "Pode seguir usando o app: o teste é liberado sozinho assim que a confirmação chegar. Se ele não aparecer em alguns minutos, veja a situação em Planos ou fale com o suporte.",
        )}
      </Banner>
    );
  return (
    <Banner kind="syncing" className={className}>
      <strong className="font-medium">{t("Confirmando seu cartão.")}</strong>{" "}
      {t("O teste é liberado assim que a confirmação chegar; costuma levar menos de um minuto.")}
    </Banner>
  );
}

const PENDING_KEY = "estudatta.teste.abrir";

/**
 * Marca (ou desmarca) que a pessoa escolheu o teste no cadastro. Fica nesta aba: o cadastro
 * redireciona para os primeiros passos por mais de um caminho, e um parâmetro na URL se perdia.
 */
export function markTrialPending(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(PENDING_KEY, "1");
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* sem armazenamento: a conta segue no gratuito e o teste fica disponível em Planos */
  }
}

export function isTrialPending(): boolean {
  try {
    return sessionStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

let opening = false; // um checkout por vez, mesmo que o efeito rode de novo

/**
 * Tela de passagem do cadastro para a página do provedor: cria o checkout do teste e leva a
 * pessoa até lá. Se não der (oferta fora do ar, provedor indisponível), a conta segue no gratuito
 * e os primeiros passos mostram o aviso (`?teste=falhou`). `onSettled` devolve a tela aos
 * primeiros passos: na falha, ou quando a pessoa volta do provedor pelo "voltar" do navegador.
 */
export function CardTrialOpening({ onSettled }: { onSettled: () => void }) {
  const [, setParams] = useSearchParams();
  const plans = usePublicPlans();
  const { mutateAsync } = useCheckout();
  const offer = plans.data?.card_trial ?? null;
  const ready = !plans.isPending;
  const tried = React.useRef(false); // uma tentativa por visita: falhou, vira aviso

  React.useEffect(() => {
    if (!ready || opening || tried.current) return;
    tried.current = true;
    markTrialPending(false);
    const fail = () => {
      setParams({ teste: "falhou" }, { replace: true });
      onSettled();
    };
    if (!offer) {
      fail();
      return;
    }
    opening = true;
    mutateAsync({ plan_code: offer.plan_code, interval: "month", trial: true, return_to: "signup" })
      .then((out) => {
        if (!out.checkout_url) return fail();
        // quem voltar do provedor sem concluir cai no aviso de cartão não cadastrado
        setParams({ retorno: "checkout", teste: "1", status: "cancelado" }, { replace: true });
        window.location.assign(out.checkout_url);
      })
      .catch(fail)
      .finally(() => {
        opening = false;
      });
  }, [ready, offer, mutateAsync, setParams, onSettled]);

  // "voltar" do navegador pode restaurar esta tela como estava (parada no "Abrindo…")
  React.useEffect(() => {
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) onSettled();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [onSettled]);

  return (
    <div className="glow-top-right flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center" role="status">
      <Spinner className="h-6 w-6" />
      <span className="text-[17px] font-medium">{t("Abrindo a página segura do cartão…")}</span>
      <span className="max-w-[40ch] text-[14px] text-neutral-400">
        {t("Sua conta já está criada. Você vai informar o cartão na página do Asaas; nada é cobrado hoje.")}
      </span>
    </div>
  );
}
