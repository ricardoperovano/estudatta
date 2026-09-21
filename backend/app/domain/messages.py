"""Templates de mensagens por tom. O núcleo não consome IA para lembretes.

Os textos passam por `_()` (idioma da conta ou da requisição); os valores entram por `.format`.
"""

from __future__ import annotations

from app.core.i18n import _

Tone = str  # acolhedor | direto | firme


def fmt_minutes(seconds: int) -> str:
    minutes = max(0, int(round(seconds / 60)))
    if minutes >= 120:
        h, m = divmod(minutes, 60)
        return f"{h}h{m:02d}" if m else f"{h}h"
    return f"{minutes} min"


def _name(activity_title: str | None, show_name: bool) -> str:
    return activity_title if (activity_title and show_name) else _("seu estudo")


def render(
    kind: str, tone: Tone, *, activity_title: str | None, show_name: bool, **ctx
) -> tuple[str, str]:
    """Retorna (título, corpo)."""
    name = _name(activity_title, show_name)
    tone = tone if tone in ("acolhedor", "direto", "firme") else "acolhedor"
    v = {
        "name": name,
        "remaining": fmt_minutes(ctx.get("remaining_seconds", 0)),
        "missing": fmt_minutes(ctx.get("missing_seconds", 0)),
        "pending": fmt_minutes(ctx.get("pending_seconds", 0)),
        "time_str": ctx.get("time_str", ""),
        "days": ctx.get("days_without", 0),
    }
    days = v["days"]

    if kind == "planned_start":
        title = {
            "acolhedor": _("Hora de começar?"),
            "direto": _("Sessão planejada"),
            "firme": _("Horário reservado"),
        }[tone]
        body = {
            "acolhedor": _(
                "Você reservou {time_str} para {name}. Que tal começar com 15 minutos?", **v
            ),
            "direto": _("{time_str}: sessão de {name}. Faltam {missing} para a meta de hoje.", **v),
            "firme": _(
                "Você reservou {time_str} para {name}. Comece a sessão agora ou reagende.", **v
            ),
        }[tone]
    elif kind == "follow_up":
        title = {
            "acolhedor": _("Ainda dá tempo"),
            "direto": _("Meta de hoje em aberto"),
            "firme": _("Meta de hoje pendente"),
        }[tone]
        body = {
            "acolhedor": _("Hoje dá para retomar. Vamos começar com 15 minutos de {name}?", **v),
            "direto": _("Faltam {missing} para sua meta de hoje em {name}.", **v),
            "firme": _(
                "Faltam {missing} para a meta de hoje. Registre uma sessão ou ajuste o plano.", **v
            ),
        }[tone]
    elif kind == "end_of_window":
        title = {
            "acolhedor": _("O dia está acabando"),
            "direto": _("Fim da janela de estudo"),
            "firme": _("Janela de estudo encerrando"),
        }[tone]
        body = {
            "acolhedor": _(
                "Ainda faltam {remaining} hoje. Se estudou e esqueceu de registrar, registre depois — a pendência se ajusta.",
                **v,
            ),
            "direto": _(
                "Faltam {remaining} para fechar hoje ({missing} da meta + recuperação).", **v
            ),
            "firme": _(
                "Faltam {remaining} para fechar hoje. Sem registro, esse tempo entra como pendência amanhã.",
                **v,
            ),
        }[tone]
    elif kind == "goal_completed":
        title = _("Meta de hoje cumprida")
        body = {
            "acolhedor": _(
                "Meta de hoje cumprida em {name}. Bom trabalho — descanse ou siga se quiser.", **v
            ),
            "direto": _("Meta de hoje cumprida em {name}.", **v),
            "firme": _("Meta de hoje cumprida em {name}. Pendência restante: {pending}.", **v),
        }[tone]
    elif kind == "resume":
        title = {
            "acolhedor": _("Retomar de onde parou?"),
            "direto": _("Sem registros há alguns dias"),
            "firme": _("Plano parado"),
        }[tone]
        body = {
            "acolhedor": _(
                "Faz {days} dias sem registro em {name}. Hoje dá para retomar — 15 minutos já ajudam.",
                **v,
            ),
            "direto": _(
                "{days} dias sem registro em {name}. Pendência: {pending}. Retome ou reorganize o plano.",
                **v,
            ),
            "firme": _(
                "{days} dias sem registro em {name}. Há {pending} a recuperar. Comece uma sessão ou revise a meta.",
                **v,
            ),
        }[tone]
    elif kind == "no_goal":
        title = {
            "acolhedor": _("O Tatá está te esperando"),
            "direto": _("Falta criar seu objetivo"),
            "firme": _("Primeiro passo: um objetivo"),
        }[tone]
        body = {
            "acolhedor": _(
                "Que tal criar seu primeiro objetivo? Leva dois minutos: você diz o que quer estudar e quanto tempo por dia, e o plano de hoje aparece pronto."
            ),
            "direto": _(
                "Crie um objetivo (o que estudar e quantos minutos por dia) e o Estudatta monta o plano de hoje."
            ),
            "firme": _(
                "Sem objetivo, não há plano. Crie o seu agora: o que estudar, quantos minutos, em quais dias."
            ),
        }[tone]
    elif kind == "inactive":
        title = {
            "acolhedor": _("Sentimos sua falta"),
            "direto": _("{days} dias sem estudar", **v),
            "firme": _("Hora de voltar ao plano"),
        }[tone]
        if days >= 14:
            body = {
                "acolhedor": _(
                    "Faz {days} dias. Tudo bem: recomeçar também é parte do caminho. Seu plano está guardado — que tal 10 minutos hoje?",
                    **v,
                ),
                "direto": _(
                    "{days} dias sem registro. Seus dados continuam lá. Uma sessão curta hoje já recoloca o plano em movimento.",
                    **v,
                ),
                "firme": _(
                    "{days} dias parado. Escolha um horário hoje e faça 10 minutos. O resto o plano reorganiza.",
                    **v,
                ),
            }[tone]
        else:
            body = {
                "acolhedor": _(
                    "Faz {days} dias que você não estuda. Sem culpa: 15 minutos hoje já contam, e o Tatá guardou seu lugar.",
                    **v,
                ),
                "direto": _(
                    "{days} dias sem sessão registrada. Comece com 15 minutos hoje; a pendência se ajusta.",
                    **v,
                ),
                "firme": _(
                    "{days} dias sem estudar. Abra o app e faça uma sessão curta hoje.", **v
                ),
            }[tone]
    elif kind == "weekly_summary":
        title = _("Resumo da semana")
        body = ctx.get("summary_text", "")
    elif kind == "session_review":
        title = _("Sessão precisa de revisão")
        body = ctx.get(
            "summary_text",
            _("Uma sessão longa ficou aberta. Confirme a duração antes de contar no saldo."),
        )
    else:
        title = ctx.get("title", "Estudatta")
        body = ctx.get("body", "")
    return title, body
