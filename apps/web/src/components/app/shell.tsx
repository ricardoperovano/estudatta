import * as React from "react";
import { Outlet } from "react-router";
import { BottomNav, Sidebar } from "./nav";
import { useUser } from "@/api/session";
import { useOnline } from "@/lib/online";
import { syncNow, useSyncStore, refreshCounts } from "@/offline/sync";
import { usePwaStore } from "@/pwa/register";
import { Banner, Button } from "@/components/ui";
import { useTimerStore } from "@/app/timer/store";
import { refreshPushSubscription } from "@/app/push";

/** Shell autenticado: lateral (tablet/desktop) + conteúdo + navegação inferior (celular). */
export function AppShell() {
  const user = useUser();
  const online = useOnline();
  const sync = useSyncStore();
  const pwa = usePwaStore();
  const timerActive = useTimerStore((s) => s.timer?.status === "active");

  React.useEffect(() => {
    if (!user) return;
    refreshCounts(user.id);
    if (online) {
      syncNow(user.id);
      refreshPushSubscription();
    }
  }, [user, online]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(var(--layout-bottom-nav-height)+env(safe-area-inset-bottom,0px))] desktop:pb-0">
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
    </div>
  );
}
