"""Scraper for JIB (https://www.jib.co.th).

JIB serves fully rendered category pages of up to 100 product cards each. Every
card carries the price, cumulative view and sold counters, spec bullets and
stock state, so one request per 100 products is enough and product pages never
need to be fetched.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import ClassVar

from pydantic import ValidationError
from selectolax.lexbor import LexborHTMLParser, LexborNode

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.base import StoreScraper

logger = logging.getLogger(__name__)

BASE_URL = "https://www.jib.co.th/web/product/product_list"

# Category -> "<menu level>/<category id>" path segments on jib.co.th. A
# category maps to several paths when JIB has no single page for it.
CATEGORY_PATHS: dict[Category, tuple[str, ...]] = {
    Category.GPU: ("2/51",),
    Category.CPU: ("2/43",),
    Category.RAM: ("2/53",),  # Desktop RAM; notebook (2/30) and NAS RAM are excluded.
    # Internal SSDs only: 2.5" SATA and M.2. The parent page (2/52) mixes in
    # hard disks, and portable SSDs (3/1358) are a different product class.
    Category.SSD: ("3/1028", "3/1471"),
}

_SKU_RE = re.compile(r"/readProduct/(\d+)")
_VIEWS_RE = re.compile(r"([\d,]+)\s*views", re.IGNORECASE)
_SOLD_RE = re.compile(r"([\d,]+)\s*sold", re.IGNORECASE)
_PRICE_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
_WHITESPACE_RE = re.compile(r"\s+")


class JibParseError(Exception):
    """Raised when a listing page does not look like a JIB product list."""


def parse_listing_page(
    html: str, category: Category, scraped_at: datetime
) -> tuple[list[ScrapedListing], str | None]:
    """Parse one JIB category page.

    Runs in O(n) over the document: a single lexbor parse followed by one pass
    over the product cards.

    Args:
        html: Raw page HTML.
        category: Category the page belongs to.
        scraped_at: Timestamp to stamp on every listing.

    Returns:
        The listings on the page and the absolute URL of the next page, or
        ``None`` on the last page.

    Raises:
        JibParseError: If the page has product cards but none could be parsed,
            which means the markup changed.
    """
    tree = LexborHTMLParser(html)
    cards = tree.css("div.divboxpro")
    listings: list[ScrapedListing] = []
    for card in cards:
        listing = _parse_card(card, category, scraped_at)
        if listing is not None:
            listings.append(listing)

    if cards and not listings:
        raise JibParseError(f"found {len(cards)} product cards but parsed none; markup changed?")

    next_link = tree.css_first('ul.pagination a[rel="next"]')
    next_url = next_link.attributes.get("href") if next_link is not None else None
    return listings, next_url or None


def _parse_card(
    card: LexborNode, category: Category, scraped_at: datetime
) -> ScrapedListing | None:
    """Parse one product card, returning ``None`` (and logging) if it is malformed."""
    link = card.css_first('a[href*="/readProduct/"]')
    name = card.css_first("span.promo_name")
    href = link.attributes.get("href") if link is not None else None
    sku_match = _SKU_RE.search(href) if href else None
    if href is None or sku_match is None or name is None:
        logger.warning("skipping JIB card without product link or name")
        return None

    price_node = card.css_first("p.price_total")
    box_node = card.css_first("div.boxprice")
    desc_node = card.css_first("div.description")
    buy_node = card.css_first("div.buy_promo")
    box_text = box_node.text() if box_node is not None else ""

    try:
        return ScrapedListing(
            merchant=JibScraper.merchant,
            merchant_sku=sku_match.group(1),
            category=category,
            title=_collapse(name.text()),
            url=href,  # type: ignore[arg-type]  # validated and coerced by pydantic
            spec_text=_clean_spec_text(desc_node.text()) if desc_node is not None else None,
            price=_parse_price(price_node.text()) if price_node is not None else None,
            view_count=_parse_counter(_VIEWS_RE, box_text),
            sold_count=_parse_counter(_SOLD_RE, box_text),
            # In-stock cards carry the `cart_modal` buy button; sold-out cards
            # use `ct_add` with the label "สินค้าหมดชั่วคราว".
            in_stock=buy_node is not None
            and "cart_modal" in (buy_node.attributes.get("class") or ""),
            scraped_at=scraped_at,
        )
    except ValidationError as exc:
        logger.warning("skipping invalid JIB card %s: %s", sku_match.group(1), exc)
        return None


def _collapse(text: str) -> str:
    """Collapse all whitespace runs to single spaces."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def _clean_spec_text(text: str) -> str | None:
    """Normalise the spec bullet block to one trimmed bullet per line."""
    lines = [_collapse(line).lstrip("•").strip() for line in text.splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return cleaned or None


def _parse_price(text: str) -> Decimal | None:
    """Parse a price such as ``"9,590.-"``; JIB shows ``"N/A.-"`` when it has none."""
    match = _PRICE_RE.search(text)
    if match is None:
        return None
    try:
        return Decimal(match.group(0).replace(",", "").rstrip("."))
    except InvalidOperation:
        return None


def _parse_counter(pattern: re.Pattern[str], text: str) -> int | None:
    """Extract a thousands-separated counter such as ``"418,108 views"``."""
    match = pattern.search(text)
    return int(match.group(1).replace(",", "")) if match else None


class JibScraper(StoreScraper):
    """Crawls JIB category listing pages."""

    merchant: ClassVar[str] = "jib"

    @classmethod
    def supported_categories(cls) -> frozenset[Category]:
        """Return the categories with a known JIB category path."""
        return frozenset(CATEGORY_PATHS)

    async def scrape_category(
        self, category: Category, *, max_pages: int | None = None
    ) -> list[ScrapedListing]:
        """Scrape every listing in ``category`` by following "next" links.

        Args:
            category: Hardware category to crawl.
            max_pages: Optional cap on listing pages fetched per JIB category
                path (a category may span several paths).

        Returns:
            All listings found, de-duplicated by merchant SKU (first seen wins).

        Raises:
            ValueError: If ``category`` has no known JIB path.
            FetchError: If a page could not be fetched.
            JibParseError: If a page's markup could not be parsed.
        """
        if category not in CATEGORY_PATHS:
            raise ValueError(f"JIB scraper does not support category {category.value!r}")

        visited: set[str] = set()
        by_sku: dict[str, ScrapedListing] = {}

        for path in CATEGORY_PATHS[category]:
            url: str | None = f"{BASE_URL}/{path}"
            pages = 0
            while url is not None and url not in visited:
                if max_pages is not None and pages >= max_pages:
                    break
                visited.add(url)
                html = await self._fetcher.get_text(url)
                listings, url = parse_listing_page(html, category, datetime.now(timezone.utc))
                pages += 1
                new = 0
                for listing in listings:
                    if listing.merchant_sku not in by_sku:
                        by_sku[listing.merchant_sku] = listing
                        new += 1
                logger.info(
                    "jib %s %s page %d: %d cards, %d new",
                    category.value,
                    path,
                    pages,
                    len(listings),
                    new,
                )
                if new == 0:
                    break  # Empty or repeated page: the site ran out of products.

        return list(by_sku.values())
