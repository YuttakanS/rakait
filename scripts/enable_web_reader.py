"""Enable login for the read-only ``web_reader`` role and write the web app's URL.

Run once after migration 0011, with the owner connection in ``DATABASE_URL``::

    set -a; . ./.env; set +a; uv run python scripts/enable_web_reader.py

It generates a random password, runs ``ALTER ROLE web_reader WITH LOGIN
PASSWORD ...`` and writes ``web/.env.production.local`` (git-ignored) holding a
``DATABASE_URL`` for that role on the owner URL's host and port. Keep the
session pooler (5432): through the transaction pooler (6543) the Next.js
build, which prerenders pages concurrently, hung past its 60 s page limit and
got rows of the wrong query back. The password is never printed. Re-running
rotates it.
"""

from __future__ import annotations

import asyncio
import os
import secrets
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import asyncpg

ROLE = "web_reader"
OUT = Path(__file__).resolve().parents[1] / "web" / ".env.production.local"


def reader_url(owner_url: str, password: str) -> str:
    """Owner URL with the reader's credentials (same host and port).

    Supabase pooler user names carry the project ref (``postgres.<ref>``); the
    reader keeps the same suffix (``web_reader.<ref>``).
    """
    parts = urlsplit(owner_url)
    user = parts.username or ""
    suffix = user[user.index(".") :] if "." in user else ""
    host = parts.hostname or ""
    port = parts.port
    netloc = f"{ROLE}{suffix}:{quote(password, safe='')}@{host}" + (f":{port}" if port else "")
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


async def main() -> None:
    """Set a fresh password, verify a read as the role, write the env file."""
    owner_url = os.environ["DATABASE_URL"]
    password = secrets.token_urlsafe(32)
    conn = await asyncpg.connect(owner_url, statement_cache_size=0)
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", ROLE):
            raise SystemExit(f"role {ROLE} missing: run `pricewatch migrate` first")
        # Identifiers and passwords cannot be bind parameters in ALTER ROLE;
        # the password is URL-safe base64, so quote_literal is exact.
        literal = await conn.fetchval("SELECT quote_literal($1)", password)
        await conn.execute(f"ALTER ROLE {ROLE} WITH LOGIN PASSWORD {literal}")
    finally:
        await conn.close()

    url = reader_url(owner_url, password)
    check = await asyncpg.connect(url, statement_cache_size=0)
    try:
        n = await check.fetchval("SELECT count(*) FROM merchant_listings")
    finally:
        await check.close()
    OUT.write_text(f"DATABASE_URL={url}\n", encoding="utf-8")
    print(f"{ROLE} can log in and reads {n} listings; URL written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
