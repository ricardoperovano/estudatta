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
  const [state, setState] = React.useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => {
    if (!token) {
      setState("error");
      setMsg("Link inválido.");
      return;
    }
    api.POST("/api/v1/auth/verify-email", { body: { token } })
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
    <AuthLayout title="Confirmar e-mail">
      {state === "loading" ? <Spinner /> : state === "ok" ? <Banner kind="synced">E-mail confirmado. Bom estudo.</Banner> : <Banner kind="error">{msg}</Banner>}
      <Button asChild variant="primary" size="lg">
        <Link to="/app">Ir para Hoje</Link>
      </Button>
    </AuthLayout>
  );
}
