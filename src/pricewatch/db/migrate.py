"""Versioned, forward-only SQL migration runner.

Migrations are plain ``NNNN_name.sql`` files applied in lexicographic order.
Each runs in its own transaction together with its bookkeeping row, so a
failed migration leaves no partial schema behind. A SHA-256 checksum of every
applied file is stored and re-verified on each run to catch edits to
migrations that already shipped.
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

import asyncpg

logger = logging.getLogger(__name__)

DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "migrations"

_FILENAME_RE = re.compile(r"^(\d{4})_[a-z0-9_]+\.sql$")
# Arbitrary constant identifying this application's migration advisory lock.
_ADVISORY_LOCK_KEY = 7_403_118_256

_BOOKKEEPING_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


class MigrationError(Exception):
    """Raised when the migration directory or database state is inconsistent."""


def discover_migrations(directory: Path) -> list[tuple[str, Path]]:
    """List migration files in ``directory`` in application order.

    Args:
        directory: Directory containing ``NNNN_name.sql`` files.

    Returns:
        ``(version, path)`` pairs sorted by version.

    Raises:
        MigrationError: If a ``.sql`` file is misnamed or a version repeats.
    """
    migrations: dict[str, Path] = {}
    for path in sorted(directory.glob("*.sql")):
        match = _FILENAME_RE.match(path.name)
        if match is None:
            raise MigrationError(f"migration file name must match NNNN_name.sql: {path.name}")
        version = match.group(1)
        if version in migrations:
            raise MigrationError(
                f"duplicate migration version {version}: {migrations[version].name} and {path.name}"
            )
        migrations[version] = path
    return sorted(migrations.items())


def _checksum(sql: str) -> str:
    """Hash migration text, ignoring line-ending differences across platforms."""
    return hashlib.sha256(sql.replace("\r\n", "\n").encode("utf-8")).hexdigest()


async def apply_migrations(
    conn: asyncpg.Connection, directory: Path = DEFAULT_MIGRATIONS_DIR
) -> list[str]:
    """Apply every pending migration.

    A session-level advisory lock serialises concurrent runners.

    Args:
        conn: Open database connection.
        directory: Directory containing the migration files.

    Returns:
        Versions applied by this call, in order.

    Raises:
        MigrationError: If an applied migration was edited or is missing.
    """
    migrations = discover_migrations(directory)
    await conn.execute("SELECT pg_advisory_lock($1)", _ADVISORY_LOCK_KEY)
    try:
        await conn.execute(_BOOKKEEPING_DDL)
        rows = await conn.fetch("SELECT version, checksum FROM schema_migrations")
        applied: dict[str, str] = {row["version"]: row["checksum"] for row in rows}

        known = {version for version, _ in migrations}
        missing = sorted(set(applied) - known)
        if missing:
            raise MigrationError(f"applied migrations missing from {directory}: {missing}")

        newly_applied: list[str] = []
        for version, path in migrations:
            sql = path.read_text(encoding="utf-8")
            checksum = _checksum(sql)
            if version in applied:
                if applied[version] != checksum:
                    raise MigrationError(
                        f"migration {path.name} was modified after being applied; "
                        "add a new migration instead"
                    )
                continue
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO schema_migrations (version, filename, checksum) "
                    "VALUES ($1, $2, $3)",
                    version,
                    path.name,
                    checksum,
                )
            logger.info("applied migration %s", path.name)
            newly_applied.append(version)
        return newly_applied
    finally:
        await conn.execute("SELECT pg_advisory_unlock($1)", _ADVISORY_LOCK_KEY)
