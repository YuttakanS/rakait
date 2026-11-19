"""Store scrapers and the registry mapping merchant slugs to them."""

from __future__ import annotations

from pricewatch.scrapers.banana import BananaScraper
from pricewatch.scrapers.base import StoreScraper
from pricewatch.scrapers.fetcher import FetchError, PoliteFetcher
from pricewatch.scrapers.ihavecpu import IhavecpuScraper
from pricewatch.scrapers.itcity import ItcityScraper
from pricewatch.scrapers.jib import JibScraper

SCRAPERS: dict[str, type[StoreScraper]] = {
    JibScraper.merchant: JibScraper,
    IhavecpuScraper.merchant: IhavecpuScraper,
    BananaScraper.merchant: BananaScraper,
    ItcityScraper.merchant: ItcityScraper,
}

#: Stores left out of a default ``pricewatch scrape``, with why and since when.
#: The scraper stays registered, so ``--store <slug>`` still runs it to check
#: whether the store has become reachable again. This is the only place a store
#: is paused; remove its entry to resume it.
PAUSED_STORES: dict[str, str] = {
    BananaScraper.merchant: "Cloudflare bot challenge since 2026-11-17",
}


def active_stores() -> list[str]:
    """Return the registered stores that are not paused, sorted by slug."""
    return sorted(store for store in SCRAPERS if store not in PAUSED_STORES)


__all__ = [
    "PAUSED_STORES",
    "SCRAPERS",
    "BananaScraper",
    "FetchError",
    "IhavecpuScraper",
    "ItcityScraper",
    "JibScraper",
    "PoliteFetcher",
    "StoreScraper",
    "active_stores",
]
