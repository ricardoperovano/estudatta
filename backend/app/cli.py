"""Comandos de operação: `python -m app.cli <comando>`.

create-admin --email E [--password P]   cria administrador (senha pedida com segurança se omitida)
promote --email E                       promove usuário existente a administrador
seed-demo [--force] [--password P]      cenário de demonstração (só com DEMO_MODE=true ou --force)
ensure-plans                            garante o catálogo inicial de planos
vapid                                   gera par de chaves VAPID e imprime as variáveis para .env
"""

from __future__ import annotations

import argparse
import base64
import getpass
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.errors import ApiError
from app.core.timeutil import utcnow


def _fail(message: str, code: int = 1) -> int:
    print(f"erro: {message}", file=sys.stderr)
    return code


def cmd_create_admin(args: argparse.Namespace) -> int:
    from app.services import auth as auth_service

    password = args.password
    if not password:
        if not sys.stdin.isatty():
            return _fail("informe --password ou execute em um terminal interativo.")
        password = getpass.getpass("Senha do administrador: ")
        confirm = getpass.getpass("Confirme a senha: ")
        if password != confirm:
            return _fail("as senhas não conferem.")
    with SessionLocal() as db:
        try:
            user = auth_service.create_user(
                db,
                email=args.email,
                password=password,
                name=args.name or "Admin",
                email_verified=True,
            )
        except ApiError as exc:
            return _fail(exc.message)
        user.role = "admin"
        user.onboarding_completed_at = utcnow()
        db.commit()
        print(f"Administrador criado: {user.email} ({user.id})")
    return 0


def cmd_promote(args: argparse.Namespace) -> int:
    from app.models.user import User
    from app.services.auth import normalize_email

    with SessionLocal() as db:
        user = db.execute(
            select(User).where(User.email == normalize_email(args.email))
        ).scalar_one_or_none()
        if user is None:
            return _fail("usuário não encontrado.")
        if user.role == "admin":
            print(f"{user.email} já é administrador.")
            return 0
        user.role = "admin"
        db.commit()
        print(f"{user.email} promovido a administrador.")
    return 0


def cmd_seed_demo(args: argparse.Namespace) -> int:
    from app.services.demo import seed_demo
    from app.services.plans import ensure_default_plans

    if not settings.DEMO_MODE and not args.force:
        return _fail(
            "seed-demo só roda com DEMO_MODE=true (ou --force). Dados de demonstração ficam "
            "separados do uso real.",
            2,
        )
    if settings.is_production and not args.force:
        return _fail("em produção, use --force explicitamente.", 2)
    with SessionLocal() as db:
        ensure_default_plans(db)
        result = seed_demo(db, password=args.password)
        db.commit()
    for k, v in result.items():
        if k == "password":
            continue
        print(f"{k}: {v}")
    if result.get("password"):
        print(f"senha gerada (mostrada uma única vez): {result['password']}")
    elif result["user_created"] is False and not args.password:
        print("usuário já existia; a senha não foi alterada (use --password para redefinir).")
    return 0


def cmd_ensure_plans(_: argparse.Namespace) -> int:
    from app.services.plans import ensure_default_plans

    with SessionLocal() as db:
        ensure_default_plans(db)
        db.commit()
    print("Catálogo de planos garantido (free, pro).")
    return 0


def generate_vapid_keys() -> tuple[str, str]:
    """Par VAPID (P-256) no formato base64url sem padding aceito por `pywebpush`."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid01

    v = Vapid01()
    v.generate_keys()
    public = v.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    private = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
    return b64(public), b64(private)


def cmd_vapid(_: argparse.Namespace) -> int:
    public, private = generate_vapid_keys()
    print("# Cole no .env (a chave privada é segredo; nunca versione):")
    print(f"VAPID_PUBLIC_KEY={public}")
    print(f"VAPID_PRIVATE_KEY={private}")
    print(f"VAPID_SUBJECT={settings.VAPID_SUBJECT}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Operação do Estudatta")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-admin", help="cria um administrador")
    p.add_argument("--email", required=True)
    p.add_argument("--password", help="se omitida, é pedida sem eco no terminal")
    p.add_argument("--name", default="Admin")
    p.set_defaults(func=cmd_create_admin)

    p = sub.add_parser("promote", help="promove usuário existente a administrador")
    p.add_argument("--email", required=True)
    p.set_defaults(func=cmd_promote)

    p = sub.add_parser("seed-demo", help="cria o cenário de demonstração (idempotente)")
    p.add_argument("--force", action="store_true", help="roda mesmo sem DEMO_MODE=true")
    p.add_argument("--password", help="senha do usuário demo (padrão: gerada e exibida uma vez)")
    p.set_defaults(func=cmd_seed_demo)

    p = sub.add_parser("ensure-plans", help="garante o catálogo inicial de planos")
    p.set_defaults(func=cmd_ensure_plans)

    p = sub.add_parser("vapid", help="gera chaves VAPID para Web Push")
    p.set_defaults(func=cmd_vapid)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
