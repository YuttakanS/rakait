"""Store scrapers and the registry mapping merchant slugs to them."""

from __future__ import annotations

from pricewatch.scrapers.base import StoreScraper
from pricewatch.scrapers.fetcher import FetchError, PoliteFetcher
from pricewatch.scrapers.jib import JibScraper

SCRAPERS: dict[str, type[StoreScraper]] = {
    JibScraper.merchant: JibScraper,
}

__all__ = ["SCRAPERS", "FetchError", "JibScraper", "PoliteFetcher", "StoreScraper"]
