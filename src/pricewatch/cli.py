"""Command-line entry point: ``pricewatch migrate`` and ``pricewatch scrape``."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from collections.abc import Sequence

from pricewatch.models import Category
from pricewatch.pipeline import StoreResult, run_scrape
from pricewatch.scrapers import SCRAPERS


def _database_url() -> str:
    """Return ``DATABASE_URL`` from the environment or exit with a clear message."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set (see .env.example)")
    return url


async def _migrate() -> int:
    """Apply pending migrations."""
    from pricewatch.db import connect
    from pricewatch.db.migrate import apply_migrations

    conn = await connect(_database_url())
    try:
        applied = await apply_migrations(conn)
    finally:
        await conn.close()
    print(f"applied {len(applied)} migration(s): {', '.join(applied) or 'none pending'}")
    return 0


async def _scrape(
    stores: Sequence[str], categories: Sequence[Category], max_pages: int | None, dry_run: bool
) -> int:
    """Scrape and either print a summary (dry run) or persist the results."""
    database_url = None if dry_run else _database_url()
    results: list[StoreResult] = await run_scrape(stores, categories, max_pages=max_pages)

    for result in results:
        in_stock = sum(1 for item in result.listings if item.in_stock)
        print(f"{result.store}: {len(result.listings)} listings ({in_stock} in stock)")
        for error in result.errors:
            print(f"  ERROR {error}", file=sys.stderr)
        if dry_run:
            for item in result.listings[:5]:
                print(
                    f"  {item.merchant_sku:>8}  {item.price!s:>10}  "
                    f"views={item.view_count} sold={item.sold_count}  {item.title[:60]}"
                )

    listings = [item for result in results for item in result.listings]
    runs = [run for result in results for run in result.runs]
    if database_url is not None:
        from pricewatch.db import connect
        from pricewatch.db.repository import record_scrape_runs, save_listings

        conn = await connect(database_url)
        try:
            written = await save_listings(conn, listings) if listings else 0
            logged = await record_scrape_runs(conn, runs)
        finally:
            await conn.close()
        print(f"wrote {written} price-history rows, {logged} scrape-run records")

    return 1 if any(result.errors for result in results) else 0


def main(argv: Sequence[str] | None = None) -> int:
    """Parse arguments and run the selected command.

    Args:
        argv: Argument vector; defaults to ``sys.argv[1:]``.

    Returns:
        Process exit code: 0 on success, 1 if any store or category failed.
    """
    parser = argparse.ArgumentParser(prog="pricewatch", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true", help="log at INFO level")
    commands = parser.add_subparsers(dest="command", required=True)

    commands.add_parser("migrate", help="apply pending database migrations")

    scrape = commands.add_parser("scrape", help="scrape merchant listings")
    scrape.add_argument(
        "--store", action="append", choices=sorted(SCRAPERS), help="store to scrape (default: all)"
    )
    scrape.add_argument(
        "--category",
        action="append",
        choices=[category.value for category in Category],
        help="category to scrape (default: all a store supports)",
    )
    scrape.add_argument("--max-pages", type=int, help="cap on listing pages per category")
    scrape.add_argument(
        "--dry-run", action="store_true", help="print a summary instead of writing to the database"
    )

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # Windows consoles default to a legacy code page that cannot encode Thai titles.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if args.command == "migrate":
        return asyncio.run(_migrate())

    stores = args.store or sorted(SCRAPERS)
    categories = [Category(value) for value in args.category] if args.category else list(Category)
    return asyncio.run(_scrape(stores, categories, args.max_pages, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
