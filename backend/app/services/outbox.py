"""Gravação de notificações na outbox (mesma transação do evento de negócio)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.timeutil import local_midnight_utc, today_in, utcnow
from app.models.activity import Activity
from app.models.notification import Notification, NotificationOutbox


def enqueue(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: str,
    dedupe_key: str,
    scheduled_for: datetime,
    payload: dict,
    channels: list[str] | None = None,
    activity_id: uuid.UUID | None = None,
    proactive: bool = True,
    ttl: timedelta = timedelta(hours=6),
) -> NotificationOutbox | None:
    """Enfileira uma notificação; a chave de deduplicação garante idempotência
    (reexecutar jobs não duplica)."""
    existing = db.execute(
        select(NotificationOutbox).where(NotificationOutbox.dedupe_key == dedupe_key)
    ).scalar_one_or_none()
    if existing is not None:
        return None
    row = NotificationOutbox(
        user_id=user_id,
        activity_id=activity_id,
        kind=kind,
        dedupe_key=dedupe_key,
        payload=payload,
        channels=channels or ["inapp", "push"],
        proactive=1 if proactive else 0,
        status="pending",
        next_run_at=scheduled_for,
        expires_at=scheduled_for + ttl,
        created_at=utcnow(),
    )
    db.add(row)
    return row


def cancel_pending(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: str | None = None,
    activity_id: uuid.UUID | None = None,
    reason: str = "cancelled",
) -> int:
    """Cancela notificações pendentes. Com `activity_id`, limita ao **dia local corrente** do
    objetivo: um evento de hoje (sessão iniciada) não deve cancelar o lembrete de amanhã, que já
    pode estar enfileirado e não seria reenfileirado por causa da chave de deduplicação."""
    q = select(NotificationOutbox).where(
        NotificationOutbox.user_id == user_id, NotificationOutbox.status == "pending"
    )
    if kind:
        q = q.where(NotificationOutbox.kind == kind)
    if activity_id:
        q = q.where(NotificationOutbox.activity_id == activity_id)
        act = db.get(Activity, activity_id)
        if act is not None:
            today = today_in(act.timezone)
            q = q.where(
                NotificationOutbox.next_run_at >= local_midnight_utc(today, act.timezone),
                NotificationOutbox.next_run_at
                < local_midnight_utc(today + timedelta(days=1), act.timezone),
            )
    n = 0
    for row in db.execute(q).scalars():
        row.status = "cancelled"
        row.skip_reason = reason
        n += 1
    return n


def notify_inapp(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    body: str,
    url: str | None = None,
    data: dict | None = None,
) -> Notification:
    n = Notification(
        user_id=user_id, kind=kind, title=title, body=body, url=url, data=data, created_at=utcnow()
    )
    db.add(n)
    return n
