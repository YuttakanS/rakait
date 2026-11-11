"""Historical backfill of JIB listing pages from the Internet Archive.

The Wayback Machine has archived JIB's category pages roughly monthly since
2024. Archived pages use the same markup the live scraper parses, so each
snapshot becomes one dated observation of every product card on it: a sparse
but long price, view and (from mid-2025) sold-count history that live scraping
alone would need months to accumulate.
"""

from __future__ import annotations

import gzip
import json
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timezone
from urllib.parse import urlencode

from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.fetcher import FetchError, PoliteFetcher
from pricewatch.scrapers.jib import CATEGORY_PATHS, JibParseError, parse_listing_page

logger = logging.getLogger(__name__)

CDX_URL = "https://web.archive.org/cdx/search/cdx"
_JIB_LIST_PREFIX = "jib.co.th/web/product/product_list"
_GZIP_MAGIC = b"\x1f\x8b"


@dataclass(frozen=True, order=True)
class Snapshot:
    """One archived capture of a page.

    Attributes:
        timestamp: Wayback 14-digit capture time, ``YYYYMMDDhhmmss`` (UTC).
        url: The original (live) URL that was captured.
    """

    timestamp: str
    url: str

    @property
    def captured_at(self) -> datetime:
        """Capture time as an aware UTC datetime."""
        return datetime.strptime(self.timestamp, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)

    @property
    def raw_url(self) -> str:
        """Wayback URL serving the original bytes without the archive toolbar."""
        return f"https://web.archive.org/web/{self.timestamp}id_/{self.url}"


def select_snapshots(rows: Sequence[Sequence[str]], path: str) -> list[Snapshot]:
    """Keep listing-page captures of ``path``, at most one per URL per day.

    Accepts the category root and its numbered pages (``.../2/51``,
    ``.../2/51/100``); filtered or sorted variants (``?price=...``) are
    dropped because they show a different product subset.

    Args:
        rows: CDX rows of ``[timestamp, original]`` (header row allowed).
        path: JIB category path such as ``"2/51"``.

    Returns:
        Snapshots sorted by time, then URL.
    """
    pattern = re.compile(
        rf"^https?://(?:www\.)?jib\.co\.th(?::80)?/web/product/product_list/"
        rf"{re.escape(path)}(?:/\d+)?/?$"
    )
    chosen: dict[tuple[str, str], Snapshot] = {}
    for row in rows:
        if len(row) < 2 or not row[0].isdigit():
            continue
        timestamp, original = row[0], row[1]
        if not pattern.match(original):
            continue
        canonical = "https://www.jib.co.th/web/product/product_list/" + original.split(
            "/product_list/", 1
        )[1].rstrip("/")
        chosen.setdefault((canonical, timestamp[:8]), Snapshot(timestamp, canonical))
    return sorted(chosen.values())


def decode_body(body: bytes) -> str:
    """Decode an archived body, un-gzipping it if the archive stored it compressed."""
    if body[:2] == _GZIP_MAGIC:
        body = gzip.decompress(body)
    return body.decode("utf-8", errors="replace")


async def list_snapshots(fetcher: PoliteFetcher, path: str, since: date) -> list[Snapshot]:
    """Query the CDX index for archived captures of one JIB category path.

    Args:
        fetcher: Rate-limited client for web.archive.org.
        path: JIB category path such as ``"2/51"``.
        since: Earliest capture date to include.

    Returns:
        Snapshots of the category's listing pages, oldest first.
    """
    query = urlencode(
        {
            "url": f"{_JIB_LIST_PREFIX}/{path}",
            "matchType": "prefix",
            "filter": "statuscode:200",
            "from": since.strftime("%Y%m%d"),
            "fl": "timestamp,original",
            "output": "json",
        }
    )
    rows = json.loads(await fetcher.get_text(f"{CDX_URL}?{query}") or "[]")
    return select_snapshots(rows, path)


async def backfill_jib(
    categories: Sequence[Category], since: date, *, fetcher: PoliteFetcher | None = None
) -> list[ScrapedListing]:
    """Parse every archived JIB listing page for ``categories`` since ``since``.

    A snapshot that fails to download or parse is logged and skipped; the
    archive is best-effort and one bad capture must not stop the rest.

    Args:
        categories: Categories to backfill (those JIB supports).
        since: Earliest capture date to include.
        fetcher: Client to use; by default one throttled to a request every
            ~5 s that backs off for up to a minute when the archive answers
            429/503, which it does freely under load.

    Returns:
        One listing per product card per snapshot, stamped with the capture time.
    """
    own_fetcher = fetcher is None
    client = fetcher or PoliteFetcher(
        min_interval=4.0, jitter=2.0, max_retries=6, backoff_base=8.0, timeout=90.0
    )
    listings: list[ScrapedListing] = []
    try:
        for category in categories:
            for path in CATEGORY_PATHS.get(category, ()):
                try:
                    snapshots = await list_snapshots(client, path, since)
                except (FetchError, ValueError) as exc:
                    logger.warning("archive: no index for %s %s: %s", category.value, path, exc)
                    continue
                logger.info("archive: %s %s has %d snapshots", category.value, path, len(snapshots))
                for snapshot in snapshots:
                    try:
                        html = decode_body(await client.get_bytes(snapshot.raw_url))
                        page, _ = parse_listing_page(html, category, snapshot.captured_at)
                    except (JibParseError, OSError, ValueError) as exc:
                        logger.warning("archive: skipping %s: %s", snapshot.raw_url, exc)
                        continue
                    except Exception as exc:  # noqa: BLE001 - best-effort archive crawl
                        logger.warning("archive: skipping %s: %r", snapshot.raw_url, exc)
                        continue
                    logger.info(
                        "archive: %s %s -> %d cards", snapshot.timestamp, snapshot.url, len(page)
                    )
                    # Archived image paths point into the Wayback Machine, not
                    # the merchant; images come from live scrapes only.
                    listings.extend(item.model_copy(update={"image_url": None}) for item in page)
    finally:
        if own_fetcher:
            await client.aclose()
    return listings
