import * as React from "react";
import { Outlet, useLocation } from "react-router";
import { BottomNav, Sidebar } from "./nav";
import { useUser } from "@/api/session";
import { useOnline } from "@/lib/online";
import { syncNow, useSyncStore, refreshCounts } from "@/offline/sync";
import { usePwaStore } from "@/pwa/register";
import { Banner, Button } from "@/components/ui";
import { useTimerStore } from "@/app/timer/store";
import { refreshPushSubscription } from "@/app/push";
import { AchievementCelebration } from "./achievement-celebration";
import { TourHelpButton } from "@/components/tour/TourHelpButton";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { ThemeToggle } from "./theme-toggle";
import { usePreferences } from "@/api/settings";
import { hasStoredTheme, setTheme } from "@/lib/theme";

/** Shell autenticado: lateral (tablet/desktop) + conteúdo + navegação inferior (celular). */
export function AppShell() {
  const user = useUser();
  const online = useOnline();
  const sync = useSyncStore();
  const pwa = usePwaStore();
  const timerActive = useTimerStore((s) => s.timer?.status === "active");
  const fullScreen = useLocation().pathname.startsWith("/app/sessao");
  const prefs = usePreferences();
  const serverTheme = prefs.data?.theme;

  // tema escolhido em outro aparelho: vale aqui se este aparelho ainda não tem escolha própria
  React.useEffect(() => {
    if ((serverTheme === "light" || serverTheme === "dark") && !hasStoredTheme()) setTheme(serverTheme);
  }, [serverTheme]);

  React.useEffect(() => {
    if (!user) return;
    refreshCounts(user.id);
    if (online) {
      syncNow(user.id);
      refreshPushSubscription();
    }
  }, [user, online]);

  return (
    <div className="app-backdrop flex min-h-dvh">
      <Sidebar />
      <div className={"flex min-w-0 flex-1 flex-col tablet:pb-0 " + (fullScreen ? "pb-[env(safe-area-inset-bottom,0px)]" : "pb-[calc(var(--layout-bottom-nav-height)+env(safe-area-inset-bottom,0px))]")}>
        {!online ? (
          <div className="px-gutter pt-3">
            <Banner kind="offline">
              <strong className="font-medium">Sem internet.</strong> Suas sessões ficam salvas neste aparelho. Vamos sincronizar quando você voltar à internet.
            </Banner>
          </div>
        ) : sync.status === "error" && sync.pending > 0 ? (
          <div className="px-gutter pt-3">
            <Banner
              kind="error"
              actions={
                <Button size="sm" variant="secondary" onClick={() => user && syncNow(user.id)}>
                  Sincronizar agora
                </Button>
              }
            >
              Não foi possível sincronizar {sync.pending} registro(s). Nada foi perdido.
            </Banner>
          </div>
        ) : null}
        {pwa.updateReady && !timerActive ? (
          <div className="px-gutter pt-3">
            <Banner
              kind="info"
              actions={
                <Button size="sm" variant="primary" onClick={pwa.apply}>
                  Atualizar agora
                </Button>
              }
            >
              Uma nova versão do Estudatta está pronta.
            </Banner>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-content flex-1 px-gutter pt-[max(56px,calc(24px+env(safe-area-inset-top,0px)))] pb-6 max-xs:px-3 desktop:px-12 desktop:pt-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <AchievementCelebration />
      <TourHelpButton />
      {/* troca rápida de tema no celular (no tablet/desktop fica na barra lateral) */}
      <ThemeToggle className="fixed right-[52px] top-[calc(env(safe-area-inset-top,0px)+10px)] z-30 flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-surface text-neutral-300 shadow-sm hover:text-primary focus-visible:ring-2 focus-visible:ring-accent tablet:hidden" />
      <TourOverlay />
    </div>
  );
}
