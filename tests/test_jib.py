from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from pricewatch.models import Category
from pricewatch.scrapers import jib
from pricewatch.scrapers.fetcher import PoliteFetcher
from pricewatch.scrapers.jib import JibParseError, JibScraper, parse_listing_page

FIXTURE = Path(__file__).parent / "fixtures" / "jib_gpu_listing.html"
NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def listing_html() -> str:
    return FIXTURE.read_text(encoding="utf-8")


def test_parses_all_cards_and_next_link(listing_html: str) -> None:
    listings, next_url = parse_listing_page(listing_html, Category.GPU, NOW)

    # The fixture also holds a commented-out card opener, which must be ignored.
    assert [item.merchant_sku for item in listings] == ["76790", "68047", "33532"]
    assert next_url == "https://www.jib.co.th/web/product/product_list/2/51/100"


def test_in_stock_card_fields(listing_html: str) -> None:
    listings, _ = parse_listing_page(listing_html, Category.GPU, NOW)
    card = listings[1]

    assert card.merchant == "jib"
    assert card.category is Category.GPU
    assert card.title == (
        "VGA (การ์ดแสดงผล) ASUS DUAL GEFORCE RTX 3050 OC EDITION 6GB GDDR6 (DUAL-RTX3050-O6G)"
    )
    assert str(card.url).startswith("https://www.jib.co.th/web/product/readProduct/68047/51/")
    assert card.price == Decimal("9590")
    assert card.view_count == 418_108
    assert card.sold_count == 72
    assert card.in_stock is True
    assert card.spec_text == ("GeForce RTX 3050\n6GB GDDR6\n1 x DisplayPort\n1 x HDMI\n1 x DVI-D")
    assert card.scraped_at == NOW


def test_sold_out_card_has_no_price(listing_html: str) -> None:
    listings, _ = parse_listing_page(listing_html, Category.GPU, NOW)
    card = listings[2]

    assert card.in_stock is False
    assert card.price is None  # JIB renders "N/A.-"
    assert card.view_count == 84_811
    assert card.sold_count == 374


def test_page_without_cards_is_empty_not_an_error() -> None:
    assert parse_listing_page("<html><body></body></html>", Category.GPU, NOW) == ([], None)


def test_unparseable_cards_raise() -> None:
    html = '<div class="divboxpro"><p>redesigned</p></div>'
    with pytest.raises(JibParseError):
        parse_listing_page(html, Category.GPU, NOW)


def _card(sku: int) -> str:
    return (
        '<div class="divboxpro">'
        f'<div class="cart_modal buy_promo">ซื้อเลย</div>'
        f'<a href="https://www.jib.co.th/web/product/readProduct/{sku}/51/x">'
        f'<span class="promo_name">GPU {sku}</span></a>'
        '<div class="boxprice">10 views 1 sold<p class="price_total">1,000.-</p></div>'
        "</div>"
    )


def _page(skus: list[int], next_url: str | None) -> str:
    pagination = (
        f'<ul class="pagination"><li><a href="{next_url}" rel="next">Next</a></li></ul>'
        if next_url
        else ""
    )
    return f"<html><body>{pagination}{''.join(_card(sku) for sku in skus)}</body></html>"


def _fetcher(pages: dict[str, str], requested: list[str]) -> PoliteFetcher:
    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, text=pages[str(request.url)])

    return PoliteFetcher(min_interval=0, jitter=0, transport=httpx.MockTransport(handler))


BASE = "https://www.jib.co.th/web/product/product_list/2/51"


async def test_scraper_follows_pagination_and_dedupes() -> None:
    requested: list[str] = []
    pages = {
        BASE: _page([1, 2], f"{BASE}/100"),
        f"{BASE}/100": _page([2, 3], None),
    }
    async with _fetcher(pages, requested) as fetcher:
        listings = await JibScraper(fetcher).scrape_category(Category.GPU)

    assert requested == [BASE, f"{BASE}/100"]
    assert [item.merchant_sku for item in listings] == ["1", "2", "3"]


async def test_scraper_stops_on_pagination_loop() -> None:
    requested: list[str] = []
    pages = {
        BASE: _page([1], f"{BASE}/100"),
        f"{BASE}/100": _page([1], f"{BASE}/200"),  # repeats page 1: nothing new
        f"{BASE}/200": _page([9], None),
    }
    async with _fetcher(pages, requested) as fetcher:
        listings = await JibScraper(fetcher).scrape_category(Category.GPU)

    assert requested == [BASE, f"{BASE}/100"]
    assert [item.merchant_sku for item in listings] == ["1"]


async def test_scraper_honours_max_pages() -> None:
    requested: list[str] = []
    pages = {BASE: _page([1], f"{BASE}/100"), f"{BASE}/100": _page([2], None)}
    async with _fetcher(pages, requested) as fetcher:
        listings = await JibScraper(fetcher).scrape_category(Category.GPU, max_pages=1)

    assert requested == [BASE]
    assert len(listings) == 1


async def test_scraper_rejects_unsupported_category(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delitem(jib.CATEGORY_PATHS, Category.SSD)
    async with _fetcher({}, []) as fetcher:
        with pytest.raises(ValueError, match="does not support"):
            await JibScraper(fetcher).scrape_category(Category.SSD)


async def test_scraper_crawls_every_path_of_a_category() -> None:
    root = "https://www.jib.co.th/web/product/product_list"
    requested: list[str] = []
    pages = {
        f"{root}/3/1028": _page([1, 2], None),
        f"{root}/3/1471": _page([2, 3], None),  # SKU 2 listed under both
    }
    async with _fetcher(pages, requested) as fetcher:
        listings = await JibScraper(fetcher).scrape_category(Category.SSD)

    assert requested == [f"{root}/3/1028", f"{root}/3/1471"]
    assert [item.merchant_sku for item in listings] == ["1", "2", "3"]
    assert {item.category for item in listings} == {Category.SSD}
