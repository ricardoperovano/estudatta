"""Armazenamento privado de materiais: local (dev) ou compatível com S3 (produção).

Uploads nunca são servidos como HTML ativo: o download usa URL assinada temporária
e `Content-Disposition: attachment` (ou inline apenas para application/pdf).
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings


@dataclass
class StoredObject:
    key: str
    size: int


class StorageBackend:
    def put(
        self, key: str, data: bytes, content_type: str
    ) -> StoredObject:  # pragma: no cover - interface
        raise NotImplementedError

    def get(self, key: str) -> bytes:  # pragma: no cover
        raise NotImplementedError

    def delete(self, key: str) -> None:  # pragma: no cover
        raise NotImplementedError

    def exists(self, key: str) -> bool:  # pragma: no cover
        raise NotImplementedError

    def signed_url(
        self, key: str, *, filename: str, content_type: str, ttl: int
    ) -> str:  # pragma: no cover
        raise NotImplementedError


class LocalStorage(StorageBackend):
    def __init__(self, root: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents:
            raise ValueError("chave inválida")
        return p

    def put(self, key: str, data: bytes, content_type: str) -> StoredObject:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return StoredObject(key=key, size=len(data))

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def signed_url(self, key: str, *, filename: str, content_type: str, ttl: int) -> str:
        exp = int(time.time()) + ttl
        sig = sign_local(key, exp)
        from urllib.parse import quote

        return f"{settings.API_URL}/api/v1/files/{quote(key, safe='/')}?exp={exp}&sig={sig}"


def sign_local(key: str, exp: int) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), f"{key}:{exp}".encode(), hashlib.sha256
    ).hexdigest()


def verify_local(key: str, exp: int, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    return hmac.compare_digest(sign_local(key, exp), sig)


class S3Storage(StorageBackend):
    def __init__(self) -> None:
        import boto3

        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        )

    def put(self, key: str, data: bytes, content_type: str) -> StoredObject:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)
        return StoredObject(key=key, size=len(data))

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:  # noqa: BLE001
            return False

    def signed_url(self, key: str, *, filename: str, content_type: str, ttl: int) -> str:
        disposition = "inline" if content_type == "application/pdf" else "attachment"
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": f'{disposition}; filename="{filename}"',
                "ResponseContentType": content_type,
            },
            ExpiresIn=ttl,
        )


_backend: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _backend
    if _backend is None:
        if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
            _backend = S3Storage()
        else:
            _backend = LocalStorage(os.path.abspath(settings.STORAGE_LOCAL_PATH))
    return _backend
