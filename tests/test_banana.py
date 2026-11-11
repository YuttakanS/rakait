from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from pricewatch.models import Category
from pricewatch.scrapers.banana import (
    BananaParseError,
    BananaScraper,
    parse_category_page,
)
from pricewatch.scrapers.fetcher import PoliteFetcher

FIXTURE = Path(__file__).parent / "fixtures" / "banana_gpu_listing.html"
NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def listing_html() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_parses_cards_and_total(listing_html: str) -> None:
    listings, total = parse_category_page(listing_html, Category.GPU, NOW)

    assert [item.merchant_sku for item in listings] == ["rqnjl8", "zgeweq", "d48k82"]
    assert total == 95


def test_card_fields(listing_html: str) -> None:
    listings, _ = parse_category_page(listing_html, Category.GPU, NOW)
    item = listings[1]

    assert item.merchant == "banana"
    assert item.title == "การ์ดจอ ASUS Dual GeForce RTX 5050 8GB GDDR6 OC Edition 128-bit"
    assert item.price == Decimal("15489")  # Sale price, not the "ประหยัดไป" saving.
    assert item.in_stock is True
    assert item.stock_quantity is None
    assert str(item.url) == (
        "https://www.bnn.in.th/th/p/"
        "asus-vga-dual-geforce-rtx-5050-8gb-gddr6-oc-edition-128-bit-4711636178518_zgeweq"
    )
    assert item.spec_text is not None and item.spec_text.splitlines()[0] == "GeForce RTX 5050"
    assert "Memory: 8GB GDDR6 128-bit" in item.spec_text.splitlines()


def test_sold_out_card(listing_html: str) -> None:
    listings, _ = parse_category_page(listing_html, Category.GPU, NOW)
    assert listings[2].in_stock is False
    assert listings[2].price == Decimal("12500")


def test_unparseable_cards_raise() -> None:
    with pytest.raises(BananaParseError):
        parse_category_page('<a class="product-item" href="/x"></a>', Category.GPU, NOW)


def _card(code: str, name: str) -> str:
    return (
        f'<a class="product-item" href="/th/p/item-{code}_{code}?ref=category">'
        f'<div class="product-item-top"></div><div class="product-name">{name}</div>'
        '<div class="product-price"><span class="price">฿1,000</span></div></a>'
    )


def _page(cards: list[tuple[str, str]], total: int) -> str:
    return f"<p>{total} รายการ</p>" + "".join(_card(code, name) for code, name in cards)


BASE = "https://www.bnn.in.th/th/p/computer-hardware-diy/ram-computer-hardware-diy"


async def test_ram_filter_and_pagination_count_filtered_items() -> None:
    pages = {
        BASE: _page([("a1", "แรมพีซี A"), ("b2", "แรมโน้ตบุ๊ค B SO-DIMM")], total=3),
        f"{BASE}?page=2": _page([("c3", "แรมพีซี C")], total=3),
    }
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, text=pages[str(request.url)])

    transport = httpx.MockTransport(handler)
    async with PoliteFetcher(min_interval=0, jitter=0, transport=transport) as fetcher:
        listings = await BananaScraper(fetcher).scrape_category(Category.RAM)

    assert [item.merchant_sku for item in listings] == ["a1", "c3"]
    # The filtered notebook module still counts toward the site's total, so
    # the crawl stops after page 2 instead of requesting an empty page 3.
    assert requested == [BASE, f"{BASE}?page=2"]


def test_product_image_not_promo_badge(listing_html: str) -> None:
    listings, _ = parse_category_page(listing_html, Category.GPU, NOW)
    assert str(listings[1].image_url) == "https://media-cdn.bnn.in.th/1/asus-rtx5050-thumbnail.jpg"
    assert listings[0].image_url is None
