import { t } from "@/i18n";
import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Button, EmptyState } from "@/components/ui";

export function ErrorPage() {
  const err = useRouteError();
  const is404 = isRouteErrorResponse(err) && err.status === 404;
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <EmptyState
        title={is404 ? t("Página não encontrada.") : t("Algo deu errado.")}
        description={
          is404
            ? t("O endereço pode ter mudado.")
            : t("Tente recarregar. Se continuar, avise a gente pelo contato.")
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
