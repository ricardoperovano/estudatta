"""Erros de API consistentes: {"error": {"code", "message", "details"}}."""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.i18n import translate


class ApiError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any = None,
    ):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.details = details


class NotFound(ApiError):
    status_code = 404
    code = "not_found"


class Forbidden(ApiError):
    status_code = 403
    code = "forbidden"


class Unauthorized(ApiError):
    status_code = 401
    code = "unauthorized"


class Conflict(ApiError):
    status_code = 409
    code = "conflict"


class ValidationFailed(ApiError):
    status_code = 422
    code = "validation_failed"


class RateLimited(ApiError):
    status_code = 429
    code = "rate_limited"


class PlanLimit(ApiError):
    status_code = 402
    code = "plan_limit"


class ServiceUnavailable(ApiError):
    status_code = 503
    code = "service_unavailable"


def _payload(code: str, message: str, details: Any = None, request: Request | None = None) -> dict:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    rid = getattr(request.state, "request_id", None) if request is not None else None
    if rid:
        body["error"]["request_id"] = rid
    return body


async def _note(
    request: Request,
    *,
    level: str,
    code: str,
    message: str,
    status: int,
    detail: str | None = None,
) -> None:
    """Registra o erro/atrito para a página Saúde do admin (fora do loop de eventos)."""
    from starlette.concurrency import run_in_threadpool

    from app.services import health

    path = request.url.path
    if path.endswith("/client-errors"):
        return  # o próprio canal de relato não gera relato (evita laço)
    sess = getattr(request.state, "auth_session", None)
    await run_in_threadpool(
        health.record,
        source="server",
        level=level,
        code=code,
        message=message,
        path=path,
        method=request.method,
        status=status,
        user_id=getattr(sess, "user_id", None),
        request_id=getattr(request.state, "request_id", None),
        detail=detail,
    )


def _is_friction(status: int) -> bool:
    from app.services.health import FRICTION_STATUSES

    return status in FRICTION_STATUSES or status >= 500


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Exceção que escapou: responde no formato padrão (antes saía texto puro) e registra com a
    pilha, para aparecer no painel em vez de se perder no log do contêiner."""
    import traceback

    stack = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    await _note(
        request,
        level="error",
        code="internal_error",
        message=f"{type(exc).__name__}: {exc}",
        status=500,
        detail=stack[-6000:],
    )
    return JSONResponse(
        status_code=500,
        content=_payload(
            "internal_error",
            translate("Algo deu errado do nosso lado. Tente de novo em instantes."),
            None,
            request,
        ),
    )


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    if _is_friction(exc.status_code):
        await _note(
            request,
            level="error" if exc.status_code >= 500 and exc.status_code != 503 else "warning",
            code=exc.code,
            message=exc.message,
            status=exc.status_code,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(exc.code, translate(exc.message), exc.details, request),
    )


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = {
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        429: "rate_limited",
    }.get(exc.status_code, "http_error")
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(code, str(exc.detail), None, request),
        headers=getattr(exc, "headers", None),
    )


def _safe_errors(exc: RequestValidationError) -> list[dict]:
    """`ctx` de validadores próprios traz a exceção original (não serializável) e `input`
    devolveria o corpo enviado (pode conter senha): ficam de fora."""
    out = []
    for err in exc.errors():
        item = {k: v for k, v in err.items() if k not in ("ctx", "input", "url")}
        ctx = err.get("ctx")
        if isinstance(ctx, dict):
            clean = {k: v for k, v in ctx.items() if isinstance(v, str | int | float | bool)}
            if clean:
                item["ctx"] = clean
        out.append(item)
    return out


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    campos = ", ".join(
        sorted({".".join(str(x) for x in e.get("loc", ())[1:]) for e in exc.errors()})
    )
    await _note(
        request,
        level="warning",
        code="validation_failed",
        message=f"Dados inválidos: {campos}"[:500],
        status=422,
    )
    return JSONResponse(
        status_code=422,
        content=_payload(
            "validation_failed", "Dados inválidos.", jsonable_encoder(_safe_errors(exc)), request
        ),
    )
