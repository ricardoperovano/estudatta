"""Senhas (Argon2id), tokens opacos, CSRF."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Parâmetros conservadores (OWASP 2024): 19 MiB, t=2, p=1
_hasher = PasswordHasher(
    time_cost=2, memory_cost=19 * 1024, parallelism=1, hash_len=32, salt_len=16
)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        # Consome tempo similar para não revelar contas sem senha
        try:
            _hasher.verify(_hasher.hash("dummy-password"), "other")
        except VerifyMismatchError:
            pass
        return False
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def generate_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """Tokens são guardados apenas como SHA-256 (o valor cru só existe no cliente)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def hmac_sha256_hex(secret: str, message: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
