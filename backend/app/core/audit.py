from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.timeutil import utcnow
from app.models.system import AuditLog


def audit(
    db: Session,
    *,
    actor_id: uuid.UUID | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict | None = None,
    ip: str | None = None,
    request_id: str | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id else None,
            metadata_=metadata,
            ip=ip,
            request_id=request_id,
            created_at=utcnow(),
        )
    )
