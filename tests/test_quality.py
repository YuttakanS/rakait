from datetime import datetime, timezone
from decimal import Decimal

from pricewatch.models import Category, ScrapedListing
from pricewatch.pipeline import ScrapeRun
from pricewatch.quality import annotate_runs, run_warnings

T0 = datetime(2026, 11, 11, tzinfo=timezone.utc)


def _listing(sku: str, price: Decimal | None, category: Category = Category.GPU) -> ScrapedListing:
    return ScrapedListing(
        merchant="jib",
        merchant_sku=sku,
        category=category,
        title=f"item {sku}",
        url=f"https://example.com/{sku}",  # type: ignore[arg-type]
        price=price,
        in_stock=True,
        scraped_at=T0,
    )


def _run(count: int, category: Category | None = Category.GPU, error: str | None = None):
    return ScrapeRun("jib", category, T0, T0, count, error)


def test_healthy_run_has_no_warnings() -> None:
    items = [_listing(str(i), Decimal(1000)) for i in range(10)]
    assert run_warnings(_run(10), items, baseline=11) == []


def test_zero_listings_without_error_warns() -> None:
    assert run_warnings(_run(0), [], baseline=None) == ["no listings returned"]


def test_failed_runs_are_not_double_reported() -> None:
    assert run_warnings(_run(0, error="FetchError"), [], baseline=100) == []
    assert run_warnings(_run(0, category=None, error="crash"), [], baseline=None) == []


def test_missing_prices_warn() -> None:
    items = [_listing("a", None), _listing("b", None), _listing("c", Decimal(5))]
    assert run_warnings(_run(3), items, baseline=None) == ["2/3 listings have no price"]


def test_count_drop_against_baseline_warns() -> None:
    items = [_listing(str(i), Decimal(1)) for i in range(40)]
    assert run_warnings(_run(40), items, baseline=200) == [
        "40 listings, 80% below the recent median of 200"
    ]
    assert run_warnings(_run(40), items, baseline=79) == []  # within half of the median


def test_annotate_runs_groups_listings_by_store_and_category() -> None:
    gpus = [_listing(str(i), Decimal(1)) for i in range(5)]
    cpus = [_listing(f"c{i}", None, Category.CPU) for i in range(3)]
    runs = [_run(5), _run(3, Category.CPU), _run(0, Category.RAM)]

    annotated = annotate_runs(runs, gpus + cpus, {("jib", Category.GPU): 6.0})

    assert [run.warning for run in annotated] == [
        None,
        "3/3 listings have no price",
        "no listings returned",
    ]
