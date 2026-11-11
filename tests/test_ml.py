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


def test_rows_missing_required_features_are_not_scored() -> None:
    n = 150
    cores = RNG.choice([4.0, 6.0, 8.0, 16.0], size=n)
    clock = RNG.uniform(3, 5, size=n)
    price = pd.Series(np.exp(7 + 0.9 * np.log2(cores) + 0.1 * clock + RNG.normal(0, 0.05, n)))
    features = pd.DataFrame({"log2_cores": np.log2(cores), "clock": clock})
    # Old budget CPUs whose titles omit the core count: cheap, specs unknown.
    features.loc[:9, "log2_cores"] = np.nan
    price.iloc[:10] = 1500.0

    fit = m.fit_fair_value(features, price, required=["log2_cores"])

    assert fit.n == n - 10
    assert fit.fair_price.iloc[:10].isna().all()  # no guessed fair price
    assert fit.z_residual.iloc[:10].isna().all()
    assert fit.fair_price.iloc[10:].notna().all()
    assert m.deal_score(fit.z_residual).iloc[:10].isna().all()


def test_optional_gaps_get_an_indicator_instead_of_a_bare_median() -> None:
    n = 160
    vram = RNG.choice([8.0, 16.0], size=n)
    boost = RNG.uniform(2000, 2800, size=n)
    old = np.arange(n) < 40  # old cards: no boost clock in the title, and cheap
    price = pd.Series(np.exp(8 + 0.8 * np.log2(vram) - 1.0 * old + RNG.normal(0, 0.05, n)))
    features = pd.DataFrame({"log2_vram": np.log2(vram), "boost": np.where(old, np.nan, boost)})

    fit = m.fit_fair_value(features, price, required=["log2_vram"])

    assert "boost_missing" in fit.features
    # With the indicator the old cards are priced as old cards, not as
    # median-spec new ones: no phantom 60% bargains.
    pct = price / fit.fair_price - 1
    assert pct[old].abs().median() < 0.1


def test_mlr_features_log_scale_capacities() -> None:
    from pricewatch.ml.train import mlr_features

    out = mlr_features(pd.DataFrame({"capacity_gb": [500.0, 1000.0, 0.0], "nvme": [1.0, 1.0, 0.0]}))
    assert "capacity_gb" not in out
    assert out["log2_capacity_gb"].iloc[1] == pytest.approx(np.log2(1000))
    assert np.isnan(out["log2_capacity_gb"].iloc[2])  # 0 GB is missing, not -inf


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
    rng = np.random.default_rng(11)  # own stream: independent of test order

    def block(views: float, sales: float, size: int = 30) -> pd.DataFrame:
        return pd.DataFrame(
            {
                "views": rng.normal(views, views * 0.05, size),
                "sales": rng.normal(sales, sales * 0.05, size),
                "price": rng.normal(1.0, 0.02, size),
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
    # Four well-separated demand blobs: Ward largely agrees with K-Means. Not
    # exactly: price noise is standardised to unit variance too, and Ward may
    # cut a blob along it.
    assert seg.hierarchy is not None
    assert seg.hierarchy.k == 4
    assert seg.hierarchy.ari_vs_kmeans > 0.8
    assert seg.hierarchy.cophenetic_corr > 0.7
    assert seg.hierarchy.linkage.shape == (len(data) - 1, 4)


def test_compare_hierarchical_refuses_oversized_inputs() -> None:
    x = np.zeros((m.MAX_HIERARCHICAL_N + 1, 2))
    with pytest.raises(ValueError, match="hierarchical limit"):
        m.compare_hierarchical(x, np.zeros(len(x), dtype=int), 2)


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
            1: [(0, 1000, True), (20, 900, True)],  # price falls -> wait
            2: [(0, 1000, True), (20, 1000, False)],  # sells out -> buy now
            3: [(0, 1000, True), (20, 1000, True)],  # stable -> fair
            4: [(0, 1000, True), (90, 500, True)],  # change beyond horizon -> unlabelled
            5: [(0, 1000, True), (0.2, 900, True)],  # hours of future only -> unlabelled
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
    assert ins["recommendation_reason"].str.startswith("กฎจาก Deal Score").all()  # no history yet
    assert ("gpu", "simple_regression") in report.market
    assert ("gpu", "fair_value_mlr") in report.market
    assert ("all", "demand_kmeans") in report.market
    assert any("timing tree" in note for note in report.notes)


def test_timing_tree_is_rejected_when_it_cannot_beat_chance() -> None:
    rng = np.random.default_rng(5)
    n = 300
    examples = pd.DataFrame(
        {
            **{f: rng.normal(size=n) for f in m.TIMING_FEATURES},
            "label": rng.choice([m.WAIT, m.FAIR, m.BUY_NOW], size=n),  # pure noise
            "scraped_at": pd.date_range("2025-01-01", periods=n, freq="D"),
        }
    )
    model = m.fit_timing_tree(examples)
    assert model.baseline_balanced_accuracy == pytest.approx(1 / 3)
    assert model.usable is False


def test_timing_tree_learns_a_real_signal() -> None:
    rng = np.random.default_rng(6)
    n = 400
    pct = rng.uniform(-0.2, 0.2, size=n)
    examples = pd.DataFrame(
        {
            **{f: rng.normal(size=n) for f in m.TIMING_FEATURES},
            "scraped_at": pd.date_range("2025-01-01", periods=n, freq="D"),
        }
    )
    examples["pct_vs_model_median"] = pct
    examples["label"] = np.where(pct > 0.07, m.WAIT, np.where(pct < -0.07, m.BUY_NOW, m.FAIR))
    model = m.fit_timing_tree(examples)
    assert model.balanced_accuracy_test > 0.9
    assert model.usable is True


def test_name_segments_reads_conversion_relative_to_attention() -> None:
    # Centroids seen on the live JIB data at k=4: views and sales correlate,
    # and the best seller converts far better than its views suggest.
    names = m.name_segments([(1.16, 0.38), (-0.45, -0.35), (-1.78, -0.70), (0.59, 3.75)])
    assert names == [m.FAVORITE, m.NICHE, m.NICHE, m.HIDDEN_GEM]


def test_name_segments_finds_hype_and_requires_a_margin() -> None:
    assert m.name_segments([(0.19, -0.37), (0.1, 0.3)]) == [m.HYPE, m.FAVORITE]
    # Sales barely above views is not a hidden gem.
    assert m.name_segments([(0.5, 0.7)]) == [m.FAVORITE]


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        ({"deal_score": 95, "in_stock": False, "stock_quantity": None}, m.WAIT),  # cannot buy
        ({"deal_score": 85, "in_stock": True, "stock_quantity": 2}, m.BUY_NOW),
        ({"deal_score": 70, "in_stock": True, "stock_quantity": None}, m.FAIR),
        ({"deal_score": 10, "in_stock": True, "stock_quantity": None}, m.WAIT),
        ({"deal_score": np.nan, "in_stock": True, "stock_quantity": None}, None),  # unscored
    ],
)
def test_rule_recommendation(row: dict[str, object], expected: str | None) -> None:
    from pricewatch.ml.train import rule_recommendation

    label, reason = rule_recommendation(pd.Series(row))
    assert label == expected
    assert reason
