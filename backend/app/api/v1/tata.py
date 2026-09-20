"""O Tatá: conversa com IA e voz natural, dentro das cotas do plano."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, rate_limit
from app.models.user import User
from app.services import tata as svc

router = APIRouter(prefix="/tata", tags=["tata"])


class HistoryItem(BaseModel):
    role: str = Field(pattern="^(user|tata)$")
    text: str = Field(max_length=1000)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[HistoryItem] = Field(default_factory=list, max_length=8)


class ChatOut(BaseModel):
    reply: str
    mood: str
    status: TataStatusOut


class TataStatusOut(BaseModel):
    chat_enabled: bool
    chat_reason: str | None
    chat_remaining_today: int
    chat_remaining_month: int | None
    voice_natural: bool
    voice_limit_month: int
    voice_used_month: int


class VoiceIn(BaseModel):
    text: str = Field(min_length=1, max_length=600)


@router.get("/status", response_model=TataStatusOut)
def tata_status(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TataStatusOut:
    return TataStatusOut(**svc.status(db, user))


@router.post(
    "/chat", response_model=ChatOut, dependencies=[Depends(rate_limit("tata_chat", 30, 600))]
)
def tata_chat(
    payload: ChatIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ChatOut:
    reply, mood = svc.chat(db, user, payload.message, [h.model_dump() for h in payload.history])
    return ChatOut(reply=reply, mood=mood, status=TataStatusOut(**svc.status(db, user)))


@router.post(
    "/voice", dependencies=[Depends(rate_limit("tata_voice", 60, 600))], response_class=Response
)
def tata_voice(
    payload: VoiceIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    """MP3 da fala. 402/429/503 com código: o app cai para a voz do aparelho."""
    audio = svc.speak(db, user, payload.text)
    return Response(
        content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"}
    )
