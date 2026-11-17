"""Exclusão de conta: uma rotina só, usada pela própria pessoa (Preferências) e pelo dono do
serviço (painel admin).

Regra central: a conta só some depois que a assinatura foi cancelada no provedor de pagamento.
Apagar a conta apaga também o registro da assinatura; se a cobrança continuasse ativa no
provedor, o cartão seguiria sendo debitado sem que existisse conta — e sem que o sistema tivesse
como saber. Por isso, se o cancelamento falhar, a exclusão é recusada e nada é apagado.

A exclusão pelo admin é deliberadamente estreita (ver `require_owner` e `admin_delete_user`):
só e-mails listados em ACCOUNT_DELETION_ADMINS, com a senha de quem exclui digitada de novo e o
e-mail da conta-alvo como confirmação; nunca a própria conta nem a de outro administrador.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, Forbidden, ServiceUnavailable, Unauthorized, ValidationFailed
from app.core.logging import get_logger
from app.core.security import verify_password
from app.integrations.mercadopago import BillingProvider, ProviderError
from app.models.activity import Activity
from app.models.billing import Subscription
from app.models.session import StudySession
from app.models.user import User

log = get_logger("account_deletion")


def is_owner(user: User) -> bool:
    """Quem pode excluir contas de outras pessoas. Lista vazia = recurso desligado."""
    allowed = {e.strip().lower() for e in settings.ACCOUNT_DELETION_ADMINS if e.strip()}
    return (
        bool(allowed) and user.role == "admin" and user.is_active and user.email.lower() in allowed
    )


def _needs_provider_cancel(sub: Subscription) -> bool:
    """Assinatura que ainda pode gerar cobrança no provedor."""
    if not sub.provider_ref or sub.status == "expired":
        return False
    if sub.status == "cancelled":
        # já cancelada lá, a menos que o cancelamento tenha ficado só registrado aqui
        return bool((sub.metadata_ or {}).get("cancel_pending"))
    return True


def cancel_billing_or_refuse(db: Session, user: User, provider: BillingProvider | None) -> int:
    """Cancela no provedor toda assinatura da conta que ainda pode cobrar. Retorna quantas.
    Lança (e nada é apagado) se alguma não puder ser cancelada."""
    subs = [
        s
        for s in db.execute(select(Subscription).where(Subscription.user_id == user.id)).scalars()
        if _needs_provider_cancel(s)
    ]
    for sub in subs:
        if provider is None or provider.name != sub.provider:
            raise ServiceUnavailable(
                "Não foi possível cancelar a assinatura no provedor de pagamento agora. "
                "A conta não foi excluída; tente de novo em instantes.",
                code="billing_cancel_failed",
            )
        try:
            provider.cancel_preapproval(sub.provider_ref)
        except ProviderError as exc:
            log.warning(
                "account_deletion.cancel_failed", subscription_id=str(sub.id), error=exc.message
            )
            raise ServiceUnavailable(
                "Não foi possível cancelar a assinatura no provedor de pagamento agora. "
                "A conta não foi excluída; tente de novo em instantes.",
                code="billing_cancel_failed",
            ) from exc
    return len(subs)


def snapshot(db: Session, user: User) -> dict:
    """O que fica na auditoria depois que a conta some (sem conteúdo de estudo)."""

    def count(model) -> int:
        return int(
            db.execute(
                select(func.count()).select_from(model).where(model.user_id == user.id)
            ).scalar_one()
        )

    return {
        "email": user.email,
        "name": user.name,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "activities": count(Activity),
        "sessions": count(StudySession),
        "subscriptions": count(Subscription),
    }


def delete_user(db: Session, user: User, provider: BillingProvider | None) -> int:
    """Cancela a cobrança, apaga os arquivos e a conta. Não faz commit. Retorna quantas
    assinaturas foram canceladas no provedor."""
    from app.services import materials as materials_service

    cancelled = cancel_billing_or_refuse(db, user, provider)
    materials_service.delete_all_user_files(db, user)
    db.delete(user)
    db.flush()
    return cancelled


def check_admin_delete(
    actor: User, target: User, *, password: str | None, confirm_email: str | None
) -> None:
    """Todas as travas da exclusão pelo painel, na ordem em que devem falhar."""
    if not is_owner(actor):
        raise Forbidden("Só o responsável pelo serviço pode excluir contas.", code="not_owner")
    if not actor.password_hash or not verify_password(password or "", actor.password_hash):
        raise Unauthorized("Senha incorreta.", code="invalid_credentials")
    if target.id == actor.id:
        raise Conflict("Para excluir a própria conta, use Preferências.", code="self_delete")
    if target.role == "admin":
        raise Conflict(
            "Esta conta é de um administrador. Remova o papel de administrador antes de excluir.",
            code="target_is_admin",
        )
    if (confirm_email or "").strip().lower() != target.email.lower():
        raise ValidationFailed(
            "O e-mail de confirmação não confere com o da conta.", code="confirm_mismatch"
        )
