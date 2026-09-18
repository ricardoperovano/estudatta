"""Notificações: preferências, central, assinaturas push e o motor de lembretes.

O motor tem duas metades, ambas idempotentes e chamadas pelos jobs:

- `schedule_reminders`: projeta as ocorrências das próximas 24 h por objetivo (no fuso do
  objetivo) e grava na outbox com chave determinística — reexecutar não duplica.
- `dispatch_outbox`: pega o que venceu (com lock por linha), **reconfere a relevância** na hora
  do envio (sessão registrada, meta cumprida, objetivo pausado, silêncio, limite diário…) e
  envia por canal, registrando `NotificationDelivery` por tentativa.

Política por tipo:
- proativos (`planned_start`, `follow_up`, `end_of_window`, `resume`): contam no limite diário;
  silêncio/pausa/soneca reagendam para o fim do período (ou pulam se o lembrete já expirou).
- `goal_completed` (reação a uma ação do usuário): não conta no limite; no silêncio só o push é
  suprimido e a central no app recebe normalmente.
- `weekly_summary` (resumo opt-in): não conta no limite; respeita silêncio/pausa reagendando.
- `system` (teste de push): entregue como pedido.
"""

from __future__ import annotations

import hashlib
import os
import socket
import uuid
from collections import Counter
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import NotFound, ServiceUnavailable, ValidationFailed
from app.core.logging import get_logger
from app.core.timeutil import local_datetime_to_utc, local_midnight_utc, today_in, utcnow
from app.domain.balance import TodaySummary
from app.domain.messages import fmt_minutes, render
from app.integrations import push as push_integration
from app.integrations.email import send_weekly_summary_email
from app.models.activity import Activity, ActivityPause
from app.models.notification import Notification, NotificationDelivery, NotificationOutbox
from app.models.user import NotificationPreferences, PushSubscription, User, UserPreferences
from app.services import balance as balance_service
from app.services import outbox
from app.services import sessions as session_service

log = get_logger("notifications")

RETRY_BACKOFF_MINUTES = (1, 5, 15, 60)
LOCK_STALE = timedelta(minutes=5)
SCHEDULE_HORIZON = timedelta(hours=24)
SCHEDULE_GRACE = timedelta(minutes=10)
DEFAULT_WINDOW_END = time(21, 0)
END_OF_WINDOW_LEAD = timedelta(hours=1)
PUSH_MAX_FAILURES = 8
PROACTIVE_KINDS = {"planned_start", "follow_up", "end_of_window", "resume"}
BALANCE_KINDS = PROACTIVE_KINDS | {"goal_completed"}
DEFAULT_URLS = {
    "weekly_summary": "/app/relatorio",
    "system": "/app/configuracoes/notificacoes",
}


# --- Preferências -------------------------------------------------------------


def get_preferences(db: Session, user: User) -> NotificationPreferences:
    prefs = db.get(NotificationPreferences, user.id)
    if prefs is None:
        prefs = NotificationPreferences(
            user_id=user.id, max_per_day=settings.NOTIFICATIONS_MAX_PROACTIVE_PER_DAY
        )
        db.add(prefs)
        db.flush()
    return prefs


def update_preferences(db: Session, user: User, data: dict) -> NotificationPreferences:
    prefs = get_preferences(db, user)
    ceiling = settings.NOTIFICATIONS_SYSTEM_CEILING_PER_DAY
    if data.get("max_per_day") is not None and data["max_per_day"] > ceiling:
        raise ValidationFailed(
            f"O limite diário máximo é {ceiling} lembretes.",
            code="max_per_day_ceiling",
            details={"ceiling": ceiling},
        )
    for key, value in data.items():
        if value is not None:
            setattr(prefs, key, value)
    db.flush()
    return prefs


def snooze(db: Session, user: User, minutes: int) -> NotificationPreferences:
    prefs = get_preferences(db, user)
    prefs.snoozed_until = utcnow() + timedelta(minutes=minutes)
    db.flush()
    return prefs


def pause(db: Session, user: User, until: datetime | None) -> NotificationPreferences:
    prefs = get_preferences(db, user)
    prefs.paused_until = until
    db.flush()
    return prefs


def user_tone(db: Session, user_id: uuid.UUID) -> str:
    up = db.get(UserPreferences, user_id)
    return up.tone if up is not None else "acolhedor"


def preview(db: Session, user: User, *, tone: str, kind: str) -> tuple[str, str]:
    """Prévia do tom com números de exemplo (não consulta o saldo real)."""
    prefs = get_preferences(db, user)
    act = (
        db.execute(
            select(Activity)
            .where(Activity.user_id == user.id, Activity.status == "active")
            .order_by(Activity.sort_order, Activity.created_at)
        )
        .scalars()
        .first()
    )
    title = act.title if act else "Inglês"
    return render(
        kind,
        tone,
        activity_title=title,
        show_name=prefs.show_activity_name,
        time_str=prefs.reminder_time,
        missing_seconds=45 * 60,
        remaining_seconds=65 * 60,
        pending_seconds=20 * 60,
        days_without=prefs.resume_after_days,
        summary_text="Na semana passada você registrou 4h30 de 5h planejadas, em 4 de 5 dias. Pendência atual: 30 min.",
    )


# --- Central --------------------------------------------------------------------


def list_notifications(
    db: Session, user: User, *, limit: int = 50, offset: int = 0, unread_only: bool = False
) -> tuple[list[Notification], int, int]:
    """(itens, total do filtro, não lidas)."""
    base = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        base = base.where(Notification.read_at.is_(None))
    total = int(db.execute(select(func.count()).select_from(base.subquery())).scalar_one())
    items = list(
        db.execute(base.order_by(Notification.created_at.desc()).limit(limit).offset(offset))
        .scalars()
        .all()
    )
    return items, total, unread_count(db, user)


def unread_count(db: Session, user: User) -> int:
    return int(
        db.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        ).scalar_one()
    )


def mark_read(db: Session, user: User, notification_id: uuid.UUID) -> Notification:
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise NotFound("Notificação não encontrada.")
    if n.read_at is None:
        n.read_at = utcnow()
        db.flush()
    return n


def mark_all_read(db: Session, user: User) -> int:
    res = db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    return int(res.rowcount or 0)


# --- Assinaturas push ---------------------------------------------------------


def active_push_subscriptions(db: Session, user_id: uuid.UUID) -> list[PushSubscription]:
    return list(
        db.execute(
            select(PushSubscription)
            .where(PushSubscription.user_id == user_id, PushSubscription.expired_at.is_(None))
            .order_by(PushSubscription.created_at)
        ).scalars()
    )


def upsert_push_subscription(
    db: Session,
    user: User,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
    device_id: str | None,
) -> PushSubscription:
    """Upsert por endpoint. Um endpoint é do aparelho/navegador: se já pertencia a outra conta
    (troca de usuário no mesmo navegador), passa a valer para a conta atual."""
    sub = db.execute(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    ).scalar_one_or_none()
    if sub is None:
        sub = PushSubscription(user_id=user.id, endpoint=endpoint, p256dh=p256dh, auth=auth)
        db.add(sub)
    sub.user_id = user.id
    sub.p256dh = p256dh
    sub.auth = auth
    sub.user_agent = user_agent
    sub.device_id = device_id
    sub.expired_at = None
    sub.failure_count = 0
    db.flush()
    return sub


def remove_push_subscription(db: Session, user: User, endpoint: str) -> bool:
    sub = db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == endpoint, PushSubscription.user_id == user.id
        )
    ).scalar_one_or_none()
    if sub is None:
        return False
    db.delete(sub)
    db.flush()
    return True


def enqueue_test_push(db: Session, user: User) -> NotificationOutbox:
    if not settings.push_enabled:
        raise ServiceUnavailable(
            "As notificações push ainda não estão configuradas neste servidor.",
            code="push_disabled",
        )
    if not active_push_subscriptions(db, user.id):
        raise ValidationFailed(
            "Ative as notificações neste aparelho antes de enviar um teste.",
            code="no_subscription",
        )
    row = outbox.enqueue(
        db,
        user_id=user.id,
        kind="system",
        dedupe_key=f"system:test:{user.id}:{uuid.uuid4().hex}",
        scheduled_for=utcnow(),
        payload={
            "title": "Teste de notificação",
            "body": "Se você está vendo isto, os lembretes vão chegar por aqui.",
            "url": DEFAULT_URLS["system"],
        },
        channels=["push", "inapp"],
        proactive=False,
        ttl=timedelta(minutes=30),
    )
    assert row is not None
    db.flush()
    return row


# --- Agendamento ---------------------------------------------------------------


def _parse_hhmm(value: str | None) -> time | None:
    if not value or ":" not in value:
        return None
    try:
        h, m = value.split(":", 1)
        return time(int(h), int(m))
    except (TypeError, ValueError):
        return None


def _window_end_for(act: Activity, d: date) -> time:
    """Fim da última janela de disponibilidade do dia (ou 21:00 se não houver)."""
    windows = (act.availability or {}).get(str(d.weekday())) or []
    ends = []
    for w in windows:
        if isinstance(w, list | tuple) and len(w) == 2:
            t = _parse_hhmm(w[1])
            if t:
                ends.append(t)
    return max(ends) if ends else DEFAULT_WINDOW_END


def _planned_slots(act: Activity, prefs: NotificationPreferences, d: date) -> list[time]:
    """Horários planejados do dia: `preferred_times` do objetivo ou, na falta, o horário de
    lembrete do usuário nos `reminder_days`. Dias sem meta não geram ocorrência (quem chama
    filtra por meta > 0)."""
    slots = [t for t in (_parse_hhmm(v) for v in (act.preferred_times or [])) if t]
    if slots:
        return sorted(set(slots))
    if d.weekday() in (prefs.reminder_days or []):
        t = _parse_hhmm(prefs.reminder_time)
        return [t] if t else []
    return []


def _in_window(when: datetime, now: datetime) -> bool:
    return now - SCHEDULE_GRACE <= when < now + SCHEDULE_HORIZON


def _schedule_activity(
    db: Session, user: User, prefs: NotificationPreferences, act: Activity, now: datetime
) -> int:
    n = 0
    today = today_in(act.timezone)
    tomorrow = today + timedelta(days=1)
    targets = {t.local_date: t for t in balance_service.project_targets(db, act, today, tomorrow)}
    for d in (today, tomorrow):
        t = targets.get(d)
        if t is None or t.target <= 0 or t.is_paused or not t.in_range:
            continue
        base = {
            "activity_title": act.title,
            "target_seconds": t.target,
            "local_date": d.isoformat(),
        }
        for slot in _planned_slots(act, prefs, d):
            slot_str = slot.strftime("%H:%M")
            when = local_datetime_to_utc(d, slot, act.timezone)
            if _in_window(when, now) and outbox.enqueue(
                db,
                user_id=user.id,
                kind="planned_start",
                dedupe_key=f"planned_start:{user.id}:{act.id}:{d.isoformat()}:{slot_str}",
                scheduled_for=when,
                payload={**base, "time_str": slot_str, "slot": slot_str},
                activity_id=act.id,
            ):
                n += 1
            follow = when + timedelta(minutes=prefs.follow_up_minutes)
            if _in_window(follow, now) and outbox.enqueue(
                db,
                user_id=user.id,
                kind="follow_up",
                dedupe_key=f"follow_up:{user.id}:{act.id}:{d.isoformat()}:{slot_str}",
                scheduled_for=follow,
                payload={**base, "time_str": slot_str, "slot": slot_str},
                activity_id=act.id,
            ):
                n += 1
        if prefs.end_of_window_alert:
            end_t = _window_end_for(act, d)
            when = local_datetime_to_utc(d, end_t, act.timezone) - END_OF_WINDOW_LEAD
            if _in_window(when, now) and outbox.enqueue(
                db,
                user_id=user.id,
                kind="end_of_window",
                dedupe_key=f"end_of_window:{user.id}:{act.id}:{d.isoformat()}",
                scheduled_for=when,
                payload={**base, "time_str": end_t.strftime("%H:%M")},
                activity_id=act.id,
                ttl=timedelta(hours=3),
            ):
                n += 1
    return n


def _schedule_resume(
    db: Session, user: User, prefs: NotificationPreferences, act: Activity, now: datetime
) -> int:
    """Retomada: `resume_after_days` dias ativos encerrados sem registro desde o último registro.
    Enviado no horário de lembrete, no máximo uma vez a cada `resume_after_days` dias."""
    today = today_in(act.timezone)
    if today.weekday() not in (prefs.reminder_days or []):
        return 0
    days = balance_service.compute_activity_balances(db, act)
    without = 0
    for d in reversed(days):
        if d.local_date >= today:
            continue
        if d.logged > 0:
            break
        if d.target > 0:
            without += 1
    if without < max(1, prefs.resume_after_days):
        return 0
    recent = db.execute(
        select(func.count())
        .select_from(NotificationOutbox)
        .where(
            NotificationOutbox.activity_id == act.id,
            NotificationOutbox.kind == "resume",
            NotificationOutbox.created_at >= now - timedelta(days=prefs.resume_after_days),
        )
    ).scalar_one()
    if recent:
        return 0
    slot = _parse_hhmm(prefs.reminder_time) or time(19, 30)
    when = max(now, local_datetime_to_utc(today, slot, act.timezone))
    today_day = next((d for d in days if d.local_date == today), None)
    pending = today_day.pending_prior if today_day else 0
    row = outbox.enqueue(
        db,
        user_id=user.id,
        kind="resume",
        dedupe_key=f"resume:{user.id}:{act.id}:{today.isoformat()}",
        scheduled_for=when,
        payload={
            "activity_title": act.title,
            "local_date": today.isoformat(),
            "days_without": without,
            "pending_seconds": pending,
        },
        activity_id=act.id,
    )
    return 1 if row else 0


def notify_goal_completed(
    db: Session, user: User, act: Activity, *, prefs: NotificationPreferences | None = None
) -> NotificationOutbox | None:
    """Enfileira "meta de hoje cumprida" se a meta do dia foi atingida (dedupe por objetivo/dia).
    Chamado pelo agendador; pode ser chamado também ao encerrar uma sessão."""
    prefs = prefs or get_preferences(db, user)
    if not (prefs.enabled and prefs.goal_completed_alert):
        return None
    summary = balance_service.activity_balance(db, act).today
    if summary is None or not summary.goal_met:
        return None
    return outbox.enqueue(
        db,
        user_id=user.id,
        kind="goal_completed",
        dedupe_key=f"goal_completed:{user.id}:{act.id}:{summary.local_date.isoformat()}",
        scheduled_for=utcnow(),
        payload={
            "activity_title": act.title,
            "local_date": summary.local_date.isoformat(),
            "target_seconds": summary.target,
            "pending_seconds": summary.pending_prior,
        },
        activity_id=act.id,
        proactive=False,
        ttl=timedelta(hours=2),
    )


def _users_with_enabled_prefs(db: Session) -> list[User]:
    return list(
        db.execute(
            select(User)
            .join(NotificationPreferences, NotificationPreferences.user_id == User.id)
            .where(
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                NotificationPreferences.enabled.is_(True),
            )
            .order_by(User.created_at)
        ).scalars()
    )


def schedule_reminders(db: Session, *, now: datetime | None = None) -> dict:
    """Job (a cada 5 min): enfileira as ocorrências das próximas 24 h. Commit por usuário."""
    now = now or utcnow()
    stats = Counter()
    for user in _users_with_enabled_prefs(db):
        try:
            prefs = get_preferences(db, user)
            acts = list(
                db.execute(
                    select(Activity).where(
                        Activity.user_id == user.id, Activity.status == "active"
                    )
                ).scalars()
            )
            n = 0
            for act in acts:
                n += _schedule_activity(db, user, prefs, act, now)
                n += _schedule_resume(db, user, prefs, act, now)
                if notify_goal_completed(db, user, act, prefs=prefs) is not None:
                    n += 1
            db.commit()
            stats["users"] += 1
            stats["enqueued"] += n
        except Exception as exc:  # noqa: BLE001 - um usuário não derruba o job
            db.rollback()
            log.warning("schedule_reminders.failed", user_id=str(user.id), error=str(exc))
            stats["errors"] += 1
    return dict(stats)


# --- Resumo semanal --------------------------------------------------------------


def _fmt_day(d: date) -> str:
    return f"{d.day:02d}/{d.month:02d}"


def weekly_summary_text(
    db: Session, user: User, prefs: NotificationPreferences, week_start: date, week_end: date
) -> str | None:
    acts = list(
        db.execute(
            select(Activity)
            .where(Activity.user_id == user.id, Activity.status == "active")
            .order_by(Activity.sort_order, Activity.created_at)
        ).scalars()
    )
    if not acts:
        return None
    logged = target = days_with_log = planned_days = pending = 0
    lines: list[str] = []
    for act in acts:
        days = [
            d
            for d in balance_service.compute_activity_balances(db, act, upto=week_end)
            if week_start <= d.local_date <= week_end
        ]
        if not days:
            continue
        a_logged = sum(d.logged for d in days)
        a_target = sum(d.target for d in days)
        a_days = sum(1 for d in days if d.logged > 0)
        a_planned = sum(1 for d in days if d.target > 0)
        a_pending = days[-1].carry_out
        logged += a_logged
        target += a_target
        days_with_log += a_days
        planned_days += a_planned
        pending += a_pending
        if prefs.show_activity_name:
            lines.append(
                f"{act.title}: {fmt_minutes(a_logged)} de {fmt_minutes(a_target)} "
                f"({a_days} de {a_planned} dias)."
            )
    head = (
        f"Semana de {_fmt_day(week_start)} a {_fmt_day(week_end)}: "
        f"{fmt_minutes(logged)} registrados de {fmt_minutes(target)} planejados, "
        f"em {days_with_log} de {planned_days} dias."
    )
    tail = (
        f" Tempo a recuperar: {fmt_minutes(pending)}."
        if pending > 0
        else " Nenhuma pendência — bom ritmo."
    )
    return " ".join([head + tail, *lines]).strip()


def weekly_summaries(db: Session, *, now: datetime | None = None) -> dict:
    """Job (de hora em hora): na segunda-feira local, enfileira o resumo da semana anterior no
    horário de lembrete do usuário. E-mail só com opt-in (filtrado no envio)."""
    now = now or utcnow()
    stats = Counter()
    ttl = timedelta(hours=12)
    for user in _users_with_enabled_prefs(db):
        try:
            prefs = get_preferences(db, user)
            if not prefs.weekly_summary:
                continue
            today = today_in(user.timezone)
            if today.weekday() != 0:
                continue
            slot = _parse_hhmm(prefs.reminder_time) or time(19, 30)
            when = local_datetime_to_utc(today, slot, user.timezone)
            if now > when + ttl:
                continue
            week_end = today - timedelta(days=1)
            week_start = week_end - timedelta(days=6)
            text = weekly_summary_text(db, user, prefs, week_start, week_end)
            if text is None:
                continue
            row = outbox.enqueue(
                db,
                user_id=user.id,
                kind="weekly_summary",
                dedupe_key=f"weekly_summary:{user.id}:{today.isoformat()}",
                scheduled_for=when,
                payload={
                    "summary_text": text,
                    "week_start": week_start.isoformat(),
                    "week_end": week_end.isoformat(),
                    "url": DEFAULT_URLS["weekly_summary"],
                },
                channels=["inapp", "push", "email"],
                proactive=False,
                ttl=ttl,
            )
            db.commit()
            if row is not None:
                stats["enqueued"] += 1
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            log.warning("weekly_summaries.failed", user_id=str(user.id), error=str(exc))
            stats["errors"] += 1
    return dict(stats)


# --- Envio -----------------------------------------------------------------------


def _policy(row: NotificationOutbox) -> str:
    if row.kind == "system":
        return "system"
    if row.kind == "goal_completed":
        return "reaction"
    if row.kind == "weekly_summary":
        return "digest"
    return "reminder" if row.proactive else "reaction"


def _in_nightly(t: time, start: time, end: time) -> bool:
    if start == end:
        return False
    if start < end:
        return start <= t < end
    return t >= start or t < end


def quiet_until(prefs: NotificationPreferences, tz: str, now: datetime) -> datetime | None:
    """Fim do período de silêncio em que `now` cai (None se não está em silêncio)."""
    zone = ZoneInfo(tz)
    local = now.astimezone(zone)
    qs, qe = _parse_hhmm(prefs.quiet_start), _parse_hhmm(prefs.quiet_end)
    cur = local
    for _ in range(12):
        if prefs.quiet_weekends and cur.weekday() >= 5:
            cur = datetime.combine(cur.date() + timedelta(days=1), time.min, tzinfo=zone)
            continue
        if qs and qe and _in_nightly(cur.time(), qs, qe):
            end_today = datetime.combine(cur.date(), qe, tzinfo=zone)
            cur = (
                end_today
                if end_today > cur
                else datetime.combine(cur.date() + timedelta(days=1), qe, tzinfo=zone)
            )
            continue
        break
    if cur == local:
        return None
    return cur.astimezone(UTC)


def _hold(
    prefs: NotificationPreferences, tz: str, now: datetime
) -> tuple[datetime | None, str | None]:
    candidates: list[tuple[datetime, str]] = []
    q = quiet_until(prefs, tz, now)
    if q is not None:
        candidates.append((q, "quiet_hours"))
    if prefs.paused_until and prefs.paused_until > now:
        candidates.append((prefs.paused_until, "paused"))
    if prefs.snoozed_until and prefs.snoozed_until > now:
        candidates.append((prefs.snoozed_until, "snoozed"))
    if not candidates:
        return None, None
    return max(candidates, key=lambda c: c[0])


def proactive_sent_today(db: Session, user: User, now: datetime) -> int:
    today = now.astimezone(ZoneInfo(user.timezone)).date()
    start = local_midnight_utc(today, user.timezone)
    end = local_midnight_utc(today + timedelta(days=1), user.timezone)
    return int(
        db.execute(
            select(func.count())
            .select_from(NotificationOutbox)
            .where(
                NotificationOutbox.user_id == user.id,
                NotificationOutbox.proactive == 1,
                NotificationOutbox.status.in_(["sent", "partial"]),
                NotificationOutbox.sent_at >= start,
                NotificationOutbox.sent_at < end,
            )
        ).scalar_one()
    )


def _row_local_date(row: NotificationOutbox, act: Activity) -> date:
    raw = (row.payload or {}).get("local_date")
    if raw:
        try:
            return date.fromisoformat(raw)
        except ValueError:
            pass
    return today_in(act.timezone)


def _activity_skip_reason(db: Session, act: Activity, row: NotificationOutbox) -> str | None:
    if act.status != "active":
        return "activity_inactive"
    d = _row_local_date(row, act)
    if row.kind in BALANCE_KINDS and d != today_in(act.timezone):
        return "stale_date"
    pause_row = (
        db.execute(
            select(ActivityPause).where(
                ActivityPause.activity_id == act.id,
                ActivityPause.start_date <= d,
                ActivityPause.end_date >= d,
            )
        )
        .scalars()
        .first()
    )
    if pause_row is not None and pause_row.silence_reminders and row.kind != "goal_completed":
        return "activity_paused"
    return None


def _relevance_skip_reason(row: NotificationOutbox, summary: TodaySummary | None) -> str | None:
    if summary is None or not summary.in_range:
        return "out_of_range"
    planned_target = (row.payload or {}).get("target_seconds")
    if row.kind in ("planned_start", "follow_up"):
        if summary.target <= 0 or summary.is_paused:
            return "plan_changed" if planned_target else "no_target"
        if summary.goal_met:
            return "goal_met"
        if summary.logged > 0:
            return "session_logged"
    elif row.kind == "end_of_window":
        if summary.remaining_total <= 0:
            return "nothing_remaining"
    elif row.kind == "goal_completed":
        if not summary.goal_met:
            return "goal_not_met"
    elif row.kind == "resume":
        if summary.logged > 0:
            return "session_logged"
    return None


def _effective_channels(
    row: NotificationOutbox, prefs: NotificationPreferences, *, suppress_push: bool
) -> list[str]:
    requested = list(row.channels or [])
    if row.kind == "system":
        return requested
    allowed = []
    for ch in requested:
        if ch == "inapp" and prefs.channel_inapp:
            allowed.append(ch)
        elif ch == "push" and prefs.channel_push and not suppress_push:
            allowed.append(ch)
        elif (
            ch == "email"
            and row.kind == "weekly_summary"
            and prefs.channel_email
            and prefs.weekly_summary_email
        ):
            allowed.append(ch)
    return allowed


def render_row(
    db: Session,
    row: NotificationOutbox,
    user: User,
    prefs: NotificationPreferences,
    act: Activity | None,
    summary: TodaySummary | None,
) -> tuple[str, str, str]:
    """(título, corpo, url) com os números atuais do saldo — nunca o texto de quando foi agendado."""
    p = row.payload or {}
    ctx: dict = {
        "time_str": p.get("time_str", ""),
        "days_without": p.get("days_without", 0),
        "summary_text": p.get("summary_text", ""),
        "title": p.get("title", "Estudatta"),
        "body": p.get("body", ""),
        "pending_seconds": p.get("pending_seconds", 0),
        "missing_seconds": p.get("target_seconds", 0),
        "remaining_seconds": p.get("target_seconds", 0),
    }
    if summary is not None:
        ctx.update(
            missing_seconds=summary.missing_today,
            remaining_seconds=summary.remaining_total,
            pending_seconds=summary.pending_prior,
        )
    title, body = render(
        row.kind,
        user_tone(db, user.id),
        activity_title=act.title if act else p.get("activity_title"),
        show_name=prefs.show_activity_name,
        **ctx,
    )
    url = p.get("url") or DEFAULT_URLS.get(row.kind, "/app/hoje")
    return title, body, url


def _endpoint_hash(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()[:32]


def _delivery(
    db: Session,
    row: NotificationOutbox,
    channel: str,
    target: str | None,
    status: str,
    error: str | None,
    now: datetime,
) -> None:
    db.add(
        NotificationDelivery(
            outbox_id=row.id,
            channel=channel,
            target=target,
            status=status,
            error=(error or None) and str(error)[:500],
            attempted_at=now,
        )
    )


def _deliver_push(
    db: Session,
    row: NotificationOutbox,
    user: User,
    title: str,
    body: str,
    url: str,
    now: datetime,
    done: set[tuple[str, str | None]],
) -> list[tuple[str, str, str | None]]:
    if not settings.push_enabled:
        _delivery(db, row, "push", None, "skipped", "push_disabled", now)
        return [("push", "skipped", "push_disabled")]
    subs = active_push_subscriptions(db, user.id)
    if not subs:
        _delivery(db, row, "push", None, "skipped", "no_subscriptions", now)
        return [("push", "skipped", "no_subscriptions")]
    payload = push_integration.build_payload(
        title=title,
        body=body,
        url=url,
        tag=f"{row.kind}:{row.activity_id or 'geral'}",
        data={
            "kind": row.kind,
            "outbox_id": str(row.id),
            "activity_id": str(row.activity_id) if row.activity_id else None,
            "local_date": (row.payload or {}).get("local_date"),
        },
    )
    out: list[tuple[str, str, str | None]] = []
    for sub in subs:
        target = _endpoint_hash(sub.endpoint)
        if ("push", target) in done:
            out.append(("push", "sent", None))
            continue
        status, error, called = "failed", None, False
        try:
            res = push_integration.send_push(sub, payload)
            called = True
            if res.ok:
                sub.last_success_at = now
                sub.failure_count = 0
                status = "sent"
            elif res.gone:
                # 404/410: o navegador cancelou a assinatura — remove, não é falha de envio
                db.delete(sub)
                status, error = "skipped", res.error
            elif res.error == "push_disabled":
                status, error = "skipped", res.error
            elif res.ambiguous:
                status, error = "ambiguous", res.error
            else:
                sub.failure_count += 1
                if sub.failure_count >= PUSH_MAX_FAILURES:
                    sub.expired_at = now
                status, error = "failed", res.error
        except Exception as exc:  # noqa: BLE001
            status = "ambiguous" if called else "failed"
            error = f"{type(exc).__name__}: {exc}"
        _delivery(db, row, "push", target, status, error, now)
        out.append(("push", status, error))
    return out


def _deliver(
    db: Session,
    row: NotificationOutbox,
    user: User,
    channels: list[str],
    title: str,
    body: str,
    url: str,
    now: datetime,
) -> list[tuple[str, str, str | None]]:
    done = {(d.channel, d.target) for d in row.deliveries if d.status in ("sent", "ambiguous")}
    results: list[tuple[str, str, str | None]] = []
    data = {
        "outbox_id": str(row.id),
        "activity_id": str(row.activity_id) if row.activity_id else None,
        "local_date": (row.payload or {}).get("local_date"),
    }
    for ch in channels:
        if ch == "inapp":
            if ("inapp", None) in done:
                results.append(("inapp", "sent", None))
                continue
            outbox.notify_inapp(
                db, user_id=user.id, kind=row.kind, title=title, body=body, url=url, data=data
            )
            _delivery(db, row, "inapp", None, "sent", None, now)
            results.append(("inapp", "sent", None))
        elif ch == "push":
            results.extend(_deliver_push(db, row, user, title, body, url, now, done))
        elif ch == "email":
            target = user.email
            if ("email", target) in done:
                results.append(("email", "sent", None))
                continue
            status, error, called = "failed", None, False
            try:
                ok = send_weekly_summary_email(user.email, body)
                called = True
                status = "sent" if ok else "failed"
                error = None if ok else "email_backend_failed"
            except Exception as exc:  # noqa: BLE001
                status = "ambiguous" if called else "failed"
                error = f"{type(exc).__name__}: {exc}"
            _delivery(db, row, "email", target, status, error, now)
            results.append(("email", status, error))
    return results


def _unlock(row: NotificationOutbox) -> None:
    row.locked_at = None
    row.locked_by = None


def _finish(
    row: NotificationOutbox, status: str, *, now: datetime, reason: str | None = None
) -> str:
    row.status = status
    row.skip_reason = reason
    if status in ("sent", "partial"):
        row.sent_at = now
    _unlock(row)
    return status


def _reschedule(row: NotificationOutbox, when: datetime) -> str:
    row.status = "pending"
    row.next_run_at = when
    _unlock(row)
    return "rescheduled"


def _retry_or_fail(row: NotificationOutbox, *, now: datetime, error: str | None) -> str:
    row.attempts += 1
    row.last_error = (error or "")[:500] or None
    if row.attempts >= row.max_attempts:
        return _finish(row, "failed", now=now, reason="max_attempts")
    minutes = RETRY_BACKOFF_MINUTES[min(row.attempts - 1, len(RETRY_BACKOFF_MINUTES) - 1)]
    return _reschedule(row, now + timedelta(minutes=minutes))


def process_outbox_row(db: Session, row: NotificationOutbox, now: datetime) -> str:
    """Reconfere a relevância e envia. Devolve o desfecho: sent | partial | skipped | expired |
    rescheduled | failed."""
    if row.expires_at is not None and row.expires_at < now:
        return _finish(row, "expired", now=now, reason="expired")
    user = db.get(User, row.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        return _finish(row, "skipped", now=now, reason="user_inactive")
    prefs = get_preferences(db, user)
    policy = _policy(row)
    if policy != "system" and not prefs.enabled:
        return _finish(row, "skipped", now=now, reason="disabled")

    act = db.get(Activity, row.activity_id) if row.activity_id else None
    summary: TodaySummary | None = None
    if row.activity_id is not None and act is None:
        return _finish(row, "skipped", now=now, reason="activity_missing")
    if act is not None:
        reason = _activity_skip_reason(db, act, row)
        if reason:
            return _finish(row, "skipped", now=now, reason=reason)
        if row.kind in BALANCE_KINDS:
            summary = balance_service.activity_balance(db, act).today
            reason = _relevance_skip_reason(row, summary)
            if reason:
                return _finish(row, "skipped", now=now, reason=reason)
            if summary is not None and (row.payload or {}).get("target_seconds") not in (
                None,
                summary.target,
            ):
                row.payload = {**row.payload, "target_seconds": summary.target}

    if policy == "reminder" and session_service.active_session(db, user) is not None:
        return _finish(row, "skipped", now=now, reason="session_active")

    suppress_push = False
    hold_until, hold_reason = _hold(prefs, user.timezone, now)
    if hold_until is not None:
        if policy in ("reminder", "digest"):
            if row.expires_at is not None and hold_until >= row.expires_at:
                return _finish(row, "skipped", now=now, reason=hold_reason)
            return _reschedule(row, hold_until)
        if policy == "reaction":
            suppress_push = True

    if policy == "reminder":
        cap = min(int(prefs.max_per_day), settings.NOTIFICATIONS_SYSTEM_CEILING_PER_DAY)
        if proactive_sent_today(db, user, now) >= cap:
            return _finish(row, "skipped", now=now, reason="daily_cap")

    channels = _effective_channels(row, prefs, suppress_push=suppress_push)
    if not channels:
        return _finish(row, "skipped", now=now, reason="no_channels")

    title, body, url = render_row(db, row, user, prefs, act, summary)
    results = _deliver(db, row, user, channels, title, body, url, now)
    statuses = [s for _, s, _ in results]
    errors = [e for _, s, e in results if s in ("failed", "skipped") and e]
    if "sent" in statuses and not any(s in ("failed", "ambiguous") for s in statuses):
        return _finish(row, "sent", now=now)
    if "sent" in statuses or "ambiguous" in statuses:
        # algo saiu (ou pode ter saído): não reenviar para não duplicar
        row.last_error = (errors[0] if errors else None) and errors[0][:500]
        return _finish(row, "partial", now=now)
    if "failed" in statuses:
        return _retry_or_fail(row, now=now, error=errors[0] if errors else "send_failed")
    return _finish(row, "skipped", now=now, reason=errors[0] if errors else "no_channels")


def claim_due(
    db: Session, *, now: datetime, worker_id: str, limit: int = 200
) -> list[NotificationOutbox]:
    """Seleciona linhas vencidas e as trava (`locked_at/locked_by`). Locks com mais de 5 min
    são considerados abandonados e podem ser retomados."""
    stale = now - LOCK_STALE
    unlocked = or_(NotificationOutbox.locked_at.is_(None), NotificationOutbox.locked_at < stale)
    candidates = list(
        db.execute(
            select(NotificationOutbox)
            .where(
                NotificationOutbox.status.in_(["pending", "processing"]),
                NotificationOutbox.next_run_at <= now,
                unlocked,
            )
            .order_by(NotificationOutbox.next_run_at, NotificationOutbox.created_at)
            .limit(limit)
        ).scalars()
    )
    claimed: list[NotificationOutbox] = []
    for row in candidates:
        res = db.execute(
            update(NotificationOutbox)
            .where(
                NotificationOutbox.id == row.id,
                NotificationOutbox.status.in_(["pending", "processing"]),
                unlocked,
            )
            .values(locked_at=now, locked_by=worker_id, status="processing")
        )
        if res.rowcount == 1:
            claimed.append(row)
    db.commit()
    for row in claimed:
        db.refresh(row)
    return claimed


def _record_crash(db: Session, row_id: uuid.UUID, now: datetime, error: str) -> None:
    row = db.get(NotificationOutbox, row_id)
    if row is None:
        return
    _retry_or_fail(row, now=now, error=error)
    db.commit()


def dispatch_outbox(
    db: Session, *, now: datetime | None = None, worker_id: str | None = None, limit: int = 200
) -> dict:
    """Job (a cada 1 min): processa até `limit` linhas vencidas. Commit por linha; uma exceção
    em uma linha registra a falha (com backoff) e segue para a próxima."""
    now = now or utcnow()
    worker_id = worker_id or f"{socket.gethostname()}:{os.getpid()}"[:64]
    rows = claim_due(db, now=now, worker_id=worker_id, limit=limit)
    stats = Counter()
    for row in rows:
        row_id = row.id
        try:
            outcome = process_outbox_row(db, row, now)
            db.commit()
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            log.warning("dispatch_outbox.failed", outbox_id=str(row_id), error=str(exc))
            _record_crash(db, row_id, now, f"{type(exc).__name__}: {exc}")
            outcome = "error"
        stats[outcome] += 1
    stats["claimed"] = len(rows)
    return dict(stats)
