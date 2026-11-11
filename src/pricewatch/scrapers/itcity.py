"""Scraper for IT City (https://www.itcity.in.th).

IT City is a Nuxt 2 site whose category pages render their product grid in the
browser, so they carry no products in the server HTML. Product pages, however,
are fully server-rendered (title, price, sold-out badge), and the site
publishes every product URL in ``sitemap-products.xml``. The crawl is
therefore two-stage:

1. Fetch the product sitemap once per scraper (one request, ~2,400 URLs) and
   pre-classify each URL by its slug, which embeds the product title.
2. Fetch only the candidate product pages of the requested category and
   re-classify by the rendered title, which is authoritative.

Breadcrumbs cannot be used for classification: they show a single,
inconsistently named level ("ซีพียู", "HDD-&-SSD", "COMPUTER-HARDWARE-(DIY)").
No view, sold or stock-quantity figures are published.

Cost: one request per candidate product, i.e. O(|candidates|) rather than
O(pages); at the default 2-3 s interval this is the slowest store per run.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import ClassVar
from urllib.parse import unquote, urlsplit

from pydantic import ValidationError
from selectolax.lexbor import LexborHTMLParser

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.base import StoreScraper, absolute_image_url

logger = logging.getLogger(__name__)

BASE_URL = "https://www.itcity.in.th"
SITEMAP_URL = f"{BASE_URL}/sitemap-products.xml"

_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>")
_SKU_RE = re.compile(r"_(PRD\d+)$")
_PRICE_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
_WHITESPACE_RE = re.compile(r"\s+")
_SOLD_OUT = "สินค้าหมด"

# Products that contain DIY parts but are not sold as one: whole systems,
# laptops, handhelds, external storage, mainboards and the Thai category
# prefixes for those. Mainboard titles rarely say "Mainboard" but always name
# a DDR generation and a socket, which the RAM rule rejects.
_NOT_A_PART = re.compile(
    r"NOTEBOOK|LAPTOP|\bNB\b|SO-?DIMM|DESKTOP|\bTOWER\b|\bAIO\b|ALL-IN-ONE|MINI\s*PC"
    r"|HANDHELD|\bXBOX\b|COMSET|\bSET\b|MONITOR|PORTABLE|EXTERNAL|ENCLOSURE|\bNAS\b"
    r"|\bDOCK|MAINBOARD|MOTHERBOARD|\bBY\s+ORDER\b|\b\d{2}(?:\.\d)?\s*(?:\"|INCH|นิ้ว)"
    r"|โน้ตบุ๊ก|โน้ตบุ๊ค|คอมพิวเตอร์|เมนบอร์ด|อุปกรณ์จัดเก็บข้อมูล|จอมอนิเตอร์",
    re.IGNORECASE,
)
_GPU = re.compile(
    r"\b(?:GEFORCE|RTX\s*\d{4}|GTX\s*\d{3,4}|RADEON|RX\s*\d{4}|ARC\s*[AB]\d{3})\b"
    r"|การ์ดจอ",
    re.IGNORECASE,
)
_CPU = re.compile(
    r"\b(?:RYZEN|CORE\s*I[3579]|CORE\s*ULTRA|ATHLON|PENTIUM|CELERON|THREADRIPPER|XEON)\b"
    r"|ซีพียู",
    re.IGNORECASE,
)
_RAM = re.compile(r"\bDDR[345]\b", re.IGNORECASE)
_SSD = re.compile(r"\b(?:SSD|NVME|M\.2)\b", re.IGNORECASE)
_CPU_WORD = re.compile(r"\bCPU\b|ซีพียู", re.IGNORECASE)
_SOCKET = re.compile(r"\b(?:LGA\s*\d{4}|AM[45])\b", re.IGNORECASE)


def classify(text: str) -> Category | None:
    """Assign a product title (or title-like URL slug) to a tracked category.

    Order matters: a CPU title names a socket, which also marks mainboards,
    so CPU is tested before RAM and RAM rejects socket-bearing titles. "GDDR7"
    cannot trip the RAM rule because of the word boundary. O(len(text)).

    Args:
        text: Product title, or a URL slug with separators turned into spaces.

    Returns:
        The category, or ``None`` if the product is not a tracked DIY part.
    """
    if _NOT_A_PART.search(text):
        return None
    if _GPU.search(text):
        return Category.GPU
    if _CPU.search(text):
        # Boxed desktop parts name a socket or say "CPU"; laptop and AIO
        # titles that only mention their processor do not.
        return Category.CPU if _SOCKET.search(text) or _CPU_WORD.search(text) else None
    if _RAM.search(text) and not _SOCKET.search(text):
        return Category.RAM
    if _SSD.search(text):
        return Category.SSD
    return None


def slug_text(url: str) -> str:
    """Turn a product URL into title-like text for :func:`classify`.

    ``.../product/AMD-RYZEN-7-9800X3D-AM5-(3Y)_PRD202508010066`` becomes
    ``"AMD RYZEN 7 9800X3D AM5 (3Y)"``.
    """
    slug = unquote(urlsplit(url).path.rsplit("/", 1)[-1])
    slug = _SKU_RE.sub("", slug)
    return slug.replace("-", " ").replace("_", " ")


def parse_sitemap(xml: str) -> list[str]:
    """Return the Thai product-page URLs listed in the product sitemap.

    A regex scan rather than an XML parse: the sitemap is ~1 MB of flat
    ``<url><loc>`` entries and the alternate-language links are attributes, so
    only ``<loc>`` text matters. O(len(xml)).
    """
    return [url for url in _LOC_RE.findall(xml) if _SKU_RE.search(urlsplit(url).path)]


def candidates(urls: Iterable[str], category: Category) -> list[str]:
    """Filter sitemap URLs to those whose slug classifies as ``category``."""
    return [url for url in urls if classify(slug_text(url)) is category]


class ItcityParseError(Exception):
    """Raised when a product page lacks the server-rendered product markup."""


def parse_product_page(html: str, url: str, scraped_at: datetime) -> ScrapedListing | None:
    """Parse one IT City product page.

    Args:
        html: Raw page HTML.
        url: The page URL; its ``_PRD...`` suffix is the merchant SKU.
        scraped_at: Timestamp to stamp on the listing.

    Returns:
        The listing, or ``None`` if its title is not a tracked DIY part.

    Raises:
        ItcityParseError: If the page has no product title or the URL no SKU.
    """
    path = urlsplit(url).path
    sku = _SKU_RE.search(path)
    tree = LexborHTMLParser(html)
    title_node = tree.css_first("h1.product-desc")
    if sku is None or title_node is None:
        raise ItcityParseError(f"no product markup on {url}")
    title = _collapse(title_node.text())
    category = classify(title)
    if category is None:
        return None

    price_node = tree.css_first("span.text-heading-1.color-dark-gray")
    image_node = tree.css_first('meta[property="og:image"]')
    # The badge is rendered twice (image overlay and buy box) and only when
    # sold out; neither the page chrome nor the hydration state contains it.
    sold_out = _SOLD_OUT in html
    try:
        return ScrapedListing(
            merchant=ItcityScraper.merchant,
            merchant_sku=sku.group(1),
            category=category,
            title=title,
            url=f"{BASE_URL}{path}",  # type: ignore[arg-type]
            price=_parse_price(price_node.text()) if price_node is not None else None,
            in_stock=not sold_out,
            image_url=absolute_image_url(  # type: ignore[arg-type]
                image_node.attributes.get("content") if image_node is not None else None,
                BASE_URL,
            ),
            scraped_at=scraped_at,
        )
    except ValidationError as exc:
        logger.warning("skipping invalid IT City product %s: %s", sku.group(1), exc)
        return None


def _collapse(text: str) -> str:
    """Collapse all whitespace runs to single spaces."""
    return _WHITESPACE_RE.sub(" ", text).strip()


def _parse_price(text: str) -> Decimal | None:
    """Parse ``"฿ 11,900"``; zero or missing means no price."""
    match = _PRICE_RE.search(text)
    if match is None:
        return None
    try:
        price = Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
        return None
    return price if price > 0 else None


class ItcityScraper(StoreScraper):
    """Crawls IT City product pages discovered through its sitemap."""

    merchant: ClassVar[str] = "itcity"

    _sitemap: list[str] | None = None

    @classmethod
    def supported_categories(cls) -> frozenset[Category]:
        """Return every tracked category; classification is by title."""
        return frozenset(Category)

    async def _product_urls(self) -> list[str]:
        """Fetch the product sitemap once per scraper instance."""
        if self._sitemap is None:
            self._sitemap = parse_sitemap(await self._fetcher.get_text(SITEMAP_URL))
            logger.info("itcity sitemap: %d product URLs", len(self._sitemap))
        return self._sitemap

    async def scrape_category(
        self, category: Category, *, max_pages: int | None = None
    ) -> list[ScrapedListing]:
        """Scrape every product page whose slug classifies as ``category``.

        Args:
            category: Hardware category to crawl.
            max_pages: Optional cap on product pages fetched.

        Returns:
            Listings whose rendered title confirms ``category``.

        Raises:
            FetchError: If the sitemap could not be fetched.
            ItcityParseError: If more than half the product pages fetched
                lacked product markup (the page layout probably changed).
        """
        urls = candidates(await self._product_urls(), category)
        if max_pages is not None:
            urls = urls[:max_pages]

        listings: list[ScrapedListing] = []
        failures = 0
        for url in urls:
            try:
                html = await self._fetcher.get_text(url)
                listing = parse_product_page(html, url, datetime.now(timezone.utc))
            except Exception as exc:  # noqa: BLE001 - one product must not sink the category
                failures += 1
                logger.warning("itcity: %s failed: %s", url, exc)
                continue
            if listing is not None and listing.category is category:
                listings.append(listing)

        logger.info(
            "itcity %s: %d candidates, %d listings, %d failures",
            category.value,
            len(urls),
            len(listings),
            failures,
        )
        if urls and failures * 2 > len(urls):
            raise ItcityParseError(f"{failures} of {len(urls)} product pages failed")
        return listings
