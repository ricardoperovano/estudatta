"""Templates de mensagens por tom. O núcleo não consome IA para lembretes."""

from __future__ import annotations

Tone = str  # acolhedor | direto | firme


def fmt_minutes(seconds: int) -> str:
    minutes = max(0, int(round(seconds / 60)))
    if minutes >= 120:
        h, m = divmod(minutes, 60)
        return f"{h}h{m:02d}" if m else f"{h}h"
    return f"{minutes} min"


def _name(activity_title: str | None, show_name: bool) -> str:
    return activity_title if (activity_title and show_name) else "seu estudo"


def render(
    kind: str, tone: Tone, *, activity_title: str | None, show_name: bool, **ctx
) -> tuple[str, str]:
    """Retorna (título, corpo)."""
    name = _name(activity_title, show_name)
    tone = tone if tone in ("acolhedor", "direto", "firme") else "acolhedor"
    remaining = fmt_minutes(ctx.get("remaining_seconds", 0))
    missing = fmt_minutes(ctx.get("missing_seconds", 0))
    pending = fmt_minutes(ctx.get("pending_seconds", 0))
    time_str = ctx.get("time_str", "")
    days = ctx.get("days_without", 0)

    if kind == "planned_start":
        title = {
            "acolhedor": "Hora de começar?",
            "direto": "Sessão planejada",
            "firme": "Horário reservado",
        }[tone]
        body = {
            "acolhedor": f"Você reservou {time_str} para {name}. Que tal começar com 15 minutos?",
            "direto": f"{time_str}: sessão de {name}. Faltam {missing} para a meta de hoje.",
            "firme": f"Você reservou {time_str} para {name}. Comece a sessão agora ou reagende.",
        }[tone]
    elif kind == "follow_up":
        title = {
            "acolhedor": "Ainda dá tempo",
            "direto": "Meta de hoje em aberto",
            "firme": "Meta de hoje pendente",
        }[tone]
        body = {
            "acolhedor": f"Hoje dá para retomar. Vamos começar com 15 minutos de {name}?",
            "direto": f"Faltam {missing} para sua meta de hoje em {name}.",
            "firme": f"Faltam {missing} para a meta de hoje. Registre uma sessão ou ajuste o plano.",
        }[tone]
    elif kind == "end_of_window":
        title = {
            "acolhedor": "O dia está acabando",
            "direto": "Fim da janela de estudo",
            "firme": "Janela de estudo encerrando",
        }[tone]
        body = {
            "acolhedor": f"Ainda faltam {remaining} hoje. Se estudou e esqueceu de registrar, registre depois — a pendência se ajusta.",
            "direto": f"Faltam {remaining} para fechar hoje ({missing} da meta + recuperação).",
            "firme": f"Faltam {remaining} para fechar hoje. Sem registro, esse tempo entra como pendência amanhã.",
        }[tone]
    elif kind == "goal_completed":
        title = "Meta de hoje cumprida"
        body = {
            "acolhedor": f"Meta de hoje cumprida em {name}. Bom trabalho — descanse ou siga se quiser.",
            "direto": f"Meta de hoje cumprida em {name}.",
            "firme": f"Meta de hoje cumprida em {name}. Pendência restante: {pending}.",
        }[tone]
    elif kind == "resume":
        title = {
            "acolhedor": "Retomar de onde parou?",
            "direto": "Sem registros há alguns dias",
            "firme": "Plano parado",
        }[tone]
        body = {
            "acolhedor": f"Faz {days} dias sem registro em {name}. Hoje dá para retomar — 15 minutos já ajudam.",
            "direto": f"{days} dias sem registro em {name}. Pendência: {pending}. Retome ou reorganize o plano.",
            "firme": f"{days} dias sem registro em {name}. Há {pending} a recuperar. Comece uma sessão ou revise a meta.",
        }[tone]
    elif kind == "no_goal":
        title = {
            "acolhedor": "O Tatá está te esperando",
            "direto": "Falta criar seu objetivo",
            "firme": "Primeiro passo: um objetivo",
        }[tone]
        body = {
            "acolhedor": "Que tal criar seu primeiro objetivo? Leva dois minutos: você diz o que quer estudar e quanto tempo por dia, e o plano de hoje aparece pronto.",
            "direto": "Crie um objetivo (o que estudar e quantos minutos por dia) e o Estudatta monta o plano de hoje.",
            "firme": "Sem objetivo, não há plano. Crie o seu agora: o que estudar, quantos minutos, em quais dias.",
        }[tone]
    elif kind == "inactive":
        title = {
            "acolhedor": "Sentimos sua falta",
            "direto": f"{days} dias sem estudar",
            "firme": "Hora de voltar ao plano",
        }[tone]
        if days >= 14:
            body = {
                "acolhedor": f"Faz {days} dias. Tudo bem: recomeçar também é parte do caminho. Seu plano está guardado — que tal 10 minutos hoje?",
                "direto": f"{days} dias sem registro. Seus dados continuam lá. Uma sessão curta hoje já recoloca o plano em movimento.",
                "firme": f"{days} dias parado. Escolha um horário hoje e faça 10 minutos. O resto o plano reorganiza.",
            }[tone]
        else:
            body = {
                "acolhedor": f"Faz {days} dias que você não estuda. Sem culpa: 15 minutos hoje já contam, e o Tatá guardou seu lugar.",
                "direto": f"{days} dias sem sessão registrada. Comece com 15 minutos hoje; a pendência se ajusta.",
                "firme": f"{days} dias sem estudar. Abra o app e faça uma sessão curta hoje.",
            }[tone]
    elif kind == "weekly_summary":
        title = "Resumo da semana"
        body = ctx.get("summary_text", "")
    elif kind == "session_review":
        title = "Sessão precisa de revisão"
        body = ctx.get(
            "summary_text",
            "Uma sessão longa ficou aberta. Confirme a duração antes de contar no saldo.",
        )
    else:
        title = ctx.get("title", "Estudatta")
        body = ctx.get("body", "")
    return title, body
