from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user, get_device_id, rate_limit
from app.core.errors import NotFound
from app.models.user import User
from app.schemas.common import OkResponse
from app.schemas.notifications import (
    NotificationListOut,
    NotificationOut,
    NotificationPreferencesOut,
    NotificationPreferencesUpdate,
    PauseIn,
    PreviewIn,
    PreviewOut,
    PushSubscribeIn,
    PushSubscriptionOut,
    PushTestOut,
    PushUnsubscribeIn,
    SnoozeIn,
    UnreadCountOut,
    VapidKeyOut,
)
from app.services import notifications as svc

router = APIRouter(prefix="/notifications", tags=["notifications"])


# --- Preferências ---------------------------------------------------------------


@router.get("/preferences", response_model=NotificationPreferencesOut)
def get_preferences(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> NotificationPreferencesOut:
    prefs = svc.get_preferences(db, user)
    db.commit()
    return NotificationPreferencesOut.model_validate(prefs)


@router.patch("/preferences", response_model=NotificationPreferencesOut)
def update_preferences(
    payload: NotificationPreferencesUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationPreferencesOut:
    prefs = svc.update_preferences(db, user, payload.model_dump(exclude_unset=True))
    db.commit()
    return NotificationPreferencesOut.model_validate(prefs)


@router.post("/preview", response_model=PreviewOut)
def preview(
    payload: PreviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PreviewOut:
    title, body = svc.preview(db, user, tone=payload.tone, kind=payload.kind)
    return PreviewOut(kind=payload.kind, tone=payload.tone, title=title, body=body)


@router.post("/snooze", response_model=NotificationPreferencesOut)
def snooze(
    payload: SnoozeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> NotificationPreferencesOut:
    prefs = svc.snooze(db, user, payload.minutes)
    db.commit()
    return NotificationPreferencesOut.model_validate(prefs)


@router.post("/pause", response_model=NotificationPreferencesOut)
def pause(
    payload: PauseIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> NotificationPreferencesOut:
    prefs = svc.pause(db, user, payload.until)
    db.commit()
    return NotificationPreferencesOut.model_validate(prefs)


# --- Central ----------------------------------------------------------------------


@router.get("", response_model=NotificationListOut)
def list_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    unread_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationListOut:
    items, total, unread = svc.list_notifications(
        db, user, limit=limit, offset=offset, unread_only=unread_only
    )
    return NotificationListOut(
        items=[NotificationOut.model_validate(n) for n in items],
        total=total,
        unread_count=unread,
        limit=limit,
        offset=offset,
    )


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> UnreadCountOut:
    return UnreadCountOut(count=svc.unread_count(db, user))


@router.post("/read-all", response_model=OkResponse)
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> OkResponse:
    n = svc.mark_all_read(db, user)
    db.commit()
    return OkResponse(message=f"{n} notificações marcadas como lidas.")


@router.post("/{notification_id}/read", response_model=NotificationOut)
def read_one(
    notification_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationOut:
    n = svc.mark_read(db, user, notification_id)
    db.commit()
    return NotificationOut.model_validate(n)


# --- Push -------------------------------------------------------------------------


@router.get("/push/vapid-public-key", response_model=VapidKeyOut)
def vapid_public_key() -> VapidKeyOut:
    if not settings.push_enabled:
        raise NotFound(
            "As notificações push ainda não estão configuradas neste servidor.",
            code="push_disabled",
        )
    return VapidKeyOut(public_key=settings.VAPID_PUBLIC_KEY or "")


@router.post("/push/subscriptions", response_model=PushSubscriptionOut, status_code=201)
def subscribe_push(
    payload: PushSubscribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    device_id: str | None = Depends(get_device_id),
) -> PushSubscriptionOut:
    sub = svc.upsert_push_subscription(
        db,
        user,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=payload.user_agent,
        device_id=device_id,
    )
    audit(
        db,
        actor_id=user.id,
        action="push.subscribe",
        target_type="push_subscription",
        target_id=str(sub.id),
        metadata={"device_id": device_id},
    )
    db.commit()
    return PushSubscriptionOut.model_validate(sub)


@router.delete("/push/subscriptions", response_model=OkResponse)
def unsubscribe_push(
    payload: PushUnsubscribeIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OkResponse:
    removed = svc.remove_push_subscription(db, user, payload.endpoint)
    db.commit()
    return OkResponse(
        ok=True,
        message="Assinatura removida." if removed else "Nenhuma assinatura com esse endpoint.",
    )


@router.post(
    "/push/test",
    response_model=PushTestOut,
    dependencies=[Depends(rate_limit("push_test", 5, 3600))],
)
def test_push(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> PushTestOut:
    row = svc.enqueue_test_push(db, user)
    db.commit()
    return PushTestOut(
        outbox_id=row.id, message="Notificação de teste enfileirada; deve chegar em instantes."
    )
