import * as React from "react";
import { useSearchParams } from "react-router";
import { Check } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import {
  isFreePlan,
  priceFor,
  subscriptionStatusLabel,
  useCancelSubscription,
  useCheckout,
  usePublicPlans,
  useSubscription,
  useVerifySubscription,
  type BillingInterval,
  type PublicPlan,
  type Subscription,
  type SubscriptionState,
} from "@/api/billing";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Banner, Button, Card, EmptyState, Input, Seg, Spinner, Tag, toast } from "@/components/ui";
import { fmtBRL, parseDate } from "@/lib/format";
import { useCheckCoupon, useRedeemCoupon, type CouponInfo } from "@/api/billing";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { usePageTour } from "@/components/tour/use-tours";
import { planosTour } from "@/tours/planos";

function fmtDateLong(d: string | null | undefined): string {
  if (!d) return "";
  return parseDate(d).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** Planos e assinatura. O plano só muda quando o servidor confirma o pagamento; voltar do checkout nunca ativa nada. */
export default function BillingPage() {
  const online = useOnline();
  const plans = usePublicPlans();
  const sub = useSubscription();
  const checkout = useCheckout();
  const verify = useVerifySubscription();
  const [params, setParams] = useSearchParams();
  const [interval, setInterval] = React.useState<BillingInterval>("month");
  const [redirectingTo, setRedirectingTo] = React.useState<string | null>(null);
  // cupom: digitado aqui ou vindo de um link (?cupom=CODIGO, como nos e-mails de campanha)
  const [couponInput, setCouponInput] = React.useState(() => (params.get("cupom") || "").toUpperCase());
  const [coupon, setCoupon] = React.useState<CouponInfo | null>(null);
  const checkCoupon = useCheckCoupon();
  const redeemCoupon = useRedeemCoupon();
  const applyCoupon = (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    checkCoupon.mutate(
      { code: c },
      {
        onSuccess: (info) => {
          setCoupon(info);
          toast("success", "Cupom aplicado", info.description);
        },
        onError: (e) => {
          setCoupon(null);
          toast("error", "Cupom não aplicado", errorMessage(e));
        },
      },
    );
  };
  const autoApplied = React.useRef(false);
  React.useEffect(() => {
    if (!autoApplied.current && params.get("cupom")) {
      autoApplied.current = true;
      applyCoupon(params.get("cupom") || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  usePageTour(planosTour, !!plans.data && (!!sub.data || sub.isError));

  // o retorno do pagamento chega como ?checkout=sucesso ou ?retorno=checkout&status=sucesso|cancelado|expirado
  // (Asaas); nenhum deles ativa nada: só a confirmação do provedor libera o plano
  const retStatus = params.get("status");
  const checkoutReturn =
    params.get("checkout") ?? (params.get("retorno") === "checkout" ? (retStatus === "cancelado" || retStatus === "expirado" ? "falhou" : "sucesso") : null);
  const clearReturn = () => {
    const next = new URLSearchParams(params);
    next.delete("checkout");
    next.delete("retorno");
    next.delete("status");
    setParams(next, { replace: true });
  };

  const onVerify = () =>
    verify.mutate(undefined, {
      onSuccess: (s) => toast("info", "Situação verificada", s.message ?? undefined),
      onError: (e) => toast("error", "Não foi possível verificar agora", errorMessage(e)),
    });

  const onSubscribe = (plan: PublicPlan) => {
    setRedirectingTo(plan.code);
    checkout.mutate(
      { plan_code: plan.code, interval, coupon_code: coupon?.kind === "percent" ? coupon.code : null },
      {
        onSuccess: (out) => {
          if (out.checkout_url) window.location.assign(out.checkout_url);
          else {
            setRedirectingTo(null);
            toast("error", "Não foi possível abrir o pagamento", "O link de pagamento não foi gerado. Tente de novo em instantes.");
          }
        },
        onError: (e) => {
          setRedirectingTo(null);
          toast("error", "Não foi possível iniciar a assinatura", errorMessage(e));
        },
      },
    );
  };

  const state = sub.data;
  const billingMode = state?.billing_mode ?? plans.data?.billing_mode ?? null;
  const currentCode = state?.entitlements.plan_code ?? null;
  const hasPaidSubscription = !!state?.subscription && ["active", "past_due", "paused"].includes(state.subscription.status);

  return (
    <div className="flex flex-col gap-[14px] desktop:max-w-[1000px] desktop:gap-8">
      <header>
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Planos</h1>
        <p className="mt-2 max-w-[56ch] text-[14px] text-neutral-400 desktop:text-[15px]">
          Comece grátis com um objetivo. Amplie quando quiser acompanhar mais coisas ao mesmo tempo.
        </p>
      </header>

      {checkoutReturn === "sucesso" ? (
        <Banner
          kind="syncing"
          actions={
            <>
              <Button size="sm" variant="primary" loading={verify.isPending} disabled={!online} onClick={onVerify}>
                Verificar situação
              </Button>
              <Button size="sm" variant="ghost-muted" onClick={clearReturn}>
                Fechar
              </Button>
            </>
          }
        >
          <strong className="font-medium">Pagamento em confirmação.</strong> Recebemos seu retorno do pagamento e estamos aguardando a confirmação. O plano muda assim que ela chegar; isso pode
          levar alguns minutos.
        </Banner>
      ) : checkoutReturn ? (
        <Banner
          kind="info"
          actions={
            <Button size="sm" variant="ghost-muted" onClick={clearReturn}>
              Fechar
            </Button>
          }
        >
          {checkoutReturn === "pendente"
            ? "O pagamento ficou pendente. Nada muda no seu plano até a confirmação."
            : "O pagamento não foi concluído. Nada foi cobrado e seu plano continua o mesmo."}
        </Banner>
      ) : null}

      {!online ? <Banner kind="offline">Sem conexão: os planos mostrados podem estar desatualizados, e assinar ou cancelar precisa de internet.</Banner> : null}

      <Card className="gap-3 p-4" data-tour="planos-cupom">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-medium">Tem um cupom?</span>
          <span className="text-[13px] text-neutral-400">Cupons de desconto valem ao assinar; cupons de dias grátis liberam o plano na hora.</span>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyCoupon(couponInput);
          }}
        >
          <label className="sr-only" htmlFor="cupom">
            Código do cupom
          </label>
          <Input
            id="cupom"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            className="min-w-[160px] flex-1 uppercase"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={!online}
          />
          <Button type="submit" variant="secondary" loading={checkCoupon.isPending} disabled={!online || !couponInput.trim()}>
            Aplicar
          </Button>
        </form>
        {coupon ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-success-tint px-3 py-2 text-[14px] text-success">
            <span>
              <strong className="font-medium">{coupon.code}</strong>: {coupon.description}
            </span>
            {coupon.kind === "trial" ? (
              <Button
                size="sm"
                variant="primary"
                loading={redeemCoupon.isPending}
                disabled={!online}
                onClick={() =>
                  redeemCoupon.mutate(coupon.code, {
                    onSuccess: (s) => {
                      setCoupon(null);
                      setCouponInput("");
                      toast("success", "Plano liberado", s.message ?? undefined);
                    },
                    onError: (e) => toast("error", "Não foi possível usar o cupom", errorMessage(e)),
                  })
                }
              >
                Liberar {coupon.value} dias grátis
              </Button>
            ) : (
              <span className="text-[12px]">Escolha o plano abaixo: o valor já sai com desconto.</span>
            )}
          </div>
        ) : null}
      </Card>

      {sub.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => sub.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar a situação da sua assinatura. {errorMessage(sub.error, "")}
        </Banner>
      ) : state ? (
        <SubscriptionCard state={state} online={online} onVerify={onVerify} verifying={verify.isPending} />
      ) : null}

      <div className="self-start" data-tour="planos-periodicidade">
        <Seg<BillingInterval>
          label="Periodicidade"
          value={interval}
          onChange={setInterval}
          options={[
            { value: "month", label: "Mensal" },
            { value: "year", label: "Anual" },
          ]}
        />
      </div>

      {plans.isPending ? (
        <div className="flex justify-center py-16" role="status">
          <Spinner className="h-6 w-6" label="Carregando planos" />
        </div>
      ) : plans.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => plans.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar os planos. {errorMessage(plans.error, "")}
        </Banner>
      ) : plans.data.plans.length === 0 ? (
        <EmptyState title="Nenhum plano disponível no momento." description="Você continua usando o Estudatta normalmente." />
      ) : (
        <div className="grid items-start gap-[14px] tablet:grid-cols-2 desktop:grid-cols-3 desktop:gap-4">
          {plans.data.plans.map((plan, i, all) => (
            <PlanCard
              key={plan.code}
              tour={all.some((p) => p.recommended) ? plan.recommended : i === 0}
              plan={plan}
              interval={interval}
              billingMode={billingMode}
              isCurrent={currentCode === plan.code}
              hasPaidSubscription={hasPaidSubscription}
              pendingCheckoutUrl={state?.subscription?.status === "pending" && state.subscription.plan_code === plan.code ? state.subscription.checkout_url : null}
              online={online}
              loading={redirectingTo === plan.code}
              disabled={redirectingTo !== null}
              onSubscribe={() => onSubscribe(plan)}
            />
          ))}
        </div>
      )}

      {plans.data ? <PriceFootnote plans={plans.data.plans} billingMode={billingMode} /> : null}
    </div>
  );
}

function PriceFootnote({ plans, billingMode }: { plans: PublicPlan[]; billingMode: string | null }) {
  const undefinedPrice = plans.some((p) => !isFreePlan(p) && p.prices.some((pr) => pr.amount_cents == null));
  const lines: string[] = [];
  if (undefinedPrice) lines.push("Sem desconto, promoção ou garantia enquanto o preço não estiver definido.");
  if (billingMode === "disabled") lines.push("As assinaturas ainda não estão abertas. Ninguém é cobrado e o plano gratuito segue funcionando por inteiro.");
  if (billingMode === "test") lines.push("Ambiente de testes: pagamentos feitos aqui não geram cobrança real.");
  if (lines.length === 0) return null;
  return (
    <p className="text-[12px] text-neutral-500 desktop:text-[13px]" data-tour="planos-aviso">
      {lines.join(" ")}
    </p>
  );
}

interface PlanCardProps {
  plan: PublicPlan;
  interval: BillingInterval;
  billingMode: string | null;
  isCurrent: boolean;
  hasPaidSubscription: boolean;
  pendingCheckoutUrl: string | null | undefined;
  online: boolean;
  loading: boolean;
  disabled: boolean;
  onSubscribe: () => void;
  tour?: boolean;
}

function PlanCard({ plan, interval, billingMode, isCurrent, hasPaidSubscription, pendingCheckoutUrl, online, loading, disabled, onSubscribe, tour }: PlanCardProps) {
  const free = isFreePlan(plan);
  const price = priceFor(plan, interval);
  const amount = free ? 0 : (price?.amount_cents ?? null);
  const unit = interval === "year" ? "/ ano" : "/ mês";
  const features = plan.features.filter((f): f is string => typeof f === "string");

  let action: React.ReactNode;
  let note: string | null = null;
  if (free) {
    action = isCurrent ? (
      <Button variant="secondary" size="lg" disabled className="mt-2">
        <Check size={16} aria-hidden /> Seu plano atual
      </Button>
    ) : (
      <Button variant="secondary" size="lg" disabled className="mt-2">
        Incluído em qualquer plano
      </Button>
    );
    if (!isCurrent && hasPaidSubscription) note = "Para voltar ao gratuito, cancele a renovação acima. O acesso continua até o fim do período já pago.";
  } else if (isCurrent) {
    action = (
      <Button variant="secondary" size="lg" disabled className="mt-2">
        <Check size={16} aria-hidden /> Seu plano atual
      </Button>
    );
  } else if (billingMode === "disabled") {
    action = (
      <Button variant="primary" size="lg" disabled className="mt-2 min-h-[48px] desktop:min-h-[44px]">
        Assinar quando disponível
      </Button>
    );
    note = "As assinaturas ainda não estão abertas. Quando abrirem, este botão leva ao pagamento.";
  } else if (!price || price.amount_cents == null) {
    action = (
      <Button variant="primary" size="lg" disabled className="mt-2 min-h-[48px] desktop:min-h-[44px]">
        Assinar quando disponível
      </Button>
    );
    note = price ? "O valor deste plano ainda não foi definido. Não é possível assinar antes disso." : `Este plano ainda não tem opção ${interval === "year" ? "anual" : "mensal"}.`;
  } else if (pendingCheckoutUrl) {
    action = (
      <Button asChild variant="primary" size="lg" className="mt-2 min-h-[48px] desktop:min-h-[44px]">
        <a href={pendingCheckoutUrl}>Continuar pagamento</a>
      </Button>
    );
    note = "Você já começou esta assinatura. O plano só muda depois que o pagamento for confirmado.";
  } else {
    action = (
      <Button variant="primary" size="lg" className="mt-2 min-h-[48px] desktop:min-h-[44px]" loading={loading} disabled={disabled || !online} onClick={onSubscribe}>
        Assinar {plan.name}
      </Button>
    );
    note = online ? "Você será levado à página de pagamento. O plano muda quando o pagamento for confirmado." : "Assinar precisa de conexão com a internet.";
  }

  return (
    <Card accent={plan.recommended} as="article" className="gap-2 p-4 desktop:gap-3 desktop:p-6" aria-label={`Plano ${plan.name}`} data-tour={tour ? "planos-plano" : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[17px] font-medium desktop:text-[20px]", plan.recommended && "text-accent")}>{plan.name}</span>
        {plan.recommended ? <Tag variant="accent">Recomendado</Tag> : null}
      </div>
      <span className="tnum text-[25px] font-medium leading-tight desktop:text-[32px]">
        {free ? "R$ 0" : amount == null ? "Valor a definir" : fmtBRL(amount)}
        {!free ? <span className="ml-1.5 text-[13px] font-normal text-neutral-400 desktop:text-[14px]">{unit}</span> : null}
      </span>
      {plan.description ? <p className="text-[13px] text-neutral-400">{plan.description}</p> : null}
      {features.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-[18px] text-[14px] text-neutral-300 desktop:gap-1.5">
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      {action}
      {note ? <p className="text-[12px] text-neutral-400">{note}</p> : null}
    </Card>
  );
}

function SubscriptionCard({ state, online, onVerify, verifying }: { state: SubscriptionState; online: boolean; onVerify: () => void; verifying: boolean }) {
  const cancel = useCancelSubscription();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const s = state.subscription;
  const ent = state.entitlements;
  const canCancel = !!s && s.status !== "cancelled" && s.status !== "expired" && !state.cancel_at_period_end;
  const canVerify = !!s && state.billing_mode !== "disabled";
  const pastHistory = state.history.filter((h) => h.id !== s?.id);

  const onCancel = () =>
    cancel.mutate(undefined, {
      onSuccess: (next) => {
        setConfirmOpen(false);
        toast("success", "Renovação cancelada", next.message ?? undefined);
      },
      onError: (e) => toast("error", "Não foi possível cancelar agora", errorMessage(e)),
    });

  return (
    <Card as="section" elev="sm" className="gap-3 p-4 desktop:p-6" aria-label="Sua assinatura" data-tour="planos-atual">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="kicker">Seu plano</span>
          <span className="text-[17px] font-medium desktop:text-[20px]">{ent.plan_name}</span>
        </div>
        <Tag variant={statusVariant(s, state.cancel_at_period_end)}>{s ? (state.cancel_at_period_end && s.status === "active" ? "Renovação cancelada" : subscriptionStatusLabel(s.status)) : sourceLabel(ent.source)}</Tag>
      </div>

      <div className="flex flex-col gap-1 text-[14px] text-neutral-300">
        {!s ? (
          <span>{ent.source === "promo" || ent.source === "admin" ? `Acesso de cortesia${ent.current_period_end ? ` até ${fmtDateLong(ent.current_period_end)}` : ""}. Nada é cobrado.` : "Você não tem assinatura. Nada é cobrado."}</span>
        ) : (
          <>
            <span>
              {s.plan_name}
              {s.interval ? ` · ${s.interval === "year" ? "anual" : "mensal"}` : ""}
              {s.amount_cents != null ? ` · ${fmtBRL(s.amount_cents)}` : ""}
            </span>
            {s.status === "pending" ? <span>Estamos aguardando a confirmação do pagamento. O plano só muda depois dela.</span> : null}
            {s.status === "past_due" ? <span className="text-pending">O último pagamento não foi confirmado. Verifique seu meio de pagamento para manter o plano.</span> : null}
            {state.next_charge_at && !state.cancel_at_period_end ? <span>Próxima cobrança em {fmtDateLong(state.next_charge_at)}.</span> : null}
            {state.cancel_at_period_end || s.status === "cancelled" ? (
              <span>
                Renovação cancelada: você não será cobrado de novo.
                {s.current_period_end ? ` O acesso ao plano continua até ${fmtDateLong(s.current_period_end)}.` : ""}
              </span>
            ) : null}
          </>
        )}
        {state.message ? <span className="text-neutral-400">{state.message}</span> : null}
      </div>

      {s ? (
        <div className="flex flex-wrap gap-2">
          {s.status === "pending" && s.checkout_url ? (
            <Button asChild variant="primary" size="lg">
              <a href={s.checkout_url}>Continuar pagamento</a>
            </Button>
          ) : null}
          {canVerify ? (
            <Button variant="secondary" size="lg" loading={verifying} disabled={!online} onClick={onVerify}>
              Verificar situação
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="ghost-muted" size="lg" className="px-3" disabled={!online} onClick={() => setConfirmOpen(true)}>
              {s.status === "pending" ? "Desistir desta assinatura" : "Cancelar renovação"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {s && !canVerify && state.billing_mode === "disabled" ? <p className="text-[12px] text-neutral-400">A verificação com o provedor de pagamento não está disponível neste ambiente.</p> : null}

      {pastHistory.length ? (
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="self-start" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? "Ocultar histórico" : `Ver histórico (${pastHistory.length})`}
          </Button>
          {showHistory ? (
            <ul className="flex flex-col divide-y divide-divider text-[13px]">
              {pastHistory.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {h.plan_name}
                    {h.interval ? ` · ${h.interval === "year" ? "anual" : "mensal"}` : ""}
                  </span>
                  <span className="text-neutral-400">
                    {subscriptionStatusLabel(h.status)}
                    {h.created_at ? ` · desde ${fmtDateLong(h.created_at)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={s?.status === "pending" ? "Desistir desta assinatura?" : "Cancelar a renovação?"}
        description={
          s?.status === "pending"
            ? "O pagamento ainda não foi confirmado. Ao desistir, nada será cobrado."
            : `Você não será cobrado de novo.${s?.current_period_end ? ` O acesso ao plano continua até ${fmtDateLong(s.current_period_end)}.` : ""} Seus dados e seu histórico ficam como estão.`
        }
        confirmLabel={s?.status === "pending" ? "Desistir" : "Cancelar renovação"}
        cancelLabel="Voltar"
        loading={cancel.isPending}
        onConfirm={onCancel}
      />
    </Card>
  );
}

function statusVariant(s: Subscription | null, cancelAtEnd: boolean): "success" | "pending" | "neutral" | "error" {
  if (!s) return "neutral";
  if (s.status === "active") return cancelAtEnd ? "neutral" : "success";
  if (s.status === "pending" || s.status === "past_due" || s.status === "paused") return "pending";
  return "neutral";
}

function sourceLabel(source: string): string {
  if (source === "promo" || source === "admin") return "Cortesia";
  if (source === "subscription") return "Assinatura";
  return "Gratuito";
}
