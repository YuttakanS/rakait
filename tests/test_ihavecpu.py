import json
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from pricewatch.models import Category
from pricewatch.scrapers.fetcher import PoliteFetcher
from pricewatch.scrapers.ihavecpu import (
    IhavecpuParseError,
    IhavecpuScraper,
    _spec_text,
    parse_category_page,
)

FIXTURE = Path(__file__).parent / "fixtures" / "ihavecpu_storage.html"
NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def storage_html() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_ssd_filter_drops_hard_disks_but_records_their_ids(storage_html: str) -> None:
    seen: set[str] = set()
    listings, total_rows, page_size = parse_category_page(storage_html, Category.SSD, NOW, seen)

    assert [item.merchant_sku for item in listings] == ["43262", "37622"]
    assert seen == {"43262", "37622", "49552"}  # The HDD counts toward coverage.
    assert (total_rows, page_size) == (20, 3)


def test_item_fields(storage_html: str) -> None:
    listings, _, _ = parse_category_page(storage_html, Category.SSD, NOW)
    item = listings[0]

    assert item.merchant == "ihavecpu"
    assert item.title.startswith("M.2 (เอสเอสดี) ADATA LEGEND 860 500GB")
    assert item.price == Decimal("3790.00")
    assert item.stock_quantity == 831
    assert item.in_stock is True
    assert item.view_count is None and item.sold_count is None
    assert str(item.url).startswith("https://ihavecpu.com/product/43262/")
    assert item.scraped_at == NOW


def test_missing_payload_raises() -> None:
    with pytest.raises(IhavecpuParseError, match="no __NEXT_DATA__"):
        parse_category_page("<html></html>", Category.GPU, NOW)


def test_spec_text_flattens_properties() -> None:
    properties = [
        {"name_th": "Memory Size", "detail": [{"name_th": "4GB GDDR6", "name_gb": "4GB GDDR6"}]},
        {"name_th": "Power", "detail": []},
        "garbage",
    ]
    assert _spec_text(properties) == "Memory Size: 4GB GDDR6"
    assert _spec_text(None) is None


def _item(product_id: int, price: int, stock: int = 5) -> dict[str, object]:
    return {
        "product_id": product_id,
        "name_th": f"VGA(การ์ดจอ) TEST {product_id}",
        "price_sale": f"{price}.00",
        "stock": str(stock),
        "property": [],
    }


def _page(ids: list[int], total_rows: int) -> str:
    payload = {
        "props": {
            "pageProps": {"product": {"row": total_rows, "data": [_item(i, 1000 + i) for i in ids]}}
        }
    }
    return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'


BASE = "https://ihavecpu.com/category/graphic-card"


async def test_scraper_handles_half_overlapping_pages() -> None:
    # The live site advances 12 rows per page number but renders 24.
    pages = {
        BASE: _page(list(range(0, 4)), total_rows=7),
        f"{BASE}?page=2": _page(list(range(2, 6)), total_rows=7),
        f"{BASE}?page=3": _page(list(range(4, 7)), total_rows=7),
        f"{BASE}?page=4": _page([], total_rows=7),
    }
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, text=pages[str(request.url)])

    transport = httpx.MockTransport(handler)
    async with PoliteFetcher(min_interval=0, jitter=0, transport=transport) as fetcher:
        listings = await IhavecpuScraper(fetcher).scrape_category(Category.GPU)

    assert [item.merchant_sku for item in listings] == [str(i) for i in range(7)]
    assert requested == [BASE, f"{BASE}?page=2", f"{BASE}?page=3"]  # Stops once all seen.
