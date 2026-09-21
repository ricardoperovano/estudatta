import { t, intlLocale } from "@/i18n";
import { Link, Navigate, NavLink, Route, Routes } from "react-router";
import {
  ArrowLeft,
  ChartBar,
  ClockCounterClockwise,
  CreditCard,
  GearSix,
  Megaphone,
  Queue,
  Receipt,
  Tag as TagIcon,
  Ticket,
  Users,
} from "@phosphor-icons/react";
import { useAdminOverview, type AdminOverview } from "@/api/admin";
import {
  fmtDate,
  fmtValue,
  humanize,
  isPlainObject,
  statusLabel,
  statusVariant,
} from "@/components/app/admin-format";
import { AdminCampaignEditorPage, AdminCampaignsPage } from "@/components/app/admin-campaigns";
import { AdminCouponsPage } from "@/components/app/admin-coupons";
import { AdminAuditPage, AdminBillingPage, AdminQueuesPage } from "@/components/app/admin-ops";
import { AdminPlansPage } from "@/components/app/admin-plans";
import { AdminSettingsPage } from "@/components/app/admin-settings";
import { AdminSubscriptionsPage } from "@/components/app/admin-subscriptions";
import { AdminTitle, QueryGate, StatCard } from "@/components/app/admin-shared";
import { AdminUserDetailPage, AdminUsersList } from "@/components/app/admin-users";
import { Logo } from "@/components/app/brand";
import { Banner, Button, Tag } from "@/components/ui";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { to: "/admin", end: true, label: t("Visão geral"), icon: ChartBar },
  { to: "/admin/usuarios", end: false, label: t("Usuários"), icon: Users },
  { to: "/admin/assinaturas", end: false, label: t("Assinaturas"), icon: Receipt },
  { to: "/admin/planos", end: false, label: t("Planos"), icon: TagIcon },
  { to: "/admin/cupons", end: false, label: t("Cupons"), icon: Ticket },
  { to: "/admin/campanhas", end: false, label: t("Campanhas"), icon: Megaphone },
  { to: "/admin/configuracoes", end: false, label: t("Configurações"), icon: GearSix },
  { to: "/admin/filas", end: false, label: t("Filas"), icon: Queue },
  { to: "/admin/cobranca", end: false, label: t("Cobrança"), icon: CreditCard },
  { to: "/admin/auditoria", end: false, label: t("Auditoria"), icon: ClockCounterClockwise },
];

/** Painel administrativo (fora do AppShell). A rota já exige papel de administrador. */
export default function AdminPage() {
  const online = useOnline();
  return (
    <div className="min-h-dvh bg-canvas text-primary">
      <header className="sticky top-0 z-30 border-b border-divider bg-canvas">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2 desktop:px-6">
          <Link
            to="/admin"
            className="flex min-h-[44px] min-w-0 items-center gap-3"
            aria-label={t("Painel administrativo — visão geral")}
          >
            <Logo size={22} />
            <span className="kicker hidden truncate xs:inline">{t("Painel administrativo")}</span>
          </Link>
          <Link
            to="/app"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-[14px] text-accent"
          >
            <ArrowLeft size={16} aria-hidden /> {t("Voltar ao app")}
          </Link>
        </div>
        <nav aria-label={t("Seções do painel")} className="overflow-x-auto desktop:hidden">
          <ul className="mx-auto flex w-max min-w-full gap-1 px-2">
            {SECTIONS.map((s) => (
              <li key={s.to}>
                <NavLink
                  to={s.to}
                  end={s.end}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex min-h-[44px] items-center whitespace-nowrap border-b-2 px-3 text-[14px]",
                      isActive ? "border-accent text-accent" : "border-transparent text-neutral-400",
                    )
                  }
                >
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto flex max-w-[1440px]">
        <nav
          aria-label={t("Seções do painel")}
          className="sticky top-[61px] hidden h-[calc(100dvh-61px)] w-[240px] shrink-0 overflow-y-auto border-r border-divider p-3 desktop:block"
        >
          <ul className="flex flex-col gap-1">
            {SECTIONS.map((s) => (
              <li key={s.to}>
                <NavLink
                  to={s.to}
                  end={s.end}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-[44px] items-center gap-3 rounded-md px-3 text-[14px] transition-colors",
                      isActive
                        ? "bg-accent-900 text-accent"
                        : "text-neutral-400 hover:bg-surface hover:text-primary",
                    )
                  }
                >
                  <s.icon size={18} aria-hidden /> {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex min-w-0 flex-1 flex-col gap-[14px] px-4 pb-12 pt-4 desktop:gap-6 desktop:px-8 desktop:pt-8">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[14px] desktop:gap-6">
            {!online ? (
              <Banner kind="offline">
                {t(
                  "Sem conexão. O painel precisa de internet: os dados podem estar desatualizados e as alterações não serão salvas.",
                )}
              </Banner>
            ) : null}
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="usuarios" element={<AdminUsersList />} />
              <Route path="usuarios/:id" element={<AdminUserDetailPage />} />
              <Route path="assinaturas" element={<AdminSubscriptionsPage />} />
              <Route path="planos" element={<AdminPlansPage />} />
              <Route path="cupons" element={<AdminCouponsPage />} />
              <Route path="campanhas" element={<AdminCampaignsPage />} />
              <Route path="campanhas/nova" element={<AdminCampaignEditorPage />} />
              <Route path="campanhas/:id" element={<AdminCampaignEditorPage />} />
              <Route path="configuracoes" element={<AdminSettingsPage />} />
              <Route path="filas" element={<AdminQueuesPage />} />
              <Route path="cobranca" element={<AdminBillingPage />} />
              <Route path="auditoria" element={<AdminAuditPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

function OverviewPage() {
  const overview = useAdminOverview();
  return (
    <>
      <AdminTitle
        title={t("Visão geral")}
        subtitle={
          overview.data
            ? t("Números gerados em {{v0}}.", { v0: fmtDate(overview.data.generated_at) })
            : undefined
        }
        actions={
          <Button
            variant="secondary"
            size="lg"
            loading={overview.isFetching}
            onClick={() => void overview.refetch()}
          >
            {t("Atualizar")}
          </Button>
        }
      />
      <QueryGate query={overview}>{(o) => <OverviewGrid o={o} />}</QueryGate>
    </>
  );
}

function OverviewGrid({ o }: { o: AdminOverview }) {
  return (
    <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-3">
      <StatCard label={t("Usuários")} value={headline(o.users)}>
        <DictLines data={o.users} skip="total" />
      </StatCard>
      <StatCard label={t("Assinaturas por situação")}>
        <StatusLines data={o.subscriptions} empty={t("Nenhuma assinatura.")} />
      </StatCard>
      <StatCard label={t("Objetivos")} value={headline(o.activities)}>
        <DictLines data={o.activities} skip="total" />
      </StatCard>
      <StatCard label={t("Sessões em 7 dias")} value={o.sessions_7d.toLocaleString(intlLocale)} />
      <StatCard label={t("Fila de envio")}>
        <StatusLines data={o.outbox} empty={t("Fila vazia.")} />
        <Link to="/admin/filas" className="inline-flex min-h-[44px] items-center text-[13px] text-accent">
          {t("Ver filas")}
        </Link>
      </StatCard>
      <StatCard
        label={t("Importações com falha em 7 dias")}
        value={o.imports_failed_7d.toLocaleString(intlLocale)}
      />
      <StatCard label={t("Uso de IA em 7 dias")}>
        <DictLines data={o.ai_usage_7d} />
      </StatCard>
      <StatCard label={t("Eventos de cobrança em 7 dias")}>
        <StatusLines data={o.billing_events_7d} empty={t("Nenhum evento.")} />
        <Link to="/admin/cobranca" className="inline-flex min-h-[44px] items-center text-[13px] text-accent">
          {t("Ver cobrança")}
        </Link>
      </StatCard>
      <StatCard
        label={t("Concessões promocionais ativas")}
        value={o.promo_grants_active.toLocaleString(intlLocale)}
      >
        <Link
          to="/admin/assinaturas"
          className="inline-flex min-h-[44px] items-center text-[13px] text-accent"
        >
          {t("Ver assinaturas")}
        </Link>
      </StatCard>
    </div>
  );
}

function headline(data: Record<string, unknown>) {
  return typeof data.total === "number" ? data.total.toLocaleString(intlLocale) : undefined;
}

function DictLines({ data, skip }: { data: Record<string, unknown>; skip?: string }) {
  const entries = Object.entries(data).filter(([k, v]) => !(k === skip && typeof v === "number"));
  if (!entries.length) return <span className="text-[13px] text-neutral-400">{t("Sem dados.")}</span>;
  return (
    <dl className="flex flex-col gap-1 text-[13px]">
      {entries.map(([k, v]) =>
        isPlainObject(v) ? (
          <div key={k} className="flex flex-col gap-1">
            <dt className="text-neutral-400">{humanize(k)}</dt>
            <dd className="pl-3">
              <DictLines data={v} />
            </dd>
          </div>
        ) : (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-neutral-400">{humanize(k)}</dt>
            <dd className="tnum min-w-0 break-words text-right">{fmtValue(v)}</dd>
          </div>
        ),
      )}
    </dl>
  );
}

function StatusLines({ data, empty }: { data: Record<string, number>; empty: string }) {
  const entries = Object.entries(data);
  if (!entries.length) return <span className="text-[13px] text-neutral-400">{empty}</span>;
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]">
      {entries.map(([s, n]) => (
        <li key={s} className="flex items-center justify-between gap-3">
          <Tag variant={statusVariant(s)}>{statusLabel(s)}</Tag>
          <span className="tnum">{n.toLocaleString(intlLocale)}</span>
        </li>
      ))}
    </ul>
  );
}
