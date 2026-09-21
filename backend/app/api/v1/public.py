"""Site público: catálogo de planos, lista de interesse e contato (sem autenticação)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import rate_limit
from app.core.i18n import _
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
                name=_(p.name),
                description=_(p.description) if p.description else p.description,
                features=[_(f) for f in (p.features or [])],
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
    return OkResponse(message=_("Pronto! Avisaremos você por e-mail quando houver novidades."))


@router.post(
    "/contact",
    response_model=OkResponse,
    dependencies=[Depends(rate_limit("contact", 5, 3600))],
)
def contact(payload: ContactIn, db: Session = Depends(get_db)) -> OkResponse:
    message = payload.message.strip()
    if not message:
        return OkResponse(message=_("Escreva uma mensagem antes de enviar."), ok=False)
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
    return OkResponse(message=_("Mensagem recebida. Respondemos pelo e-mail informado."))


_UNSUB_PAGE = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estudatta</title></head>
<body style="margin:0;background:#f3f5fe;font-family:Inter,-apple-system,'Segoe UI',Roboto,sans-serif;color:#292b31">
<div style="max-width:480px;margin:10vh auto;padding:28px;background:#fff;border:1px solid #e4e7f5;border-radius:20px">
<h1 style="margin:0 0 10px;font-size:22px">{title}</h1><p style="margin:0 0 18px;color:#595d6c;line-height:1.6">{body}</p>
<a href="{app}/app/preferencias" style="color:#5d5294">Abrir preferências</a></div></body></html>"""


def _unsub_response(ok: bool) -> HTMLResponse:
    from app.core.config import settings

    if ok:
        title, body = (
            "Pronto.",
            "Você não vai mais receber lembretes de retorno por e-mail. Dá para reativar quando quiser em Preferências.",
        )
    else:
        title, body = (
            "Link inválido.",
            "Não foi possível confirmar este link. Você pode desligar os lembretes em Preferências.",
        )
    return HTMLResponse(
        _UNSUB_PAGE.format(title=title, body=body, app=settings.APP_URL.rstrip("/")),
        status_code=200 if ok else 400,
    )


@router.get("/unsubscribe", response_class=HTMLResponse, include_in_schema=False)
def unsubscribe_page(
    u: str = Query(default=""), t: str = Query(default=""), db: Session = Depends(get_db)
) -> HTMLResponse:
    """Descadastro dos e-mails de retorno pelo link do e-mail (sem login)."""
    from app.services.notifications import unsubscribe_reengagement

    ok = unsubscribe_reengagement(db, u, t)
    db.commit()
    return _unsub_response(ok)


@router.post("/unsubscribe", response_class=HTMLResponse, include_in_schema=False)
def unsubscribe_one_click(
    u: str = Query(default=""), t: str = Query(default=""), db: Session = Depends(get_db)
) -> HTMLResponse:
    """List-Unsubscribe-Post (RFC 8058): o provedor de e-mail descadastra com um clique."""
    from app.services.notifications import unsubscribe_reengagement

    ok = unsubscribe_reengagement(db, u, t)
    db.commit()
    return _unsub_response(ok)
