"""O Tatá conversa (IA) e fala (voz natural), dentro das cotas do plano.

- Conversa: uma ação de IA por mensagem (`ai_daily_actions`/`ai_monthly_actions`, como as demais
  ações). O modelo recebe um retrato honesto dos dados da pessoa e responde curto, sem culpa e sem
  inventar números: tudo o que ele cita vem do contexto que montamos aqui.
- Voz: `tata_voice_monthly` falas por mês pela ElevenLabs; o áudio é guardado no armazenamento por
  hash do texto, então frases repetidas (balões padrão) não consomem cota nem crédito de novo.
  Sem cota ou sem chave, o app usa o sintetizador do aparelho.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import PlanLimit, RateLimited, ServiceUnavailable, ValidationFailed
from app.core.i18n import _, current_locale
from app.core.timeutil import today_in, utcnow
from app.integrations import elevenlabs
from app.integrations.storage import get_storage
from app.models.activity import Activity
from app.models.system import AiUsage
from app.models.user import User
from app.services import ai as ai_service
from app.services import balance as balance_service
from app.services import gamification, insights, revisions
from app.services.plans import get_entitlements

MAX_MESSAGE_CHARS = 1000
MAX_HISTORY = 8
MOODS = ("idle", "cheer", "encourage", "think", "love", "focus")

SYSTEM = """Você é o Tatá, mascote e companheiro de estudo do Estudatta (um cronômetro fofinho com um marcador de livro como cauda). Fale em português do Brasil, em 1 a 3 frases curtas, com carinho e leveza, sem culpa e sem cobrança. Trate a pessoa pelo primeiro nome quando fizer sentido.
Regras:
- Use SÓ os dados do bloco <dados>. Nunca invente números, datas, matérias ou resultados. Se não souber, diga que não sabe ou sugira onde ver no app.
- Não prometa aprovação, fluência ou resultado; o Estudatta organiza o estudo que a pessoa já faz.
- Se a pessoa estiver desanimada, acolha primeiro e sugira um passo pequeno (10–15 min).
- Pode sugerir ações concretas do app: começar sessão, registrar tempo, revisões de hoje, próxima matéria, distribuir pendência, planejar a semana.
- Assuntos fora de estudo/organização: responda gentilmente que você é só um companheiro de estudos.
Responda em JSON: {"reply": "...", "mood": "idle|cheer|encourage|think|love|focus"}."""


class TataReply(BaseModel):
    reply: str = Field(min_length=1, max_length=600)
    mood: str = "idle"


def _fmt_min(seconds: int) -> str:
    m = max(0, int(round(seconds / 60)))
    return f"{m // 60}h{m % 60:02d}" if m >= 60 else f"{m} min"


def build_context(db: Session, user: User) -> str:
    """Retrato curto e honesto do estudo da pessoa, para o modelo não inventar nada."""
    lines = [
        f"nome: {(user.name or '').strip() or 'sem nome'}",
        f"hoje: {today_in(user.timezone).isoformat()}",
    ]
    acts = list(
        db.execute(
            select(Activity).where(Activity.user_id == user.id, Activity.status == "active")
        ).scalars()
    )
    if not acts:
        lines.append("objetivos: nenhum criado ainda (sugira criar o primeiro em Objetivos)")
    for act in acts[:3]:
        try:
            bal = balance_service.activity_balance(db, act)
            t = bal.today
            lines.append(
                f"objetivo '{act.title}': meta de hoje {_fmt_min(t.target)}, registrado hoje {_fmt_min(t.logged)}, "
                f"falta hoje {_fmt_min(t.missing_today)}, pendência de dias anteriores {_fmt_min(t.pending_prior)}, "
                f"dia de descanso: {'sim' if t.is_rest else 'não'}"
            )
            ins = insights.activity_insights(db, user, act)
            nxt = ins.get("next_subject")
            if nxt:
                lines.append(
                    f"  próxima matéria sugerida: {nxt['subject_title']}"
                    + (f" · {nxt['topic_title']}" if nxt.get("topic_title") else "")
                )
            cov = ins.get("coverage") or {}
            if cov.get("topics_total"):
                lines.append(
                    f"  edital: {cov['topics_studied']} de {cov['topics_total']} tópicos estudados"
                )
        except Exception:  # noqa: BLE001 - contexto é auxiliar
            lines.append(f"objetivo '{act.title}'")
    try:
        summ = revisions.summary(db, user)
        lines.append(
            f"revisões: {summ.get('overdue', 0)} atrasadas, {summ.get('due_today', 0)} para hoje"
        )
    except Exception:  # noqa: BLE001
        pass
    try:
        prof = gamification.profile(db, user)
        rec = prof.get("records") or {}
        lines.append(
            f"nível {prof['level']['number']} ({prof['level']['title']}), {prof['xp']} XP, sequência atual {rec.get('current_streak', 0)} dias, "
            f"melhor sequência {rec.get('best_streak', 0)} dias, esta semana {_fmt_min(rec.get('this_week_seconds', 0))}"
        )
    except Exception:  # noqa: BLE001
        pass
    return "\n".join(lines)


def chat(db: Session, user: User, message: str, history: list[dict]) -> tuple[str, str]:
    """Uma mensagem → (resposta, humor). Conta como ação de IA."""
    msg = (message or "").strip()
    if not msg:
        raise ValidationFailed("Escreva uma mensagem.", code="empty_message")
    if len(msg) > MAX_MESSAGE_CHARS:
        raise ValidationFailed(
            "Mensagem longa demais (até 1000 caracteres).", code="message_too_long"
        )
    hist = [
        h
        for h in history[-MAX_HISTORY:]
        if h.get("role") in ("user", "tata") and (h.get("text") or "").strip()
    ]
    convo = "\n".join(
        f"{'Pessoa' if h['role'] == 'user' else 'Tatá'}: {h['text'].strip()[:600]}" for h in hist
    )
    prompt = f"<dados>\n{build_context(db, user)}\n</dados>\n\n"
    system = SYSTEM
    if current_locale() == "en":
        system += "\nIMPORTANT: the person uses the app in English. Write the reply in natural English (keep the same warmth and rules)."
    if convo:
        prompt += f"Conversa até aqui:\n{convo}\n\n"
    prompt += f"Pessoa: {msg}\nTatá:"
    parsed, _unused = ai_service._call(  # noqa: SLF001 - mesma cota e registro das outras ações
        db,
        user,
        "tata_chat",
        system=system,
        prompt=prompt,
        schema=TataReply,
        max_tokens=300,
        input_chars=len(msg),
    )
    mood = parsed.mood if parsed.mood in MOODS else "idle"
    return parsed.reply.strip(), mood


# --- Voz -------------------------------------------------------------------------------------


def voice_limit(db: Session, user: User) -> int:
    v = get_entitlements(db, user.id).limit("tata_voice_monthly")
    try:
        return max(0, int(v)) if v is not None else 0
    except (TypeError, ValueError):
        return 0


def _month_start() -> date:
    return utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def voice_used(db: Session, user_id: uuid.UUID | None) -> int:
    start = _month_start()
    q = (
        select(func.count())
        .select_from(AiUsage)
        .where(AiUsage.action == "tata_voice", AiUsage.status == "ok", AiUsage.created_at >= start)
    )
    if user_id is not None:
        q = q.where(AiUsage.user_id == user_id)
    return int(db.execute(q).scalar_one())


def status(db: Session, user: User) -> dict:
    ai = ai_service.status(db, user)
    limit = voice_limit(db, user)
    used = voice_used(db, user.id)
    return {
        "chat_enabled": ai["enabled"] and ai["reason"] is None,
        "chat_reason": ai["reason"],
        "chat_remaining_today": ai["remaining_today"],
        "chat_remaining_month": ai["remaining_this_month"],
        "voice_natural": settings.voice_available and limit > 0 and used < limit,
        "voice_limit_month": limit,
        "voice_used_month": used,
    }


def _cache_key(text: str) -> str:
    h = hashlib.sha256(
        f"{settings.ELEVENLABS_VOICE_ID}|{settings.ELEVENLABS_MODEL}|{text}".encode()
    ).hexdigest()
    return f"tata-voice/{h[:2]}/{h}.mp3"


def speak(db: Session, user: User, text: str) -> bytes:
    """MP3 da fala. Frases já geradas vêm do cache sem gastar cota; novas contam uma fala."""
    t = " ".join((text or "").split())
    if not t:
        raise ValidationFailed("Nada para falar.", code="empty_text")
    if len(t) > settings.TATA_VOICE_MAX_CHARS:
        raise ValidationFailed("Texto longo demais para a voz.", code="text_too_long")
    if not settings.voice_available:
        raise ServiceUnavailable("A voz natural não está configurada.", code="voice_disabled")
    storage = get_storage()
    key = _cache_key(t)
    if storage.exists(key):
        return storage.get(key)
    limit = voice_limit(db, user)
    if limit <= 0:
        raise PlanLimit("Seu plano não inclui a voz natural do Tatá.", code="voice_plan")
    used = voice_used(db, user.id)
    if used >= limit:
        raise RateLimited(
            _(
                "Você usou as {n} falas com voz natural deste mês. A voz do aparelho continua funcionando.",
                n=limit,
            ),
            code="voice_quota",
            details={"limit": limit, "used": used},
        )
    if voice_used(db, None) >= settings.TATA_VOICE_GLOBAL_MONTHLY:
        raise RateLimited("O limite mensal de voz do serviço foi atingido.", code="voice_budget")
    try:
        audio = elevenlabs.synthesize(t)
    except elevenlabs.VoiceError as exc:
        db.add(
            AiUsage(
                user_id=user.id,
                action="tata_voice",
                status="failed",
                input_chars=len(t),
                error_code=exc.code,
                created_at=utcnow(),
            )
        )
        db.commit()
        raise ServiceUnavailable(exc.message, code=exc.code) from exc
    storage.put(key, audio, "audio/mpeg")
    db.add(
        AiUsage(
            user_id=user.id,
            action="tata_voice",
            status="ok",
            model=settings.ELEVENLABS_MODEL,
            input_chars=len(t),
            created_at=utcnow(),
        )
    )
    db.commit()
    return audio
