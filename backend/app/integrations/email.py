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


def send_email(
    to: str, subject: str, text: str, html: str | None = None, headers: dict[str, str] | None = None
) -> bool:
    return get_backend().send(
        OutgoingEmail(to=to, subject=subject, text=text, html=html, headers=headers or {})
    )


# --- Modelo visual (tema claro da marca; tabelas e estilos inline para Gmail/Outlook) -----------

_FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def _asset(path: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}{path}"


def _button(label: str, url: str) -> str:
    return (
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px">'
        f'<tr><td style="border-radius:12px;background:#5d5294">'
        f'<a href="{url}" style="display:inline-block;padding:13px 22px;font-family:{_FONT};font-size:15px;'
        f'font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">{label}</a></td></tr></table>'
    )


def _layout(
    title: str,
    body_html: str,
    *,
    cta: tuple[str, str] | None = None,
    footer_note: str | None = None,
    unsubscribe_url: str | None = None,
    tata: bool = True,
) -> str:
    tata_html = (
        f'<img src="{_asset("/marca/tata-email.png")}" width="88" height="97" alt="Tatá, o mascote do Estudatta" '
        'style="display:block;border:0;margin:0 0 12px">'
        if tata
        else ""
    )
    unsub = (
        f' <a href="{unsubscribe_url}" style="color:#75798c;text-decoration:underline">Não quero receber estes lembretes</a>.'
        if unsubscribe_url
        else ""
    )
    note = (
        footer_note
        or "Você recebeu este e-mail porque tem uma conta no Estudatta. Se não foi você, ignore esta mensagem."
    )
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{title}</title></head>
<body style="margin:0;padding:0;background:#f3f5fe">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5fe"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
<tr><td style="padding:0 6px 16px">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td><img src="{_asset("/marca/logo-claro-128.png")}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px"></td>
<td style="padding-left:10px;font-family:{_FONT};font-size:18px;font-weight:600;color:#292b31;letter-spacing:-0.2px">Estudatta</td>
</tr></table></td></tr>
<tr><td style="background:#ffffff;border-radius:20px;border:1px solid #e4e7f5;padding:28px 28px 24px">
{tata_html}
<h1 style="margin:0 0 12px;font-family:{_FONT};font-size:24px;line-height:1.2;font-weight:600;color:#292b31;letter-spacing:-0.3px">{title}</h1>
<div style="font-family:{_FONT};font-size:15px;line-height:1.6;color:#595d6c">{body_html}</div>
{_button(*cta) if cta else ""}
</td></tr>
<tr><td style="padding:18px 10px 0;font-family:{_FONT};font-size:12px;line-height:1.5;color:#75798c">{note}{unsub}</td></tr>
</table></td></tr></table></body></html>"""


def send_verification_email(to: str, link: str) -> bool:
    text = f"Oi! Confirme seu e-mail no Estudatta acessando: {link}\n\nO link vale por 24 horas."
    html = _layout(
        "Confirme seu e-mail",
        '<p style="margin:0 0 10px">Que bom ter você por aqui! Para deixar sua conta pronta, confirme seu e-mail.</p>'
        '<p style="margin:0">O link vale por 24 horas.</p>',
        cta=("Confirmar e-mail", link),
    )
    return send_email(to, "Confirme seu e-mail · Estudatta", text, html)


def send_password_reset_email(to: str, link: str) -> bool:
    text = f"Para redefinir sua senha no Estudatta, acesse: {link}\n\nO link vale por 1 hora. Se você não pediu, ignore."
    html = _layout(
        "Redefinir senha",
        '<p style="margin:0 0 10px">Recebemos um pedido para redefinir sua senha.</p>'
        '<p style="margin:0">O link vale por 1 hora. Se não foi você, é só ignorar: sua senha continua a mesma.</p>',
        cta=("Criar nova senha", link),
        tata=False,
    )
    return send_email(to, "Redefinir senha · Estudatta", text, html)


def send_weekly_summary_email(to: str, summary_text: str) -> bool:
    html = _layout(
        "Resumo da semana",
        f'<p style="margin:0">{summary_text}</p>',
        cta=("Ver relatório completo", f"{settings.APP_URL.rstrip('/')}/app/relatorio"),
    )
    return send_email(to, "Resumo da semana · Estudatta", summary_text, html)


def send_nudge_email(to: str, *, title: str, body: str, url: str, unsubscribe_url: str) -> bool:
    """Lembrete de retorno (sem objetivo / dias sem estudar), com descadastro de um clique."""
    text = f"{body}\n\nAbrir o Estudatta: {url}\n\nNão quer mais estes lembretes? {unsubscribe_url}"
    html = _layout(
        title,
        f'<p style="margin:0">{body}</p>',
        cta=("Abrir o Estudatta", url),
        footer_note="Você recebe este lembrete porque ativou os lembretes de retorno no Estudatta.",
        unsubscribe_url=unsubscribe_url,
    )
    return send_email(
        to,
        f"{title} · Estudatta",
        text,
        html,
        headers={
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )


def send_campaign_email(
    to: str, *, title: str, body: str, url: str, cta_label: str, unsubscribe_url: str
) -> bool:
    """Campanha do administrador (dicas, desconto, chamada de volta). Parágrafos por linha em branco."""
    paras = [p.strip() for p in body.split("\n\n") if p.strip()]
    html_body = "".join(
        f'<p style="margin:0 0 12px">{p.replace(chr(10), "<br>")}</p>' for p in paras
    )
    text = f"{body}\n\n{cta_label}: {url}\n\nNão quer mais receber? {unsubscribe_url}"
    html = _layout(
        title,
        html_body,
        cta=(cta_label, url),
        footer_note="Você recebe este e-mail porque tem uma conta no Estudatta.",
        unsubscribe_url=unsubscribe_url,
    )
    return send_email(
        to,
        title,
        text,
        html,
        headers={
            "List-Unsubscribe": f"<{unsubscribe_url}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )
