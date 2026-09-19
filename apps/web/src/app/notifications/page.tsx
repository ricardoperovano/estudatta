import * as React from "react";
import { Link, useNavigate } from "react-router";
import { BellSimple, BellSimpleSlash, CaretRight, Checks } from "@phosphor-icons/react";
import { errorMessage } from "@/api/client";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationList, useSnoozeReminders, type NotificationItem } from "@/api/inbox";
import { useNotificationPrefs } from "@/api/settings";
import { Banner, Button, Card, EmptyState, Seg, Spinner, Tag, toast } from "@/components/ui";
import { fmtDateTimeShort, fmtTime, parseDate, todayIso, isoDate } from "@/lib/format";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { usePageTour } from "@/components/tour/use-tours";
import { notificacoesTour } from "@/tours/notificacoes";

const PAGE = 30;

const KIND_LABEL: Record<string, string> = {
  planned_start: "Hora de começar",
  follow_up: "Lembrete",
  end_of_window: "Fim do dia",
  goal_completed: "Meta de hoje",
  resume: "Retomar o plano",
  weekly_summary: "Resumo da semana",
  billing_cancelled: "Assinatura",
  billing_past_due: "Assinatura",
  billing_activated: "Assinatura",
  system: "Aviso",
};

function kindLabel(kind: string): string {
  if (KIND_LABEL[kind]) return KIND_LABEL[kind];
  return kind.startsWith("billing") ? "Assinatura" : "Aviso";
}

function fmtWhen(iso: string): string {
  const d = parseDate(iso);
  return isoDate(d) === todayIso() ? `hoje, ${fmtTime(d)}` : fmtDateTimeShort(d);
}

/** Só caminhos internos do app viram link; qualquer outra coisa é ignorada. */
function internalPath(url: string | null): string | null {
  if (!url || !url.startsWith("/") || url.startsWith("//")) return null;
  if (url.startsWith("/app/configuracoes")) return "/app/preferencias";
  return url;
}

// relógio de baixa frequência (render puro: nada de Date.now() no corpo do componente)
let clockNow = Date.now();
function subscribeClock(cb: () => void) {
  clockNow = Date.now();
  const id = window.setInterval(() => {
    clockNow = Date.now();
    cb();
  }, 30_000);
  return () => window.clearInterval(id);
}
function useClock(): number {
  return React.useSyncExternalStore(
    subscribeClock,
    () => clockNow,
    () => clockNow,
  );
}

type Filter = "all" | "unread";

/** Central de notificações: o que o app avisou, com marcar lida, ler todas e adiar lembretes por 1h. */
export default function NotificationsPage() {
  const online = useOnline();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [limit, setLimit] = React.useState(PAGE);
  const list = useNotificationList(filter === "unread", limit);
  const prefs = useNotificationPrefs();
  const readAll = useMarkAllNotificationsRead();
  const snooze = useSnoozeReminders();
  usePageTour(notificacoesTour, list.isSuccess);

  const now = useClock();
  const snoozedUntil = prefs.data?.snoozed_until && parseDate(prefs.data.snoozed_until).getTime() > now ? prefs.data.snoozed_until : null;
  const unread = list.data?.unread_count ?? 0;

  const onSnooze = () =>
    snooze.mutate(60, {
      onSuccess: (p) => toast("info", "Lembretes adiados por 1h", p.snoozed_until ? `Voltam às ${fmtTime(p.snoozed_until)}.` : undefined),
      onError: (e) => toast("error", "Não foi possível adiar", errorMessage(e)),
    });

  const onReadAll = () =>
    readAll.mutate(undefined, {
      onSuccess: () => toast("success", "Tudo marcado como lido"),
      onError: (e) => toast("error", "Não foi possível marcar como lidas", errorMessage(e)),
    });

  return (
    <div className="flex flex-col gap-[14px] desktop:max-w-[760px]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[13px] text-neutral-400">{unread > 0 ? `${unread} não ${unread === 1 ? "lida" : "lidas"}` : "Tudo em dia"}</span>
          <h1 className="text-[25px] leading-[1.15] desktop:text-[32px] desktop:leading-[1.1]">Notificações</h1>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="notificacoes-acoes">
          <Button variant="secondary" size="lg" loading={snooze.isPending} disabled={!online} onClick={onSnooze}>
            <BellSimpleSlash size={16} aria-hidden /> Adiar 1h
          </Button>
          <Button variant="primary" size="lg" loading={readAll.isPending} disabled={!online || unread === 0} onClick={onReadAll}>
            <Checks size={16} aria-hidden /> Ler todas
          </Button>
        </div>
      </header>

      {snoozedUntil ? <Banner kind="info">Lembretes adiados até {fmtTime(snoozedUntil)}. Avisos já recebidos continuam aqui.</Banner> : null}
      {prefs.data && !prefs.data.enabled ? (
        <Banner
          kind="info"
          actions={
            <Button asChild size="sm" variant="secondary">
              <Link to="/app/preferencias">Abrir Preferências</Link>
            </Button>
          }
        >
          Os lembretes estão desligados. Você só verá aqui avisos sobre sua conta.
        </Banner>
      ) : null}
      {!online ? <Banner kind="offline">Sem conexão: a lista pode estar desatualizada, e marcar como lida precisa de internet.</Banner> : null}

      <div className="self-start" data-tour="notificacoes-filtro">
        <Seg<Filter>
          label="Filtro"
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE);
          }}
          options={[
            { value: "all", label: "Todas" },
            { value: "unread", label: unread > 0 ? `Não lidas (${unread})` : "Não lidas" },
          ]}
        />
      </div>

      {list.isPending ? (
        <div className="flex justify-center py-16" role="status">
          <Spinner className="h-6 w-6" label="Carregando notificações" />
        </div>
      ) : list.isError ? (
        <Banner
          kind="error"
          actions={
            <Button size="sm" variant="secondary" onClick={() => list.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar as notificações. {errorMessage(list.error, "")}
        </Banner>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          glyph={<BellSimple size={40} className="text-neutral-600" aria-hidden />}
          title={filter === "unread" ? "Nenhuma notificação por ler." : "Nenhuma notificação ainda."}
          description={filter === "unread" ? "Quando chegar algo novo, aparece aqui." : "Lembretes de estudo e avisos da sua conta aparecem aqui."}
          action={
            filter === "unread" ? (
              <Button variant="secondary" onClick={() => setFilter("all")}>
                Ver todas
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link to="/app/preferencias">Ajustar lembretes</Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {list.data.items.map((n, i) => (
              <NotificationRow key={n.id} item={n} online={online} tour={i === 0} />
            ))}
          </ul>
          {list.data.total > list.data.items.length ? (
            <Button variant="secondary" size="lg" className="self-center" loading={list.isFetching} onClick={() => setLimit((l) => Math.min(200, l + PAGE))} disabled={limit >= 200}>
              {limit >= 200 ? "Mostrando as 200 mais recentes" : "Mostrar mais"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

function NotificationRow({ item, online, tour }: { item: NotificationItem; online: boolean; tour?: boolean }) {
  const nav = useNavigate();
  const markRead = useMarkNotificationRead();
  const unread = !item.read_at;
  const path = internalPath(item.url);

  const open = () => {
    if (unread && online) markRead.mutate(item.id);
    if (path) nav(path);
  };

  return (
    <li data-tour={tour ? "notificacoes-item" : undefined}>
      <Card className={cn("gap-1.5 p-[14px]", unread ? "shadow-sm" : "opacity-75")}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[12px] text-neutral-400">
            {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden /> : null}
            {kindLabel(item.kind)}
            {unread ? <span className="sr-only">(não lida)</span> : null}
          </span>
          <span className="tnum text-[12px] text-neutral-400">{fmtWhen(item.created_at)}</span>
        </div>
        <span className={cn("text-[14px]", unread && "font-medium")}>{item.title}</span>
        {item.body ? <p className="text-[13px] text-neutral-400">{item.body}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {path ? (
            <Button variant="ghost" size="md" className="min-h-[40px]" onClick={open}>
              Abrir <CaretRight size={14} aria-hidden />
            </Button>
          ) : null}
          {unread ? (
            <Button
              variant="ghost-muted"
              size="md"
              className="min-h-[40px]"
              loading={markRead.isPending}
              disabled={!online}
              onClick={() => markRead.mutate(item.id, { onError: (e) => toast("error", "Não foi possível marcar como lida", errorMessage(e)) })}
            >
              Marcar como lida
            </Button>
          ) : (
            <Tag variant="neutral" className="ml-auto">
              Lida
            </Tag>
          )}
        </div>
      </Card>
    </li>
  );
}
