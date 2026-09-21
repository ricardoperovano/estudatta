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
import { detectTimezone } from "@/lib/device";
import { siteLink } from "@/design/brand";

const schema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email(t("Informe um e-mail válido.")),
  password: z.string().min(8, t("Use pelo menos 8 caracteres.")),
});
type Form = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: signup } = useAuthActions();
  const nav = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      await signup(v.email, v.password, v.name || "", detectTimezone());
      nav("/onboarding", { replace: true });
    } catch (e) {
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
        <Field label={t("Como quer ser chamado (opcional)")} htmlFor="name">
          <Input id="name" autoComplete="given-name" {...register("name")} />
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
        <Button type="submit" size="xl" block loading={formState.isSubmitting}>
          {t("Criar conta")}
        </Button>
      </form>
    </AuthLayout>
  );
}
