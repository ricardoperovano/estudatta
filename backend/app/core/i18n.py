"""Idioma das mensagens do servidor (pt-BR ou en).

O idioma vem, nesta ordem, da conta (`user.locale`, definido pela dependência de autenticação)
ou do cabeçalho `Accept-Language` (rotas públicas). Fica num contextvar por requisição; tarefas
em segundo plano (e-mails, push, resumo) chamam `use_locale(user.locale)` explicitamente.

As chaves são o próprio texto em pt-BR; `app/i18n/en.py` traz a tradução. `_("…")` devolve o texto
no idioma atual e aplica `.format(**kw)` quando há valores, para as duas línguas.
"""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar

SUPPORTED = ("pt-BR", "en")
DEFAULT = "pt-BR"

_current: ContextVar[str] = ContextVar("locale", default=DEFAULT)


def normalize_locale(value: str | None) -> str | None:
    """'en-US' → 'en', 'pt_BR' → 'pt-BR'; None quando não é um idioma suportado."""
    if not value:
        return None
    v = value.strip().lower().replace("_", "-")
    if v.startswith("pt"):
        return "pt-BR"
    if v.startswith("en"):
        return "en"
    return None


def from_accept_language(header: str | None) -> str | None:
    """Primeiro idioma suportado do Accept-Language (respeitando a ordem/qualidade declarada)."""
    if not header:
        return None
    items: list[tuple[float, int, str]] = []
    for i, part in enumerate(header.split(",")):
        piece = part.strip()
        if not piece:
            continue
        lang, _, q = piece.partition(";q=")
        try:
            quality = float(q) if q else 1.0
        except ValueError:
            quality = 0.0
        items.append((-quality, i, lang.strip()))
    for _, _, lang in sorted(items):
        n = normalize_locale(lang)
        if n:
            return n
    return None


def current_locale() -> str:
    return _current.get()


def set_locale(value: str | None) -> None:
    _current.set(normalize_locale(value) or DEFAULT)


@contextmanager
def use_locale(value: str | None):
    token = _current.set(normalize_locale(value) or DEFAULT)
    try:
        yield
    finally:
        _current.reset(token)


def translate(text: str, locale: str | None = None, /, **values) -> str:
    """Texto no idioma pedido (ou no atual). Chaves ausentes voltam em pt-BR — nunca vazio."""
    loc = normalize_locale(locale) if locale else current_locale()
    out = text
    if loc == "en":
        from app.i18n.en import MESSAGES

        out = MESSAGES.get(text, text)
    if values:
        try:
            out = out.format(**values)
        except (KeyError, IndexError, ValueError):
            pass
    return out


def _(text: str, /, **values) -> str:
    return translate(text, None, **values)


def _account_locale(scope) -> str | None:
    """Idioma da conta pelo cookie de sessão, sem passar pela dependência de autenticação.

    As dependências e rotas síncronas rodam no threadpool com uma cópia do contexto, então um
    `set_locale` feito lá não chega ao handler de erros nem a outras dependências. Uma consulta
    por chave indexada aqui resolve isso na task certa. Falhas viram "sem idioma de conta".
    """
    try:
        from sqlalchemy import select

        from app.core.config import settings
        from app.core.db import SessionLocal
        from app.core.security import hash_token
        from app.models.user import AuthSession, User

        raw = None
        for k, v in scope.get("headers") or []:
            if k == b"cookie":
                for part in v.decode("latin-1", "ignore").split(";"):
                    name, _sep, val = part.strip().partition("=")
                    if name == settings.SESSION_COOKIE_NAME and val:
                        raw = val
                        break
                break
        if not raw:
            return None
        with SessionLocal() as db:
            row = db.execute(
                select(User.locale)
                .join(AuthSession, AuthSession.user_id == User.id)
                .where(AuthSession.token_hash == hash_token(raw), AuthSession.revoked_at.is_(None))
            ).first()
        return row[0] if row else None
    except Exception:  # noqa: BLE001 - idioma é auxiliar; nunca derruba a requisição
        return None


class LocaleMiddleware:
    """Define o idioma da requisição na mesma task da aplicação: conta (cookie de sessão) ou
    Accept-Language. Um `BaseHTTPMiddleware` rodaria `call_next` em outra task e o contextvar
    não chegaria às rotas nem ao handler de erros."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        header = None
        for k, v in scope.get("headers") or []:
            if k == b"accept-language":
                header = v.decode("latin-1", "ignore")
                break
        locale = normalize_locale(_account_locale(scope)) or from_accept_language(header) or DEFAULT
        token = _current.set(locale)
        try:
            await self.app(scope, receive, send)
        finally:
            _current.reset(token)
