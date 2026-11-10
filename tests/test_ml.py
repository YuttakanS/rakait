from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from pricewatch.ml import models as m
from pricewatch.ml.train import gpu_class, run_models

RNG = np.random.default_rng(0)


def test_simple_regression_recovers_known_slope() -> None:
    vram = pd.Series(RNG.choice([4, 6, 8, 12, 16, 24], size=200).astype(float))
    price = 2000 + 1000 * vram + RNG.normal(0, 300, size=200)

    fit = m.simple_regression(vram, pd.Series(price), "vram_gb")

    assert fit.slope == pytest.approx(1000, rel=0.03)
    assert fit.intercept == pytest.approx(2000, abs=400)
    assert fit.r2 > 0.95


def test_simple_regression_rejects_constant_feature() -> None:
    with pytest.raises(ValueError, match="variation"):
        m.simple_regression(pd.Series([8.0] * 10), pd.Series(range(10), dtype=float), "vram_gb")


def test_fair_value_flags_underpriced_listing() -> None:
    n = 120
    features = pd.DataFrame(
        {"vram_gb": RNG.choice([8, 12, 16], size=n), "perf_class": RNG.uniform(5, 9, size=n)}
    )
    log_price = 7 + 0.05 * features["vram_gb"] + 0.3 * features["perf_class"]
    price = pd.Series(np.exp(log_price + RNG.normal(0, 0.03, size=n)))
    price.iloc[0] *= 0.7  # A 30% bargain.

    fit = m.fit_fair_value(features, price)
    scores = m.deal_score(fit.z_residual)

    assert fit.r2_cv > 0.9
    assert fit.mape_cv < 0.06
    assert scores.iloc[0] >= 95
    assert scores.iloc[0] == scores.max()
    assert price.iloc[0] / fit.fair_price.iloc[0] - 1 == pytest.approx(-0.3, abs=0.06)


def test_deal_score_is_50_at_fair_value_and_monotone() -> None:
    scores = m.deal_score(pd.Series([-2.0, -1.0, 0.0, 1.0, 2.0]))
    assert scores.tolist() == [98, 84, 50, 16, 2]


def test_tier_tree_respects_depth_limit() -> None:
    n = 200
    perf = pd.Series(RNG.uniform(3, 9, size=n))
    price = pd.Series(
        np.where(perf < 6, 8000, np.where(perf < 8, 20000, 45000)) + RNG.normal(0, 500, n)
    )

    tree = m.fit_tier_tree(pd.DataFrame({"perf_class": perf}), price)

    assert tree.model.get_depth() <= m.MAX_TREE_DEPTH
    assert tree.r2_cv > 0.95
    assert "perf_class <=" in tree.rules


def test_segment_demand_names_clusters_from_centroids() -> None:
    def block(views: float, sales: float, size: int = 30) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "views": RNG.normal(views, views * 0.05, size),
                "sales": RNG.normal(sales, sales * 0.05, size),
                "price": RNG.normal(1.0, 0.02, size),
            }
        )

    data = pd.concat(
        [block(50_000, 5.0), block(50_000, 0.02), block(500, 5.0), block(500, 0.02)],
        ignore_index=True,
    )
    seg = m.segment_demand(data["views"], data["sales"], data["price"], k_range=range(4, 5))

    assert seg.labels.iloc[0] == "community_favorite"
    assert seg.labels.iloc[30] == "overpriced_hype"
    assert seg.labels.iloc[60] == "hidden_gem"
    assert seg.labels.iloc[90] == "niche"
    assert seg.silhouette > 0.5


def _history(paths: dict[int, list[tuple[int, float, bool]]]) -> pd.DataFrame:
    t0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = [
        {
            "listing_id": lid,
            "category": "gpu",
            "canonical_id": 1,
            "scraped_at": pd.Timestamp(t0 + timedelta(days=day)),
            "price": price,
            "in_stock": stock,
            "sold_count": np.nan,
            "stock_quantity": np.nan,
            "first_seen_at": pd.Timestamp(t0),
        }
        for lid, obs in paths.items()
        for day, price, stock in obs
    ]
    return pd.DataFrame(rows)


def test_label_price_paths_uses_only_the_future_for_labels() -> None:
    history = _history(
        {
            1: [(0, 1000, True), (10, 900, True)],  # price falls -> wait
            2: [(0, 1000, True), (10, 1000, False)],  # sells out -> buy now
            3: [(0, 1000, True), (10, 1000, True)],  # stable -> fair
            4: [(0, 1000, True), (90, 500, True)],  # change beyond horizon -> fair
        }
    )
    examples = m.label_price_paths(history, horizon_days=35)

    assert examples["label"].tolist() == [m.WAIT, m.BUY_NOW, m.FAIR]
    # The last observation of each listing has no future, so it is unlabelled.
    assert len(examples) == 3


def test_timing_tree_needs_enough_history() -> None:
    with pytest.raises(ValueError, match="not enough history"):
        m.fit_timing_tree(pd.DataFrame({"label": [m.WAIT] * 5, "scraped_at": range(5)}))


@pytest.mark.parametrize(
    ("chip", "expected"),
    [
        ("GeForce RTX 5070 Ti", (5, 7.5)),
        ("GeForce RTX 3050", (3, 5.0)),
        ("GeForce GT 1030", (1, 3.0)),
        ("Radeon RX 9070 XT", (9, 7.5)),
        ("Radeon RX 7600", (7, 6.0)),
        (None, None),
    ],
)
def test_gpu_class(chip: object, expected: tuple[float, float] | None) -> None:
    result = gpu_class(chip)
    if expected is None:
        assert all(np.isnan(v) for v in result)
    else:
        assert result == expected


def test_run_models_end_to_end_on_synthetic_catalogue() -> None:
    n = 90
    chips = RNG.choice(["GeForce RTX 5060", "GeForce RTX 5070", "Radeon RX 9070 XT"], size=n)
    vram = np.where(chips == "GeForce RTX 5060", 8, 16)
    base = np.select(
        [chips == "GeForce RTX 5060", chips == "GeForce RTX 5070"], [11000, 20000], 26000
    )
    current = pd.DataFrame(
        {
            "listing_id": np.arange(n),
            "category": "gpu",
            "canonical_id": pd.Series(chips).astype("category").cat.codes,
            "manufacturer": "NVIDIA",
            "chip": chips,
            "vram_gb": vram,
            "price": base * RNG.uniform(0.9, 1.1, size=n),
            "view_count": RNG.lognormal(8, 1.5, size=n),
            "sales_per_day": RNG.lognormal(-2, 1.5, size=n),
            "views_per_day": np.nan,
            "in_stock": True,
            "stock_quantity": np.nan,
            "age_days": 30,
        }
    )

    report = run_models(current, pd.DataFrame(), figures=None)

    ins = report.insights
    assert ins["deal_score"].between(0, 100).all()
    assert ins["fair_price"].notna().all()
    assert set(ins["recommendation"]) <= {m.BUY_NOW, m.WAIT, m.FAIR}
    assert ins["recommendation_reason"].str.startswith("rules:").all()  # no history yet
    assert ("gpu", "simple_regression") in report.market
    assert ("gpu", "fair_value_mlr") in report.market
    assert ("all", "demand_kmeans") in report.market
    assert any("timing tree" in note for note in report.notes)
