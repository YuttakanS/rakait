"""Scrape orchestration with per-store failure isolation."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers import SCRAPERS, PoliteFetcher

logger = logging.getLogger(__name__)


@dataclass
class StoreResult:
    """Outcome of scraping one store.

    Attributes:
        store: Merchant slug.
        listings: Listings gathered from every category that succeeded.
        errors: One message per category (or the whole store) that failed.
    """

    store: str
    listings: list[ScrapedListing] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


async def _scrape_store(
    store: str, categories: Sequence[Category], max_pages: int | None
) -> StoreResult:
    """Scrape one store, isolating failures per category."""
    result = StoreResult(store=store)
    scraper_cls = SCRAPERS[store]
    supported = scraper_cls.supported_categories()
    async with PoliteFetcher() as fetcher:
        scraper = scraper_cls(fetcher)
        for category in categories:
            if category not in supported:
                logger.info("%s: category %s not supported, skipping", store, category.value)
                continue
            try:
                result.listings.extend(await scraper.scrape_category(category, max_pages=max_pages))
            except Exception as exc:  # noqa: BLE001 - one category must not sink the rest
                logger.exception("%s: scraping %s failed", store, category.value)
                result.errors.append(f"{category.value}: {type(exc).__name__}: {exc}")
    return result


async def run_scrape(
    stores: Sequence[str], categories: Sequence[Category], *, max_pages: int | None = None
) -> list[StoreResult]:
    """Scrape several stores concurrently.

    Each store gets its own rate-limited fetcher, so stores run in parallel
    while requests to any single host stay serialised. A store that fails
    yields a result carrying the error and never cancels the others.

    Args:
        stores: Merchant slugs; each must be a key of ``SCRAPERS``.
        categories: Categories to crawl in every store.
        max_pages: Optional cap on listing pages per category.

    Returns:
        One result per store, in input order.

    Raises:
        ValueError: If a store slug has no registered scraper.
    """
    unknown = [store for store in stores if store not in SCRAPERS]
    if unknown:
        raise ValueError(f"no scraper registered for: {unknown}")

    outcomes = await asyncio.gather(
        *(_scrape_store(store, categories, max_pages) for store in stores),
        return_exceptions=True,
    )
    results: list[StoreResult] = []
    for store, outcome in zip(stores, outcomes, strict=True):
        if isinstance(outcome, BaseException):
            logger.error("%s: store scrape crashed: %r", store, outcome)
            results.append(
                StoreResult(store=store, errors=[f"{type(outcome).__name__}: {outcome}"])
            )
        else:
            results.append(outcome)
    return results
