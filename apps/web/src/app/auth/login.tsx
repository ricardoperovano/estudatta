import { t } from "@/i18n";
import * as React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GoogleLogo } from "@phosphor-icons/react";
import { AuthLayout } from "./layout";
import { Button, Field, Input, Banner } from "@/components/ui";
import { useAuthActions, usePublicConfig } from "@/api/session";
import { errorMessage, API_BASE } from "@/api/client";

const schema = z.object({
  email: z.string().email(t("Informe um e-mail válido.")),
  password: z.string().min(1, t("Informe sua senha.")),
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuthActions();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const cfg = usePublicConfig();
  const [error, setError] = React.useState<string | null>(
    params.get("erro") === "google"
      ? t("Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.")
      : params.get("erro") === "vincular"
        ? t("Já existe uma conta com este e-mail. Entre com e-mail e senha para vinculá-la.")
        : null,
  );
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  const from = (loc.state as { from?: string } | null)?.from || "/app";

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      const data = await login(v.email, v.password);
      nav(data.user.onboarding_completed_at ? from : "/onboarding", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <AuthLayout
      title={t("Entrar")}
      subtitle={t("Continue de onde parou.")}
      greeting={t("Oi! Que bom te ver de novo. Seu plano de hoje está esperando.")}
      footer={
        <span>
          {t("Ainda não tem conta?")} <Link to="/cadastro">{t("Criar conta")}</Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {error ? <Banner kind="error">{error}</Banner> : null}
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
        <Field label={t("Senha")} htmlFor="password" error={formState.errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            invalid={!!formState.errors.password}
            {...register("password")}
          />
        </Field>
        <Button type="submit" size="xl" block loading={formState.isSubmitting}>
          {t("Entrar")}
        </Button>
        <Link to="/recuperar-senha" className="self-start text-[13px]">
          {t("Esqueci minha senha")}
        </Link>
        {cfg.data?.google_oauth_enabled ? (
          <Button asChild variant="secondary" size="lg" block>
            <a href={`${API_BASE}/api/v1/auth/google/start?next=${encodeURIComponent(from)}`}>
              <GoogleLogo size={18} aria-hidden /> {t("Entrar com Google")}
            </a>
          </Button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
