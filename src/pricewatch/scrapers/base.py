"""Common interface implemented by every store scraper."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar
from urllib.parse import urljoin

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


def absolute_image_url(src: str | None, base: str) -> str | None:
    """Resolve a card's image ``src`` against the merchant origin.

    Empty sources (lazy-load placeholders) and non-HTTP schemes (``data:``
    URIs) mean no usable image.

    Args:
        src: The ``src`` attribute or JSON field as served.
        base: The merchant origin, e.g. ``"https://www.jib.co.th"``.

    Returns:
        An absolute http(s) URL, or ``None``.
    """
    if not src or not src.strip():
        return None
    url = urljoin(base + "/", src.strip())
    return url if url.startswith(("http://", "https://")) else None
