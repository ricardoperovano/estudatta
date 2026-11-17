"""Exclusão de conta pelo painel admin: irreversível, então cada trava tem o seu teste.

Só o responsável (e-mail em ACCOUNT_DELETION_ADMINS) exclui; pede a senha dele de novo e o e-mail
da conta-alvo; nunca a própria conta nem a de outro administrador; cancela a cobrança antes e,
se não conseguir, não apaga nada; toda tentativa vai para a auditoria.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.models.activity import Activity
from app.models.system import AuditLog
from app.models.user import User
from tests.api.test_admin import make_admin, second_client
from tests.api.test_billing import activate_pro, billing_on, fake  # noqa: F401  (fixtures)
from tests.conftest import make_activity, signup

OWNER = "admin@example.com"
PASSWORD = "senha-forte-123"
VICTIM = "alvo@example.com"


@pytest.fixture
def owner(client, monkeypatch):
    """Administrador que é o responsável pelo serviço (está na lista)."""
    make_admin(client, email=OWNER)
    monkeypatch.setattr(settings, "ACCOUNT_DELETION_ADMINS", [OWNER.upper()])  # caixa não importa
    return client


@pytest.fixture
def victim():
    """Conta comum, com um objetivo, em outro navegador."""
    c = second_client()
    data = signup(c, email=VICTIM, name="Alvo")
    make_activity(c)
    return c, data["user"]["id"]


def _delete(client, user_id, *, password=PASSWORD, confirm=VICTIM, reason=None):
    return client.post(
        f"/api/v1/admin/users/{user_id}/delete",
        json={"password": password, "confirm_email": confirm, "reason": reason},
    )


def _exists(user_id) -> bool:
    with SessionLocal() as db:
        return db.get(User, uuid.UUID(str(user_id))) is not None


def _audit(action: str) -> list[AuditLog]:
    with SessionLocal() as db:
        rows = list(db.execute(select(AuditLog).where(AuditLog.action == action)).scalars())
        db.expunge_all()
    return rows


def test_owner_deletes_the_account_and_everything_it_owned(owner, victim):
    vc, uid = victim
    detail = owner.get(f"/api/v1/admin/users/{uid}").json()
    assert detail["can_delete"] is True
    r = _delete(owner, uid, reason="conta de teste")
    assert r.status_code == 200, r.text
    assert not _exists(uid)
    with SessionLocal() as db:
        assert (
            db.execute(select(Activity).where(Activity.user_id == uuid.UUID(uid))).first() is None
        )
    # a sessão da conta apagada deixa de valer, e o e-mail fica livre
    assert vc.get("/api/v1/activities").status_code == 401
    (log,) = _audit("admin.user.delete")
    assert log.target_id == uid and log.actor_id is not None
    assert log.metadata_["email"] == VICTIM and log.metadata_["activities"] == 1
    assert log.metadata_["reason"] == "conta de teste"


def test_being_admin_is_not_enough(client, victim, monkeypatch):
    _vc, uid = victim
    make_admin(client, email=OWNER)
    # recurso desligado (lista vazia): nenhum administrador exclui
    monkeypatch.setattr(settings, "ACCOUNT_DELETION_ADMINS", [])
    assert client.get(f"/api/v1/admin/users/{uid}").json()["can_delete"] is False
    r = _delete(client, uid)
    assert r.status_code == 403 and r.json()["error"]["code"] == "not_owner"
    # lista com outra pessoa: este administrador continua sem poder
    monkeypatch.setattr(settings, "ACCOUNT_DELETION_ADMINS", ["dono@example.com"])
    assert _delete(client, uid).status_code == 403
    assert _exists(uid)
    assert [a.metadata_["why"] for a in _audit("admin.user.delete_denied")] == ["not_owner"] * 2


def test_regular_user_and_anonymous_cannot_even_reach_it(victim, monkeypatch):
    vc, uid = victim
    # mesmo que o e-mail de uma conta comum esteja na lista, sem papel de administrador não passa
    monkeypatch.setattr(settings, "ACCOUNT_DELETION_ADMINS", [VICTIM])
    assert _delete(vc, uid, password="senha-forte-123").status_code == 403
    assert _delete(second_client(), uid).status_code == 401
    assert _exists(uid)


def test_wrong_password_or_wrong_confirmation_deletes_nothing(owner, victim):
    _vc, uid = victim
    r = _delete(owner, uid, password="senha-errada-123")
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = _delete(owner, uid, password="")
    assert r.status_code == 401
    r = _delete(owner, uid, confirm="outra@example.com")
    assert r.status_code == 422 and r.json()["error"]["code"] == "confirm_mismatch"
    r = _delete(owner, uid, confirm="")
    assert r.status_code == 422
    assert _exists(uid)
    assert _audit("admin.user.delete") == []
    assert len(_audit("admin.user.delete_denied")) == 4


def test_never_self_and_never_another_admin(owner, victim):
    _vc, uid = victim
    me = owner.get("/api/v1/auth/session").json()["user"]["id"]
    r = _delete(owner, me, confirm=OWNER)
    assert r.status_code == 409 and r.json()["error"]["code"] == "self_delete"
    with SessionLocal() as db:
        db.get(User, uuid.UUID(uid)).role = "admin"
        db.commit()
    assert owner.get(f"/api/v1/admin/users/{uid}").json()["can_delete"] is False
    r = _delete(owner, uid)
    assert r.status_code == 409 and r.json()["error"]["code"] == "target_is_admin"
    assert _exists(uid) and _exists(me)


def test_unknown_account_is_404(owner):
    assert _delete(owner, uuid.uuid4()).status_code == 404


def test_subscription_is_cancelled_at_the_provider_before_deleting(owner, billing_on):  # noqa: F811
    vc = second_client()
    uid = signup(vc, email=VICTIM, name="Alvo")["user"]["id"]
    _data, pid = activate_pro(vc, billing_on)
    assert _delete(owner, uid).status_code == 200
    assert billing_on.count("cancel") == 1 and billing_on.store[pid]["status"] == "cancelled"
    assert not _exists(uid)
    assert _audit("admin.user.delete")[0].metadata_["subscriptions_cancelled"] == 1


def test_if_the_provider_cannot_cancel_nothing_is_deleted(owner, billing_on):  # noqa: F811
    vc = second_client()
    uid = signup(vc, email=VICTIM, name="Alvo")["user"]["id"]
    activate_pro(vc, billing_on)
    billing_on.fail.add("cancel")
    r = _delete(owner, uid)
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing_cancel_failed"
    # a conta e a assinatura continuam lá: senão o cartão seguiria sendo cobrado sem conta
    assert _exists(uid)
    assert vc.get("/api/v1/billing/subscription").json()["subscription"]["status"] == "active"
    assert _audit("admin.user.delete_failed")[0].metadata_["why"] == "billing_cancel_failed"


def test_self_service_deletion_also_cancels_the_subscription_first(user_client, billing_on):  # noqa: F811
    """A exclusão pela própria conta apagava a assinatura daqui e deixava a cobrança viva no
    provedor."""
    _data, pid = activate_pro(user_client, billing_on)
    billing_on.fail.add("cancel")
    r = user_client.post("/api/v1/me/delete", json={"password": PASSWORD, "confirm": "EXCLUIR"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "billing_cancel_failed"
    assert user_client.get("/api/v1/auth/session").status_code == 200  # a conta continua
    billing_on.fail.discard("cancel")
    r = user_client.post("/api/v1/me/delete", json={"password": PASSWORD, "confirm": "EXCLUIR"})
    assert r.status_code == 200, r.text
    assert billing_on.store[pid]["status"] == "cancelled"
