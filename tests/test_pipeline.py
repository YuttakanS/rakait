from datetime import datetime, timezone

import pytest

from pricewatch import pipeline
from pricewatch.models import Category, ScrapedListing
from pricewatch.scrapers.base import StoreScraper


def _listing(merchant: str, sku: str, category: Category) -> ScrapedListing:
    return ScrapedListing(
        merchant=merchant,
        merchant_sku=sku,
        category=category,
        title=f"{merchant} {sku}",
        url=f"https://example.test/{sku}",
        in_stock=True,
        scraped_at=datetime(2026, 11, 11, tzinfo=timezone.utc),
    )


class GoodScraper(StoreScraper):
    merchant = "good"

    @classmethod
    def supported_categories(cls) -> frozenset[Category]:
        return frozenset({Category.GPU, Category.CPU})

    async def scrape_category(self, category, *, max_pages=None):
        return [_listing(self.merchant, category.value, category)]


class HalfBrokenScraper(GoodScraper):
    merchant = "half"

    async def scrape_category(self, category, *, max_pages=None):
        if category is Category.GPU:
            raise RuntimeError("gpu page exploded")
        return await super().scrape_category(category, max_pages=max_pages)


class CrashingScraper(GoodScraper):
    merchant = "crash"

    def __init__(self, fetcher) -> None:
        raise RuntimeError("cannot even start")


@pytest.fixture(autouse=True)
def fake_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        pipeline,
        "SCRAPERS",
        {cls.merchant: cls for cls in (GoodScraper, HalfBrokenScraper, CrashingScraper)},
    )


async def test_one_store_failing_does_not_block_others() -> None:
    results = await pipeline.run_scrape(["crash", "half", "good"], [Category.GPU, Category.CPU])
    by_store = {result.store: result for result in results}

    assert [result.store for result in results] == ["crash", "half", "good"]
    assert by_store["crash"].listings == []
    assert "cannot even start" in by_store["crash"].errors[0]
    # The failing category is reported; the other category still comes through.
    assert [item.category for item in by_store["half"].listings] == [Category.CPU]
    assert by_store["half"].errors == ["gpu: RuntimeError: gpu page exploded"]
    assert len(by_store["good"].listings) == 2
    assert by_store["good"].errors == []


async def test_unsupported_categories_are_skipped() -> None:
    (result,) = await pipeline.run_scrape(["good"], [Category.SSD, Category.GPU])
    assert [item.category for item in result.listings] == [Category.GPU]
    assert result.errors == []


async def test_unknown_store_is_rejected() -> None:
    with pytest.raises(ValueError, match="no scraper registered"):
        await pipeline.run_scrape(["nope"], [Category.GPU])
