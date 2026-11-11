from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from pricewatch.models import Category
from pricewatch.scrapers.fetcher import PoliteFetcher
from pricewatch.scrapers.itcity import (
    SITEMAP_URL,
    ItcityParseError,
    ItcityScraper,
    candidates,
    classify,
    parse_product_page,
    parse_sitemap,
    slug_text,
)

FIXTURES = Path(__file__).parent / "fixtures"
NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)
GPU_URL = (
    "https://www.itcity.in.th/product/"
    "GALAX-GEFORCE-RTX-5060-1-CLICK-OC-V2-8GB-GDDR7-128bit-(3Y)_PRD202607012065"
)
CPU_URL = "https://www.itcity.in.th/product/AMD-RYZEN-7-9800X3D-AM5-(3Y)_PRD202508010066"


def _fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("การ์ดจอ GIGABYTE GEFORCE RTX 4060 GAMING OC 8GB GDDR6 (3Y) GPU", Category.GPU),
        ("ARC B580 LIMITED EDITION 12GB GDDR6", Category.GPU),
        ("AMD RYZEN 7 9800X3D AM5 (3Y)", Category.CPU),
        ("INTEL CORE ULTRA 5 225 CPU", Category.CPU),
        ("CORSAIR VENGEANCE LPX 16GB(16X1/3200) DDR4 BK (CMK16GX4M1E3200C16)", Category.RAM),
        ("ADATA LEGEND 860 500GB M.2 2280 NVMe Gen4 SLEG-860-500GCS (5Y)", Category.SSD),
        ("SANDISK ULTRA 3D 1TB SSD SATA 2.5 SDSSDH3-1T00-G26 SSD", Category.SSD),
        # Not DIY parts:
        ("ASUS PRIME B650M-A WIFI DDR5 AM5 (3Y)", None),  # mainboard
        ("KINGSTON FURY IMPACT 8GB (1x8/4800) DDR5 NB Ram", None),  # notebook RAM
        ("SANDISK SDSSDE10 Portable SSD 1TB", None),
        ("(Notebook) ASUS Vivobook S16 Ryzen AI 7 445", None),
        ('ASUS VM670GA 27"Ryzen AI 7 445', None),  # AIO
        ("LENOVO Tower 17L Core Ultra 5 225", None),
        ("UGREEN NASync DXP480T Plus 4-Bay All-Flash SSD NAS", None),
        ("BROTHER MFC-L2700D Printer", None),
    ],
)
def test_classify(title: str, expected: Category | None) -> None:
    assert classify(title) is expected


def test_slug_text_drops_sku_and_separators() -> None:
    assert slug_text(CPU_URL) == "AMD RYZEN 7 9800X3D AM5 (3Y)"


def test_parse_sitemap_keeps_product_locs_only() -> None:
    xml = (
        "<urlset><url><loc>https://www.itcity.in.th/product/A-RTX-5060_PRD1</loc>"
        '<xhtml:link rel="alternate" href="https://www.itcity.in.th/en/product/A_PRD1"/></url>'
        "<url><loc>https://www.itcity.in.th/help/about-us</loc></url></urlset>"
    )
    assert parse_sitemap(xml) == ["https://www.itcity.in.th/product/A-RTX-5060_PRD1"]


def test_candidates_filter_by_slug() -> None:
    urls = [GPU_URL, CPU_URL, "https://www.itcity.in.th/product/BROTHER-Printer_PRD9"]
    assert candidates(urls, Category.GPU) == [GPU_URL]
    assert candidates(urls, Category.CPU) == [CPU_URL]


def test_sold_out_gpu_page() -> None:
    item = parse_product_page(_fixture("itcity_gpu_sold_out.html"), GPU_URL, NOW)

    assert item is not None
    assert item.merchant == "itcity"
    assert item.merchant_sku == "PRD202607012065"
    assert item.category is Category.GPU
    assert item.title == "GALAX GEFORCE RTX 5060 1-CLICK OC V2 8GB GDDR7 128bit (3Y)"
    assert item.price == Decimal("11900")
    assert item.in_stock is False
    assert item.view_count is None and item.sold_count is None


def test_in_stock_cpu_page() -> None:
    item = parse_product_page(_fixture("itcity_cpu_in_stock.html"), CPU_URL, NOW)

    assert item is not None
    assert item.category is Category.CPU
    assert item.price == Decimal("17990")
    assert item.in_stock is True
    assert str(item.url) == CPU_URL


def test_page_without_product_markup_raises() -> None:
    with pytest.raises(ItcityParseError):
        parse_product_page("<html><body>maintenance</body></html>", CPU_URL, NOW)


def test_non_part_title_is_skipped() -> None:
    html = '<html><body><h1 class="product-desc">BROTHER MFC-L2700D Printer</h1></body></html>'
    assert parse_product_page(html, CPU_URL, NOW) is None


def _sitemap(urls: list[str]) -> str:
    return "<urlset>" + "".join(f"<url><loc>{url}</loc></url>" for url in urls) + "</urlset>"


async def test_scrape_fetches_sitemap_once_and_only_candidates() -> None:
    pages = {
        SITEMAP_URL: _sitemap([GPU_URL, CPU_URL]),
        GPU_URL: _fixture("itcity_gpu_sold_out.html"),
        CPU_URL: _fixture("itcity_cpu_in_stock.html"),
    }
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(200, text=pages[str(request.url)])

    transport = httpx.MockTransport(handler)
    async with PoliteFetcher(min_interval=0, jitter=0, transport=transport) as fetcher:
        scraper = ItcityScraper(fetcher)
        gpus = await scraper.scrape_category(Category.GPU)
        cpus = await scraper.scrape_category(Category.CPU)

    assert [item.merchant_sku for item in gpus] == ["PRD202607012065"]
    assert [item.merchant_sku for item in cpus] == ["PRD202508010066"]
    # httpx percent-encodes the parentheses in product URLs.
    assert [httpx.URL(url) for url in requested] == [
        httpx.URL(SITEMAP_URL),
        httpx.URL(GPU_URL),
        httpx.URL(CPU_URL),
    ]


async def test_scrape_tolerates_one_bad_page_but_not_a_broken_layout() -> None:
    other = GPU_URL.replace("PRD202607012065", "PRD202607099999")
    pages = {
        SITEMAP_URL: _sitemap([GPU_URL, other]),
        GPU_URL: _fixture("itcity_gpu_sold_out.html"),
        other: "<html><body>redesigned</body></html>",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        for url, body in pages.items():
            if httpx.URL(url) == request.url:
                return httpx.Response(200, text=body)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with PoliteFetcher(min_interval=0, jitter=0, transport=transport) as fetcher:
        listings = await ItcityScraper(fetcher).scrape_category(Category.GPU)
    assert len(listings) == 1  # 1 of 2 failed: tolerated.

    pages[GPU_URL] = pages[other]
    async with PoliteFetcher(min_interval=0, jitter=0, transport=transport) as fetcher:
        with pytest.raises(ItcityParseError):
            await ItcityScraper(fetcher).scrape_category(Category.GPU)
