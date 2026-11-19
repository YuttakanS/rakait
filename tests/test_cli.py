"""``pricewatch scrape`` store selection: paused stores (SPEC round 22a)."""

from collections.abc import Sequence

import pytest

from pricewatch import cli
from pricewatch.models import Category
from pricewatch.pipeline import ScrapeRun, StoreResult, _now
from pricewatch.scrapers import PAUSED_STORES, SCRAPERS, active_stores


@pytest.fixture
def scraped(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Replace the network scrape; record the stores asked for.

    Every store returns an empty, error-free result, except ``banana``, which
    fails the way Cloudflare's challenge makes it fail.
    """
    asked: list[str] = []

    async def fake_run_scrape(
        stores: Sequence[str], categories: Sequence[Category], *, max_pages: int | None = None
    ) -> list[StoreResult]:
        asked.extend(stores)
        results = []
        for store in stores:
            error = "FetchError: HTTP 403" if store == "banana" else None
            runs = []
            if error is not None:
                runs.append(
                    ScrapeRun(
                        store=store,
                        category=None,
                        started_at=_now(),
                        finished_at=_now(),
                        listing_count=0,
                        error=error,
                    )
                )
            results.append(StoreResult(store=store, runs=runs))
        return results

    monkeypatch.setattr(cli, "run_scrape", fake_run_scrape)
    return asked


def test_banana_is_paused_with_its_reason() -> None:
    assert PAUSED_STORES == {"banana": "Cloudflare bot challenge since 2026-11-17"}
    # Paused, not removed: the scraper is still registered for --store.
    assert "banana" in SCRAPERS
    assert active_stores() == sorted(set(SCRAPERS) - {"banana"})


def test_default_scrape_skips_paused_stores_and_succeeds(
    scraped: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    assert cli.main(["scrape", "--dry-run"]) == 0

    assert scraped == active_stores()
    out, err = capsys.readouterr()
    skipped = [line for line in out.splitlines() if "paused" in line]
    assert skipped == [
        "banana: paused, skipped (Cloudflare bot challenge since 2026-11-17); "
        "run with --store banana to retry"
    ]
    # Skipping is neither an error nor a quality warning.
    assert "ERROR" not in err
    assert "WARN" not in err


def test_explicit_store_still_runs_a_paused_store(
    scraped: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    # Still blocked: the 403 fails the command as any store failure does.
    assert cli.main(["scrape", "--store", "banana", "--dry-run"]) == 1

    assert scraped == ["banana"]
    out, err = capsys.readouterr()
    assert "paused" not in out
    assert "ERROR FetchError: HTTP 403" in err
