import { t as tx } from "@/i18n";
import * as React from "react";
import { Link } from "react-router";
import { CaretRight, Minus, Plus } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/api/client";
import { useUser } from "@/api/session";
import {
  settingsKeys,
  usePreferences,
  useUpdatePreferences,
  type Preferences,
  type PreferencesUpdate,
} from "@/api/settings";
import { InstallPrompt } from "@/components/app/install-prompt";
import { useLogoutFlow } from "@/components/app/logout";
import { AccountSection, DataSection } from "@/components/app/settings-account";
import { RemindersSection, SettingsRow, SettingsSection } from "@/components/app/settings-reminders";
import {
  Banner,
  Button,
  Card,
  DurationStepper,
  Input,
  Seg,
  Spinner,
  Switch,
  Tag,
  toast,
} from "@/components/ui";
import { TataSvg } from "@/components/mascot/TataSvg";
import { setTataMuted, useTataPrefs } from "@/components/mascot/use-tata";
import { setVoiceMode, speak, useVoiceMode } from "@/components/mascot/voice";
import { useTataStatus } from "@/api/tata";
import { fmtDateTimeShort } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { readTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";
import type { PendingOp } from "@/offline/db";
import { discardOp, listConflicts, retryOp, syncNow, useSyncStore } from "@/offline/sync";
import { useTourStore } from "@/components/tour/store";
import { usePageTour, useResetTours } from "@/components/tour/use-tours";
import { preferenciasTour } from "@/tours/preferencias";

/** Preferências: lembretes, aparência, sessão padrão, conta, dados, sincronização, instalação e sair. */
export default function SettingsPage() {
  const online = useOnline();
  const user = useUser();
  const prefs = usePreferences();
  usePageTour(preferenciasTour, !!prefs.data);
  return (
    <div className="flex flex-col gap-[14px] desktop:gap-8">
      <header>
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">
          {tx("Preferências")}
        </h1>
      </header>
      {!online ? (
        <Banner kind="offline">
          {tx(
            "Sem conexão: as preferências ficam só para leitura até a internet voltar. Seus registros continuam salvos neste aparelho.",
          )}
        </Banner>
      ) : null}
      <div className="grid gap-8 desktop:grid-cols-2 desktop:gap-12">
        <div className="flex flex-col gap-8">
          <RemindersSection online={online} />
          <AppearanceSection online={online} />
          <DefaultSessionSection online={online} />
          <StudyCompanionSection online={online} />
          <RevisionsSection online={online} />
        </div>
        <div className="flex flex-col gap-8">
          <AccountSection online={online} />
          <DataSection online={online} />
          <SyncSection online={online} />
          <InstallSection />
          <HelpSection online={online} />
          <MoreSection isAdmin={user?.role === "admin"} />
          <LogoutSection online={online} />
        </div>
      </div>
    </div>
  );
}

/** PATCH otimista das preferências gerais, com retorno ao valor anterior em caso de erro. */
function usePatchPreferences() {
  const qc = useQueryClient();
  const update = useUpdatePreferences();
  return (body: PreferencesUpdate, onFail?: () => void) => {
    const prev = qc.getQueryData<Preferences>(settingsKeys.preferences);
    if (prev) qc.setQueryData(settingsKeys.preferences, { ...prev, ...body });
    update.mutate(body, {
      onError: (e) => {
        if (prev) qc.setQueryData(settingsKeys.preferences, prev);
        onFail?.();
        toast("error", tx("Não foi possível salvar"), errorMessage(e));
      },
    });
  };
}

function AppearanceSection({ online }: { online: boolean }) {
  const patch = usePatchPreferences();
  // acompanha também a troca rápida (botão de tema na barra lateral / no topo)
  const theme = React.useSyncExternalStore(subscribeTheme, readTheme, readTheme);

  const choose = (t: Theme) => {
    const before = theme;
    setTheme(t);
    // o tema vale neste aparelho na hora; a conta guarda a escolha para os outros aparelhos
    if (online) patch({ theme: t }, () => setTheme(before));
  };

  return (
    <SettingsSection title={tx("Aparência")}>
      <Seg<Theme>
        label={tx("Tema")}
        block
        size="lg"
        value={theme}
        onChange={choose}
        options={[
          { value: "system", label: tx("Sistema") },
          { value: "light", label: tx("Claro") },
          { value: "dark", label: tx("Escuro") },
        ]}
      />
      <p className="text-[12px] text-neutral-400">
        {tx("“Sistema” acompanha o modo claro ou escuro do aparelho.")}
      </p>
    </SettingsSection>
  );
}

function MinuteStepper({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <SettingsRow label={label}>
      <Button
        variant="secondary"
        size="icon"
        aria-label={tx("{{v0}}: menos {{v1}} min", { v0: label, v1: step })}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        <Minus size={16} aria-hidden />
      </Button>
      <span className="tnum min-w-[56px] text-center text-neutral-300" aria-live="polite">
        {tx("{{v0}} min", { v0: value })}
      </span>
      <Button
        variant="secondary"
        size="icon"
        aria-label={tx("{{v0}}: mais {{v1}} min", { v0: label, v1: step })}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        <Plus size={16} aria-hidden />
      </Button>
    </SettingsRow>
  );
}

function DefaultSessionSection({ online }: { online: boolean }) {
  const prefs = usePreferences();
  const patch = usePatchPreferences();
  return (
    <SettingsSection title={tx("Sessão padrão")}>
      {prefs.isPending ? (
        <div className="flex justify-center py-8" role="status">
          <Spinner className="h-6 w-6" label={tx("Carregando preferências")} />
        </div>
      ) : prefs.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => prefs.refetch()}>
              {tx("Tentar de novo")}
            </Button>
          }
        >
          {tx("Não foi possível carregar suas preferências. {{v0}}", {
            v0: errorMessage(prefs.error, ""),
          })}
        </Banner>
      ) : (
        <>
          <Card className="gap-3 p-[14px] text-[14px]">
            <span className="text-[12px] text-neutral-400">
              {tx("Duração sugerida ao começar uma sessão")}
            </span>
            <DurationStepper
              minutes={prefs.data.default_session_minutes}
              min={5}
              max={480}
              onChange={(m) => online && patch({ default_session_minutes: m })}
              className={online ? undefined : "pointer-events-none opacity-45"}
            />
          </Card>
          <Card className="gap-3 p-[14px] text-[14px]">
            <MinuteStepper
              label={tx("Foco (pomodoro)")}
              value={prefs.data.pomodoro_focus_minutes}
              min={5}
              max={120}
              step={5}
              disabled={!online}
              onChange={(v) => patch({ pomodoro_focus_minutes: v })}
            />
            <MinuteStepper
              label={tx("Pausa (pomodoro)")}
              value={prefs.data.pomodoro_break_minutes}
              min={1}
              max={60}
              disabled={!online}
              onChange={(v) => patch({ pomodoro_break_minutes: v })}
            />
          </Card>
        </>
      )}
    </SettingsSection>
  );
}

// --- Tatá e revisões ---------------------------------------------------------------------------

function StudyCompanionSection({ online }: { online: boolean }) {
  const prefs = usePreferences();
  const patch = usePatchPreferences();
  const { muted } = useTataPrefs();
  const voiceMode = useVoiceMode();
  const enabled = prefs.data?.mascot_enabled ?? true;
  const status = useTataStatus(enabled);
  const st = status.data;
  return (
    <SettingsSection title={tx("Tatá, o companheiro de estudo")}>
      <Card className="flex-row items-center gap-4 p-[14px] text-[14px]" data-tour="preferencias-tata">
        <TataSvg mood={enabled ? "wave" : "sleep"} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <SettingsRow
            label={tx("Mostrar o Tatá")}
            hint={tx("Aparece no cronômetro, no Hoje e nas conquistas. Vale para todos os aparelhos.")}
            htmlFor="pref-tata"
          >
            <Switch
              id="pref-tata"
              checked={enabled}
              disabled={!online || prefs.isPending}
              onCheckedChange={(v) => patch({ mascot_enabled: v })}
            />
          </SettingsRow>
          <SettingsRow
            label={tx("Falas do Tatá")}
            hint={tx("Silenciar vale só neste aparelho. O tom segue o dos lembretes.")}
            htmlFor="pref-tata-falas"
          >
            <Switch
              id="pref-tata-falas"
              checked={!muted}
              disabled={!enabled}
              onCheckedChange={(v) => setTataMuted(!v)}
            />
          </SettingsRow>
          <SettingsRow
            label={tx("Voz do Tatá")}
            hint={tx("Voz natural até a cota do seu plano; depois, a voz do aparelho.")}
            htmlFor="pref-tata-voz"
          >
            <Switch
              id="pref-tata-voz"
              checked={voiceMode === "on"}
              disabled={!enabled || muted}
              onCheckedChange={(v) => setVoiceMode(v ? "on" : "off")}
            />
          </SettingsRow>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12px] text-neutral-400">
            <span className="tnum">
              {st
                ? st.voice_limit_month > 0
                  ? tx("{{v0}} de {{v1}} falas com voz natural usadas este mês", {
                      v0: st.voice_used_month,
                      v1: st.voice_limit_month,
                    })
                  : tx("Seu plano usa a voz do aparelho.")
                : status.isError
                  ? tx("Não deu para consultar a cota de voz agora.")
                  : " "}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!enabled}
              onClick={() => speak(tx("Oi! Eu sou o Tatá."))}
            >
              {tx("Testar voz")}
            </Button>
          </div>
          {st ? (
            <span className="tnum text-[12px] text-neutral-400">
              {st.chat_enabled || st.chat_reason === "ai_quota" || st.chat_reason === "ai_monthly_quota"
                ? tx("Conversas com IA: {{v0}} {{v1}} hoje{{v2}}", {
                    v0: st.chat_remaining_today,
                    v1: st.chat_remaining_today === 1 ? "restante" : "restantes",
                    v2:
                      st.chat_remaining_month === null
                        ? ""
                        : " " + tx("· {{v0}} no mês", { v0: st.chat_remaining_month }),
                  })
                : st.chat_reason === "ai_plan"
                  ? tx("Conversas com IA: incluídas nos planos Essencial e Completo.")
                  : tx("Conversas com IA: indisponíveis neste ambiente.")}
            </span>
          ) : null}
        </div>
      </Card>
    </SettingsSection>
  );
}

const INTERVAL_PRESETS: { value: string; label: string; days: number[] }[] = [
  { value: "1,7,30", label: tx("1 · 7 · 30 dias"), days: [1, 7, 30] },
  { value: "1,3,7,15,30", label: "1 · 3 · 7 · 15 · 30", days: [1, 3, 7, 15, 30] },
  { value: "2,7,21,60", label: "2 · 7 · 21 · 60", days: [2, 7, 21, 60] },
];

function RevisionsSection({ online }: { online: boolean }) {
  const prefs = usePreferences();
  const patch = usePatchPreferences();
  const enabled = prefs.data?.revisions_enabled ?? true;
  const current = (prefs.data?.revision_intervals ?? [1, 7, 30]).join(",");
  const preset = INTERVAL_PRESETS.find((p) => p.value === current);
  const [custom, setCustom] = React.useState<string | null>(null);
  const text = custom ?? current.split(",").join(", ");
  const saveCustom = () => {
    if (custom === null) return;
    const days = custom
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number);
    const ok =
      days.length >= 1 &&
      days.length <= 6 &&
      days.every((d) => d >= 1 && d <= 365) &&
      days.every((d, i) => i === 0 || d > days[i - 1]);
    if (!ok) {
      toast(
        "error",
        tx("Intervalos inválidos"),
        tx("Use de 1 a 6 números crescentes entre 1 e 365, como 1, 7, 30."),
      );
      return;
    }
    setCustom(null);
    patch({ revision_intervals: days });
  };
  return (
    <SettingsSection title={tx("Revisões espaçadas")}>
      <Card className="gap-3 p-[14px] text-[14px]" data-tour="preferencias-revisoes">
        <SettingsRow
          label={tx("Agendar revisões")}
          hint={tx(
            "Depois de uma sessão de teoria, aula, leitura ou prática com matéria, o Estudatta agenda as revisões.",
          )}
          htmlFor="pref-rev"
        >
          <Switch
            id="pref-rev"
            checked={enabled}
            disabled={!online || prefs.isPending}
            onCheckedChange={(v) => patch({ revisions_enabled: v })}
          />
        </SettingsRow>
        {enabled ? (
          <>
            <Seg<string>
              label={tx("Intervalos")}
              block
              size="sm"
              value={preset?.value ?? "custom"}
              onChange={(v) => {
                const p = INTERVAL_PRESETS.find((x) => x.value === v);
                if (p && online) patch({ revision_intervals: p.days });
              }}
              options={[
                ...INTERVAL_PRESETS.map((p) => ({ value: p.value, label: p.label, disabled: !online })),
                ...(preset ? [] : [{ value: "custom", label: tx("Personalizado") }]),
              ]}
            />
            <div className="flex items-end gap-2">
              <label
                className="flex flex-1 flex-col gap-1 text-[12px] text-neutral-400"
                htmlFor="pref-rev-custom"
              >
                {tx("Dias depois do estudo, separados por vírgula")}
                <Input
                  id="pref-rev-custom"
                  inputMode="numeric"
                  value={text}
                  disabled={!online}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveCustom()}
                />
              </label>
              <Button variant="secondary" disabled={!online || custom === null} onClick={saveCustom}>
                {tx("Salvar")}
              </Button>
            </div>
            <p className="m-0 text-[12px] text-neutral-400">
              {tx("Uma sessão do tipo Revisão na mesma matéria conclui a revisão do dia e agenda a próxima.")}{" "}
              <Link to="/app/revisoes">{tx("Ver revisões")}</Link>
            </p>
          </>
        ) : null}
      </Card>
    </SettingsSection>
  );
}

// --- Sincronização ------------------------------------------------------------------------------

const OP_LABEL: Record<string, string> = {
  "session.start": tx("Início de sessão"),
  "session.pause": tx("Pausa de sessão"),
  "session.resume": tx("Retomada de sessão"),
  "session.finish": tx("Sessão concluída"),
  "session.discard": tx("Sessão descartada"),
  "session.manual": tx("Tempo registrado manualmente"),
};

function opLabel(op: PendingOp): string {
  return OP_LABEL[op.kind] ?? tx("Registro feito sem conexão");
}

function SyncSection({ online }: { online: boolean }) {
  const user = useUser();
  const sync = useSyncStore();
  const [busy, setBusy] = React.useState(false);
  const conflicts = useQuery({
    queryKey: ["sync", "conflicts", user?.id ?? "", sync.conflicts, sync.pending],
    queryFn: () => listConflicts(user!.id),
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
  });

  if (!user) return null;

  const run = async () => {
    setBusy(true);
    try {
      const ok = await syncNow(user.id);
      const s = useSyncStore.getState();
      if (ok) toast("success", tx("Tudo sincronizado"));
      else if (s.status === "offline")
        toast("info", tx("Sem conexão"), tx("Seus registros continuam salvos neste aparelho."));
      else if (s.conflicts > 0)
        toast("info", tx("Alguns registros precisam da sua decisão"), tx("Veja a lista abaixo."));
      else
        toast(
          "error",
          tx("Não foi possível sincronizar agora"),
          tx("Nada foi perdido. Tente de novo em instantes."),
        );
    } finally {
      setBusy(false);
      void conflicts.refetch();
    }
  };

  const keep = async (op: PendingOp) => {
    await retryOp(user.id, op.op_id);
    await run();
  };
  const discard = async (op: PendingOp) => {
    await discardOp(user.id, op.op_id);
    toast("info", tx("Registro descartado"));
    void conflicts.refetch();
  };

  const syncing = busy || sync.status === "syncing";
  const items = conflicts.data ?? [];

  return (
    <SettingsSection title={tx("Sincronização")}>
      <Card className="gap-2 p-[14px] text-[14px]" data-tour="preferencias-sync">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{tx("Registros deste aparelho")}</span>
          {!online ? (
            <Tag variant="info">{tx("Sem conexão")}</Tag>
          ) : syncing ? (
            <Tag variant="neutral" icon={<Spinner />}>
              {tx("Sincronizando")}
            </Tag>
          ) : sync.conflicts > 0 ? (
            <Tag variant="error">
              {sync.conflicts} {sync.conflicts === 1 ? "conflito" : "conflitos"}
            </Tag>
          ) : sync.pending > 0 ? (
            <Tag variant="pending">
              {sync.pending} {sync.pending === 1 ? "pendente" : "pendentes"}
            </Tag>
          ) : (
            <Tag variant="success">{tx("Sincronizado")}</Tag>
          )}
        </div>
        <span className="text-[12px] text-neutral-400">
          {sync.pending > 0
            ? tx("{{v0}} {{v1}} envio. Eles ficam salvos aqui até sincronizar.", {
                v0: sync.pending,
                v1: sync.pending === 1 ? tx("registro aguarda") : tx("registros aguardam"),
              })
            : tx("Nada aguardando envio.")}
          {sync.lastSyncAt
            ? " " + tx("Última sincronização: {{v0}}.", { v0: fmtDateTimeShort(sync.lastSyncAt) })
            : ""}
        </span>
        {sync.status === "error" ? (
          <span className="text-[12px] text-error">{tx("A última tentativa falhou. Nada foi perdido.")}</span>
        ) : null}
        <Button
          variant="primary"
          className="min-h-[40px] self-start"
          loading={syncing}
          disabled={!online}
          onClick={run}
        >
          {tx("Sincronizar agora")}
        </Button>
      </Card>

      {items.length ? (
        <div className="flex flex-col gap-2">
          {items.map((op) => (
            <Banner
              key={op.op_id}
              kind="conflict"
              actions={
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!online || syncing}
                    onClick={() => void keep(op)}
                  >
                    {tx("Manter e tentar de novo")}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={syncing} onClick={() => void discard(op)}>
                    {tx("Descartar")}
                  </Button>
                </>
              }
            >
              <strong className="font-medium">{opLabel(op)}</strong> ·{" "}
              {fmtDateTimeShort(op.client_created_at)}
              <span className="block text-[13px] text-neutral-400">
                {op.status === "conflict"
                  ? tx("Este registro diverge do que já está na sua conta.")
                  : tx("Este registro não foi aceito.")}
                {tx("{{v0}} Descartar apaga só a cópia deste aparelho.", {
                  v0: op.error ? ` ${op.error}` : "",
                })}
              </span>
            </Banner>
          ))}
        </div>
      ) : null}
    </SettingsSection>
  );
}

// --- Instalar ------------------------------------------------------------------------------------

/** Instalação: convite nativo ou a instrução do navegador detectado + "Ver passo a passo" (/app/instalar). */
function InstallSection() {
  return (
    <SettingsSection title={tx("Instalar o app")}>
      <InstallPrompt showInstalled />
    </SettingsSection>
  );
}

// --- Ajuda ---------------------------------------------------------------------------------------

function HelpSection({ online }: { online: boolean }) {
  const reset = useResetTours();
  const markLocal = useTourStore((s) => s.markLocal);
  const run = () =>
    reset.mutate(undefined, {
      onSuccess: () => {
        // não reabre o tour desta página agora; ele volta na próxima visita
        markLocal(preferenciasTour.key);
        toast("success", tx("Os tours vão aparecer de novo em cada página."));
      },
      onError: (e) => toast("error", tx("Não foi possível reativar os tours"), errorMessage(e)),
    });
  return (
    <SettingsSection title={tx("Ajuda")}>
      <Card className="gap-2 p-[14px] text-[14px]" data-tour="preferencias-tours">
        <span>{tx("Rever os tours")}</span>
        <span className="text-[12px] text-neutral-400">
          {tx(
            "Cada página tem um tour curto. Para rever só o da página aberta, toque no ? no canto da tela.",
          )}
        </span>
        <Button
          variant="secondary"
          className="min-h-[40px] self-start"
          loading={reset.isPending}
          disabled={!online}
          onClick={run}
        >
          {tx("Mostrar os tours de novo")}
        </Button>
      </Card>
    </SettingsSection>
  );
}

// --- Mais ----------------------------------------------------------------------------------------

function MoreSection({ isAdmin }: { isAdmin: boolean }) {
  const links = [
    { to: "/app/planos", label: tx("Planos e assinatura") },
    { to: "/app/notificacoes", label: tx("Notificações") },
    { to: "/app/materiais", label: tx("Materiais") },
    { to: "/app/importar", label: tx("Importar conteúdo") },
    ...(isAdmin ? [{ to: "/admin", label: tx("Painel administrativo") }] : []),
  ];
  return (
    <SettingsSection title={tx("Mais")}>
      <Card className="gap-0 px-[14px] py-1 text-[14px]">
        <ul className="flex flex-col divide-y divide-divider">
          {links.map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="flex min-h-[44px] items-center justify-between gap-2 hover:text-accent"
              >
                {l.label}
                <CaretRight size={14} className="text-neutral-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </SettingsSection>
  );
}

// --- Sair ----------------------------------------------------------------------------------------

function LogoutSection({ online }: { online: boolean }) {
  const user = useUser();
  const { leave, dialog } = useLogoutFlow(online);
  return (
    <section aria-label={tx("Sair")} className="flex flex-col gap-2">
      <Button variant="secondary" size="lg" block onClick={leave}>
        {tx("Sair")}
      </Button>
      {user ? (
        <p className="break-all text-center text-[12px] text-neutral-400">
          {tx("Conectado como {{v0}}", { v0: user.email })}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
