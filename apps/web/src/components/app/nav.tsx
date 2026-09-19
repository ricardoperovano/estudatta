import { NavLink, useLocation } from "react-router";
import {
  ArrowsClockwise,
  Bell,
  CalendarBlank,
  ChartLineUp,
  Check,
  CloudSlash,
  Gear,
  Sparkle,
  SunHorizon,
  Target,
  Trophy,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Symbol } from "./brand";
import { useSyncStore } from "@/offline/sync";
import { fmtTime } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { useUnreadCount } from "@/api/notifications";
import { useUser } from "@/api/session";
import { useGamification, useRevisionSummary } from "@/api/study";
import { TataSvg } from "@/components/mascot/TataSvg";
import { useTataPrefs } from "@/components/mascot/use-tata";
import { ThemeSwitch } from "./theme-toggle";

type Item = { to: string; label: string; labelLong?: string; icon: Icon; end?: boolean };

const study: Item[] = [
  { to: "/app", label: "Hoje", icon: SunHorizon, end: true },
  { to: "/app/plano", label: "Plano", labelLong: "Plano da semana", icon: CalendarBlank },
  { to: "/app/objetivos", label: "Objetivos", icon: Target },
];
const track: Item[] = [
  { to: "/app/relatorio", label: "Relatório", icon: ChartLineUp },
  { to: "/app/revisoes", label: "Revisões", icon: ArrowsClockwise },
  { to: "/app/conquistas", label: "Conquistas", icon: Trophy },
];
/** celular: 4 itens (Revisões e Conquistas ficam acessíveis pelo Hoje) */
const mobile: Item[] = [study[0], study[1], study[2], track[0]];

/** Navegação inferior no celular: ícone com pílula lilás no item ativo. */
export function BottomNav() {
  const { pathname } = useLocation();
  // cronômetro em tela cheia (tela 04): sem navegação inferior; "Minimizar" volta para Hoje
  if (pathname.startsWith("/app/sessao")) return null;
  return (
    <nav
      aria-label="Principal"
      data-tour="nav"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--layout-bottom-nav-height)+env(safe-area-inset-bottom,0px))] items-center justify-around rounded-t-[20px] border-t border-divider bg-surface pb-[calc(6px+env(safe-area-inset-bottom,0px))] text-[11px] shadow-[0_-6px_24px_rgba(41,43,49,0.06)] tablet:hidden"
    >
      {mobile.map(({ to, label, icon: I, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => cn("flex min-h-[44px] min-w-[64px] flex-col items-center justify-center gap-1", isActive ? "font-medium text-accent" : "text-neutral-500")}>
          {({ isActive }) => (
            <>
              <span className={cn("flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-base", isActive && "bg-accent-900")}>
                <I size={22} weight={isActive ? "fill" : "duotone"} aria-hidden />
              </span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Badge({ n, tone = "accent", label }: { n: number; tone?: "accent" | "pending"; label: string }) {
  if (n <= 0) return null;
  return (
    <>
      <span
        aria-label={label}
        className={cn(
          "ml-auto hidden min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-medium leading-[20px] desktop:inline-block",
          tone === "pending" ? "bg-warning-tint text-pending" : "bg-accent-900 text-accent",
        )}
      >
        {n > 99 ? "99+" : n}
      </span>
      <span aria-hidden className={cn("absolute right-2 top-2 h-2 w-2 rounded-full desktop:hidden", tone === "pending" ? "bg-pending" : "bg-accent")} />
    </>
  );
}

function NavItem({ item, badge, active }: { item: Item; badge?: React.ReactNode; active?: boolean }) {
  const { to, label, labelLong, icon: I, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      title={labelLong || label}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-[14px] px-3 py-[9px] text-[14px] transition-colors duration-base tablet:justify-center desktop:justify-start",
          isActive || active ? "bg-accent-900 font-medium text-accent" : "text-neutral-400 hover:bg-canvas hover:text-primary",
        )
      }
    >
      {({ isActive }) => (
        <>
          <I size={22} weight={isActive || active ? "fill" : "duotone"} aria-hidden className="shrink-0 transition-transform duration-base group-hover:scale-110" />
          <span className="hidden truncate desktop:inline">{labelLong || label}</span>
          {badge}
        </>
      )}
    </NavLink>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="hidden px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500 desktop:block">{title}</span>
      <span aria-hidden className="mx-auto my-2 h-px w-6 bg-divider desktop:hidden" />
      {children}
    </div>
  );
}

/** Cartão do topo: o Tatá cumprimenta, com nível, XP e sequência. Leva às Conquistas. */
function CompanionCard() {
  const user = useUser();
  const g = useGamification();
  const { enabled: tata } = useTataPrefs();
  const first = (user?.name || "").trim().split(/\s+/)[0];
  const lv = g.data?.level;
  const streak = g.data?.records.current_streak ?? 0;
  const pct = lv && lv.xp_for_next ? Math.min(1, lv.xp_into_level / lv.xp_for_next) : 0;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return (
    <NavLink
      to="/app/conquistas"
      title="Suas conquistas"
      className="group flex items-center gap-3 rounded-[18px] bg-[linear-gradient(135deg,var(--color-accent-900),var(--color-bg-canvas))] p-2.5 transition-shadow duration-base hover:shadow-md tablet:justify-center desktop:justify-start"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm">
        {tata ? <TataSvg mood="idle" size={34} /> : <Symbol size={22} />}
      </span>
      <span className="hidden min-w-0 flex-1 flex-col gap-1 desktop:flex">
        <span className="truncate text-[14px] font-medium text-primary">
          {hello}
          {first ? `, ${first}` : ""}!
        </span>
        {lv ? (
          <>
            <span className="truncate text-[12px] text-neutral-400">
              Nível {lv.number} · {lv.title}
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${lv.xp_into_level} de ${lv.xp_for_next} XP para o próximo nível`}>
              <span className="block h-full rounded-full bg-accent transition-[width] duration-slow" style={{ width: `${pct * 100}%` }} />
            </span>
            {streak > 1 ? <span className="text-[11px] text-neutral-500">{streak} dias seguidos. No seu ritmo.</span> : null}
          </>
        ) : (
          <span className="text-[12px] text-neutral-400">Que bom te ver por aqui.</span>
        )}
      </span>
    </NavLink>
  );
}

function SyncChip() {
  const sync = useSyncStore();
  const online = useOnline();
  const base = "hidden items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-[11px] desktop:flex";
  if (!online)
    return (
      <span className={cn(base, "bg-info-tint text-info")}>
        <CloudSlash size={12} weight="bold" aria-hidden /> Sem conexão
      </span>
    );
  if (sync.status === "syncing") return <span className={cn(base, "bg-canvas text-neutral-400")}>Sincronizando…</span>;
  if (sync.pending > 0) return <span className={cn(base, "bg-warning-tint text-pending")}>{sync.pending} pendente(s)</span>;
  return (
    <span className={cn(base, "bg-success-tint text-success")}>
      <Check size={11} weight="bold" aria-hidden />
      {sync.lastSyncAt ? `Sincronizado às ${fmtTime(sync.lastSyncAt)}` : "Sincronizado"}
    </span>
  );
}

/** Lateral flutuante (desktop 256px; recolhida em 76px no tablet). */
export function Sidebar() {
  const unread = useUnreadCount();
  const revs = useRevisionSummary();
  const due = (revs.data?.overdue ?? 0) + (revs.data?.due_today ?? 0);
  const { pathname } = useLocation();
  return (
    <div className="sticky top-0 hidden h-dvh shrink-0 p-3 tablet:block">
      <aside
        data-tour="nav"
        className="flex h-full w-[76px] flex-col gap-1 overflow-y-auto rounded-[24px] border border-divider bg-surface px-2.5 py-4 shadow-sm desktop:w-sidebar"
      >
        <div className="flex items-center gap-[10px] px-2 pb-3 tablet:justify-center desktop:justify-start">
          <Symbol size={26} />
          <span className="hidden text-[17px] font-medium tracking-[-0.015em] text-primary desktop:inline">Estudatta</span>
        </div>
        <CompanionCard />
        <nav aria-label="Principal" className="flex flex-col">
          <Section title="Estudar">
            {study.map((i) => (
              <NavItem key={i.to} item={i} />
            ))}
          </Section>
          <Section title="Acompanhar">
            <NavItem item={track[0]} />
            <NavItem item={track[1]} badge={<Badge n={due} tone="pending" label={`${due} revisões para hoje ou atrasadas`} />} />
            <NavItem item={track[2]} />
          </Section>
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 pt-4">
          <NavItem
            item={{ to: "/app/notificacoes", label: "Notificações", icon: Bell }}
            badge={<Badge n={unread} label={`${unread} notificações não lidas`} />}
          />
          <NavItem item={{ to: "/app/preferencias", label: "Preferências", icon: Gear }} active={pathname.startsWith("/app/preferencias")} />
          <NavItem item={{ to: "/app/planos", label: "Planos", icon: Sparkle }} />
          <ThemeSwitch className="mt-2" />
          <div className="mt-2 px-1">
            <SyncChip />
          </div>
        </div>
      </aside>
    </div>
  );
}
