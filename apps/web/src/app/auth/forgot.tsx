import * as React from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthLayout } from "./layout";
import { Button, Field, Input, Banner } from "@/components/ui";
import { api, unwrap, errorMessage } from "@/api/client";

const schema = z.object({ email: z.string().email("Informe um e-mail válido.") });
type Form = z.infer<typeof schema>;

export default function ForgotPage() {
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) });
  const onSubmit = async (v: Form) => {
    setError(null);
    try {
      unwrap(await api.POST("/api/v1/auth/forgot-password", { body: { email: v.email } }));
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <AuthLayout mood="think" greeting="Acontece com todo mundo. Vamos resolver isso rapidinho." title="Recuperar senha" subtitle="Enviamos um link para redefinir a senha, se o e-mail tiver conta." footer={<Link to="/entrar">Voltar para entrar</Link>}>
      {done ? (
        <Banner kind="synced">Se o e-mail existir, você receberá um link válido por 1 hora.</Banner>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          {error ? <Banner kind="error">{error}</Banner> : null}
          <Field label="E-mail" htmlFor="email" error={formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" invalid={!!formState.errors.email} {...register("email")} />
          </Field>
          <Button type="submit" size="xl" block loading={formState.isSubmitting}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
