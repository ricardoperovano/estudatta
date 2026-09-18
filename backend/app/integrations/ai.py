"""Cliente HTTP para API de chat compatível com OpenAI (`POST {AI_BASE_URL}/chat/completions`).

- Modo sem credencial honesto: `AiError("ai_disabled")` quando `AI_ENABLED=false` ou sem chave.
- Sempre pede `response_format={"type": "json_object"}`; quem chama valida a saída com Pydantic.
- **Nunca** registra conteúdo do usuário nos logs — só metadados (modelo, latência, tokens, código de erro).
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass

import httpx

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("ai")


class AiError(Exception):
    def __init__(self, code: str, message: str | None = None):
        super().__init__(message or code)
        self.code = code
        self.message = message or code


@dataclass
class AiResult:
    data: dict
    model: str | None
    tokens_in: int | None
    tokens_out: int | None
    latency_ms: int


class AiClient:
    def complete_json(
        self, *, system: str, user: str, max_tokens: int | None = None
    ) -> AiResult:  # pragma: no cover - interface
        raise NotImplementedError


class HttpAiClient(AiClient):
    def __init__(self) -> None:
        self.base_url = settings.AI_BASE_URL.rstrip("/")
        self.api_key = settings.AI_API_KEY or ""
        self.model = settings.AI_MODEL
        self.timeout = settings.AI_TIMEOUT_SECONDS

    def complete_json(
        self, *, system: str, user: str, max_tokens: int | None = None
    ) -> AiResult:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": max_tokens or settings.AI_MAX_OUTPUT_TOKENS,
        }
        started = time.monotonic()
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )
        except httpx.TimeoutException as exc:
            log.warning("ai.timeout", model=self.model, timeout=self.timeout)
            raise AiError("ai_timeout", "O serviço de IA demorou demais para responder.") from exc
        except httpx.HTTPError as exc:
            log.warning("ai.network_error", model=self.model, error=type(exc).__name__)
            raise AiError("ai_unavailable", "Não foi possível falar com o serviço de IA.") from exc
        latency = int((time.monotonic() - started) * 1000)
        if resp.status_code == 429:
            log.warning("ai.rate_limited", model=self.model, status=resp.status_code)
            raise AiError("ai_rate_limited", "O serviço de IA está ocupado. Tente em instantes.")
        if resp.status_code >= 400:
            log.warning("ai.http_error", model=self.model, status=resp.status_code)
            raise AiError("ai_unavailable", "O serviço de IA recusou a solicitação.")
        try:
            body = resp.json()
            content = body["choices"][0]["message"]["content"]
            data = json.loads(content)
            if not isinstance(data, dict):
                raise ValueError("saída não é um objeto")
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            log.warning("ai.bad_output", model=self.model, latency_ms=latency)
            raise AiError("ai_bad_output", "A resposta da IA veio em formato inesperado.") from exc
        usage = body.get("usage") or {}
        log.info(
            "ai.completion",
            model=body.get("model") or self.model,
            latency_ms=latency,
            tokens_in=usage.get("prompt_tokens"),
            tokens_out=usage.get("completion_tokens"),
        )
        return AiResult(
            data=data,
            model=body.get("model") or self.model,
            tokens_in=usage.get("prompt_tokens"),
            tokens_out=usage.get("completion_tokens"),
            latency_ms=latency,
        )


def get_client() -> AiClient:
    """Fábrica (testes substituem por um cliente falso via monkeypatch)."""
    if not settings.ai_available:
        raise AiError("ai_disabled", "Os recursos de IA não estão habilitados neste ambiente.")
    return HttpAiClient()
