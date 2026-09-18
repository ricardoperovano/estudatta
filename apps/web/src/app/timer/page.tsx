import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Dialog, DialogActions, DialogContent, Field, Input, Select, Spinner, Tag } from "@/components/ui";
import { useActiveSession, useActivities, useInvalidateAll, useToday, keys } from "@/api/queries";
import { useUser } from "@/api/session";
import { api, unwrap, errorMessage, isNetworkError, ApiError } from "@/api/client";
import { elapsedSeconds, useTimerStore } from "./store";
import type { LocalTimer } from "@/offline/db";
import { enqueueOp } from "@/offline/sync";
import { fmtClock, fmtMinutes, fmtRemaining } from "@/lib/format";
import { uuid } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { StudySession } from "@/api/types";

/**
 * Cronômetro: número 72/96px tnum; controles Pausar / Encerrar; "Ajustar tempo ou trocar conteúdo".
 * setInterval só redesenha; a duração vem dos intervalos persistidos e o servidor é a fonte final.
 */
export default function TimerPage() {
  const user = useUser();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const invalidate = useInvalidateAll();
  const activities = useActivities();
  const today = useToday();
  const active = useActiveSession();
  const timer = useTimerStore((s) => s.timer);
  const hydrated = useTimerStore((s) => s.hydrated);
  const setTimer = useTimerStore((s) => s.set);
  const clearTimer = useTimerStore((s) => s.clear);
  const [now, setNow] = React.useState(Date.now());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [reviewOpen, setReviewOpen] = React.useState<StudySession | null>(null);
  const [adjustOpen, setAdjustOpen] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ session_id: string; activity_id: string; device_id: string | null } | null>(null);
  const [starting, setStarting] = React.useState(false);
  const objetivoParam = params.get("objetivo");
  const [activityId, setActivityId] = React.useState<string>(objetivoParam || "");

  React.useEffect(() => {
    if (user) useTimerStore.getState().load(user.id);
  }, [user]);

  // visor: redesenha 1×/s só enquanto ativo (recupera após bloqueio/recarga porque usa timestamps)
  React.useEffect(() => {
    if (!timer || timer.status !== "active") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [timer]);

  // sessão ativa no servidor (outro aparelho) sem cronômetro local → oferece retomar
  const serverActive = active.data ?? null;
  React.useEffect(() => {
    if (!hydrated || !user) return;
    if (serverActive && !timer) {
      const act = activities.data?.find((a) => a.id === serverActive.activity_id);
      const focusIntervals = (serverActive.intervals || []).map((i) => ({ kind: i.kind as "focus" | "pause", started_at: i.started_at, ended_at: i.ended_at ?? null }));
      if (serverActive.device_id && serverActive.device_id !== deviceOf()) {
        setConflict({ session_id: serverActive.id, activity_id: serverActive.activity_id, device_id: serverActive.device_id });
      }
      setTimer({
        user_id: user.id,
        session_id: serverActive.id,
        client_uuid: serverActive.client_uuid || uuid(),
        activity_id: serverActive.activity_id,
        activity_title: act?.title || "Objetivo",
        subject_id: serverActive.subject_id,
        topic_id: serverActive.topic_id,
        kind: (serverActive.kind as "timer" | "pomodoro") || "timer",
        status: serverActive.status as "active" | "paused",
        started_at: serverActive.started_at || new Date().toISOString(),
        intervals: focusIntervals,
        version: serverActive.version,
        synced: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverActive, hydrated, user]);

  // vindo de "Começar sessão" na tela Hoje: inicia de imediato (uma vez) quando não há cronômetro
  const autoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || !user || timer || autoStarted.current || !objetivoParam || starting) return;
    if (active.isPending || activities.isPending) return;
    if (active.data) return;
    autoStarted.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user, timer, objetivoParam, active.isPending, active.data, activities.isPending]);

  const cards = today.data?.data.cards ?? [];
  const card = timer ? cards.find((c) => c.activity.id === timer.activity_id) : cards.find((c) => c.activity.id === activityId);
  const elapsed = elapsedSeconds(timer, now);
  const goalTarget = card?.summary ? card.summary.next_step_seconds + card.summary.logged : 0;
  const remainingToday = card?.summary ? Math.max(0, card.summary.next_step_seconds - elapsed) : 0;
  const progress = goalTarget > 0 ? Math.min(1, (card!.summary!.logged + elapsed) / goalTarget) : 0;

  const start = async () => {
    if (!user) return;
    const id = activityId || cards[0]?.activity.id || activities.data?.[0]?.id;
    if (!id) {
      setError("Crie um objetivo antes de começar uma sessão.");
      return;
    }
    setError(null);
    setStarting(true);
    const client_uuid = uuid();
    const startedAt = new Date().toISOString();
    const act = (activities.data || []).find((a) => a.id === id);
    const local: LocalTimer = {
      user_id: user.id,
      session_id: null,
      client_uuid,
      activity_id: id,
      activity_title: act?.title || card?.activity.title || "Objetivo",
      kind: "timer",
      status: "active",
      started_at: startedAt,
      intervals: [{ kind: "focus", started_at: startedAt, ended_at: null }],
      version: 1,
      synced: false,
    };
    try {
      const s = unwrap(await api.POST("/api/v1/sessions/start", { body: { activity_id: id, kind: "timer", client_uuid, started_at: startedAt } }));
      local.session_id = s.id;
      local.version = s.version;
      local.synced = true;
      await setTimer(local);
      qc.invalidateQueries({ queryKey: keys.activeSession });
    } catch (e) {
      if (e instanceof ApiError && e.code === "session_active") {
        setConflict(e.details as { session_id: string; activity_id: string; device_id: string | null });
        qc.invalidateQueries({ queryKey: keys.activeSession });
      } else if (isNetworkError(e)) {
        await setTimer(local);
        await enqueueOp(user.id, "session.start", { activity_id: id, client_uuid, started_at: startedAt, kind: "timer" }, client_uuid);
        toast.offline("Sessão iniciada neste aparelho", "Vamos sincronizar quando você voltar à internet.");
      } else setError(errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const transition = async (kind: "pause" | "resume") => {
    if (!timer || !user) return;
    setBusy(true);
    const at = new Date().toISOString();
    const intervals = timer.intervals.map((i) => (i.ended_at ? i : { ...i, ended_at: at }));
    intervals.push({ kind: kind === "pause" ? "pause" : "focus", started_at: at, ended_at: null });
    const next: LocalTimer = { ...timer, status: kind === "pause" ? "paused" : "active", intervals, version: timer.version + 1 };
    await setTimer(next);
    try {
      if (timer.session_id) {
        const s = unwrap(await api.POST(`/api/v1/sessions/{session_id}/${kind}` as "/api/v1/sessions/{session_id}/pause", { params: { path: { session_id: timer.session_id } }, body: { at } }));
        await setTimer({ ...next, version: s.version, synced: true });
      } else {
        await enqueueOp(user.id, `session.${kind}`, { client_uuid: timer.client_uuid, at });
      }
    } catch (e) {
      if (isNetworkError(e)) await enqueueOp(user.id, `session.${kind}`, { session_id: timer.session_id, client_uuid: timer.client_uuid, at });
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async (note?: string) => {
    if (!timer || !user) return;
    setBusy(true);
    const at = new Date().toISOString();
    try {
      if (timer.session_id) {
        const s = unwrap(await api.POST("/api/v1/sessions/{session_id}/finish", { params: { path: { session_id: timer.session_id } }, body: { at, note: note || null } }));
        await clearTimer(user.id);
        invalidate();
        if (s.needs_review) {
          setReviewOpen(s);
          return;
        }
        toast.success(`${fmtMinutes(s.duration_seconds || 0)} registrados`, s.status === "discarded" ? "Sessão sem tempo válido foi descartada." : "A pendência foi ajustada.");
        nav("/app");
      } else {
        await enqueueOp(user.id, "session.finish", { client_uuid: timer.client_uuid, at, note: note || null, intervals: timer.intervals.map((i) => ({ ...i, ended_at: i.ended_at ?? at })) });
        await clearTimer(user.id);
        toast.offline("Sessão encerrada neste aparelho", "Vamos sincronizar quando você voltar à internet.");
        nav("/app");
      }
    } catch (e) {
      if (isNetworkError(e)) {
        await enqueueOp(user.id, "session.finish", { session_id: timer.session_id, client_uuid: timer.client_uuid, at, note: note || null });
        await clearTimer(user.id);
        toast.offline("Sessão encerrada neste aparelho", "Vamos sincronizar quando você voltar à internet.");
        nav("/app");
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
      setFinishOpen(false);
    }
  };

  const discard = async () => {
    if (!timer || !user) return;
    setBusy(true);
    try {
      if (timer.session_id) await api.POST("/api/v1/sessions/{session_id}/discard", { params: { path: { session_id: timer.session_id } } });
      else await enqueueOp(user.id, "session.discard", { client_uuid: timer.client_uuid });
    } catch {
      /* se falhar offline, o servidor manterá a sessão para revisão */
    } finally {
      await clearTimer(user.id);
      invalidate();
      setBusy(false);
      nav("/app");
    }
  };

  const takeOver = async () => {
    if (!conflict || !user) return;
    // transferência explícita: adota a sessão do outro aparelho neste
    setConflict(null);
    qc.invalidateQueries({ queryKey: keys.activeSession });
  };

  if (!hydrated || activities.isPending) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  // --- estado: sem sessão → escolher objetivo e começar ---------------------
  if (!timer) {
    const list = activities.data?.filter((a) => a.status === "active") ?? [];
    const chosen = activityId || list[0]?.id || "";
    return (
      <div className="mx-auto flex max-w-[440px] flex-col gap-4">
        <h1 className="text-[25px]">Começar sessão</h1>
        {error ? <Banner kind="error">{error}</Banner> : null}
        {conflict ? (
          <Banner
            kind="conflict"
            actions={
              <>
                <Button size="sm" variant="secondary" onClick={takeOver}>
                  Continuar neste aparelho
                </Button>
                <Button size="sm" variant="ghost" onClick={() => nav("/app")}>
                  Deixar como está
                </Button>
              </>
            }
          >
            Há uma sessão em andamento em outro aparelho. Você pode continuá-la aqui; nada é perdido.
          </Banner>
        ) : null}
        {list.length === 0 ? (
          <Banner kind="info">
            Nenhum objetivo ativo. <Link to="/app/objetivos/novo">Criar objetivo</Link>
          </Banner>
        ) : (
          <>
            <Field label="Objetivo" htmlFor="t-activity">
              <Select id="t-activity" value={chosen} onChange={(e) => setActivityId(e.target.value)}>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </Select>
            </Field>
            {card?.summary ? <p className="text-[14px] text-neutral-400">{cards.find((c) => c.activity.id === chosen)?.next_step}</p> : null}
            <Button size="xl" block loading={starting} onClick={start} autoFocus>
              Começar sessão
            </Button>
            <Button variant="ghost" size="lg" onClick={() => nav("/app?registrar=1")}>
              Registrar manualmente
            </Button>
          </>
        )}
      </div>
    );
  }

  // --- estado: em sessão ------------------------------------------------------
  const label = [timer.activity_title, timer.label].filter(Boolean).join(" · ");
  return (
    <div className="glow-center -mx-gutter -mt-[max(56px,calc(24px+env(safe-area-inset-top,0px)))] flex min-h-[calc(100dvh-var(--layout-bottom-nav-height))] flex-col items-center gap-4 px-4 pb-6 pt-[max(56px,calc(24px+env(safe-area-inset-top,0px)))] text-center max-xs:-mx-3 desktop:-mx-12 desktop:-mt-10 desktop:min-h-dvh desktop:pt-10">
      <div className="flex w-full max-w-[560px] items-center justify-between">
        <Button variant="ghost-muted" size="md" onClick={() => nav("/app")}>
          Minimizar
        </Button>
        <Tag variant="neutral">{label}</Tag>
      </div>
      {error ? <Banner kind="error" className="w-full max-w-[560px] text-left">{error}</Banner> : null}
      {!timer.synced ? <Banner kind="offline" className="w-full max-w-[560px] text-left">Sessão salva neste aparelho. Vamos sincronizar quando você voltar à internet.</Banner> : null}
      <div className="mt-auto flex flex-col items-center gap-[10px]">
        <span className="kicker text-neutral-400">{timer.status === "active" ? "Em sessão" : "Pausada"}</span>
        <span className="tnum text-[72px] font-semibold leading-none tracking-[-0.02em] desktop:text-[96px]" aria-live="off">
          {fmtClock(elapsed)}
        </span>
        {card?.summary && card.summary.next_step_seconds > 0 ? (
          <span className="tnum text-[14px] text-neutral-300">
            {remainingToday > 0 ? `Faltam ${fmtRemaining(remainingToday)} para os ${fmtMinutes(card.summary.next_step_seconds)} de hoje` : "Meta de hoje alcançada nesta sessão"}
          </span>
        ) : null}
        <div className="mt-1.5 h-1 w-[240px] overflow-hidden rounded-[2px] bg-neutral-800" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta de hoje">
          <div className="h-full bg-accent transition-[width] duration-slow" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <div className="mt-auto flex w-full max-w-[560px] flex-col gap-3">
        <div className="flex gap-[10px]">
          {timer.status === "active" ? (
            <Button variant="secondary" size="xl" className="flex-1" onClick={() => transition("pause")} loading={busy}>
              Pausar
            </Button>
          ) : (
            <Button variant="secondary" size="xl" className="flex-1" onClick={() => transition("resume")} loading={busy}>
              Retomar
            </Button>
          )}
          <Button variant="primary" size="xl" className="flex-1" onClick={() => setFinishOpen(true)} disabled={busy}>
            Encerrar
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAdjustOpen(true)}>
          Ajustar tempo ou trocar conteúdo
        </Button>
      </div>

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent mode="sheet" title="Encerrar sessão" description={`${fmtMinutes(elapsed)} de foco serão registrados. Pausas não contam.`}>
          <FinishForm onConfirm={finish} onDiscard={discard} busy={busy} />
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent mode="sheet" title="Ajustar sessão" description="Você pode encerrar agora e corrigir a duração, ou descartar.">
          <div className="flex flex-col gap-2 text-left text-[14px] text-neutral-300">
            <p>Trocar o conteúdo: ao encerrar, informe o que estudou na observação. A edição completa (matéria, tópico, páginas) fica no histórico de sessões.</p>
          </div>
          <DialogActions>
            <Button variant="ghost" onClick={discard} disabled={busy}>
              Descartar sessão
            </Button>
            <Button variant="primary" onClick={() => { setAdjustOpen(false); setFinishOpen(true); }}>
              Encerrar e ajustar
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>

      {reviewOpen ? <ReviewDialog session={reviewOpen} onDone={() => { setReviewOpen(null); invalidate(); nav("/app"); }} /> : null}
    </div>
  );
}

function deviceOf() {
  try {
    return localStorage.getItem("estudatta.device_id");
  } catch {
    return null;
  }
}

function FinishForm({ onConfirm, onDiscard, busy }: { onConfirm: (note?: string) => void; onDiscard: () => void; busy: boolean }) {
  const [note, setNote] = React.useState("");
  return (
    <div className="flex flex-col gap-3 text-left">
      <Field label="O que você estudou (opcional)" htmlFor="f-note">
        <Input id="f-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vocabulário · lista 12" maxLength={2000} />
      </Field>
      <DialogActions>
        <Button variant="ghost" onClick={onDiscard} disabled={busy}>
          Descartar
        </Button>
        <Button variant="primary" size="lg" onClick={() => onConfirm(note)} loading={busy}>
          Registrar
        </Button>
      </DialogActions>
    </div>
  );
}

/** Sessão longa esquecida: pede revisão da duração antes de contar no saldo. Nada é apagado. */
function ReviewDialog({ session, onDone }: { session: StudySession; onDone: () => void }) {
  const [minutes, setMinutes] = React.useState(Math.min(240, Math.round((session.duration_seconds || 0) / 60)));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      unwrap(await api.PATCH("/api/v1/sessions/{session_id}", { params: { path: { session_id: session.id } }, body: { duration_seconds: minutes * 60, resolve_review: true, reason: "revisão de sessão longa" } }));
      toast.success(`${minutes} min registrados`);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent title="Confirme a duração" description={`O cronômetro ficou aberto por ${fmtMinutes(session.duration_seconds || 0)}. Quanto desse tempo foi estudo de verdade?`}>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Field label="Minutos de estudo" htmlFor="rv-min" hint="A sessão só entra no saldo depois desta confirmação. Nada foi apagado.">
          <Input id="rv-min" type="number" min={1} max={960} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} />
        </Field>
        <DialogActions>
          <Button variant="ghost" onClick={onDone}>
            Revisar depois
          </Button>
          <Button variant="primary" onClick={confirm} loading={busy}>
            Confirmar {minutes} min
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
