import * as React from "react";
import { Link } from "react-router";
import { Minus, Plus } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, errorMessage } from "@/api/client";
import {
  getCurrentPushSubscription,
  getServiceWorkerRegistration,
  sendTestPush,
  settingsKeys,
  useNotificationPrefs,
  useNotificationPreview,
  usePreferences,
  useUpdateNotificationPrefs,
  useUpdatePreferences,
  type NotificationPrefs,
  type NotificationPrefsUpdate,
  type Preferences,
  type Tone,
} from "@/api/settings";
import { pushState, subscribeToPush, unsubscribeFromPush, type PushState } from "@/app/push";
import { Symbol } from "@/components/app/brand";
import { Banner, Button, Card, DayPicker, Field, Input, Seg, Spinner, Switch, Tag, toast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PlanUpsell, useHasFeature } from "@/components/app/plan-upsell";

export function SettingsSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex flex-col gap-[14px]", className)}>
      <h2 className="text-[17px] font-medium leading-tight desktop:text-[20px]">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsRow({ label, hint, children, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-[32px] items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {hint ? <span className="text-[12px] text-neutral-400">{hint}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Campo de hora compacto: confirma ao sair do campo; `key` = valor do servidor para acompanhar mudanças sem efeito. */
function TimeField({ id, value, label, disabled, onCommit }: { id: string; value: string; label: string; disabled?: boolean; onCommit: (v: string) => void }) {
  return (
    <Input
      key={value}
      id={id}
      type="time"
      aria-label={label}
      defaultValue={value}
      disabled={disabled}
      className="tnum min-h-[36px] w-[104px] px-2 text-right text-neutral-300"
      onBlur={(e) => {
        const v = e.target.value;
        if (/^\d{2}:\d{2}$/.test(v) && v !== value) onCommit(v);
      }}
    />
  );
}

const TONE_LABEL: Record<Tone, string> = { acolhedor: "acolhedor", direto: "direto", firme: "firme" };

/** Seção Lembretes (tela 11): interruptores, horário, dias, tom com prévia, silêncio, limite diário e notificações do navegador. */
export function RemindersSection({ online }: { online: boolean }) {
  const fullRemindersFlag = useHasFeature("reminders");
  const qc = useQueryClient();
  const prefs = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const [ceiling, setCeiling] = React.useState<number | null>(null);

  const patch = (body: NotificationPrefsUpdate) => {
    const prev = qc.getQueryData<NotificationPrefs>(settingsKeys.notificationPrefs);
    if (prev) qc.setQueryData(settingsKeys.notificationPrefs, { ...prev, ...body });
    update.mutate(body, {
      onError: (e) => {
        if (prev) qc.setQueryData(settingsKeys.notificationPrefs, prev);
        if (e instanceof ApiError && e.code === "max_per_day_ceiling") {
          const c = (e.details as { ceiling?: unknown } | null)?.ceiling;
          if (typeof c === "number") setCeiling(c);
        }
        toast("error", "Não foi possível salvar", errorMessage(e));
      },
    });
  };

  if (prefs.isPending) {
    return (
      <SettingsSection title="Lembretes">
        <div className="flex justify-center py-10" role="status">
          <Spinner className="h-6 w-6" label="Carregando lembretes" />
        </div>
      </SettingsSection>
    );
  }
  if (prefs.isError) {
    return (
      <SettingsSection title="Lembretes">
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => prefs.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar seus lembretes. {errorMessage(prefs.error, "")}
        </Banner>
      </SettingsSection>
    );
  }

  const p = prefs.data;
  const off = !p.enabled || !online;
  const fullReminders = fullRemindersFlag;
  const maxReached = ceiling != null && p.max_per_day >= ceiling;

  return (
    <SettingsSection title="Lembretes">
      <Card className="gap-3 p-[14px] text-[14px]" data-tour="preferencias-lembretes">
        <SettingsRow label="Lembrar de estudar">
          <Switch label="Lembrar de estudar" checked={p.enabled} disabled={!online} onCheckedChange={(v) => patch({ enabled: v })} />
        </SettingsRow>
        <SettingsRow label="Horário" htmlFor="reminder-time">
          <TimeField id="reminder-time" label="Horário do lembrete" value={p.reminder_time} disabled={off} onCommit={(v) => patch({ reminder_time: v })} />
        </SettingsRow>
        <SettingsRow label="Avisar se o dia terminar sem registro">
          <Switch label="Avisar se o dia terminar sem registro" checked={fullReminders && p.end_of_window_alert} disabled={off || !fullReminders} onCheckedChange={(v) => patch({ end_of_window_alert: v })} />
        </SettingsRow>
        <SettingsRow label="Avisar quando a meta de hoje for concluída">
          <Switch label="Avisar quando a meta de hoje for concluída" checked={p.goal_completed_alert} disabled={off} onCheckedChange={(v) => patch({ goal_completed_alert: v })} />
        </SettingsRow>
        <SettingsRow label="Resumo da semana">
          <Switch label="Resumo da semana" checked={p.weekly_summary} disabled={off} onCheckedChange={(v) => patch({ weekly_summary: v })} />
        </SettingsRow>
        {!fullReminders ? (
          <PlanUpsell
            compact
            text="No Gratuito você recebe o lembrete no horário planejado e o resumo da semana no app. O segundo aviso, o aviso de fim do dia, o de retomada e o resumo por e-mail estão nos planos Essencial e Completo."
          />
        ) : null}
        <SettingsRow label="Mostrar o nome do objetivo" hint="Desligado, o aviso não revela o que você estuda.">
          <Switch label="Mostrar o nome do objetivo no aviso" checked={p.show_activity_name} disabled={off} onCheckedChange={(v) => patch({ show_activity_name: v })} />
        </SettingsRow>
      </Card>

      <Field label="Dias com lembrete">
        <DayPicker
          value={p.reminder_days}
          onChange={(days) => patch({ reminder_days: days })}
          className={cn("max-w-[360px]", off && "pointer-events-none opacity-45")}
        />
      </Field>

      <ToneField online={online} />

      <Card className="gap-3 p-[14px] text-[14px]">
        <SettingsRow label="Horário de silêncio">
          <TimeField id="quiet-start" label="Início do silêncio" value={p.quiet_start} disabled={off} onCommit={(v) => patch({ quiet_start: v })} />
          <span aria-hidden className="text-neutral-400">
            –
          </span>
          <TimeField id="quiet-end" label="Fim do silêncio" value={p.quiet_end} disabled={off} onCommit={(v) => patch({ quiet_end: v })} />
        </SettingsRow>
        <SettingsRow label="Fins de semana em silêncio">
          <Switch label="Fins de semana em silêncio" checked={p.quiet_weekends} disabled={off} onCheckedChange={(v) => patch({ quiet_weekends: v })} />
        </SettingsRow>
        <SettingsRow label="Limite diário" hint={maxReached ? `O máximo é ${ceiling} por dia.` : "Máximo de lembretes por dia."}>
          <Button variant="secondary" size="icon" aria-label="Menos um lembrete por dia" disabled={off || p.max_per_day <= 1} onClick={() => patch({ max_per_day: p.max_per_day - 1 })}>
            <Minus size={16} aria-hidden />
          </Button>
          <span className="tnum min-w-[28px] text-center text-neutral-300" aria-live="polite">
            {p.max_per_day}
          </span>
          <Button variant="secondary" size="icon" aria-label="Mais um lembrete por dia" disabled={off || maxReached} onClick={() => patch({ max_per_day: p.max_per_day + 1 })}>
            <Plus size={16} aria-hidden />
          </Button>
        </SettingsRow>
      </Card>

      <BrowserNotificationsCard online={online} />
    </SettingsSection>
  );
}

function ToneField({ online }: { online: boolean }) {
  const qc = useQueryClient();
  const prefs = usePreferences();
  const update = useUpdatePreferences();
  const tone = (prefs.data?.tone as Tone | undefined) ?? "acolhedor";
  const preview = useNotificationPreview(tone);

  const setTone = (t: Tone) => {
    const prev = qc.getQueryData<Preferences>(settingsKeys.preferences);
    if (prev) qc.setQueryData(settingsKeys.preferences, { ...prev, tone: t });
    update.mutate(
      { tone: t },
      {
        onError: (e) => {
          if (prev) qc.setQueryData(settingsKeys.preferences, prev);
          toast("error", "Não foi possível salvar o tom", errorMessage(e));
        },
      },
    );
  };

  return (
    <>
      <Field label="Tom das mensagens">
        <Seg<Tone>
          label="Tom das mensagens"
          block
          size="lg"
          value={tone}
          onChange={setTone}
          options={[
            { value: "acolhedor", label: "Acolhedor", disabled: !online || prefs.isPending },
            { value: "direto", label: "Direto", disabled: !online || prefs.isPending },
            { value: "firme", label: "Firme", disabled: !online || prefs.isPending },
          ]}
        />
      </Field>
      <div className="flex items-start gap-[10px] rounded-md bg-surface p-3" aria-live="polite">
        <Symbol size={20} className="mt-0.5 shrink-0" />
        <div className="text-[14px]">
          <span className="block text-[12px] text-neutral-400">Exemplo · {TONE_LABEL[tone]}</span>
          {preview.isPending ? (
            <span className="text-neutral-400">Carregando exemplo…</span>
          ) : preview.isError ? (
            <span className="text-neutral-400">
              Não foi possível carregar o exemplo agora.{" "}
              <button type="button" className="cursor-pointer text-accent underline-offset-2 hover:underline" onClick={() => preview.refetch()}>
                Tentar de novo
              </button>
            </span>
          ) : (
            preview.data.body
          )}
        </div>
      </div>
    </>
  );
}

type DeviceState = { state: PushState; subscribed: boolean; ready: boolean };

async function readDeviceState(): Promise<DeviceState> {
  const state = await pushState();
  if (state !== "granted" && state !== "default") return { state, subscribed: false, ready: true };
  const reg = await getServiceWorkerRegistration();
  const sub = reg ? await getCurrentPushSubscription() : null;
  return { state, subscribed: !!sub, ready: !!reg };
}

const NOT_READY = "O app ainda não está pronto para receber avisos em segundo plano neste navegador. Recarregue a página e tente de novo.";

/** Estado honesto das notificações do navegador neste aparelho; a permissão só é pedida no clique. */
function BrowserNotificationsCard({ online }: { online: boolean }) {
  const device = useQuery({ queryKey: ["push", "device-state"], queryFn: readDeviceState, staleTime: 0, gcTime: 0, retry: false });
  const [busy, setBusy] = React.useState<"on" | "off" | "test" | null>(null);

  const run = async (kind: "on" | "off" | "test", fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast("error", "Não foi possível concluir", errorMessage(e));
    } finally {
      setBusy(null);
      void device.refetch();
    }
  };

  const allow = () =>
    run("on", async () => {
      if (!device.data?.ready) throw new Error(NOT_READY);
      const result = await subscribeToPush();
      if (result === "granted") toast("success", "Notificações ativadas neste aparelho");
      else if (result === "denied") toast("info", "Permissão negada", "Os lembretes continuam aparecendo com o app aberto.");
    });

  const d = device.data;
  let tag: React.ReactNode = null;
  let text: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (device.isPending) {
    text = <Spinner label="Verificando notificações" />;
  } else if (!d) {
    tag = <Tag variant="neutral">Indisponíveis</Tag>;
    text = "Não foi possível verificar as notificações neste navegador.";
    actions = (
      <Button variant="secondary" className="min-h-[40px] self-start" onClick={() => device.refetch()}>
        Verificar de novo
      </Button>
    );
  } else if (d.state === "granted" && d.subscribed) {
    tag = <Tag variant="success">Ativas neste aparelho</Tag>;
    text = "Os lembretes chegam mesmo com o app fechado. O horário exato depende do aparelho e do navegador.";
    actions = (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="min-h-[40px]" loading={busy === "test"} disabled={!online || busy !== null} onClick={() => run("test", async () => toast("info", "Teste enviado", await sendTestPush()))}>
          Enviar um teste
        </Button>
        <Button
          variant="ghost-muted"
          className="min-h-[40px] px-3"
          loading={busy === "off"}
          disabled={!online || busy !== null}
          onClick={() =>
            run("off", async () => {
              await unsubscribeFromPush();
              toast("info", "Notificações desativadas neste aparelho");
            })
          }
        >
          Desativar neste aparelho
        </Button>
      </div>
    );
  } else if (d.state === "granted" || d.state === "default") {
    tag = <Tag variant="pending">{d.state === "granted" ? "Não ativadas neste aparelho" : "Não permitidas"}</Tag>;
    text = d.ready ? "Sem permissão, os lembretes aparecem só com o app aberto." : `Sem permissão, os lembretes aparecem só com o app aberto. ${NOT_READY}`;
    actions = (
      <Button variant="primary" className="min-h-[40px] self-start" loading={busy === "on"} disabled={!online || busy !== null} onClick={allow}>
        Permitir notificações
      </Button>
    );
  } else if (d.state === "denied") {
    tag = <Tag variant="pending">Bloqueadas</Tag>;
    text = "As notificações deste site estão bloqueadas no navegador. Para receber lembretes com o app fechado, libere nas permissões do site e volte aqui. Até lá, eles aparecem só com o app aberto.";
    actions = (
      <Button variant="secondary" className="min-h-[40px] self-start" onClick={() => device.refetch()}>
        Verificar de novo
      </Button>
    );
  } else if (d.state === "ios-needs-install") {
    tag = <Tag variant="neutral">Requer instalação</Tag>;
    text = "No iPhone e no iPad, as notificações só funcionam com o app adicionado à tela inicial. Veja “Instalar o app” mais abaixo e volte aqui depois.";
  } else if (d.state === "server-disabled") {
    tag = <Tag variant="neutral">Indisponíveis</Tag>;
    text = (
      <>
        O envio de notificações com o app fechado ainda não está ativo neste ambiente. Os lembretes aparecem com o app aberto, na{" "}
        <Link to="/app/notificacoes" className="text-accent underline-offset-2 hover:underline">
          central de notificações
        </Link>
        .
      </>
    );
  } else {
    tag = <Tag variant="neutral">Sem suporte</Tag>;
    text = "Este navegador não oferece notificações. Os lembretes aparecem só com o app aberto.";
  }

  return (
    <Card className="gap-2 p-[14px] text-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Notificações do navegador</span>
        {tag}
      </div>
      <span className="text-[12px] text-neutral-400">{text}</span>
      {actions}
    </Card>
  );
}
