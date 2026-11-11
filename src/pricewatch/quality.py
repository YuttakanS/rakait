"""Data-quality checks on a completed scrape, before it is persisted.

A merchant redesign rarely makes a scraper raise: selectors silently match
fewer cards, or the price node moves and every price parses as ``None``. These
checks compare each successful (store, category) run against itself and
against the median of its recent history and attach a human-readable warning.

All checks are O(n) in the run's listings plus O(1) per run against the
precomputed baselines, so they add nothing measurable to a scrape.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import replace

from pricewatch.models import Category, ScrapedListing
from pricewatch.pipeline import ScrapeRun

#: A run below this fraction of its recent median listing count is flagged.
MIN_COUNT_RATIO = 0.5
#: A run where more than this fraction of listings lack a price is flagged.
MAX_MISSING_PRICE = 0.5

BaselineKey = tuple[str, Category]


def run_warnings(
    run: ScrapeRun, listings: Sequence[ScrapedListing], baseline: float | None
) -> list[str]:
    """Return the quality warnings for one successful run.

    Args:
        run: The run record; failed runs (``error`` set) are not checked,
            since the error already explains the gap.
        listings: The run's listings.
        baseline: Median listing count of the recent successful runs of the
            same (store, category), or ``None`` without history.

    Returns:
        Warning messages, empty when the run looks healthy.
    """
    if run.error is not None or run.category is None:
        return []
    count = len(listings)
    if count == 0:
        return ["no listings returned"]

    warnings: list[str] = []
    missing = sum(1 for item in listings if item.price is None)
    if missing > MAX_MISSING_PRICE * count:
        warnings.append(f"{missing}/{count} listings have no price")
    if baseline is not None and baseline > 0 and count < MIN_COUNT_RATIO * baseline:
        drop = 1 - count / baseline
        warnings.append(f"{count} listings, {drop:.0%} below the recent median of {baseline:g}")
    return warnings


def annotate_runs(
    runs: Sequence[ScrapeRun],
    listings: Sequence[ScrapedListing],
    baselines: Mapping[BaselineKey, float],
) -> list[ScrapeRun]:
    """Attach quality warnings to every run of a scrape.

    Args:
        runs: Run records from :func:`pricewatch.pipeline.run_scrape`.
        listings: Every listing the scrape produced.
        baselines: Recent median listing count per (store, category).

    Returns:
        The runs, in order, with ``warning`` set where a check failed.
    """
    by_run: dict[BaselineKey, list[ScrapedListing]] = defaultdict(list)
    for item in listings:
        by_run[(item.merchant, item.category)].append(item)

    annotated: list[ScrapeRun] = []
    for run in runs:
        key = (run.store, run.category) if run.category is not None else None
        found = run_warnings(
            run,
            by_run.get(key, []) if key is not None else [],
            baselines.get(key) if key is not None else None,
        )
        annotated.append(replace(run, warning="; ".join(found)) if found else run)
    return annotated
