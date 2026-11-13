/**
 * Painel admin › Saúde: o ambiente está de pé? algo quebrou? onde as pessoas estão batendo?
 *
 * Três blocos, do mais urgente ao menos: verificações do ambiente, erros (algo quebrou no
 * servidor, no app ou numa tarefa em segundo plano) e atritos (a pessoa esbarrou num limite, numa
 * validação ou num serviço indisponível). Ocorrências do mesmo problema viram uma linha só.
 */
import * as React from "react";
import { ArrowsClockwise, CheckCircle, Warning, XCircle } from "@phosphor-icons/react";
import { useAdminHealth, type HealthGroup } from "@/api/admin";
import { fmtDate } from "@/components/app/admin-format";
import { AdminSection, AdminTitle, QueryGate, StatCard } from "@/components/app/admin-shared";
import { Button, Seg, Tag } from "@/components/ui";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "1", label: t("24 horas") },
  { value: "7", label: t("7 dias") },
  { value: "30", label: t("30 dias") },
];

export function sourceLabel(source: string): string {
  if (source === "client") return t("App");
  if (source === "worker") return t("Segundo plano");
  return t("Servidor");
}

/** "há 5 min", "há 3 h", "há 2 dias": o que importa num painel é a recência. */
export function ago(iso: string, now: number = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 1) return t("agora");
  if (min < 60) return t("há {{v0}} min", { v0: min });
  const h = Math.round(min / 60);
  if (h < 48) return t("há {{v0}} h", { v0: h });
  return t("há {{v0}} dias", { v0: Math.round(h / 24) });
}

export function AdminHealthPage() {
  const [days, setDays] = React.useState("7");
  const health = useAdminHealth(Number(days));
  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Saúde")}
        subtitle={t("O que quebrou, onde as pessoas esbarraram e se o ambiente está de pé.")}
        actions={
          <>
            <Seg value={days} onChange={setDays} options={PERIODS} label={t("Período")} />
            <Button
              variant="secondary"
              size="lg"
              loading={health.isFetching}
              onClick={() => void health.refetch()}
            >
              <ArrowsClockwise size={16} aria-hidden /> {t("Atualizar")}
            </Button>
          </>
        }
      />
      <QueryGate query={health}>
        {(h) => {
          const errors = h.groups.filter((g) => g.level === "error");
          const friction = h.groups.filter((g) => g.level !== "error");
          const problems = h.checks.filter((c) => c.state === "fail").length;
          return (
            <>
              <AdminSection
                title={t("Ambiente")}
                meta={
                  problems ? (
                    <Tag variant="error">{t("{{v0}} para resolver", { v0: problems })}</Tag>
                  ) : (
                    <Tag variant="success">{t("Tudo de pé")}</Tag>
                  )
                }
              >
                <ul className="grid gap-x-6 gap-y-1 tablet:grid-cols-2">
                  {h.checks.map((c) => (
                    <li key={c.key} className="flex min-h-[36px] items-center gap-2 text-[14px]">
                      {c.state === "ok" ? (
                        <CheckCircle size={18} weight="fill" className="shrink-0 text-success" aria-hidden />
                      ) : c.state === "warn" ? (
                        <Warning size={18} weight="fill" className="shrink-0 text-pending" aria-hidden />
                      ) : (
                        <XCircle size={18} weight="fill" className="shrink-0 text-error" aria-hidden />
                      )}
                      <span>{c.label}</span>
                      {c.note ? <span className="truncate text-[12px] text-neutral-400">{c.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </AdminSection>

              <div className="grid gap-[14px] tablet:grid-cols-2 desktop:grid-cols-4">
                <StatCard label={t("Erros em 24 h")} value={h.totals.errors_24h} />
                <StatCard label={t("Erros no período")} value={h.totals.errors_period} />
                <StatCard label={t("Atritos em 24 h")} value={h.totals.friction_24h} />
                <StatCard label={t("Pessoas afetadas")} value={h.totals.users_affected_period} />
              </div>

              <AdminSection title={t("Erros")} meta={t("algo quebrou")}>
                {errors.length === 0 ? (
                  <Empty>{t("Nenhum erro registrado no período.")}</Empty>
                ) : (
                  <GroupList groups={errors} />
                )}
              </AdminSection>

              <AdminSection title={t("Atritos")} meta={t("a pessoa esbarrou em algo")}>
                {friction.length === 0 ? (
                  <Empty>{t("Nenhum atrito registrado no período.")}</Empty>
                ) : (
                  <GroupList groups={friction} />
                )}
              </AdminSection>

              <AdminSection title={t("Mensagens de contato")} meta={t("enviadas pelo formulário do site")}>
                {h.contact_messages.length === 0 ? (
                  <Empty>{t("Nenhuma mensagem recebida.")}</Empty>
                ) : (
                  <ul className="flex flex-col divide-y divide-divider">
                    {h.contact_messages.map((m) => (
                      <li key={m.id} className="flex flex-col gap-1 py-3 text-[14px]">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <a href={`mailto:${m.email}`} className="break-all font-medium">
                            {m.name ? `${m.name} · ${m.email}` : m.email}
                          </a>
                          <span className="text-[12px] text-neutral-400">{fmtDate(m.created_at)}</span>
                        </div>
                        {m.subject ? <span className="text-[13px] text-neutral-400">{m.subject}</span> : null}
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminSection>
            </>
          );
        }}
      </QueryGate>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] text-neutral-400">{children}</span>;
}

function GroupList({ groups }: { groups: HealthGroup[] }) {
  return (
    <ul className="flex flex-col divide-y divide-divider">
      {groups.map((g) => (
        <li key={g.fingerprint} className="flex flex-col gap-1 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tag variant={g.level === "error" ? "error" : "pending"}>{sourceLabel(g.source)}</Tag>
            <span className="min-w-0 flex-1 basis-[240px] break-words text-[14px] font-medium">
              {g.message}
            </span>
            <span className="tnum whitespace-nowrap text-[13px]">
              {g.count}× · {t("{{v0}} pessoa(s)", { v0: g.users })}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-[12px] text-neutral-400">
            {g.path ? (
              <span className="break-all font-mono">
                {g.method ? `${g.method} ` : ""}
                {g.path}
              </span>
            ) : null}
            {g.status ? <span className="tnum">HTTP {g.status}</span> : null}
            <span>{g.code}</span>
            <span>{t("última vez {{v0}}", { v0: ago(g.last_seen) })}</span>
          </div>
          {g.detail || g.context ? (
            <details className="text-[12px]">
              <summary className="inline-flex min-h-[32px] cursor-pointer items-center text-accent">
                {t("Detalhes técnicos")}
              </summary>
              {g.context ? (
                <p className="break-all text-neutral-400">
                  {Object.entries(g.context)
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · ")}
                </p>
              ) : null}
              {g.detail ? (
                <pre
                  className={cn(
                    "mt-1 max-h-[280px] overflow-auto whitespace-pre-wrap break-all rounded-md p-3 font-mono text-[11px] leading-[1.5]",
                    "bg-[color-mix(in_srgb,var(--color-text-primary)_6%,transparent)]",
                  )}
                >
                  {g.detail}
                </pre>
              ) : null}
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
