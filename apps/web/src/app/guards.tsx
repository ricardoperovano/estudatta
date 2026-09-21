import { t } from "@/i18n";
import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "@/api/session";
import { Spinner } from "@/components/ui";

export function FullPageLoading({ label = t("Carregando") }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-label={label}>
      <Spinner className="h-6 w-6" />
    </div>
  );
}

/** Rotas privadas: exige sessão; sem ela vai para /entrar (guardando destino). */
export function RequireAuth() {
  const { data, isPending } = useSession();
  const loc = useLocation();
  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/entrar" replace state={{ from: loc.pathname + loc.search }} />;
  if (!data.user.onboarding_completed_at && !loc.pathname.startsWith("/onboarding"))
    return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function RequireAdmin() {
  const { data, isPending } = useSession();
  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/entrar" replace />;
  if (data.user.role !== "admin") return <Navigate to="/app" replace />;
  return <Outlet />;
}

/** Rotas de entrada: se já autenticado, vai para o app. */
export function RedirectIfAuthed() {
  const { data, isPending } = useSession();
  if (isPending) return <FullPageLoading />;
  if (data) return <Navigate to={data.user.onboarding_completed_at ? "/app" : "/onboarding"} replace />;
  return <Outlet />;
}

/** "/" no domínio do app: vai para Hoje (ou para a entrada, sem sessão). */
export function RootRedirect() {
  const { data, isPending } = useSession();
  if (isPending) return <FullPageLoading />;
  if (!data) return <Navigate to="/entrar" replace />;
  return <Navigate to={data.user.onboarding_completed_at ? "/app" : "/onboarding"} replace />;
}
