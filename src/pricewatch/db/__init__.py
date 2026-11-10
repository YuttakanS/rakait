"""PostgreSQL persistence: connections, migrations and batch writers."""

from __future__ import annotations

from urllib.parse import urlsplit

import asyncpg

# Supabase's transaction-mode pooler (Supavisor) listens on 6543. It hands a
# different server connection to each transaction, so asyncpg's per-connection
# prepared-statement cache would reference statements that do not exist there.
_TRANSACTION_POOLER_PORT = 6543


async def connect(database_url: str) -> asyncpg.Connection:
    """Open a connection, disabling the statement cache behind a transaction pooler.

    Session-mode poolers (port 5432) and direct connections keep the cache,
    which saves a parse/plan round trip on every repeated query.

    Args:
        database_url: PostgreSQL connection URL.

    Returns:
        An open connection; the caller closes it.
    """
    behind_transaction_pooler = urlsplit(database_url).port == _TRANSACTION_POOLER_PORT
    return await asyncpg.connect(
        database_url, statement_cache_size=0 if behind_transaction_pooler else 100
    )
