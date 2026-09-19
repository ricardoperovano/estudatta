import * as React from "react";
import { Link, useNavigate } from "react-router";
import { CaretRight, Minus, Plus } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { errorMessage } from "@/api/client";
import { useAuthActions, useUser } from "@/api/session";
import { settingsKeys, usePreferences, useUpdatePreferences, type Preferences, type PreferencesUpdate } from "@/api/settings";
import { InstallPrompt } from "@/components/app/install-prompt";
import { AccountSection, DataSection } from "@/components/app/settings-account";
import { RemindersSection, SettingsRow, SettingsSection } from "@/components/app/settings-reminders";
import { Banner, Button, Card, Dialog, DialogContent, DurationStepper, Input, Seg, Spinner, Switch, Tag, toast } from "@/components/ui";
import { TataSvg } from "@/components/mascot/TataSvg";
import { setTataMuted, useTataPrefs } from "@/components/mascot/use-tata";
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
        <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Preferências</h1>
      </header>
      {!online ? <Banner kind="offline">Sem conexão: as preferências ficam só para leitura até a internet voltar. Seus registros continuam salvos neste aparelho.</Banner> : null}
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
        toast("error", "Não foi possível salvar", errorMessage(e));
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
    <SettingsSection title="Aparência">
      <Seg<Theme>
        label="Tema"
        block
        size="lg"
        value={theme}
        onChange={choose}
        options={[
          { value: "system", label: "Sistema" },
          { value: "light", label: "Claro" },
          { value: "dark", label: "Escuro" },
        ]}
      />
      <p className="text-[12px] text-neutral-400">“Sistema” acompanha o modo claro ou escuro do aparelho.</p>
    </SettingsSection>
  );
}

function MinuteStepper({ label, value, min, max, step = 1, disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <SettingsRow label={label}>
      <Button variant="secondary" size="icon" aria-label={`${label}: menos ${step} min`} disabled={disabled || value <= min} onClick={() => onChange(Math.max(min, value - step))}>
        <Minus size={16} aria-hidden />
      </Button>
      <span className="tnum min-w-[56px] text-center text-neutral-300" aria-live="polite">
        {value} min
      </span>
      <Button variant="secondary" size="icon" aria-label={`${label}: mais ${step} min`} disabled={disabled || value >= max} onClick={() => onChange(Math.min(max, value + step))}>
        <Plus size={16} aria-hidden />
      </Button>
    </SettingsRow>
  );
}

function DefaultSessionSection({ online }: { online: boolean }) {
  const prefs = usePreferences();
  const patch = usePatchPreferences();
  return (
    <SettingsSection title="Sessão padrão">
      {prefs.isPending ? (
        <div className="flex justify-center py-8" role="status">
          <Spinner className="h-6 w-6" label="Carregando preferências" />
        </div>
      ) : prefs.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => prefs.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar suas preferências. {errorMessage(prefs.error, "")}
        </Banner>
      ) : (
        <>
          <Card className="gap-3 p-[14px] text-[14px]">
            <span className="text-[12px] text-neutral-400">Duração sugerida ao começar uma sessão</span>
            <DurationStepper
              minutes={prefs.data.default_session_minutes}
              min={5}
              max={480}
              onChange={(m) => online && patch({ default_session_minutes: m })}
              className={online ? undefined : "pointer-events-none opacity-45"}
            />
          </Card>
          <Card className="gap-3 p-[14px] text-[14px]">
            <MinuteStepper label="Foco (pomodoro)" value={prefs.data.pomodoro_focus_minutes} min={5} max={120} step={5} disabled={!online} onChange={(v) => patch({ pomodoro_focus_minutes: v })} />
            <MinuteStepper label="Pausa (pomodoro)" value={prefs.data.pomodoro_break_minutes} min={1} max={60} disabled={!online} onChange={(v) => patch({ pomodoro_break_minutes: v })} />
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
  const enabled = prefs.data?.mascot_enabled ?? true;
  return (
    <SettingsSection title="Tatá, o companheiro de estudo">
      <Card className="flex-row items-center gap-4 p-[14px] text-[14px]" data-tour="preferencias-tata">
        <TataSvg mood={enabled ? "wave" : "sleep"} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <SettingsRow label="Mostrar o Tatá" hint="Aparece no cronômetro, no Hoje e nas conquistas. Vale para todos os aparelhos." htmlFor="pref-tata">
            <Switch id="pref-tata" checked={enabled} disabled={!online || prefs.isPending} onCheckedChange={(v) => patch({ mascot_enabled: v })} />
          </SettingsRow>
          <SettingsRow label="Falas do Tatá" hint="Silenciar vale só neste aparelho. O tom segue o dos lembretes." htmlFor="pref-tata-falas">
            <Switch id="pref-tata-falas" checked={!muted} disabled={!enabled} onCheckedChange={(v) => setTataMuted(!v)} />
          </SettingsRow>
        </div>
      </Card>
    </SettingsSection>
  );
}

const INTERVAL_PRESETS: { value: string; label: string; days: number[] }[] = [
  { value: "1,7,30", label: "1 · 7 · 30 dias", days: [1, 7, 30] },
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
    const ok = days.length >= 1 && days.length <= 6 && days.every((d) => d >= 1 && d <= 365) && days.every((d, i) => i === 0 || d > days[i - 1]);
    if (!ok) {
      toast("error", "Intervalos inválidos", "Use de 1 a 6 números crescentes entre 1 e 365, como 1, 7, 30.");
      return;
    }
    setCustom(null);
    patch({ revision_intervals: days });
  };
  return (
    <SettingsSection title="Revisões espaçadas">
      <Card className="gap-3 p-[14px] text-[14px]" data-tour="preferencias-revisoes">
        <SettingsRow label="Agendar revisões" hint="Depois de uma sessão de teoria, aula, leitura ou prática com matéria, o Estudatta agenda as revisões." htmlFor="pref-rev">
          <Switch id="pref-rev" checked={enabled} disabled={!online || prefs.isPending} onCheckedChange={(v) => patch({ revisions_enabled: v })} />
        </SettingsRow>
        {enabled ? (
          <>
            <Seg<string>
              label="Intervalos"
              block
              size="sm"
              value={preset?.value ?? "custom"}
              onChange={(v) => {
                const p = INTERVAL_PRESETS.find((x) => x.value === v);
                if (p && online) patch({ revision_intervals: p.days });
              }}
              options={[...INTERVAL_PRESETS.map((p) => ({ value: p.value, label: p.label, disabled: !online })), ...(preset ? [] : [{ value: "custom", label: "Personalizado" }])]}
            />
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[12px] text-neutral-400" htmlFor="pref-rev-custom">
                Dias depois do estudo, separados por vírgula
                <Input id="pref-rev-custom" inputMode="numeric" value={text} disabled={!online} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCustom()} />
              </label>
              <Button variant="secondary" disabled={!online || custom === null} onClick={saveCustom}>
                Salvar
              </Button>
            </div>
            <p className="m-0 text-[12px] text-neutral-400">
              Uma sessão do tipo Revisão na mesma matéria conclui a revisão do dia e agenda a próxima. <Link to="/app/revisoes">Ver revisões</Link>
            </p>
          </>
        ) : null}
      </Card>
    </SettingsSection>
  );
}

// --- Sincronização ------------------------------------------------------------------------------

const OP_LABEL: Record<string, string> = {
  "session.start": "Início de sessão",
  "session.pause": "Pausa de sessão",
  "session.resume": "Retomada de sessão",
  "session.finish": "Sessão concluída",
  "session.discard": "Sessão descartada",
  "session.manual": "Tempo registrado manualmente",
};

function opLabel(op: PendingOp): string {
  return OP_LABEL[op.kind] ?? "Registro feito sem conexão";
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
      if (ok) toast("success", "Tudo sincronizado");
      else if (s.status === "offline") toast("info", "Sem conexão", "Seus registros continuam salvos neste aparelho.");
      else if (s.conflicts > 0) toast("info", "Alguns registros precisam da sua decisão", "Veja a lista abaixo.");
      else toast("error", "Não foi possível sincronizar agora", "Nada foi perdido. Tente de novo em instantes.");
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
    toast("info", "Registro descartado");
    void conflicts.refetch();
  };

  const syncing = busy || sync.status === "syncing";
  const items = conflicts.data ?? [];

  return (
    <SettingsSection title="Sincronização">
      <Card className="gap-2 p-[14px] text-[14px]" data-tour="preferencias-sync">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>Registros deste aparelho</span>
          {!online ? (
            <Tag variant="info">Sem conexão</Tag>
          ) : syncing ? (
            <Tag variant="neutral" icon={<Spinner />}>
              Sincronizando
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
            <Tag variant="success">Sincronizado</Tag>
          )}
        </div>
        <span className="text-[12px] text-neutral-400">
          {sync.pending > 0
            ? `${sync.pending} ${sync.pending === 1 ? "registro aguarda" : "registros aguardam"} envio. Eles ficam salvos aqui até sincronizar.`
            : "Nada aguardando envio."}
          {sync.lastSyncAt ? ` Última sincronização: ${fmtDateTimeShort(sync.lastSyncAt)}.` : ""}
        </span>
        {sync.status === "error" ? <span className="text-[12px] text-error">A última tentativa falhou. Nada foi perdido.</span> : null}
        <Button variant="primary" className="min-h-[40px] self-start" loading={syncing} disabled={!online} onClick={run}>
          Sincronizar agora
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
                  <Button size="sm" variant="primary" disabled={!online || syncing} onClick={() => void keep(op)}>
                    Manter e tentar de novo
                  </Button>
                  <Button size="sm" variant="secondary" disabled={syncing} onClick={() => void discard(op)}>
                    Descartar
                  </Button>
                </>
              }
            >
              <strong className="font-medium">{opLabel(op)}</strong> · {fmtDateTimeShort(op.client_created_at)}
              <span className="block text-[13px] text-neutral-400">
                {op.status === "conflict" ? "Este registro diverge do que já está na sua conta." : "Este registro não foi aceito."}
                {op.error ? ` ${op.error}` : ""} Descartar apaga só a cópia deste aparelho.
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
    <SettingsSection title="Instalar o app">
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
        toast("success", "Os tours vão aparecer de novo em cada página.");
      },
      onError: (e) => toast("error", "Não foi possível reativar os tours", errorMessage(e)),
    });
  return (
    <SettingsSection title="Ajuda">
      <Card className="gap-2 p-[14px] text-[14px]" data-tour="preferencias-tours">
        <span>Rever os tours</span>
        <span className="text-[12px] text-neutral-400">Cada página tem um tour curto. Para rever só o da página aberta, toque no ? no canto da tela.</span>
        <Button variant="secondary" className="min-h-[40px] self-start" loading={reset.isPending} disabled={!online} onClick={run}>
          Mostrar os tours de novo
        </Button>
      </Card>
    </SettingsSection>
  );
}

// --- Mais ----------------------------------------------------------------------------------------

function MoreSection({ isAdmin }: { isAdmin: boolean }) {
  const links = [
    { to: "/app/planos", label: "Planos e assinatura" },
    { to: "/app/notificacoes", label: "Notificações" },
    { to: "/app/materiais", label: "Materiais" },
    { to: "/app/importar", label: "Importar conteúdo" },
    ...(isAdmin ? [{ to: "/admin", label: "Painel administrativo" }] : []),
  ];
  return (
    <SettingsSection title="Mais">
      <Card className="gap-0 px-[14px] py-1 text-[14px]">
        <ul className="flex flex-col divide-y divide-divider">
          {links.map((l) => (
            <li key={l.to}>
              <Link to={l.to} className="flex min-h-[44px] items-center justify-between gap-2 hover:text-accent">
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
  const { logout } = useAuthActions();
  const nav = useNavigate();
  const sync = useSyncStore();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<"sync" | "discard" | "plain" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const waiting = sync.pending + sync.conflicts;

  const leave = async (kind: "discard" | "plain") => {
    setBusy(kind);
    await logout();
    nav("/entrar", { replace: true });
  };

  const syncAndLeave = async () => {
    if (!user) return;
    setBusy("sync");
    setError(null);
    const ok = await syncNow(user.id);
    const s = useSyncStore.getState();
    if (ok && s.pending === 0 && s.conflicts === 0) {
      await logout();
      nav("/entrar", { replace: true });
      return;
    }
    setBusy(null);
    setError(
      s.status === "offline"
        ? "Sem conexão: não deu para sincronizar agora. Você pode esperar a internet voltar ou sair descartando os registros."
        : s.conflicts > 0
          ? "Alguns registros precisam da sua decisão em Sincronização antes de serem enviados."
          : "Não foi possível sincronizar agora. Nada foi perdido; tente de novo em instantes.",
    );
  };

  return (
    <section aria-label="Sair" className="flex flex-col gap-2">
      <Button variant="secondary" size="lg" block loading={busy === "plain"} onClick={() => (waiting > 0 ? setOpen(true) : void leave("plain"))}>
        Sair
      </Button>
      {user ? <p className="break-all text-center text-[12px] text-neutral-400">Conectado como {user.email}</p> : null}

      <Dialog open={open} onOpenChange={(o) => busy === null && setOpen(o)}>
        <DialogContent
          mode="sheet"
          title="Há registros ainda não sincronizados"
          description={`${waiting} ${waiting === 1 ? "registro feito" : "registros feitos"} neste aparelho ainda não ${waiting === 1 ? "chegou" : "chegaram"} à sua conta. Ao sair, os dados deste aparelho são apagados.`}
        >
          {error ? <Banner kind="error">{error}</Banner> : null}
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" block loading={busy === "sync"} disabled={!online || busy !== null} onClick={() => void syncAndLeave()}>
              Sincronizar e sair
            </Button>
            <Button variant="danger" size="lg" block loading={busy === "discard"} disabled={busy !== null} onClick={() => void leave("discard")}>
              Descartar {waiting === 1 ? "o registro" : "os registros"} e sair
            </Button>
            <Button variant="ghost-muted" size="lg" block disabled={busy !== null} onClick={() => setOpen(false)}>
              Continuar conectado
            </Button>
          </div>
          {!online ? <p className="text-[12px] text-neutral-400">Sem conexão: sincronizar só será possível quando a internet voltar.</p> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
