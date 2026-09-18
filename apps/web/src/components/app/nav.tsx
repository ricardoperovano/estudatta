import { NavLink, useLocation } from "react-router";
import { CalendarBlank, ChartBar, Clock, ListBullets, Gear, Bell } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Logo, Symbol } from "./brand";
import { useSyncStore } from "@/offline/sync";
import { Check } from "@phosphor-icons/react";
import { fmtTime } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { useUnreadCount } from "@/api/notifications";

const items = [
  { to: "/app", label: "Hoje", icon: Clock, end: true },
  { to: "/app/plano", label: "Plano", labelLong: "Plano da semana", icon: CalendarBlank },
  { to: "/app/objetivos", label: "Objetivos", icon: ListBullets },
  { to: "/app/relatorio", label: "Relatório", icon: ChartBar },
];

/** Navegação inferior 64px no celular: 4 itens (Hoje · Plano · Objetivos · Relatório). */
export function BottomNav() {
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--layout-bottom-nav-height)+env(safe-area-inset-bottom,0px))] items-center justify-around border-t border-divider bg-canvas pb-[calc(6px+env(safe-area-inset-bottom,0px))] text-[11px] desktop:hidden">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn("flex min-w-[56px] min-h-[44px] flex-col items-center justify-center gap-[3px] rounded-md", isActive ? "text-accent" : "text-neutral-500")}
        >
          {({ isActive }) => (
            <>
              <Icon size={24} weight={isActive ? "fill" : "regular"} aria-hidden />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Lateral 240px no desktop (72px colapsada no tablet) com os mesmos itens + Preferências e Planos. */
export function Sidebar() {
  const sync = useSyncStore();
  const online = useOnline();
  const unread = useUnreadCount();
  const { pathname } = useLocation();
  const linkCls = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-[6px] px-[10px] py-[9px] text-[14px] transition-colors duration-base tablet:justify-center desktop:justify-start",
      active ? "bg-accent-900 text-accent" : "text-neutral-400 hover:bg-[color-mix(in_srgb,var(--color-text-primary)_5%,transparent)] hover:text-primary",
    );
  return (
    <aside className="hidden h-dvh w-[72px] shrink-0 flex-col gap-1 border-r border-divider px-3 py-6 tablet:flex desktop:w-sidebar">
      <div className="flex items-center gap-[10px] px-[10px] pb-5 tablet:justify-center desktop:justify-start">
        <span className="desktop:hidden">
          <Symbol size={24} />
        </span>
        <span className="hidden desktop:block">
          <Logo size={24} />
        </span>
      </div>
      {items.map(({ to, label, labelLong, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => linkCls(isActive)} title={labelLong || label}>
          <Icon size={24} aria-hidden className="shrink-0" />
          <span className="hidden desktop:inline">{labelLong || label}</span>
        </NavLink>
      ))}
      <div className="mt-auto flex flex-col gap-1">
        <NavLink to="/app/notificacoes" className={({ isActive }) => linkCls(isActive)} title="Notificações">
          <span className="relative">
            <Bell size={24} aria-hidden className="shrink-0" />
            {unread > 0 ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-pending" aria-label={`${unread} não lidas`} /> : null}
          </span>
          <span className="hidden desktop:inline">Notificações</span>
        </NavLink>
        <NavLink to="/app/preferencias" className={({ isActive }) => linkCls(isActive || pathname.startsWith("/app/preferencias"))} title="Preferências">
          <Gear size={24} aria-hidden className="shrink-0" />
          <span className="hidden desktop:inline">Preferências</span>
        </NavLink>
        <NavLink to="/app/planos" className={({ isActive }) => linkCls(isActive)} title="Planos">
          <ListBullets size={24} aria-hidden className="shrink-0 desktop:hidden" />
          <span className="hidden desktop:inline">Planos</span>
        </NavLink>
        <div className="hidden items-center gap-2 px-[10px] py-[9px] text-[12px] desktop:flex">
          {!online ? (
            <span className="text-info">Sem conexão</span>
          ) : sync.status === "syncing" ? (
            <span className="text-neutral-400">Sincronizando…</span>
          ) : sync.pending > 0 ? (
            <span className="text-pending">{sync.pending} pendente(s)</span>
          ) : (
            <>
              <Check size={12} weight="bold" className="text-success" aria-hidden />
              <span className="text-neutral-400">{sync.lastSyncAt ? `Sincronizado às ${fmtTime(sync.lastSyncAt)}` : "Sincronizado"}</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
