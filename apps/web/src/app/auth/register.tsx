import { t } from "@/i18n";
import * as React from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthLayout } from "./layout";
import { Button, Field, Input, Banner } from "@/components/ui";
import { useAuthActions } from "@/api/session";
import { errorMessage } from "@/api/client";
import { usePublicPlans } from "@/api/billing";
import { CardTrialPitch, CardTrialTerms, markTrialPending } from "@/components/app/card-trial";
import { cn } from "@/lib/utils";
import { detectTimezone } from "@/lib/device";
import { siteLink } from "@/design/brand";
import { isConnectionFailure } from "@/api/client";
import { noteConnectionFailure } from "@/lib/error-report";

const schema = z.object({
  name: z.string().trim().min(1, t("Diga como quer ser chamado.")).max(120),
  email: z.string().email(t("Informe um e-mail válido.")),
  password: z.string().min(8, t("Use pelo menos 8 caracteres.")),
});
type Form = z.infer<typeof schema>;
type Start = "trial" | "free";

export default function RegisterPage() {
  const { register: signup } = useAuthActions();
  const nav = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  // Teste grátis com cartão: só é oferecido quando o servidor diz que está valendo. Sem a
  // oferta (cobrança desligada, catálogo fora do ar), o cadastro segue como sempre: gratuito.
  const plans = usePublicPlans();
  const offer = plans.data?.card_trial ?? null;
  const trialPlan = offer ? plans.data?.plans.find((p) => p.code === offer.plan_code) : null;
  const [start, setStart] = React.useState<Start>("trial");
  const wantsTrial = !!offer && start === "trial";

  const onSubmit = async (v: Form) => {
    setError(null);
    // Quem escolheu o teste segue, com a conta criada (no gratuito), para a página do provedor de
    // pagamento: os primeiros passos leem esta marca e abrem o checkout (`CardTrialOpening`). Se
    // ele não abrir, a pessoa continua no gratuito e pode começar o teste depois, em Planos.
    markTrialPending(wantsTrial);
    try {
      await signup(v.email, v.password, v.name, detectTimezone());
      nav("/onboarding", { replace: true });
    } catch (e) {
      markTrialPending(false);
      if (isConnectionFailure(e)) noteConnectionFailure("POST /auth/register", e);
      setError(errorMessage(e));
    }
  };

  return (
    <AuthLayout
      mood="cheer"
      greeting={t("Oi! Eu sou o Tatá. Vamos montar seu primeiro plano de estudo?")}
      title={t("Criar conta")}
      subtitle={t("Você define a meta. O plano mostra o que fazer hoje e como retomar se atrasar.")}
      footer={
        <span>
          {t("Já tem conta?")} <Link to="/entrar">{t("Entrar")}</Link>{" "}
          {t("· Ao criar a conta você concorda com os")} <a href={siteLink("/termos")}>{t("termos")}</a>{" "}
          {t("e a")} <a href={siteLink("/privacidade")}>{t("privacidade")}</a>.
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Field label={t("Como quer ser chamado")} htmlFor="name" error={formState.errors.name?.message}>
          <Input
            id="name"
            autoComplete="given-name"
            invalid={!!formState.errors.name}
            {...register("name")}
          />
        </Field>
        <Field label={t("E-mail")} htmlFor="email" error={formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            invalid={!!formState.errors.email}
            {...register("email")}
          />
        </Field>
        <Field
          label={t("Senha")}
          htmlFor="password"
          hint={t("Pelo menos 8 caracteres.")}
          error={formState.errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            invalid={!!formState.errors.password}
            {...register("password")}
          />
        </Field>
        {offer ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[14px] font-medium">{t("Como você quer começar?")}</legend>
            <StartOption
              selected={start === "trial"}
              onSelect={() => setStart("trial")}
              name="trial"
              label={t("Teste os benefícios do {{v0}} por {{v1}} dias", { v0: offer.plan_name, v1: offer.days })}
              tag={t("{{v0}} dias grátis", { v0: offer.days })}
            >
              <CardTrialPitch offer={offer} plan={trialPlan} />
              {start === "trial" ? (
                <CardTrialTerms offer={offer} className="mt-1 border-t border-divider pt-3" />
              ) : (
                <span className="text-[13px] text-neutral-400">
                  {t("Você cadastra o cartão e só começa a pagar depois de {{v0}} dias, se não cancelar.", {
                    v0: offer.days,
                  })}
                </span>
              )}
            </StartOption>
            <StartOption
              selected={start === "free"}
              onSelect={() => setStart("free")}
              name="free"
              label={t("Começar no plano gratuito")}
            >
              <span className="text-[15px] font-medium">{t("Começar no plano gratuito")}</span>
              <span className="text-[13px] text-neutral-400">
                {t("Sem cartão. Um objetivo, com cronômetro, plano da semana e recuperação do atraso. Dá para testar o {{v0}} depois.", {
                  v0: offer.plan_name,
                })}
              </span>
            </StartOption>
          </fieldset>
        ) : null}
        <Button type="submit" size="xl" block loading={formState.isSubmitting}>
          {wantsTrial ? t("Criar conta e cadastrar o cartão") : t("Criar conta")}
        </Button>
        {wantsTrial ? (
          <p className="-mt-1 text-center text-[12px] text-neutral-400">
            {t("O cartão é informado na página segura do Asaas, nosso provedor de pagamento. Nada é cobrado hoje.")}
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
}

/** Opção de começo: cartão inteiro clicável, com o rádio de verdade para teclado e leitor de tela. */
function StartOption({
  selected,
  onSelect,
  name,
  label,
  tag,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  name: Start;
  /** nome curto do rádio para leitor de tela (o cartão inteiro seria lido como rótulo) */
  label: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-[14px] border p-[14px] transition-colors duration-base",
        selected ? "tint-soft border-accent" : "border-divider hover:border-accent",
      )}
    >
      <input
        type="radio"
        name="start"
        value={name}
        checked={selected}
        onChange={onSelect}
        aria-label={label}
        className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--color-action-primary)]"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        {tag ? (
          <span className="w-fit rounded-full bg-accent-800 px-2 py-[2px] text-[11px] font-medium uppercase tracking-[0.06em] text-accent-100">
            {tag}
          </span>
        ) : null}
        {children}
      </span>
    </label>
  );
}
