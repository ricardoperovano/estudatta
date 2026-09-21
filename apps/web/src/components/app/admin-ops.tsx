/** Painel administrativo — filas, cobrança e auditoria. */
import { t } from "@/i18n";
import * as React from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import {
  useAdminQueues,
  useAuditLog,
  useBillingEvents,
  useReconcileBilling,
  useRetryOutbox,
  type BillingEvent,
} from "@/api/admin";
import {
  fmtDate,
  fmtValue,
  humanize,
  shortId,
  statusLabel,
  statusVariant,
} from "@/components/app/admin-format";
import {
  AdminSection,
  AdminTitle,
  JsonBlock,
  KeyValues,
  Pager,
  QueryGate,
  SearchInput,
} from "@/components/app/admin-shared";
import {
  Banner,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Select,
  Tag,
  toast,
} from "@/components/ui";

// --- Filas -------------------------------------------------------------------------------

const QUEUE_PAGE = 20;

export function AdminQueuesPage() {
  const [offset, setOffset] = React.useState(0);
  const queues = useAdminQueues({ limit: QUEUE_PAGE, offset });
  const retry = useRetryOutbox();

  const doRetry = async (id: string) => {
    try {
      await retry.mutateAsync(id);
      toast("success", t("Reenvio agendado"), t("A notificação voltou para a fila."));
    } catch (e) {
      toast("error", t("Não foi possível reenviar"), errorMessage(e));
    }
  };

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Filas")}
        subtitle={t("Envio de notificações e importações que falharam.")}
        actions={
          <Button
            variant="secondary"
            size="lg"
            loading={queues.isFetching}
            onClick={() => void queues.refetch()}
          >
            <ArrowsClockwise size={16} aria-hidden /> {t("Atualizar")}
          </Button>
        }
      />
      <QueryGate query={queues}>
        {(q) => {
          const total = Math.max(q.failed_outbox.total ?? 0, q.failed_imports.total ?? 0);
          const count = Math.max(q.failed_outbox.items.length, q.failed_imports.items.length);
          const statuses = Object.entries(q.outbox_by_status);
          return (
            <>
              <AdminSection title={t("Fila de envio por situação")}>
                {statuses.length === 0 ? (
                  <span className="text-[13px] text-neutral-400">{t("A fila está vazia.")}</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {statuses.map(([s, n]) => (
                      <Tag key={s} variant={statusVariant(s)}>
                        {statusLabel(s)} · <span className="tnum">{n.toLocaleString("pt-BR")}</span>
                      </Tag>
                    ))}
                  </div>
                )}
              </AdminSection>

              <AdminSection
                title={t("Falhas de envio")}
                meta={
                  <span className="tnum">
                    {t("{{v0}} no total", {
                      v0: fmtValue(q.failed_outbox.total ?? q.failed_outbox.items.length),
                    })}
                  </span>
                }
              >
                {q.failed_outbox.items.length === 0 ? (
                  <EmptyState title={t("Nenhuma falha de envio nesta página.")} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {q.failed_outbox.items.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-col gap-2 rounded-md border border-divider p-3 text-[13px] tablet:flex-row tablet:items-center"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[14px] font-medium">{humanize(r.kind)}</span>
                            <Tag variant={statusVariant(r.status)}>{statusLabel(r.status)}</Tag>
                            <span className="tnum text-neutral-400">
                              {t("tentativas {{v0}}/{{v1}}", { v0: r.attempts, v1: r.max_attempts })}
                            </span>
                          </div>
                          <span className="tnum text-neutral-400">
                            {t("usuário {{v0}} · canais {{v1}} · criada {{v2}} · próxima {{v3}}", {
                              v0: shortId(r.user_id),
                              v1: fmtValue(r.channels),
                              v2: fmtDate(r.created_at),
                              v3: fmtDate(r.next_run_at),
                            })}
                          </span>
                          {r.last_error ? (
                            <span className="break-words text-error">{r.last_error}</span>
                          ) : null}
                          {r.skip_reason ? (
                            <span className="break-words text-neutral-400">
                              {t("Ignorada: {{v0}}", { v0: r.skip_reason })}
                            </span>
                          ) : null}
                        </div>
                        <Button
                          size="lg"
                          loading={retry.isPending && retry.variables === r.id}
                          disabled={retry.isPending}
                          onClick={() => void doRetry(r.id)}
                        >
                          {t("Tentar de novo")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminSection>

              <AdminSection title={t("Entregas com falha")} meta={t("as mais recentes")}>
                {q.failed_deliveries.length === 0 ? (
                  <EmptyState title={t("Nenhuma entrega com falha.")} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.1em] text-neutral-400">
                          <th className="py-2 pr-3 font-normal">{t("Quando")}</th>
                          <th className="py-2 pr-3 font-normal">{t("Canal")}</th>
                          <th className="py-2 pr-3 font-normal">{t("Notificação")}</th>
                          <th className="py-2 font-normal">{t("Erro")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.failed_deliveries.map((d) => (
                          <tr key={d.id} className="border-t border-divider align-top">
                            <td className="tnum whitespace-nowrap py-2 pr-3">{fmtDate(d.attempted_at)}</td>
                            <td className="py-2 pr-3">{d.channel}</td>
                            <td className="tnum py-2 pr-3">{shortId(d.outbox_id)}</td>
                            <td className="break-words py-2 text-error">{d.error ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </AdminSection>

              <AdminSection
                title={t("Importações com falha")}
                meta={
                  <span className="tnum">
                    {t("{{v0}} no total", {
                      v0: fmtValue(q.failed_imports.total ?? q.failed_imports.items.length),
                    })}
                  </span>
                }
              >
                {q.failed_imports.items.length === 0 ? (
                  <EmptyState title={t("Nenhuma importação com falha nesta página.")} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {q.failed_imports.items.map((j) => (
                      <li
                        key={j.id}
                        className="flex flex-col gap-1 rounded-md border border-divider p-3 text-[13px]"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium">{humanize(j.source)}</span>
                          <Tag variant={statusVariant(j.status)}>{statusLabel(j.status)}</Tag>
                          {j.error_code ? (
                            <code className="text-[12px] text-neutral-400">{j.error_code}</code>
                          ) : null}
                        </div>
                        <span className="tnum text-neutral-400">
                          {t("usuário {{v0}} · objetivo {{v1}} · criada {{v2}} · terminou {{v3}}", {
                            v0: shortId(j.user_id),
                            v1: shortId(j.activity_id),
                            v2: fmtDate(j.created_at),
                            v3: fmtDate(j.finished_at),
                          })}
                        </span>
                        {j.error_message ? (
                          <span className="break-words text-error">{j.error_message}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </AdminSection>

              <Pager
                total={total}
                limit={QUEUE_PAGE}
                offset={offset}
                count={count}
                busy={queues.isFetching}
                onChange={setOffset}
              />
            </>
          );
        }}
      </QueryGate>
    </div>
  );
}

// --- Cobrança ----------------------------------------------------------------------------

const BILLING_PAGE = 25;
const BILLING_STATUSES = ["received", "processed", "ignored", "failed"];

export function AdminBillingPage() {
  const [filter, setFilter] = React.useState({ status: "", offset: 0 });
  const events = useBillingEvents({ status: filter.status, limit: BILLING_PAGE, offset: filter.offset });
  const reconcile = useReconcileBilling();
  const [payloadOf, setPayloadOf] = React.useState<BillingEvent | null>(null);

  const run = () => {
    reconcile.mutate(undefined, {
      onSuccess: () => toast("success", t("Reconciliação concluída")),
    });
  };

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Cobrança")}
        subtitle={t("Eventos recebidos do provedor de pagamento e reconciliação das assinaturas.")}
        actions={
          <Button size="lg" loading={reconcile.isPending} onClick={run}>
            {t("Reconciliar agora")}
          </Button>
        }
      />

      {reconcile.isError ? (
        <Banner
          kind="error"
          actions={
            <Button variant="secondary" size="lg" onClick={run}>
              {t("Tentar de novo")}
            </Button>
          }
        >
          {errorMessage(reconcile.error)}
        </Banner>
      ) : null}
      {reconcile.data ? (
        <AdminSection title={t("Resultado da reconciliação")}>
          <KeyValues data={reconcile.data.summary} />
        </AdminSection>
      ) : null}

      <Field label={t("Situação")} htmlFor="billing-status" className="w-full tablet:w-[240px]">
        <Select
          id="billing-status"
          value={filter.status}
          onChange={(e) => setFilter({ status: e.target.value, offset: 0 })}
        >
          <option value="">{t("Todas")}</option>
          {BILLING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </Field>

      <QueryGate query={events}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={t("Nenhum evento de cobrança.")}
              description={
                filter.status
                  ? t("Nenhum evento com esta situação.")
                  : t("Quando o provedor enviar avisos, eles aparecem aqui.")
              }
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {page.items.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-col gap-2 rounded-md bg-surface p-4 text-[13px] tablet:flex-row tablet:items-center"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-all text-[14px] font-medium">{ev.event_type}</span>
                        <Tag variant={statusVariant(ev.status)}>{statusLabel(ev.status)}</Tag>
                        {!ev.signature_valid ? <Tag variant="error">{t("assinatura inválida")}</Tag> : null}
                      </div>
                      <span className="tnum break-all text-neutral-400">
                        {t("{{v0}} · evento {{v1}}", { v0: ev.provider, v1: ev.event_id })}
                        {ev.resource_id ? " " + t("· recurso {{v0}}", { v0: ev.resource_id }) : ""}
                        {ev.subscription_id
                          ? " " + t("· assinatura {{v0}}", { v0: shortId(ev.subscription_id) })
                          : ""}
                      </span>
                      <span className="tnum text-neutral-400">
                        {t("recebido {{v0}} · processado {{v1}}", {
                          v0: fmtDate(ev.received_at),
                          v1: fmtDate(ev.processed_at),
                        })}
                      </span>
                      {ev.error ? <span className="break-words text-error">{ev.error}</span> : null}
                    </div>
                    <Button variant="secondary" size="lg" onClick={() => setPayloadOf(ev)}>
                      {t("Ver conteúdo")}
                    </Button>
                  </li>
                ))}
              </ul>
              <Pager
                total={page.total}
                limit={page.limit}
                offset={page.offset}
                count={page.items.length}
                busy={events.isFetching}
                onChange={(offset) => setFilter((f) => ({ ...f, offset }))}
              />
            </>
          )
        }
      </QueryGate>

      <Dialog open={!!payloadOf} onOpenChange={(o) => (o ? undefined : setPayloadOf(null))}>
        {payloadOf ? (
          <DialogContent
            title={t("Conteúdo do evento")}
            description={`${payloadOf.event_type} · ${payloadOf.event_id}`}
            width="min(720px, calc(100% - 32px))"
          >
            <JsonBlock value={payloadOf.payload} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

// --- Auditoria ---------------------------------------------------------------------------

const AUDIT_PAGE = 50;

export function AdminAuditPage() {
  const [filter, setFilter] = React.useState({ action: "", offset: 0 });
  const log = useAuditLog({ action: filter.action, limit: AUDIT_PAGE, offset: filter.offset });
  const commit = React.useCallback(
    (action: string) => setFilter((f) => (f.action === action ? f : { action, offset: 0 })),
    [],
  );

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Auditoria")}
        subtitle={t("Toda mudança feita por este painel fica registrada aqui.")}
      />
      <SearchInput
        label={t("Filtrar por ação")}
        placeholder={t("Ação começa com… ex.: admin.plan")}
        onCommit={commit}
      />
      <QueryGate query={log}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={t("Nenhum registro.")}
              description={filter.action ? t("Nenhuma ação começa com este texto.") : undefined}
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {page.items.map((r) => {
                  const meta = r.metadata && Object.keys(r.metadata).length ? r.metadata : null;
                  return (
                    <li key={r.id} className="flex flex-col gap-1 rounded-md bg-surface p-4 text-[13px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <code className="break-all text-[13px] text-accent">{r.action}</code>
                        <span className="tnum text-[12px] text-neutral-400">{fmtDate(r.created_at)}</span>
                      </div>
                      <span className="tnum break-all text-neutral-400">
                        {t("por {{v0}}", { v0: shortId(r.actor_id) })}
                        {r.target_type ? ` · ${humanize(r.target_type)} ${r.target_id ?? ""}` : ""}
                        {r.ip ? ` · ${r.ip}` : ""}
                      </span>
                      {meta ? (
                        <details>
                          <summary className="flex min-h-[44px] cursor-pointer items-center text-accent">
                            {t("Metadados")}
                          </summary>
                          <JsonBlock value={meta} />
                          {r.request_id ? (
                            <span className="tnum mt-1 block break-all text-[11px] text-neutral-400">
                              {t("requisição {{v0}}", { v0: r.request_id })}
                            </span>
                          ) : null}
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <Pager
                total={page.total}
                limit={page.limit}
                offset={page.offset}
                count={page.items.length}
                busy={log.isFetching}
                onChange={(offset) => setFilter((f) => ({ ...f, offset }))}
              />
            </>
          )
        }
      </QueryGate>
    </div>
  );
}
