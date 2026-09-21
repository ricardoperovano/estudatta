import { t } from "@/i18n";
import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { AuthLayout } from "./layout";
import { Banner, Button, Spinner } from "@/components/ui";
import { api, unwrap, errorMessage } from "@/api/client";
import { useAuthActions } from "@/api/session";

export default function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { refresh } = useAuthActions();
  const [state, setState] = React.useState<"loading" | "ok" | "error">(token ? "loading" : "error");
  const [msg, setMsg] = React.useState(token ? "" : t("Link inválido."));
  React.useEffect(() => {
    if (!token) return;
    api
      .POST("/api/v1/auth/verify-email", { body: { token } })
      .then((r) => {
        unwrap(r);
        setState("ok");
        refresh();
      })
      .catch((e) => {
        setState("error");
        setMsg(errorMessage(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return (
    <AuthLayout
      title={t("Confirmar e-mail")}
      mood="cheer"
      greeting={t("Só mais um passo e sua conta fica pronta.")}
    >
      {state === "loading" ? (
        <Spinner />
      ) : state === "ok" ? (
        <Banner kind="synced">{t("E-mail confirmado. Bom estudo.")}</Banner>
      ) : (
        <Banner kind="error">{msg}</Banner>
      )}
      <Button asChild variant="primary" size="lg">
        <Link to="/app">{t("Ir para Hoje")}</Link>
      </Button>
    </AuthLayout>
  );
}
