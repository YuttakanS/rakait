"""Integration tests against a real PostgreSQL database.

Skipped unless ``TEST_DATABASE_URL`` is set. Each test runs inside a throwaway
schema that is dropped afterwards.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from pricewatch.db.migrate import (
    DEFAULT_MIGRATIONS_DIR,
    MigrationError,
    apply_migrations,
    discover_migrations,
)
from pricewatch.db.repository import UnknownMerchantError, save_listings
from pricewatch.models import Category, ScrapedListing

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")

T0 = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


@pytest.fixture
async def conn():
    import asyncpg

    connection = await asyncpg.connect(TEST_DATABASE_URL)
    schema = f"pricewatch_test_{uuid.uuid4().hex[:12]}"
    await connection.execute(f'CREATE SCHEMA "{schema}"')
    await connection.execute(f'SET search_path TO "{schema}"')
    try:
        yield connection
    finally:
        await connection.execute(f'DROP SCHEMA "{schema}" CASCADE')
        await connection.close()


def _listing(
    sku: str,
    price: str | None,
    sold: int,
    at: datetime,
    merchant: str = "jib",
    stock_quantity: int | None = None,
):
    return ScrapedListing(
        merchant=merchant,
        merchant_sku=sku,
        category=Category.GPU,
        title=f"GPU {sku}",
        url=f"https://www.jib.co.th/web/product/readProduct/{sku}",
        price=Decimal(price) if price is not None else None,
        view_count=100,
        sold_count=sold,
        in_stock=price is not None,
        stock_quantity=stock_quantity,
        scraped_at=at,
    )


async def test_migrations_apply_once(conn) -> None:
    expected = [version for version, _ in discover_migrations(DEFAULT_MIGRATIONS_DIR)]
    assert expected[:8] == ["0001", "0002", "0003", "0004", "0005", "0006", "0007", "0008"]
    assert await apply_migrations(conn) == expected
    assert await apply_migrations(conn) == []
    # Five merchants seeded by 0001, Advice removed by 0008.
    slugs = await conn.fetch("SELECT slug FROM merchants ORDER BY slug")
    assert [row["slug"] for row in slugs] == ["banana", "ihavecpu", "itcity", "jib"]


async def test_edited_migration_is_detected(conn, tmp_path) -> None:
    path = tmp_path / "0001_a.sql"
    path.write_text("CREATE TABLE a (id INT);")
    await apply_migrations(conn, tmp_path)
    path.write_text("CREATE TABLE a (id BIGINT);")
    with pytest.raises(MigrationError, match="modified after being applied"):
        await apply_migrations(conn, tmp_path)


async def test_failed_migration_rolls_back(conn, tmp_path) -> None:
    import asyncpg

    (tmp_path / "0001_a.sql").write_text("CREATE TABLE a (id INT); SELECT * FROM missing;")
    with pytest.raises(asyncpg.PostgresError):
        await apply_migrations(conn, tmp_path)
    assert await conn.fetchval("SELECT to_regclass('a')") is None
    assert await conn.fetchval("SELECT count(*) FROM schema_migrations") == 0


async def test_save_listings_upserts_and_appends_history(conn) -> None:
    await apply_migrations(conn)

    assert (
        await save_listings(conn, [_listing("1", "9590", 72, T0), _listing("2", None, 5, T0)]) == 2
    )
    later = T0 + timedelta(hours=6)
    assert await save_listings(conn, [_listing("1", "9290", 80, later)]) == 1

    listings = await conn.fetch(
        "SELECT merchant_sku, current_price, sold_count, in_stock FROM merchant_listings "
        "ORDER BY merchant_sku"
    )
    assert [tuple(row) for row in listings] == [
        ("1", Decimal("9290.00"), 80, True),
        ("2", None, 5, False),
    ]
    history = await conn.fetch(
        "SELECT h.price, h.sold_count FROM price_history h "
        "JOIN merchant_listings l ON l.id = h.listing_id "
        "WHERE l.merchant_sku = '1' ORDER BY h.scraped_at"
    )
    assert [tuple(row) for row in history] == [(Decimal("9590.00"), 72), (Decimal("9290.00"), 80)]


async def test_save_listings_is_idempotent_and_ignores_stale_data(conn) -> None:
    await apply_migrations(conn)
    newer = T0 + timedelta(hours=1)
    await save_listings(conn, [_listing("1", "100", 1, newer)])

    assert await save_listings(conn, [_listing("1", "100", 1, newer)]) == 0
    # An out-of-order (older) observation must not overwrite the current state.
    await save_listings(conn, [_listing("1", "999", 0, T0)])
    assert await conn.fetchval("SELECT current_price FROM merchant_listings") == Decimal("100.00")


async def test_duplicate_skus_in_one_batch_keep_latest(conn) -> None:
    await apply_migrations(conn)
    batch = [_listing("1", "100", 1, T0), _listing("1", "90", 2, T0 + timedelta(minutes=1))]
    assert await save_listings(conn, batch) == 1
    assert await conn.fetchval("SELECT current_price FROM merchant_listings") == Decimal("90.00")


async def test_unknown_merchant_is_rejected(conn) -> None:
    await apply_migrations(conn)
    with pytest.raises(UnknownMerchantError, match="nope"):
        await save_listings(conn, [_listing("1", "100", 1, T0, merchant="nope")])
    assert await conn.fetchval("SELECT count(*) FROM merchant_listings") == 0


async def test_record_scrape_runs(conn) -> None:
    from pricewatch.db.repository import record_scrape_runs
    from pricewatch.pipeline import ScrapeRun

    await apply_migrations(conn)
    runs = [
        ScrapeRun("jib", Category.GPU, T0, T0 + timedelta(seconds=5), 202),
        ScrapeRun("jib", Category.CPU, T0, T0 + timedelta(seconds=1), 0, "FetchError: HTTP 503"),
        ScrapeRun("jib", None, T0, T0, 0, "RuntimeError: crashed"),
        ScrapeRun("nope", Category.GPU, T0, T0, 1),  # unknown merchant: dropped, not fatal
    ]
    assert await record_scrape_runs(conn, runs) == 3
    rows = await conn.fetch("SELECT category, listing_count, error FROM scrape_runs ORDER BY id")
    assert [tuple(row) for row in rows] == [
        ("gpu", 202, None),
        ("cpu", 0, "FetchError: HTTP 503"),
        (None, 0, "RuntimeError: crashed"),
    ]


async def test_recent_listing_counts_ignores_unhealthy_runs(conn) -> None:
    from pricewatch.db.repository import recent_listing_counts, record_scrape_runs
    from pricewatch.pipeline import ScrapeRun

    await apply_migrations(conn)
    hour = timedelta(hours=1)
    runs = [
        ScrapeRun("jib", Category.GPU, T0 + i * hour, T0 + i * hour, count)
        for i, count in enumerate([10, 100, 110, 120])
    ] + [
        ScrapeRun("jib", Category.GPU, T0 + 9 * hour, T0 + 9 * hour, 0, "FetchError"),
        ScrapeRun("jib", Category.GPU, T0 + 9 * hour, T0 + 9 * hour, 5, None, "drop"),
        ScrapeRun("banana", Category.CPU, T0, T0, 40),
    ]
    await record_scrape_runs(conn, runs)

    assert await recent_listing_counts(conn, window=3) == {
        ("jib", Category.GPU): 110.0,  # newest three healthy: 100, 110, 120
        ("banana", Category.CPU): 40.0,
    }


async def test_rls_denies_non_owner_roles(conn) -> None:
    """A non-owner role (standing in for Supabase's anon) sees no rows even if granted."""

    await apply_migrations(conn)
    await save_listings(conn, [_listing("1", "100", 1, T0)])
    role = f"pw_anon_{uuid.uuid4().hex[:8]}"
    schema = await conn.fetchval("SELECT current_schema()")
    await conn.execute(f'CREATE ROLE "{role}"')
    try:
        await conn.execute(f'GRANT USAGE ON SCHEMA "{schema}" TO "{role}"')
        await conn.execute(f'GRANT SELECT, DELETE ON price_history TO "{role}"')
        async with conn.transaction():
            await conn.execute(f'SET LOCAL ROLE "{role}"')
            assert await conn.fetchval("SELECT count(*) FROM price_history") == 0
            assert await conn.execute("DELETE FROM price_history") == "DELETE 0"
        # The owner (our backend) is unaffected.
        assert await conn.fetchval("SELECT count(*) FROM price_history") == 1
    finally:
        await conn.execute(f'REVOKE ALL ON price_history FROM "{role}"')
        await conn.execute(f'REVOKE ALL ON SCHEMA "{schema}" FROM "{role}"')
        await conn.execute(f'DROP ROLE "{role}"')


async def test_stock_quantity_is_stored_in_listing_and_history(conn) -> None:
    await apply_migrations(conn)
    await save_listings(conn, [_listing("9", "100", 0, T0, merchant="ihavecpu", stock_quantity=52)])
    later = T0 + timedelta(hours=3)
    await save_listings(
        conn, [_listing("9", "100", 0, later, merchant="ihavecpu", stock_quantity=47)]
    )

    assert await conn.fetchval("SELECT stock_quantity FROM merchant_listings") == 47
    history = await conn.fetch("SELECT stock_quantity FROM price_history ORDER BY scraped_at")
    assert [row[0] for row in history] == [52, 47]


async def test_backfilled_history_is_kept_without_overwriting_current_state(conn) -> None:
    await apply_migrations(conn)
    await save_listings(conn, [_listing("1", "9000", 50, T0)])
    month_ago = T0 - timedelta(days=30)
    assert await save_listings(conn, [_listing("1", "9900", 40, month_ago)]) == 1

    row = await conn.fetchrow(
        "SELECT current_price, sold_count, first_seen_at, last_scraped_at FROM merchant_listings"
    )
    assert (row["current_price"], row["sold_count"]) == (Decimal("9000.00"), 50)
    assert row["first_seen_at"] == month_ago
    assert row["last_scraped_at"] == T0
    prices = await conn.fetch("SELECT price FROM price_history ORDER BY scraped_at")
    assert [r[0] for r in prices] == [Decimal("9900.00"), Decimal("9000.00")]


async def test_link_listings_groups_merchants_under_one_canonical_product(conn) -> None:
    from pricewatch.db.linking import link_listings

    await apply_migrations(conn)
    titles = {
        ("jib", "1"): "VGA (การ์ดแสดงผล) ASUS DUAL GEFORCE RTX 5060 8GB GDDR7 OC EDITION",
        ("ihavecpu", "2"): "VGA(การ์ดจอ) MSI GEFORCE RTX 5060 VENTUS 2X OC 8G - 8GB GDDR7 (3Y)",
        ("banana", "3"): "การ์ดจอ GALAX GeForce RTX 5060 1-Click OC V2 8GB GDDR7 128-bit",
        ("banana", "4"): "การ์ดจอ LEADTEK NVIDIA Ampere RTX A1000 8GB GDDR6 128-bit",
    }
    await save_listings(
        conn,
        [
            ScrapedListing(
                merchant=merchant,
                merchant_sku=sku,
                category=Category.GPU,
                title=title,
                url=f"https://example.test/{sku}",
                price=Decimal("10000"),
                in_stock=True,
                scraped_at=T0,
            )
            for (merchant, sku), title in titles.items()
        ],
    )

    summary = await link_listings(conn)

    assert (summary.listings, summary.linked, summary.products) == (4, 3, 1)
    rows = await conn.fetch(
        "SELECT l.merchant_sku, l.brand, c.model, c.manufacturer, c.specs->>'vram_gb' AS vram "
        "FROM merchant_listings l LEFT JOIN canonical_products c ON c.id = l.canonical_product_id "
        "ORDER BY l.merchant_sku"
    )
    assert [tuple(r) for r in rows] == [
        ("1", "ASUS", "GeForce RTX 5060 8GB", "NVIDIA", "8"),
        ("2", "MSI", "GeForce RTX 5060 8GB", "NVIDIA", "8"),
        ("3", "Galax", "GeForce RTX 5060 8GB", "NVIDIA", "8"),
        ("4", "Leadtek", None, None, None),
    ]
    methods = await conn.fetch(
        "SELECT merchant_sku, link_method FROM merchant_listings ORDER BY merchant_sku"
    )
    assert [tuple(r) for r in methods] == [("1", "rule"), ("2", "rule"), ("3", "rule"), ("4", None)]
    report = await conn.fetchval(
        "SELECT payload FROM market_insights WHERE category = 'all' AND kind = 'linkage_quality'"
    )
    assert '"excluded": 1' in report  # the workstation card
    # Idempotent: a second pass reuses the same canonical product.
    assert (await link_listings(conn)).products == 1
    assert await conn.fetchval("SELECT count(*) FROM canonical_products") == 1


async def test_train_persists_insights(conn, tmp_path) -> None:
    import numpy as np

    from pricewatch.db.linking import link_listings
    from pricewatch.ml.train import train

    await apply_migrations(conn)
    rng = np.random.default_rng(1)
    chips = {"5060": (8, 11000), "5070": (12, 20000), "5080": (16, 38000)}
    listings = []
    for i in range(60):
        chip = list(chips)[i % 3]
        vram, base = chips[chip]
        listings.append(
            ScrapedListing(
                merchant=["jib", "ihavecpu", "banana"][i % 3],
                merchant_sku=str(i),
                category=Category.GPU,
                title=f"VGA MSI GEFORCE RTX {chip} - {vram}GB GDDR7",
                url=f"https://example.test/{i}",
                price=Decimal(str(round(base * rng.uniform(0.9, 1.1)))),
                view_count=int(rng.integers(100, 100_000)),
                sold_count=int(rng.integers(0, 500)),
                in_stock=True,
                scraped_at=datetime.now(timezone.utc),
            )
        )
    await save_listings(conn, listings)
    await link_listings(conn)

    report = await train(conn, figures=tmp_path)

    assert await conn.fetchval("SELECT count(*) FROM listing_insights") == 60
    assert (
        await conn.fetchval(
            "SELECT count(*) FROM listing_insights WHERE deal_score BETWEEN 0 AND 100"
        )
        == 60
    )
    kinds = {r[0] for r in await conn.fetch("SELECT kind FROM market_insights")}
    assert {"simple_regression", "fair_value_mlr", "tier_tree"} <= kinds
    assert "linkage_quality" in kinds  # written by link, kept by train
    assert report.market[("gpu", "simple_regression")]["slope_thb_per_unit"] > 0
    assert (tmp_path / "gpu_simple_regression.png").exists()


async def test_image_url_survives_observations_without_one(conn) -> None:
    await apply_migrations(conn)

    def obs(at: datetime, image: str | None) -> ScrapedListing:
        return ScrapedListing(
            merchant="jib",
            merchant_sku="img1",
            category=Category.GPU,
            title="VGA ASUS DUAL RTX 5060 8GB",
            url="https://www.jib.co.th/p/1",
            price=Decimal("10000"),
            in_stock=True,
            image_url=image,
            scraped_at=at,
        )

    await save_listings(conn, [obs(T0, "https://www.jib.co.th/img/a.jpg")])
    await save_listings(conn, [obs(T0 + timedelta(hours=3), None)])  # newer, no image
    await save_listings(conn, [obs(T0 - timedelta(days=30), None)])  # archive backfill
    assert await conn.fetchval("SELECT image_url FROM merchant_listings") == (
        "https://www.jib.co.th/img/a.jpg"
    )
    await save_listings(conn, [obs(T0 + timedelta(hours=6), "https://www.jib.co.th/img/b.jpg")])
    assert await conn.fetchval("SELECT image_url FROM merchant_listings") == (
        "https://www.jib.co.th/img/b.jpg"
    )
