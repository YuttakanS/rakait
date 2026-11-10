"""Scraper for BaNANA (https://www.bnn.in.th).

BaNANA is a server-rendered Nuxt 2 site. Category pages render 24 product
cards each (``?page=N``) plus the category's total count ("95 รายการ"). A card
carries the name, a one-line spec summary, the price and an out-of-stock badge.
No view, sold or stock-quantity figures are published.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import ClassVar
from urllib.parse import urljoin, urlsplit

from pydantic import ValidationError
from selectolax.lexbor import LexborHTMLParser, LexborNode

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.base import StoreScraper

logger = logging.getLogger(__name__)

BASE_URL = "https://www.bnn.in.th"
_CATEGORY_ROOT = f"{BASE_URL}/th/p/computer-hardware-diy"

CATEGORY_URLS: dict[Category, str] = {
    Category.GPU: f"{_CATEGORY_ROOT}/graphic-card-computer-hardware-diy",
    Category.CPU: f"{_CATEGORY_ROOT}/cpu-computer-hardware-diy",
    Category.RAM: f"{_CATEGORY_ROOT}/ram-computer-hardware-diy",
    # The SSD sub-category omits M.2 drives, so crawl the parent and filter.
    Category.SSD: f"{_CATEGORY_ROOT}/harddisk-and-solid-state-drive-2",
}

# Product-name filters for categories that mix in other product classes.
_CATEGORY_FILTERS: dict[Category, Callable[[str], bool]] = {
    # "การ์ดเอสเอสดี" (M.2) and "เอสเอสดี" (SATA); portable drives excluded.
    Category.SSD: lambda name: "เอสเอสดี" in name and "พกพา" not in name,
    # Desktop modules only ("แรมพีซี"), matching the other merchants.
    Category.RAM: lambda name: "โน้ตบุ๊ค" not in name and "SO-DIMM" not in name.upper(),
}

_TOTAL_RE = re.compile(r"([\d,]+)\s*รายการ")
_SKU_RE = re.compile(r"_([a-z0-9]+)$")
_PRICE_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
_WHITESPACE_RE = re.compile(r"\s+")


class BananaParseError(Exception):
    """Raised when a page has product cards but none could be parsed."""


def parse_category_page(
    html: str,
    category: Category,
    scraped_at: datetime,
    seen_ids: set[str] | None = None,
) -> tuple[list[ScrapedListing], int | None]:
    """Parse one BaNANA category page.

    Args:
        html: Raw page HTML.
        category: Category the page belongs to.
        scraped_at: Timestamp to stamp on every listing.
        seen_ids: If given, every product id on the page is added to it,
            including products the category filter drops.

    Returns:
        The listings kept by the category filter, and the category's total
        product count if the page states one.

    Raises:
        BananaParseError: If cards are present but none could be parsed.
    """
    tree = LexborHTMLParser(html)
    cards = tree.css("a.product-item")
    keep = _CATEGORY_FILTERS.get(category)
    listings: list[ScrapedListing] = []
    parsed_any = False
    for card in cards:
        parsed = _parse_card(card, category, scraped_at)
        if parsed is None:
            continue
        parsed_any = True
        if seen_ids is not None:
            seen_ids.add(parsed.merchant_sku)
        if keep is None or keep(parsed.title):
            listings.append(parsed)

    if cards and not parsed_any:
        raise BananaParseError(f"found {len(cards)} product cards but parsed none")

    total = _TOTAL_RE.search(html)
    return listings, int(total.group(1).replace(",", "")) if total else None


def _parse_card(
    card: LexborNode, category: Category, scraped_at: datetime
) -> ScrapedListing | None:
    """Parse one product card, returning ``None`` (and logging) if malformed."""
    href = card.attributes.get("href")
    name_node = card.css_first(".product-name")
    if not href or name_node is None:
        logger.warning("skipping BaNANA card without link or name")
        return None
    path = urlsplit(href).path
    sku = _SKU_RE.search(path)
    if sku is None:
        logger.warning("skipping BaNANA card with unexpected URL %s", href)
        return None

    top = card.css_first(".product-item-top")
    spec_node = card.css_first(".product-short-attribute")
    price_node = card.css_first(".product-price .price")
    try:
        return ScrapedListing(
            merchant=BananaScraper.merchant,
            merchant_sku=sku.group(1),
            category=category,
            title=_collapse(name_node.text()),
            url=urljoin(BASE_URL, path),  # type: ignore[arg-type]
            spec_text=_spec_text(spec_node.text()) if spec_node is not None else None,
            price=_parse_price(price_node.text()) if price_node is not None else None,
            # Sold-out cards carry `-is-inactive` and a "สินค้าหมด" badge.
            in_stock="-is-inactive" not in ((top.attributes.get("class") or "") if top else ""),
            scraped_at=scraped_at,
        )
    except ValidationError as exc:
        logger.warning("skipping invalid BaNANA card %s: %s", sku.group(1), exc)
        return None


def _collapse(text: str) -> str:
    """Collapse all whitespace runs to single spaces."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def _spec_text(text: str) -> str | None:
    """Split the ``a | b | c`` spec summary into one item per line."""
    parts = [_collapse(part) for part in text.split("|")]
    return "\n".join(part for part in parts if part) or None


def _parse_price(text: str) -> Decimal | None:
    """Parse ``"฿17,290"``; zero or missing means no price."""
    match = _PRICE_RE.search(text)
    if match is None:
        return None
    try:
        price = Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
        return None
    return price if price > 0 else None


class BananaScraper(StoreScraper):
    """Crawls BaNANA category pages."""

    merchant: ClassVar[str] = "banana"

    @classmethod
    def supported_categories(cls) -> frozenset[Category]:
        """Return the categories with a known BaNANA URL."""
        return frozenset(CATEGORY_URLS)

    async def scrape_category(
        self, category: Category, *, max_pages: int | None = None
    ) -> list[ScrapedListing]:
        """Scrape every listing in ``category``: O(total / 24) requests.

        Args:
            category: Hardware category to crawl.
            max_pages: Optional cap on pages fetched.

        Returns:
            Listings kept by the category filter, de-duplicated by product code.

        Raises:
            ValueError: If ``category`` has no known BaNANA URL.
            FetchError: If a page could not be fetched.
            BananaParseError: If a page's markup could not be parsed.
        """
        if category not in CATEGORY_URLS:
            raise ValueError(f"BaNANA scraper does not support category {category.value!r}")

        base = CATEGORY_URLS[category]
        by_sku: dict[str, ScrapedListing] = {}
        seen_ids: set[str] = set()
        total: int | None = None
        page = 1
        while max_pages is None or page <= max_pages:
            url = base if page == 1 else f"{base}?page={page}"
            seen_before = len(seen_ids)
            listings, page_total = parse_category_page(
                await self._fetcher.get_text(url), category, datetime.now(timezone.utc), seen_ids
            )
            total = page_total if page_total is not None else total
            for listing in listings:
                by_sku.setdefault(listing.merchant_sku, listing)
            logger.info(
                "banana %s page %d: %d kept, %d/%s seen",
                category.value,
                page,
                len(listings),
                len(seen_ids),
                total,
            )
            if len(seen_ids) == seen_before or (total is not None and len(seen_ids) >= total):
                break  # Nothing new, or every product the site counts has been seen.
            page += 1

        if max_pages is None and total is not None and len(seen_ids) < total:
            logger.warning(
                "banana %s: saw %d of %d products; pagination may have changed",
                category.value,
                len(seen_ids),
                total,
            )
        return list(by_sku.values())
