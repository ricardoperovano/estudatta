from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.sessions import to_out as session_out
from app.core.db import get_db
from app.core.deps import get_current_user, get_device_id
from app.core.timeutil import utcnow
from app.models.user import User
from app.schemas.sync import SyncBatchIn, SyncBatchOut, SyncResultOut, SyncStatusOut
from app.services import sessions as session_service
from app.services import sync as svc

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/batch", response_model=SyncBatchOut)
def batch(
    payload: SyncBatchIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    header_device_id: str | None = Depends(get_device_id),
) -> SyncBatchOut:
    device_id = payload.device_id or header_device_id
    results = svc.apply_batch(db, user, device_id=device_id, operations=payload.operations)
    db.commit()
    return SyncBatchOut(
        results=[SyncResultOut.model_validate(r) for r in results], server_time=utcnow()
    )


@router.get("/status", response_model=SyncStatusOut)
def status(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    device_id: str | None = Depends(get_device_id),
) -> SyncStatusOut:
    active = session_service.active_session(db, user)
    return SyncStatusOut(
        server_time=utcnow(),
        active_session=session_out(active) if active else None,
        last_sync_at=svc.last_sync_at(db, user, device_id),
    )
