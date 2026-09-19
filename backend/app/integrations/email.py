"""Envio de e-mail: Cloudflare Email Sending (API REST), SMTP, console (dev) ou memória (testes)."""

from __future__ import annotations

import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import parseaddr

import httpx

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("email")


@dataclass
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str | None = None
    headers: dict[str, str] = field(default_factory=dict)


class EmailBackend:
    def send(self, msg: OutgoingEmail) -> bool:  # pragma: no cover - interface
        raise NotImplementedError


class ConsoleBackend(EmailBackend):
    def send(self, msg: OutgoingEmail) -> bool:
        log.info("email.console", to=msg.to, subject=msg.subject, preview=msg.text[:200])
        return True


class MemoryBackend(EmailBackend):
    sent: list[OutgoingEmail] = []

    def send(self, msg: OutgoingEmail) -> bool:
        MemoryBackend.sent.append(msg)
        return True


class SmtpBackend(EmailBackend):
    def send(self, msg: OutgoingEmail) -> bool:
        em = EmailMessage()
        em["From"] = settings.EMAIL_FROM
        em["To"] = msg.to
        em["Subject"] = msg.subject
        for k, v in msg.headers.items():
            em[k] = v
        em.set_content(msg.text)
        if msg.html:
            em.add_alternative(msg.html, subtype="html")
        try:
            if settings.SMTP_TLS:
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
            with server:
                if settings.SMTP_STARTTLS:
                    server.starttls()
                if settings.SMTP_USER:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
                server.send_message(em)
            return True
        except Exception as exc:  # noqa: BLE001
            log.warning("email.smtp_failed", error=str(exc), to=msg.to)
            return False


CLOUDFLARE_SEND_URL = (
    "https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send"
)


class CloudflareBackend(EmailBackend):
    """Cloudflare Email Service (Email Sending) pela API REST. O domínio do remetente precisa
    estar em Compute → Email Service → Email Sending, na mesma conta do token."""

    def send(self, msg: OutgoingEmail) -> bool:
        if not (settings.CLOUDFLARE_ACCOUNT_ID and settings.CLOUDFLARE_EMAIL_API_TOKEN):
            log.warning("email.cloudflare_not_configured", to=msg.to)
            return False
        name, address = parseaddr(settings.EMAIL_FROM)
        payload: dict = {
            "from": {"address": address, "name": name or settings.APP_NAME},
            "to": msg.to,
            "subject": msg.subject,
            "text": msg.text,
        }
        if msg.html:
            payload["html"] = msg.html
        if msg.headers:
            payload["headers"] = msg.headers
        try:
            res = httpx.post(
                CLOUDFLARE_SEND_URL.format(account_id=settings.CLOUDFLARE_ACCOUNT_ID),
                json=payload,
                headers={"Authorization": f"Bearer {settings.CLOUDFLARE_EMAIL_API_TOKEN}"},
                timeout=20,
            )
            data = res.json() if res.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("email.cloudflare_failed", error=str(exc), to=msg.to)
            return False
        if res.status_code >= 400 or not data.get("success", False):
            log.warning(
                "email.cloudflare_failed",
                status=res.status_code,
                errors=data.get("errors"),
                to=msg.to,
            )
            return False
        if (data.get("result") or {}).get("permanent_bounces"):
            log.warning("email.cloudflare_bounced", to=msg.to)
            return False
        return True


def get_backend() -> EmailBackend:
    if settings.EMAIL_BACKEND == "cloudflare":
        return CloudflareBackend()
    if settings.EMAIL_BACKEND == "smtp":
        return SmtpBackend()
    if settings.EMAIL_BACKEND == "memory":
        return MemoryBackend()
    return ConsoleBackend()


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    return get_backend().send(OutgoingEmail(to=to, subject=subject, text=text, html=html))


def _layout(title: str, body_html: str) -> str:
    return f"""<!doctype html><html lang="pt-BR"><body style="margin:0;background:#161826;color:#e9e9ed;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:24px"><span style="font-weight:500;font-size:18px">Estudatta</span></div>
<h1 style="font-size:25px;font-weight:500;line-height:1.12;letter-spacing:-0.015em;margin:0 0 12px">{title}</h1>
<div style="font-size:15px;line-height:1.55;color:#b2b6ca">{body_html}</div>
<p style="font-size:12px;color:#9397ab;margin-top:32px">Você recebeu este e-mail porque tem uma conta no Estudatta. Se não foi você, ignore esta mensagem.</p>
</div></body></html>"""


def send_verification_email(to: str, link: str) -> bool:
    text = f"Confirme seu e-mail no Estudatta acessando: {link}\n\nO link vale por 24 horas."
    html = _layout(
        "Confirme seu e-mail",
        f'<p>Para ativar sua conta, confirme seu e-mail.</p><p><a href="{link}" style="display:inline-block;border:1px solid #9184d9;color:#9184d9;padding:10px 16px;border-radius:8px;text-decoration:none">Confirmar e-mail</a></p><p>O link vale por 24 horas.</p>',
    )
    return send_email(to, "Confirme seu e-mail · Estudatta", text, html)


def send_password_reset_email(to: str, link: str) -> bool:
    text = f"Para redefinir sua senha no Estudatta, acesse: {link}\n\nO link vale por 1 hora. Se você não pediu, ignore."
    html = _layout(
        "Redefinir senha",
        f'<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="{link}" style="display:inline-block;border:1px solid #9184d9;color:#9184d9;padding:10px 16px;border-radius:8px;text-decoration:none">Redefinir senha</a></p><p>O link vale por 1 hora. Se você não pediu, ignore esta mensagem.</p>',
    )
    return send_email(to, "Redefinir senha · Estudatta", text, html)


def send_weekly_summary_email(to: str, summary_text: str) -> bool:
    html = _layout(
        "Resumo da semana",
        f'<p>{summary_text}</p><p><a href="{settings.APP_URL}/app/relatorio" style="color:#9184d9">Ver relatório completo</a></p>',
    )
    return send_email(to, "Resumo da semana · Estudatta", summary_text, html)
