"""Voz natural do Tatá pela ElevenLabs (texto → áudio MP3). Sem chave, `available()` é False e o
app usa o sintetizador do próprio aparelho."""

from __future__ import annotations

import httpx

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("voice.elevenlabs")
BASE = "https://api.elevenlabs.io/v1"


class VoiceError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def available() -> bool:
    return settings.voice_available


def synthesize(text: str, *, transport: httpx.BaseTransport | None = None) -> bytes:
    """Gera o MP3 (44.1 kHz, 64 kbps) para a fala. Levanta VoiceError com um código estável."""
    if not settings.voice_available:
        raise VoiceError("voice_disabled", "A voz natural não está configurada.")
    try:
        with httpx.Client(timeout=30, transport=transport) as client:
            res = client.post(
                f"{BASE}/text-to-speech/{settings.ELEVENLABS_VOICE_ID}",
                params={"output_format": "mp3_44100_64"},
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY or "", "Accept": "audio/mpeg"},
                json={
                    "text": text,
                    "model_id": settings.ELEVENLABS_MODEL,
                    "language_code": "pt",
                    "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35},
                },
            )
    except httpx.HTTPError as exc:
        log.warning("voice.network_error", error=type(exc).__name__)
        raise VoiceError("voice_unavailable", "Não foi possível gerar a voz agora.") from exc
    if res.status_code == 401:
        raise VoiceError("voice_unavailable", "A chave da voz foi recusada.")
    if res.status_code == 429:
        raise VoiceError("voice_busy", "O serviço de voz está ocupado.")
    if res.status_code >= 400:
        log.warning("voice.http_error", status=res.status_code, body=res.text[:200])
        raise VoiceError("voice_unavailable", "O serviço de voz recusou a solicitação.")
    return res.content
