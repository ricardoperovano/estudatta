/** Painel administrativo — usuários (lista + detalhe). Não existe "entrar como usuário". */
import { t } from "@/i18n";
import * as React from "react";
import { Link, useParams } from "react-router";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import {
  useAdminPlans,
  useAdminUser,
  useAdminUsers,
  useGrantPromo,
  useRevokePromo,
  useSetUserActive,
  useSetUserRole,
  type AdminUser,
  type AdminUserDetail,
  type PromoGrant,
  type UserRole,
} from "@/api/admin";
import { useUser } from "@/api/session";
import { fmtDate, intervalLabel, shortId, statusLabel, statusVariant } from "@/components/app/admin-format";
import {
  AdminSection,
  AdminTitle,
  KeyValues,
  Pager,
  QueryGate,
  SearchInput,
} from "@/components/app/admin-shared";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  EmptyState,
  Field,
  Input,
  Seg,
  Select,
  Tag,
  Textarea,
  toast,
} from "@/components/ui";
import { fmtBRL } from "@/lib/format";

const PAGE = 25;
const ROLE_LABEL: Record<UserRole, string> = { user: t("Usuário"), admin: "Administrador" };
const ROLES: UserRole[] = ["user", "admin"];

function roleLabel(role: string): string {
  return role === "admin" || role === "user" ? ROLE_LABEL[role] : role;
}

export function AdminUsersList() {
  const [filter, setFilter] = React.useState({ q: "", offset: 0 });
  const users = useAdminUsers({ q: filter.q, limit: PAGE, offset: filter.offset });
  const commit = React.useCallback((q: string) => setFilter((f) => (f.q === q ? f : { q, offset: 0 })), []);

  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <AdminTitle
        title={t("Usuários")}
        subtitle={t("Busque por nome ou e-mail. Toque em uma pessoa para ver o detalhe.")}
      />
      <SearchInput label={t("Buscar usuários")} placeholder={t("Nome ou e-mail")} onCommit={commit} />
      <QueryGate query={users}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={t("Nenhum usuário encontrado.")}
              description={filter.q ? t("Tente outro termo de busca.") : undefined}
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {page.items.map((u) => (
                  <li key={u.id}>
                    <UserRow user={u} />
                  </li>
                ))}
              </ul>
              <Pager
                total={page.total}
                limit={page.limit}
                offset={page.offset}
                count={page.items.length}
                busy={users.isFetching}
                onChange={(offset) => setFilter((f) => ({ ...f, offset }))}
              />
            </>
          )
        }
      </QueryGate>
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  return (
    <Link
      to={`/admin/usuarios/${user.id}`}
      className="flex min-h-[44px] flex-col gap-2 rounded-md bg-surface p-4 transition-colors hover:shadow-accent-ring tablet:flex-row tablet:items-center tablet:gap-4"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium">{user.name || t("Sem nome")}</span>
        <span className="truncate text-[13px] text-neutral-400">{user.email}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {user.role === "admin" ? <Tag variant="accent">{t("admin")}</Tag> : null}
        {!user.is_active ? <Tag variant="error">{t("desativado")}</Tag> : null}
        <Tag variant="neutral">{user.plan_code ?? t("sem plano")}</Tag>
        {user.subscription_status ? (
          <Tag variant={statusVariant(user.subscription_status)}>{statusLabel(user.subscription_status)}</Tag>
        ) : null}
      </div>
      <span className="tnum shrink-0 text-[12px] text-neutral-400 tablet:w-[150px] tablet:text-right">
        {t("Último acesso: {{v0}}", { v0: fmtDate(user.last_login_at) })}
      </span>
      <CaretRight size={16} aria-hidden className="hidden shrink-0 text-neutral-400 tablet:block" />
    </Link>
  );
}

export function AdminUserDetailPage() {
  const { id } = useParams();
  const detail = useAdminUser(id);
  return (
    <div className="flex flex-col gap-[14px] desktop:gap-6">
      <Link
        to="/admin/usuarios"
        className="inline-flex min-h-[44px] items-center gap-1 self-start text-[14px] text-accent"
      >
        <CaretLeft size={16} aria-hidden /> {t("Usuários")}
      </Link>
      <QueryGate query={detail}>{(d) => <UserDetail detail={d} />}</QueryGate>
    </div>
  );
}

function UserDetail({ detail }: { detail: AdminUserDetail }) {
  const { user, entitlements, subscriptions, promo_grants, usage } = detail;
  const me = useUser();
  const isSelf = me?.id === user.id;

  return (
    <>
      <AdminTitle
        title={user.name || user.email}
        subtitle={user.email}
        actions={
          <>
            <Tag variant={user.role === "admin" ? "accent" : "neutral"}>{roleLabel(user.role)}</Tag>
            <Tag variant={user.is_active ? "success" : "error"}>
              {user.is_active ? "ativo" : "desativado"}
            </Tag>
          </>
        }
      />

      <AdminSection title={t("Dados")}>
        <KeyValues
          data={{
            id: user.id,
            "fuso horário": user.timezone,
            "e-mail verificado em": user.email_verified_at,
            "primeiros passos concluídos em": user.onboarding_completed_at,
            "último acesso": user.last_login_at,
            "conta criada em": user.created_at,
          }}
        />
      </AdminSection>

      <AdminSection
        title={t("Direitos de acesso")}
        meta={<Tag variant="outline">{entitlements.plan_name}</Tag>}
      >
        <KeyValues
          data={{
            plano: entitlements.plan_code,
            origem: entitlements.source,
            "situação da assinatura": entitlements.subscription_status
              ? statusLabel(entitlements.subscription_status)
              : null,
            "fim do período": entitlements.current_period_end,
            "cancela ao fim do período": entitlements.cancel_at_period_end,
          }}
        />
        <span className="kicker mt-2">{t("Limites")}</span>
        <KeyValues data={entitlements.limits} />
      </AdminSection>

      <AdminSection title={t("Assinaturas")}>
        {subscriptions.length === 0 ? (
          <span className="text-[13px] text-neutral-400">{t("Nenhuma assinatura registrada.")}</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {subscriptions.map((s) => (
              <li key={s.id} className="flex flex-col gap-1 rounded-md border border-divider p-3 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{s.plan_name}</span>
                  <Tag variant={statusVariant(s.status)}>{statusLabel(s.status)}</Tag>
                  <span className="tnum text-neutral-400">
                    {fmtBRL(s.amount_cents)}
                    {s.interval ? ` / ${intervalLabel(s.interval)}` : ""}
                  </span>
                </div>
                <span className="tnum text-neutral-400">
                  {t("{{v0}} · período {{v1}} → {{v2}}", {
                    v0: s.provider,
                    v1: fmtDate(s.current_period_start),
                    v2: fmtDate(s.current_period_end),
                  })}
                  {s.cancel_at_period_end ? t("· cancela ao fim do período") : ""}
                </span>
                <span className="tnum text-neutral-400">
                  {t("criada {{v0}} · sincronizada {{v1}}", {
                    v0: fmtDate(s.created_at),
                    v1: fmtDate(s.last_synced_at),
                  })}
                  {s.ended_at ? " " + t("· encerrada {{v0}}", { v0: fmtDate(s.ended_at) }) : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title={t("Uso")}>
        <KeyValues data={usage} />
      </AdminSection>

      <AdminSection title={t("Acesso promocional")} meta={t("Concessão explícita; não simula pagamento.")}>
        <PromoGrants grants={promo_grants} />
        <PromoForm userId={user.id} userLabel={user.name || user.email} />
      </AdminSection>

      <AdminSection title={t("Papel e situação da conta")}>
        {isSelf ? (
          <span className="text-[13px] text-neutral-400">
            {t("Esta é a sua própria conta; o servidor pode recusar mudanças nela.")}
          </span>
        ) : null}
        <RoleForm key={`${user.id}:${user.role}`} user={user} />
        <ActiveToggle user={user} />
      </AdminSection>
    </>
  );
}

function RoleForm({ user }: { user: AdminUser }) {
  const [role, setRole] = React.useState<UserRole>(user.role === "admin" ? "admin" : "user");
  const [confirm, setConfirm] = React.useState(false);
  const setUserRole = useSetUserRole();
  const changed = role !== user.role;

  const apply = async () => {
    try {
      await setUserRole.mutateAsync({ id: user.id, role });
      toast(
        "success",
        t("Papel alterado"),
        t("{{v0}} agora é {{v1}}.", { v0: user.email, v1: roleLabel(role).toLowerCase() }),
      );
      setConfirm(false);
    } catch (e) {
      toast("error", t("Não foi possível alterar o papel"), errorMessage(e));
      setConfirm(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t("Papel")} htmlFor="admin-role" className="w-full tablet:w-[240px]">
        <Select
          id="admin-role"
          value={role}
          onChange={(e) => setRole(e.target.value === "admin" ? "admin" : "user")}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Button size="lg" disabled={!changed} onClick={() => setConfirm(true)}>
        {t("Alterar papel")}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("Alterar papel?")}
        description={
          role === "admin"
            ? t("{{v0}} passará a ter acesso total a este painel.", { v0: user.email })
            : t("{{v0}} perderá o acesso a este painel.", { v0: user.email })
        }
        confirmLabel={t("Alterar papel")}
        danger={role === "admin"}
        loading={setUserRole.isPending}
        onConfirm={apply}
      />
    </div>
  );
}

function ActiveToggle({ user }: { user: AdminUser }) {
  const [confirm, setConfirm] = React.useState(false);
  const setActive = useSetUserActive();
  const next = !user.is_active;

  const apply = async () => {
    try {
      await setActive.mutateAsync({ id: user.id, active: next });
      toast("success", next ? t("Conta reativada") : t("Conta desativada"));
    } catch (e) {
      toast(
        "error",
        next ? t("Não foi possível reativar") : t("Não foi possível desativar"),
        errorMessage(e),
      );
    }
    setConfirm(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
      <span className="text-[13px] text-neutral-400">
        {user.is_active
          ? t("Desativar impede novos acessos desta pessoa. Os dados são mantidos.")
          : t("A conta está desativada. Reativar devolve o acesso.")}
      </span>
      <Button size="lg" variant={user.is_active ? "danger" : "primary"} onClick={() => setConfirm(true)}>
        {user.is_active ? t("Desativar conta") : t("Reativar conta")}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={user.is_active ? t("Desativar esta conta?") : t("Reativar esta conta?")}
        description={
          user.is_active
            ? t("{{v0}} não conseguirá mais entrar até ser reativada. A ação fica registrada na auditoria.", {
                v0: user.email,
              })
            : t("{{v0}} voltará a conseguir entrar.", { v0: user.email })
        }
        confirmLabel={user.is_active ? t("Desativar") : t("Reativar")}
        danger={user.is_active}
        loading={setActive.isPending}
        onConfirm={apply}
      />
    </div>
  );
}

function PromoGrants({ grants }: { grants: PromoGrant[] }) {
  const [target, setTarget] = React.useState<PromoGrant | null>(null);
  const revoke = useRevokePromo();

  const apply = async () => {
    if (!target) return;
    try {
      await revoke.mutateAsync(target.id);
      toast("success", t("Concessão revogada"));
    } catch (e) {
      toast("error", t("Não foi possível revogar"), errorMessage(e));
    }
    setTarget(null);
  };

  if (grants.length === 0)
    return <span className="text-[13px] text-neutral-400">{t("Nenhuma concessão promocional.")}</span>;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {grants.map((g) => (
          <li
            key={g.id}
            className="flex flex-col gap-2 rounded-md border border-divider p-3 text-[13px] tablet:flex-row tablet:items-center"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-medium">{g.plan_code}</span>
                <Tag variant={g.active ? "success" : "neutral"}>
                  {g.active ? "ativa" : g.revoked_at ? "revogada" : "encerrada"}
                </Tag>
                {g.lifetime || !g.ends_at ? <Tag variant="accent">{t("Vitalício")}</Tag> : null}
              </div>
              <span className="tnum text-neutral-400">
                {fmtDate(g.starts_at)} →{" "}
                {g.lifetime || !g.ends_at ? t("sem data de término") : fmtDate(g.ends_at)}
                {g.revoked_at ? " " + t("· revogada {{v0}}", { v0: fmtDate(g.revoked_at) }) : ""} ·{" "}
                {g.granted_by ? t("por {{v0}}", { v0: shortId(g.granted_by) }) : t("via cupom")}
              </span>
              <span className="break-words">{g.reason}</span>
            </div>
            {g.active ? (
              <Button variant="danger" size="lg" onClick={() => setTarget(g)}>
                {t("Revogar")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => (o ? undefined : setTarget(null))}
        title={t("Revogar esta concessão?")}
        description={t(
          "O acesso promocional termina agora. A pessoa volta ao plano que tiver por assinatura ou ao gratuito.",
        )}
        confirmLabel={t("Revogar")}
        danger
        loading={revoke.isPending}
        onConfirm={apply}
      />
    </>
  );
}

type Duration = "days" | "lifetime";

interface PromoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string;
  /** Nome ou e-mail, só para o texto do diálogo. */
  userLabel?: string;
}

/**
 * Concessão de acesso promocional: plano, duração (por período ou vitalício) e motivo.
 * Reutilizado na página de assinaturas.
 */
export function PromoDialog({ open, onOpenChange, userId, userLabel }: PromoDialogProps) {
  const plans = useAdminPlans();
  const grant = useGrantPromo();
  const [planCode, setPlanCode] = React.useState("");
  const [duration, setDuration] = React.useState<Duration>("days");
  const [days, setDays] = React.useState("30");
  const [reason, setReason] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const options = (plans.data ?? []).filter((p) => p.active && p.code !== "free");
  const daysN = /^\d+$/.test(days) ? Number(days) : NaN;
  const daysError =
    duration === "lifetime" || (Number.isInteger(daysN) && daysN >= 1 && daysN <= 3650)
      ? null
      : t("Entre 1 e 3650 dias.");
  const reasonT = reason.trim();
  const reasonError =
    reasonT.length < 3
      ? t("Explique o motivo (mínimo 3 caracteres).")
      : reasonT.length > 300
        ? t("Máximo de 300 caracteres.")
        : null;
  const planError = planCode ? null : t("Escolha um plano.");

  const reset = () => {
    setReason("");
    setTouched(false);
    setDuration("days");
    setDays("30");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (daysError || reasonError || planError) return;
    try {
      await grant.mutateAsync({
        id: userId,
        plan_code: planCode,
        days: duration === "lifetime" ? null : daysN,
        reason: reasonT,
      });
      toast(
        "success",
        t("Acesso promocional concedido"),
        duration === "lifetime"
          ? t("{{v0}}, vitalício.", { v0: planCode })
          : t("{{v0}} por {{v1}} dias.", { v0: planCode, v1: daysN }),
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      toast("error", t("Não foi possível conceder"), errorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("Conceder acesso")}
        description={
          userLabel
            ? t("Acesso promocional para {{v0}}. Fica marcado como concessão, não como pagamento.", {
                v0: userLabel,
              })
            : t("Acesso promocional explícito; não simula pagamento.")
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <Field
            label={t("Plano")}
            htmlFor="promo-plan"
            error={touched ? planError : null}
            hint={
              plans.isError
                ? t("Não foi possível carregar os planos: {{v0}}", { v0: errorMessage(plans.error) })
                : undefined
            }
          >
            <Select
              id="promo-plan"
              value={planCode}
              onChange={(e) => setPlanCode(e.target.value)}
              invalid={touched && !!planError}
              disabled={plans.isLoading}
            >
              <option value="">{plans.isLoading ? t("Carregando…") : t("Escolha…")}</option>
              {options.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Duração")}>
            <Seg<Duration>
              label={t("Duração do acesso")}
              value={duration}
              onChange={setDuration}
              block
              size="lg"
              options={[
                { value: "days", label: t("Por período") },
                { value: "lifetime", label: t("Vitalício") },
              ]}
            />
          </Field>
          {duration === "days" ? (
            <Field label={t("Dias")} htmlFor="promo-days" error={touched ? daysError : null}>
              <Input
                id="promo-days"
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                invalid={touched && !!daysError}
                className="tnum"
              />
            </Field>
          ) : (
            <p className="text-[13px] text-neutral-400">
              {t("Sem data de término. Pode ser revogado a qualquer momento na página da pessoa.")}
            </p>
          )}
          <Field
            label={t("Motivo (obrigatório, fica na auditoria)")}
            htmlFor="promo-reason"
            error={touched ? reasonError : null}
          >
            <Textarea
              id="promo-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              invalid={touched && !!reasonError}
              maxLength={300}
            />
          </Field>
          <DialogActions>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => onOpenChange(false)}
              disabled={grant.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" size="lg" loading={grant.isPending}>
              {t("Conceder acesso")}
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PromoForm({ userId, userLabel }: { userId: string; userLabel: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
      <span className="text-[13px] text-neutral-400">
        {t("Libera um plano por um período ou para sempre, sem cobrança.")}
      </span>
      <Button size="lg" onClick={() => setOpen(true)}>
        {t("Conceder acesso")}
      </Button>
      <PromoDialog open={open} onOpenChange={setOpen} userId={userId} userLabel={userLabel} />
    </div>
  );
}
