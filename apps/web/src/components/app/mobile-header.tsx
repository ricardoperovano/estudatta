/**
 * Cabeçalho do celular: logo à esquerda; notificações, tema e ajuda à direita. Fixo no topo com
 * fundo translúcido. Do tablet para cima a lateral cumpre esse papel; no cronômetro em tela
 * cheia ele some.
 */
import { Link, useLocation } from "react-router";
import { Bell } from "@phosphor-icons/react";
import { useUnreadCount } from "@/api/notifications";
import { TourHelpButton } from "@/components/tour/TourHelpButton";
import { Symbol } from "./brand";
import { ThemeToggle } from "./theme-toggle";

const round =
  "relative flex h-9 w-9 items-center justify-center rounded-full border border-divider bg-surface text-neutral-300 shadow-sm hover:text-primary focus-visible:ring-2 focus-visible:ring-accent";

export function MobileHeader() {
  const unread = useUnreadCount();
  const { pathname } = useLocation();
  if (pathname.startsWith("/app/sessao")) return null;
  return (
    <header className="sticky top-0 z-30 border-b border-divider bg-[color-mix(in_srgb,var(--color-bg-canvas)_82%,transparent)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-md tablet:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-gutter max-xs:px-3">
        <Link to="/app" className="flex items-center gap-2 text-primary no-underline" aria-label="Estudatta — ir para Hoje">
          <Symbol size={26} />
          <span className="text-[18px] font-semibold tracking-[-0.015em]">Estudatta</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/app/notificacoes" className={round} aria-label={unread > 0 ? `Notificações: ${unread} não lidas` : "Notificações"} title="Notificações">
            <Bell size={18} weight="bold" aria-hidden />
            {unread > 0 ? (
              <span aria-hidden className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-pending px-1 text-center text-[10px] font-semibold leading-[18px] text-on-accent">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>
          <ThemeToggle className={round} />
          <TourHelpButton inline />
        </div>
      </div>
    </header>
  );
}
