"""Command-line entry point: ``pricewatch migrate`` and ``pricewatch scrape``."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from collections.abc import Sequence
from datetime import date, datetime

from pricewatch.models import Category, ScrapedListing
from pricewatch.pipeline import StoreResult, run_scrape
from pricewatch.quality import annotate_runs
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
    if database_url is None:
        runs = annotate_runs(runs, listings, {})
    else:
        from pricewatch.db import connect
        from pricewatch.db.repository import (
            recent_listing_counts,
            record_scrape_runs,
            save_listings,
        )

        conn = await connect(database_url)
        try:
            # Baselines are read before this run is logged, so it is compared
            # only with its predecessors.
            runs = annotate_runs(runs, listings, await recent_listing_counts(conn))
            written = await save_listings(conn, listings) if listings else 0
            logged = await record_scrape_runs(conn, runs)
        finally:
            await conn.close()
        print(f"wrote {written} price-history rows, {logged} scrape-run records")

    warned = [run for run in runs if run.warning is not None]
    for run in warned:
        category = run.category.value if run.category is not None else "-"
        print(f"  WARN {run.store}/{category}: {run.warning}", file=sys.stderr)
    # A warning still saves the data but fails the step, so the scheduled
    # workflow turns red and notifies, as it does for errors.
    return 1 if warned or any(result.errors for result in results) else 0


async def _train() -> int:
    """Fit every model on the current catalogue and persist the insights."""
    from pricewatch.db import connect
    from pricewatch.ml.train import FIGURES_DIR, train

    conn = await connect(_database_url())
    try:
        report = await train(conn)
    finally:
        await conn.close()
    ins = report.insights
    print(f"insights for {len(ins)} listings; figures in {FIGURES_DIR}")
    print(f"  fair price: {int(ins['fair_price'].notna().sum())} listings")
    print(f"  demand cluster: {int(ins['demand_cluster'].notna().sum())} listings")
    print(f"  recommendations: {ins['recommendation'].value_counts().to_dict()}")
    for (category, kind), payload in sorted(report.market.items()):
        headline = {
            k: round(v, 3) if isinstance(v, float) else v
            for k, v in payload.items()
            if k
            in {
                "slope_thb_per_unit",
                "r2",
                "r2_cv",
                "mape_cv",
                "n",
                "k",
                "silhouette",
                "ari_vs_kmeans",
                "cophenetic_corr",
                "accuracy_test",
                "baseline_accuracy_test",
                "leaves",
            }
        }
        print(f"  {category}/{kind}: {headline}")
    for note in report.notes:
        print(f"  note: {note}")
    return 0


async def _link() -> int:
    """Parse listing titles and link them to canonical products."""
    from pricewatch.db import connect
    from pricewatch.db.linking import link_listings

    conn = await connect(_database_url())
    try:
        summary = await link_listings(conn)
    finally:
        await conn.close()
    share = summary.linked / summary.listings if summary.listings else 0.0
    print(
        f"linked {summary.linked}/{summary.listings} listings ({share:.0%}) "
        f"to {summary.products} canonical products "
        f"({summary.by_similarity} by similarity fallback)"
    )
    return 0


async def _backfill(categories: Sequence[Category], since: date, dry_run: bool) -> int:
    """Import archived JIB snapshots and persist (or summarise) them."""
    from collections import Counter

    from pricewatch.backfill import backfill_jib

    database_url = None if dry_run else _database_url()
    listings = await backfill_jib(categories, since)
    per_month = Counter(item.scraped_at.strftime("%Y-%m") for item in listings)
    print(f"archive: {len(listings)} observations across {len(per_month)} months")
    for month, count in sorted(per_month.items()):
        print(f"  {month}: {count}")
    if database_url is not None and listings:
        from pricewatch.db import connect
        from pricewatch.db.repository import save_listings

        # save_listings keeps one observation per SKU per call (the latest), so
        # each archived snapshot is saved as its own batch to keep the history.
        snapshots: dict[datetime, list[ScrapedListing]] = {}
        for item in listings:
            snapshots.setdefault(item.scraped_at, []).append(item)
        conn = await connect(database_url)
        try:
            written = 0
            for _, batch in sorted(snapshots.items()):
                written += await save_listings(conn, batch)
        finally:
            await conn.close()
        print(f"wrote {written} price-history rows from {len(snapshots)} snapshots")
    return 0


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

    commands.add_parser("link", help="match listings to canonical products")
    commands.add_parser("train", help="fit the ML models and store listing/market insights")

    backfill = commands.add_parser(
        "backfill", help="import archived JIB listing pages from the Wayback Machine"
    )
    backfill.add_argument(
        "--since",
        type=date.fromisoformat,
        default=date(2024, 1, 1),
        help="earliest capture date, YYYY-MM-DD (default: 2024-01-01)",
    )
    backfill.add_argument(
        "--category",
        action="append",
        choices=[category.value for category in Category],
        help="category to backfill (default: all)",
    )
    backfill.add_argument(
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

    if args.command == "train":
        return asyncio.run(_train())

    if args.command == "link":
        return asyncio.run(_link())

    if args.command == "backfill":
        categories = (
            [Category(value) for value in args.category] if args.category else list(Category)
        )
        return asyncio.run(_backfill(categories, args.since, args.dry_run))

    stores = args.store or sorted(SCRAPERS)
    categories = [Category(value) for value in args.category] if args.category else list(Category)
    return asyncio.run(_scrape(stores, categories, args.max_pages, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
