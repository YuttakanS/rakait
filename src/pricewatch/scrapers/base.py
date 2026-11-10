"""Common interface implemented by every store scraper."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.fetcher import PoliteFetcher


class StoreScraper(ABC):
    """Scrapes listing pages of a single merchant.

    Subclasses set ``merchant`` to the merchant slug and implement
    :meth:`scrape_category`.

    Args:
        fetcher: Rate-limited HTTP client dedicated to this merchant.
    """

    merchant: ClassVar[str]

    def __init__(self, fetcher: PoliteFetcher) -> None:
        """Bind the scraper to its fetcher."""
        self._fetcher = fetcher

    @classmethod
    @abstractmethod
    def supported_categories(cls) -> frozenset[Category]:
        """Return the categories this scraper knows how to crawl."""

    @abstractmethod
    async def scrape_category(
        self, category: Category, *, max_pages: int | None = None
    ) -> list[ScrapedListing]:
        """Scrape every listing in ``category``.

        Args:
            category: Hardware category to crawl.
            max_pages: Optional cap on listing pages fetched.

        Returns:
            All listings found, de-duplicated by merchant SKU.
        """
