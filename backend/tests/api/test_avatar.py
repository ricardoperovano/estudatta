"""Foto de perfil: envio validado pelo conteúdo, versão para cache, remoção e isolamento."""

import io
import struct
import zlib

from tests.conftest import signup


def png(size=4) -> bytes:
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    raw = b"".join(b"\x00" + b"\x80\x40\xc0" * size for _ in range(size))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_avatar_upload_get_replace_delete(user_client, client):
    api = "/api/v1/me"
    assert user_client.get(f"{api}/avatar").status_code == 404
    assert user_client.get(api).json()["avatar_version"] is None
    r = user_client.put(
        f"{api}/avatar", files={"file": ("foto.png", io.BytesIO(png()), "image/png")}
    )
    assert r.status_code == 200, r.text
    assert r.json()["avatar_version"] == 1
    g = user_client.get(f"{api}/avatar")
    assert (
        g.status_code == 200
        and g.headers["content-type"] == "image/png"
        and g.content.startswith(b"\x89PNG")
    )
    assert "immutable" in g.headers["cache-control"]
    r = user_client.put(
        f"{api}/avatar", files={"file": ("foto.png", io.BytesIO(png(6)), "image/png")}
    )
    assert r.json()["avatar_version"] == 2
    assert user_client.get("/api/v1/auth/session").json()["user"]["avatar_version"] == 2
    # outra conta não vê a foto desta
    signup(client, email="outra@example.com")
    assert client.get(f"{api}/avatar").status_code == 404
    # conteúdo que não é imagem, mesmo com content-type de imagem
    r = user_client.put(
        f"{api}/avatar", files={"file": ("x.png", io.BytesIO(b"<html>oi</html>"), "image/png")}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "avatar_type"
    r = user_client.put(
        f"{api}/avatar",
        files={"file": ("x.png", io.BytesIO(b"\x89PNG" + b"0" * 400_000), "image/png")},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "avatar_too_large"
    r = user_client.delete(f"{api}/avatar")
    assert r.status_code == 200 and r.json()["avatar_version"] is None
    assert user_client.get(f"{api}/avatar").status_code == 404
