import { t } from "@/i18n";
import * as React from "react";
import { reportError } from "@/lib/error-report";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button, EmptyState } from "@/components/ui";
import { SupportEmailLink } from "@/components/app/support-contact";

export function ErrorPage() {
  const err = useRouteError();
  const is404 = isRouteErrorResponse(err) && err.status === 404;
  // a tela de erro é o sinal mais forte de que algo quebrou para a pessoa: vai para o painel
  React.useEffect(() => {
    if (!is404 && !isRouteErrorResponse(err)) reportError("render_error", err);
  }, [err, is404]);
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <EmptyState
        title={is404 ? t("Página não encontrada.") : t("Algo deu errado.")}
        description={
          is404
            ? t("O endereço pode ter mudado.")
            : (
                <>
                  {t("Tente recarregar. Se continuar, escreva para")} <SupportEmailLink />.
                </>
              )
        }
        action={
          <Button asChild variant="primary">
            <Link to="/app">{t("Ir para Hoje")}</Link>
          </Button>
        }
      />
    </div>
  );
}
