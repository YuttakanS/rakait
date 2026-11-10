"""Scraper for IHAVECPU (https://ihavecpu.com).

IHAVECPU is a Next.js site: each category page embeds its product list as JSON
in ``<script id="__NEXT_DATA__">``, 24 products per page (``?page=N``), along
with the category's total row count. Every product carries the sale price, the
exact units in stock and structured spec properties, so product pages never
need to be fetched. No view or sold counters are published.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, ClassVar

from pydantic import ValidationError

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.base import StoreScraper

logger = logging.getLogger(__name__)

BASE_URL = "https://ihavecpu.com"

CATEGORY_SLUGS: dict[Category, str] = {
    Category.GPU: "graphic-card",
    Category.CPU: "cpu",
    Category.RAM: "ram",
    Category.SSD: "storage",  # Mixed with hard disks; filtered below.
}

_NEXT_DATA_RE = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL)
_WHITESPACE_RE = re.compile(r"\s+")


def _is_ssd(name: str) -> bool:
    """Keep solid-state drives from the mixed ``storage`` category."""
    return "เอสเอสดี" in name or "SSD" in name.upper()


# Optional per-category filter applied to product names.
_CATEGORY_FILTERS: dict[Category, Callable[[str], bool]] = {Category.SSD: _is_ssd}


class IhavecpuParseError(Exception):
    """Raised when a page does not carry the expected Next.js product payload."""


def parse_category_page(
    html: str,
    category: Category,
    scraped_at: datetime,
    seen_ids: set[str] | None = None,
) -> tuple[list[ScrapedListing], int, int]:
    """Parse one IHAVECPU category page.

    Args:
        html: Raw page HTML.
        category: Category the page belongs to.
        scraped_at: Timestamp to stamp on every listing.
        seen_ids: If given, every product id on the page is added to it,
            including products the category filter drops.

    Returns:
        ``(listings, total_rows, page_size)``: the parsed listings after the
        category filter, the category's total product count and the number of
        products on this page before filtering (used to derive page count).

    Raises:
        IhavecpuParseError: If the ``__NEXT_DATA__`` payload is missing or does
            not have the expected shape.
    """
    match = _NEXT_DATA_RE.search(html)
    if match is None:
        raise IhavecpuParseError("no __NEXT_DATA__ payload; page layout changed or blocked?")
    try:
        product = json.loads(match.group(1))["props"]["pageProps"]["product"]
        items: list[dict[str, Any]] = product["data"]
        total_rows = int(product["row"])
    except (ValueError, KeyError, TypeError) as exc:
        raise IhavecpuParseError(f"unexpected __NEXT_DATA__ shape: {exc!r}") from exc

    keep = _CATEGORY_FILTERS.get(category)
    listings: list[ScrapedListing] = []
    for item in items:
        if seen_ids is not None and item.get("product_id") is not None:
            seen_ids.add(str(item["product_id"]))
        name = _collapse(str(item.get("name_th") or ""))
        if keep is not None and not keep(name):
            continue
        listing = _parse_item(item, name, category, scraped_at)
        if listing is not None:
            listings.append(listing)
    return listings, total_rows, len(items)


def _parse_item(
    item: dict[str, Any], name: str, category: Category, scraped_at: datetime
) -> ScrapedListing | None:
    """Convert one product object, returning ``None`` (and logging) if invalid."""
    product_id = item.get("product_id")
    if product_id is None or not name:
        logger.warning("skipping IHAVECPU item without id or name")
        return None
    stock = _parse_int(item.get("stock"))
    try:
        return ScrapedListing(
            merchant=IhavecpuScraper.merchant,
            merchant_sku=str(product_id),
            category=category,
            title=name,
            url=f"{BASE_URL}/product/{product_id}/{_slug(name)}",  # type: ignore[arg-type]
            spec_text=_spec_text(item.get("property")),
            price=_parse_price(item.get("price_sale")),
            in_stock=stock is not None and stock > 0,
            stock_quantity=stock,
            scraped_at=scraped_at,
        )
    except ValidationError as exc:
        logger.warning("skipping invalid IHAVECPU item %s: %s", product_id, exc)
        return None


def _collapse(text: str) -> str:
    """Collapse all whitespace runs to single spaces."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def _slug(name: str) -> str:
    """Build the site's readable URL slug; the server only routes on the numeric id."""
    return name.lower().replace(" ", "-")


def _parse_price(value: object) -> Decimal | None:
    """Parse a decimal string such as ``"5490.00"``; zero means "no price"."""
    if value is None:
        return None
    try:
        price = Decimal(str(value))
    except InvalidOperation:
        return None
    return price if price > 0 else None


def _parse_int(value: object) -> int | None:
    """Parse a non-negative integer such as ``"52"``; negatives clamp to zero."""
    try:
        return max(0, int(str(value)))
    except ValueError:
        return None


def _spec_text(properties: object) -> str | None:
    """Flatten ``property`` entries into ``"Name: value"`` lines."""
    if not isinstance(properties, list):
        return None
    lines: list[str] = []
    for prop in properties:
        if not isinstance(prop, dict):
            continue
        values = [
            _collapse(str(detail.get("name_gb") or detail.get("name_th") or ""))
            for detail in prop.get("detail") or []
            if isinstance(detail, dict)
        ]
        values = [value for value in values if value]
        label = _collapse(str(prop.get("name_th") or prop.get("filter_text") or ""))
        if label and values:
            lines.append(f"{label}: {', '.join(values)}")
    return "\n".join(lines) or None


class IhavecpuScraper(StoreScraper):
    """Crawls IHAVECPU category pages."""

    merchant: ClassVar[str] = "ihavecpu"

    @classmethod
    def supported_categories(cls) -> frozenset[Category]:
        """Return the categories with a known IHAVECPU slug."""
        return frozenset(CATEGORY_SLUGS)

    async def scrape_category(
        self, category: Category, *, max_pages: int | None = None
    ) -> list[ScrapedListing]:
        """Scrape every listing in ``category``.

        The site renders 24 products per page but advances only 12 per page
        number, so consecutive pages overlap by half. Pages are therefore read
        until one adds nothing new (or the page number alone would pass the
        total row count, a guard against an endless crawl): O(rows / 12)
        requests.

        Args:
            category: Hardware category to crawl.
            max_pages: Optional cap on pages fetched.

        Returns:
            All listings found, de-duplicated by product id (first seen wins).

        Raises:
            ValueError: If ``category`` has no known IHAVECPU slug.
            FetchError: If a page could not be fetched.
            IhavecpuParseError: If a page's payload could not be parsed.
        """
        if category not in CATEGORY_SLUGS:
            raise ValueError(f"IHAVECPU scraper does not support category {category.value!r}")

        base = f"{BASE_URL}/category/{CATEGORY_SLUGS[category]}"
        by_sku: dict[str, ScrapedListing] = {}
        seen_ids: set[str] = set()  # Includes items dropped by the category filter.
        total_rows = 0
        page = 1
        while max_pages is None or page <= max_pages:
            url = base if page == 1 else f"{base}?page={page}"
            html = await self._fetcher.get_text(url)
            listings, total_rows, page_size = parse_category_page(
                html, category, datetime.now(timezone.utc), seen_ids
            )
            new = 0
            for listing in listings:
                if listing.merchant_sku not in by_sku:
                    by_sku[listing.merchant_sku] = listing
                    new += 1
            logger.info(
                "ihavecpu %s page %d: %d on page, %d new kept, %d/%d seen",
                category.value,
                page,
                page_size,
                new,
                len(seen_ids),
                total_rows,
            )
            if page_size == 0 or len(seen_ids) >= total_rows or page > total_rows:
                break
            page += 1

        if max_pages is None and len(seen_ids) < total_rows:
            logger.warning(
                "ihavecpu %s: saw %d of %d products; pagination may have changed",
                category.value,
                len(seen_ids),
                total_rows,
            )
        return list(by_sku.values())
