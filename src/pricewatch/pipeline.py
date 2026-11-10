"""Scrape orchestration with per-store failure isolation."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers import SCRAPERS, PoliteFetcher

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScrapeRun:
    """One attempt at scraping a single category of a single store.

    Attributes:
        store: Merchant slug.
        category: Category attempted, or ``None`` if the store failed before
            any category was attempted.
        started_at: When the attempt began (UTC).
        finished_at: When the attempt ended (UTC).
        listing_count: Listings obtained; 0 on failure.
        error: Failure description, or ``None`` on success.
    """

    store: str
    category: Category | None
    started_at: datetime
    finished_at: datetime
    listing_count: int
    error: str | None = None


@dataclass
class StoreResult:
    """Outcome of scraping one store.

    Attributes:
        store: Merchant slug.
        listings: Listings gathered from every category that succeeded.
        runs: One record per category attempted, in order.
    """

    store: str
    listings: list[ScrapedListing] = field(default_factory=list)
    runs: list[ScrapeRun] = field(default_factory=list)

    @property
    def errors(self) -> list[str]:
        """Return one message per failed run, prefixed by its category if any."""
        return [
            f"{run.category.value}: {run.error}" if run.category is not None else run.error
            for run in self.runs
            if run.error is not None
        ]


def _now() -> datetime:
    """Return the current UTC time."""
    return datetime.now(timezone.utc)


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
            started_at = _now()
            error: str | None = None
            listings: list[ScrapedListing] = []
            try:
                listings = await scraper.scrape_category(category, max_pages=max_pages)
            except Exception as exc:  # noqa: BLE001 - one category must not sink the rest
                logger.exception("%s: scraping %s failed", store, category.value)
                error = f"{type(exc).__name__}: {exc}"
            result.listings.extend(listings)
            result.runs.append(
                ScrapeRun(
                    store=store,
                    category=category,
                    started_at=started_at,
                    finished_at=_now(),
                    listing_count=len(listings),
                    error=error,
                )
            )
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

    started_at = _now()
    outcomes = await asyncio.gather(
        *(_scrape_store(store, categories, max_pages) for store in stores),
        return_exceptions=True,
    )
    results: list[StoreResult] = []
    for store, outcome in zip(stores, outcomes, strict=True):
        if isinstance(outcome, BaseException):
            logger.error("%s: store scrape crashed: %r", store, outcome)
            crash = ScrapeRun(
                store=store,
                category=None,
                started_at=started_at,
                finished_at=_now(),
                listing_count=0,
                error=f"{type(outcome).__name__}: {outcome}",
            )
            results.append(StoreResult(store=store, runs=[crash]))
        else:
            results.append(outcome)
    return results
