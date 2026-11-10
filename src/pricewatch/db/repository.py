"""Batch persistence of scraped listings."""

from __future__ import annotations

from collections.abc import Sequence

import asyncpg

from pricewatch.models import ScrapedListing
from pricewatch.pipeline import ScrapeRun

_STAGE_COLUMNS: tuple[str, ...] = (
    "merchant",
    "merchant_sku",
    "category",
    "title",
    "url",
    "spec_text",
    "price",
    "view_count",
    "sold_count",
    "in_stock",
    "scraped_at",
)

_CREATE_STAGE = """
CREATE TEMP TABLE listing_stage (
    merchant      TEXT NOT NULL,
    merchant_sku  TEXT NOT NULL,
    category      TEXT NOT NULL,
    title         TEXT NOT NULL,
    url           TEXT NOT NULL,
    spec_text     TEXT,
    price         NUMERIC(12, 2),
    view_count    BIGINT,
    sold_count    BIGINT,
    in_stock      BOOLEAN NOT NULL,
    scraped_at    TIMESTAMPTZ NOT NULL
) ON COMMIT DROP
"""

# One statement, one round trip: upsert the latest state, then append the
# observation to the ledger using the ids returned by the upsert.
_MERGE = """
WITH upserted AS (
    INSERT INTO merchant_listings AS l (
        merchant_id, merchant_sku, category, title, url, spec_text,
        current_price, view_count, sold_count, in_stock, last_scraped_at
    )
    SELECT m.id, s.merchant_sku, s.category, s.title, s.url, s.spec_text,
           s.price, s.view_count, s.sold_count, s.in_stock, s.scraped_at
    FROM listing_stage AS s
    JOIN merchants AS m ON m.slug = s.merchant
    ON CONFLICT (merchant_id, merchant_sku) DO UPDATE SET
        category        = EXCLUDED.category,
        title           = EXCLUDED.title,
        url             = EXCLUDED.url,
        spec_text       = EXCLUDED.spec_text,
        current_price   = EXCLUDED.current_price,
        view_count      = EXCLUDED.view_count,
        sold_count      = EXCLUDED.sold_count,
        in_stock        = EXCLUDED.in_stock,
        last_scraped_at = EXCLUDED.last_scraped_at
    WHERE l.last_scraped_at <= EXCLUDED.last_scraped_at
    RETURNING id, last_scraped_at, current_price, view_count, sold_count, in_stock
)
INSERT INTO price_history (listing_id, scraped_at, price, view_count, sold_count, in_stock)
SELECT id, last_scraped_at, current_price, view_count, sold_count, in_stock
FROM upserted
ON CONFLICT (listing_id, scraped_at) DO NOTHING
"""


class UnknownMerchantError(Exception):
    """Raised when listings reference a merchant slug absent from ``merchants``."""


async def save_listings(conn: asyncpg.Connection, listings: Sequence[ScrapedListing]) -> int:
    """Upsert listings and append one price-history row for each.

    The batch is streamed into a temporary table with ``COPY`` and merged with
    a single set-based statement, so cost is two round trips regardless of
    batch size instead of O(n) row-by-row commits. Everything runs in one
    transaction: either the whole batch lands or none of it.

    Args:
        conn: Open database connection.
        listings: Scraped listings; if a ``(merchant, merchant_sku)`` pair
            repeats, the latest ``scraped_at`` wins.

    Returns:
        Number of price-history rows written.

    Raises:
        UnknownMerchantError: If a listing's merchant slug is not registered.
    """
    latest: dict[tuple[str, str], ScrapedListing] = {}
    for listing in listings:
        key = (listing.merchant, listing.merchant_sku)
        current = latest.get(key)
        if current is None or listing.scraped_at >= current.scraped_at:
            latest[key] = listing
    if not latest:
        return 0

    records = [
        (
            item.merchant,
            item.merchant_sku,
            item.category.value,
            item.title,
            str(item.url),
            item.spec_text,
            item.price,
            item.view_count,
            item.sold_count,
            item.in_stock,
            item.scraped_at,
        )
        for item in latest.values()
    ]

    async with conn.transaction():
        known = await conn.fetch(
            "SELECT slug FROM merchants WHERE slug = ANY($1::text[])",
            list({merchant for merchant, _ in latest}),
        )
        unknown = {merchant for merchant, _ in latest} - {row["slug"] for row in known}
        if unknown:
            raise UnknownMerchantError(f"merchants not registered: {sorted(unknown)}")

        await conn.execute(_CREATE_STAGE)
        await conn.copy_records_to_table("listing_stage", records=records, columns=_STAGE_COLUMNS)
        status: str = await conn.execute(_MERGE)

    # asyncpg returns the command tag, e.g. "INSERT 0 42".
    return int(status.rsplit(" ", 1)[-1])


async def record_scrape_runs(conn: asyncpg.Connection, runs: Sequence[ScrapeRun]) -> int:
    """Append scrape-run log rows in one multi-row insert.

    Runs whose merchant slug is not registered are dropped by the join rather
    than failing the batch: the log must never be the reason a scrape fails.

    Args:
        conn: Open database connection.
        runs: Run records to store.

    Returns:
        Number of rows written.
    """
    if not runs:
        return 0
    status: str = await conn.execute(
        """
        INSERT INTO scrape_runs
            (merchant_id, category, started_at, finished_at, listing_count, error)
        SELECT m.id, r.category, r.started_at, r.finished_at, r.listing_count, r.error
        FROM unnest($1::text[], $2::text[], $3::timestamptz[], $4::timestamptz[],
                    $5::int[], $6::text[]) WITH ORDINALITY
             AS r (merchant, category, started_at, finished_at, listing_count, error, ord)
        JOIN merchants AS m ON m.slug = r.merchant
        ORDER BY r.ord  -- identity ids follow input order
        """,
        [run.store for run in runs],
        [run.category.value if run.category is not None else None for run in runs],
        [run.started_at for run in runs],
        [run.finished_at for run in runs],
        [run.listing_count for run in runs],
        [run.error for run in runs],
    )
    return int(status.rsplit(" ", 1)[-1])
