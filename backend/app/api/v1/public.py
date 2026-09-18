"""Site público: catálogo de planos, lista de interesse e contato (sem autenticação)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import rate_limit
from app.core.timeutil import utcnow
from app.models.system import ContactMessage, WaitlistEntry
from app.schemas.billing import (
    ContactIn,
    PlanPriceOut,
    PublicPlanOut,
    PublicPlansOut,
    WaitlistIn,
)
from app.schemas.common import OkResponse
from app.services import billing as billing_service
from app.services.auth import normalize_email

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/plans", response_model=PublicPlansOut)
def public_plans(db: Session = Depends(get_db)) -> PublicPlansOut:
    """Catálogo ativo. Preços vêm só do banco; `amount_cents=null` = "Valor a definir"."""
    plans = billing_service.list_public_plans(db)
    return PublicPlansOut(
        billing_mode=billing_service.billing_mode(),
        plans=[
            PublicPlanOut(
                code=p.code,
                name=p.name,
                description=p.description,
                features=list(p.features or []),
                limits=dict(p.limits or {}),
                recommended=p.recommended,
                prices=[PlanPriceOut.model_validate(pr) for pr in billing_service.active_prices(p)],
            )
            for p in plans
        ],
    )


@router.post(
    "/waitlist",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("waitlist", 10, 3600))],
)
def join_waitlist(payload: WaitlistIn, db: Session = Depends(get_db)) -> OkResponse:
    """Idempotente por e-mail: a resposta é idêntica quando o e-mail já está na lista."""
    email = normalize_email(payload.email)
    existing = db.execute(
        select(WaitlistEntry).where(WaitlistEntry.email == email)
    ).scalar_one_or_none()
    if existing is None:
        source = (payload.source or "").strip()[:64] or None
        db.add(WaitlistEntry(email=email, source=source, created_at=utcnow()))
        db.commit()
    return OkResponse(message="Pronto! Avisaremos você por e-mail quando houver novidades.")


@router.post(
    "/contact",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("contact", 5, 3600))],
)
def contact(payload: ContactIn, db: Session = Depends(get_db)) -> OkResponse:
    message = payload.message.strip()
    if not message:
        return OkResponse(message="Escreva uma mensagem antes de enviar.", ok=False)
    db.add(
        ContactMessage(
            email=normalize_email(payload.email),
            name=(payload.name or "").strip()[:120] or None,
            subject=(payload.subject or "").strip()[:160] or None,
            message=message[:4000],
            created_at=utcnow(),
        )
    )
    db.commit()
    return OkResponse(message="Mensagem recebida. Respondemos pelo e-mail informado.")
