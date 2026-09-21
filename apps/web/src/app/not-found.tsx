import { t } from "@/i18n";
import { Link } from "react-router";
import { Button, EmptyState } from "@/components/ui";
import { siteLink } from "@/design/brand";

/** 404 do app. As páginas públicas ficam no site (outro domínio). */
export default function NotFoundPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <EmptyState
        title={t("Página não encontrada.")}
        description={t("O endereço pode ter mudado. O plano continua onde você parou.")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild variant="primary" size="lg">
              <Link to="/app">{t("Ir para Hoje")}</Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <a href={siteLink("/")}>{t("Ir para o site")}</a>
            </Button>
          </div>
        }
      />
    </div>
  );
}
