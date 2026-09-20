import { Avatar } from "./profile-menu";
import { prepareAvatar } from "@/lib/avatar-image";
import * as React from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/api/client";
import { useAuthActions, usePublicConfig, useUser } from "@/api/session";
import {
  exportMyData,
  settingsKeys,
  useAuthSessions,
  useChangePassword,
  useDeleteAccount,
  useResendVerification,
  useRevokeOtherSessions,
  useRevokeSession,
  useUpdateProfile,
  type AuthSessionOut,
  avatarUrl,
  useDeleteAvatar,
  useUploadAvatar,
} from "@/api/settings";
import { SettingsRow, SettingsSection } from "@/components/app/settings-reminders";
import { Banner, Button, Card, Dialog, DialogActions, DialogContent, Field, Input, Select, Spinner, Tag, toast } from "@/components/ui";
import { detectTimezone } from "@/lib/device";
import { fmtDateTimeShort } from "@/lib/format";

const FALLBACK_ZONES = ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "Europe/Lisbon", "UTC"];

function timezones(current: string): string[] {
  let list: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
    list = intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    list = [];
  }
  if (list.length === 0) list = FALLBACK_ZONES;
  return list.includes(current) ? list : [current, ...list];
}

/** "Chrome · Linux" a partir do user agent, sem expor a string crua. */
function describeDevice(s: AuthSessionOut): string {
  if (s.device_label) return s.device_label;
  const ua = s.user_agent ?? "";
  if (!ua) return "Aparelho não identificado";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

/** Seção Conta: nome, fuso, e-mail/confirmação, senha e sessões ativas. */
export function AccountSection({ online }: { online: boolean }) {
  const user = useUser();
  if (!user) return null;
  return (
    <SettingsSection title="Conta" id="conta">
      <AvatarCard online={online} />
      <ProfileForm key={`${user.name}|${user.timezone}`} name={user.name} timezone={user.timezone} online={online} />
      <EmailCard email={user.email} verified={!!user.email_verified_at} online={online} />
      <SessionsCard online={online} />
    </SettingsSection>
  );
}

function AvatarCard({ online }: { online: boolean }) {
  const user = useUser();
  const upload = useUploadAvatar();
  const remove = useDeleteAvatar();
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const url = avatarUrl(user);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const blob = await prepareAvatar(file);
      await upload.mutateAsync(blob);
      toast("success", "Foto atualizada");
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  const busy = upload.isPending || remove.isPending;
  return (
    <Card className="flex-row items-center gap-4 p-[14px] text-[14px]">
      <Avatar size={64} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="font-medium">Foto de perfil</span>
        <span className="text-[12px] text-neutral-400">JPG, PNG ou WebP. A foto é cortada no quadrado e reduzida aqui no seu aparelho.</span>
        {error ? <span className="text-[12px] text-error">{error}</span> : null}
        <div className="flex flex-wrap gap-2">
          <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={onFile} aria-label="Escolher foto de perfil" />
          <Button size="sm" variant="secondary" loading={upload.isPending} disabled={!online || busy} onClick={() => inputRef.current?.click()}>
            {url ? "Trocar foto" : "Enviar foto"}
          </Button>
          {url ? (
            <Button size="sm" variant="ghost" loading={remove.isPending} disabled={!online || busy} onClick={() => remove.mutate(undefined, { onSuccess: () => toast("info", "Foto removida") })}>
              Remover
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ProfileForm({ name: initialName, timezone: initialZone, online }: { name: string; timezone: string; online: boolean }) {
  const update = useUpdateProfile();
  const [name, setName] = React.useState(initialName);
  const [zone, setZone] = React.useState(initialZone);
  const [error, setError] = React.useState<string | null>(null);
  const zones = React.useMemo(() => timezones(initialZone), [initialZone]);
  const deviceZone = detectTimezone();
  const dirty = name.trim() !== initialName || zone !== initialZone;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Informe seu nome.");
    setError(null);
    update.mutate(
      { name: name.trim(), timezone: zone },
      {
        onSuccess: () => toast("success", "Conta atualizada"),
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <Card as="section" className="p-[14px]">
      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <Field label="Nome" htmlFor="account-name">
          <Input id="account-name" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Fuso horário" htmlFor="account-zone" hint="Define quando o seu dia começa e termina para metas, saldo e lembretes.">
          <Select id="account-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        {deviceZone !== zone ? (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setZone(deviceZone)}>
            Usar o fuso deste aparelho ({deviceZone.replace(/_/g, " ")})
          </Button>
        ) : null}
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Button type="submit" variant="primary" size="lg" className="self-start" loading={update.isPending} disabled={!dirty || !online}>
          Salvar
        </Button>
      </form>
    </Card>
  );
}

function EmailCard({ email, verified, online }: { email: string; verified: boolean; online: boolean }) {
  const resend = useResendVerification();
  const [pwOpen, setPwOpen] = React.useState(false);
  return (
    <Card className="gap-3 p-[14px] text-[14px]">
      <SettingsRow label="E-mail" hint={<span className="break-all">{email}</span>}>
        {verified ? <Tag variant="success">Confirmado</Tag> : <Tag variant="pending">Não confirmado</Tag>}
      </SettingsRow>
      {!verified ? (
        <div className="flex flex-col gap-2">
          <span className="text-[12px] text-neutral-400">Confirme seu e-mail para poder recuperar a conta se esquecer a senha.</span>
          <Button
            variant="primary"
            className="min-h-[40px] self-start"
            loading={resend.isPending}
            disabled={!online}
            onClick={() =>
              resend.mutate(undefined, {
                onSuccess: (r) => toast("info", "Confirmação reenviada", r.message ?? `Confira a caixa de entrada de ${email}.`),
                onError: (e) => toast("error", "Não foi possível reenviar", errorMessage(e)),
              })
            }
          >
            Reenviar confirmação
          </Button>
        </div>
      ) : null}
      <SettingsRow label="Senha">
        <Button variant="secondary" className="min-h-[40px]" disabled={!online} onClick={() => setPwOpen(true)}>
          Trocar senha
        </Button>
      </SettingsRow>
      {pwOpen ? <ChangePasswordDialog onClose={() => setPwOpen(false)} /> : null}
    </Card>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const change = useChangePassword();
  const qc = useQueryClient();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [errors, setErrors] = React.useState<{ current?: string; next?: string; again?: string; form?: string }>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!current) errs.current = "Informe a senha atual.";
    if (next.length < 8) errs.next = "A nova senha precisa de pelo menos 8 caracteres.";
    if (again !== next) errs.again = "As senhas não são iguais.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: (r) => {
          toast("success", "Senha alterada", r.message === "Senha alterada." ? undefined : (r.message ?? undefined));
          void qc.invalidateQueries({ queryKey: settingsKeys.authSessions });
          onClose();
        },
        onError: (err) => setErrors({ form: errorMessage(err) }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mode="sheet" title="Trocar senha">
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <Field label="Senha atual" htmlFor="pw-current" error={errors.current}>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} invalid={!!errors.current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="Nova senha" htmlFor="pw-next" error={errors.next} hint="Pelo menos 8 caracteres.">
            <Input id="pw-next" type="password" autoComplete="new-password" value={next} invalid={!!errors.next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repita a nova senha" htmlFor="pw-again" error={errors.again}>
            <Input id="pw-again" type="password" autoComplete="new-password" value={again} invalid={!!errors.again} onChange={(e) => setAgain(e.target.value)} />
          </Field>
          {errors.form ? <Banner kind="error">{errors.form}</Banner> : null}
          <DialogActions>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={change.isPending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" loading={change.isPending}>
              Trocar senha
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionsCard({ online }: { online: boolean }) {
  const sessions = useAuthSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const others = sessions.data?.filter((s) => !s.current) ?? [];

  return (
    <Card className="gap-2 p-[14px] text-[14px]">
      <span>Sessões ativas</span>
      <span className="text-[12px] text-neutral-400">Aparelhos em que sua conta está aberta. Encerrar uma sessão exige entrar de novo naquele aparelho.</span>
      {sessions.isPending ? (
        <Spinner label="Carregando sessões" />
      ) : sessions.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => sessions.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar as sessões. {errorMessage(sessions.error, "")}
        </Banner>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-divider">
            {sessions.data.map((s) => (
              <li key={s.id} className="flex min-h-[52px] items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate">{describeDevice(s)}</span>
                  <span className="text-[12px] text-neutral-400">Último acesso: {fmtDateTimeShort(s.last_seen_at)}</span>
                </div>
                {s.current ? (
                  <Tag variant="accent">Este aparelho</Tag>
                ) : (
                  <Button
                    variant="secondary"
                    className="min-h-[40px]"
                    disabled={!online || revoke.isPending}
                    loading={revoke.isPending && revoke.variables === s.id}
                    onClick={() =>
                      revoke.mutate(s.id, {
                        onSuccess: () => toast("success", "Sessão encerrada"),
                        onError: (e) => toast("error", "Não foi possível encerrar a sessão", errorMessage(e)),
                      })
                    }
                  >
                    Revogar
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {others.length > 1 ? (
            <Button
              variant="ghost"
              className="min-h-[40px] self-start"
              loading={revokeOthers.isPending}
              disabled={!online}
              onClick={() =>
                revokeOthers.mutate(undefined, {
                  onSuccess: () => toast("success", "Outras sessões encerradas"),
                  onError: (e) => toast("error", "Não foi possível encerrar as sessões", errorMessage(e)),
                })
              }
            >
              Encerrar todas as outras sessões
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

// --- Dados ------------------------------------------------------------------------------------

/** Seção Dados: exportação (independe de plano) e exclusão de conta digitando EXCLUIR. */
export function DataSection({ online }: { online: boolean }) {
  const [exporting, setExporting] = React.useState<"json" | "csv" | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const doExport = async (format: "json" | "csv") => {
    setExporting(format);
    try {
      await exportMyData(format);
    } catch (e) {
      toast("error", "Não foi possível exportar", errorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  return (
    <SettingsSection title="Dados">
      <Card className="gap-2 p-[14px] text-[14px]" data-tour="preferencias-dados">
        <span>Exportar meus dados</span>
        <span className="text-[12px] text-neutral-400">Tudo o que você registrou, em um arquivo completo, ou só o histórico de sessões em planilha. Disponível em qualquer plano.</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="min-h-[40px]" loading={exporting === "json"} disabled={!online || exporting !== null} onClick={() => doExport("json")}>
            Exportar tudo (JSON)
          </Button>
          <Button variant="secondary" className="min-h-[40px]" loading={exporting === "csv"} disabled={!online || exporting !== null} onClick={() => doExport("csv")}>
            Histórico de sessões (CSV)
          </Button>
        </div>
      </Card>
      <Card className="gap-2 p-[14px] text-[14px]">
        <span>Excluir conta</span>
        <span className="text-[12px] text-neutral-400">Apaga objetivos, sessões, planos, materiais e preferências. Não dá para desfazer. Se quiser guardar algo, exporte antes.</span>
        <Button variant="danger" className="min-h-[40px] self-start" disabled={!online} onClick={() => setDeleteOpen(true)}>
          Excluir minha conta
        </Button>
      </Card>
      {deleteOpen ? <DeleteAccountDialog onClose={() => setDeleteOpen(false)} /> : null}
    </SettingsSection>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const del = useDeleteAccount();
  const { logout } = useAuthActions();
  const config = usePublicConfig();
  const nav = useNavigate();
  const [confirm, setConfirm] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const ready = confirm.trim() === "EXCLUIR";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    del.mutate(
      { confirm: "EXCLUIR", password: password || null },
      {
        onSuccess: async () => {
          await logout();
          toast("info", "Conta excluída");
          nav("/", { replace: true });
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !del.isPending && onClose()}>
      <DialogContent mode="sheet" title="Excluir minha conta" description="Tudo o que você registrou será apagado de forma definitiva. Se tiver assinatura, cancele a renovação em Planos antes.">
        <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
          <Field label="Para confirmar, digite EXCLUIR" htmlFor="del-confirm">
            <Input id="del-confirm" value={confirm} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Field label="Sua senha" htmlFor="del-password" hint={config.data?.google_oauth_enabled ? "Se você entra só com o Google e nunca criou senha, deixe em branco." : undefined}>
            <Input id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error ? <Banner kind="error">{error}</Banner> : null}
          <DialogActions>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={del.isPending}>
              Manter minha conta
            </Button>
            <Button type="submit" variant="danger" size="lg" loading={del.isPending} disabled={!ready}>
              Excluir definitivamente
            </Button>
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
