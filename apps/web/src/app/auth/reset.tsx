import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthLayout } from "./layout";
import { Button, Field, Input, Banner } from "@/components/ui";
import { api, unwrap, errorMessage } from "@/api/client";

const schema = z.object({ password: z.string().min(8, "Use pelo menos 8 caracteres.") });
type Form = z.infer<typeof schema>;

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      unwrap(await api.POST("/api/v1/auth/reset-password", { body: { token, password: v.password } }));
      nav("/entrar", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <AuthLayout mood="encourage" greeting="Escolha uma senha nova e pronto." title="Redefinir senha" footer={<Link to="/entrar">Voltar para entrar</Link>}>
      {!token ? (
        <Banner kind="error">Link inválido. Peça um novo em "Esqueci minha senha".</Banner>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {error ? <Banner kind="error">{error}</Banner> : null}
          <Field label="Nova senha" htmlFor="password" error={formState.errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" invalid={!!formState.errors.password} {...register("password")} />
          </Field>
          <Button type="submit" size="xl" block loading={formState.isSubmitting}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
