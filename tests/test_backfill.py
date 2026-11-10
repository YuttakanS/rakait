import gzip
from datetime import datetime, timezone

from pricewatch.backfill import Snapshot, decode_body, select_snapshots

ROWS = [
    ["timestamp", "original"],
    ["20240118001345", "https://www.jib.co.th/web/product/product_list/2/51"],
    ["20240118093000", "https://www.jib.co.th/web/product/product_list/2/51"],  # same day
    ["20240118001400", "http://jib.co.th:80/web/product/product_list/2/51/100/"],
    ["20240220010101", "https://www.jib.co.th/web/product/product_list/2/51/0?price=&brand="],
    ["20240220010101", "https://www.jib.co.th/web/product/product_list/2/510"],  # other category
    ["20240301000000", "https://www.jib.co.th/web/product/product_list/2/51"],
]


def test_select_snapshots_keeps_one_per_page_per_day() -> None:
    snapshots = select_snapshots(ROWS, "2/51")
    assert snapshots == [
        Snapshot("20240118001345", "https://www.jib.co.th/web/product/product_list/2/51"),
        Snapshot("20240118001400", "https://www.jib.co.th/web/product/product_list/2/51/100"),
        Snapshot("20240301000000", "https://www.jib.co.th/web/product/product_list/2/51"),
    ]


def test_snapshot_urls_and_time() -> None:
    snap = Snapshot("20240118001345", "https://www.jib.co.th/web/product/product_list/2/51")
    assert snap.captured_at == datetime(2024, 1, 18, 0, 13, 45, tzinfo=timezone.utc)
    assert snap.raw_url == (
        "https://web.archive.org/web/20240118001345id_/"
        "https://www.jib.co.th/web/product/product_list/2/51"
    )


def test_decode_body_handles_gzip_and_plain() -> None:
    html = "<p>การ์ดจอ</p>"
    assert decode_body(gzip.compress(html.encode())) == html
    assert decode_body(html.encode()) == html
