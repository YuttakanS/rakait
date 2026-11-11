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
        ("GeForce RTX 5070 Ti", (2025, 7.5)),
        ("GeForce RTX 3050", (2020, 5.0)),
        ("GeForce GT 1030", (2017, 3.0)),
        # Model number 710 once read as "generation 7", newer than RTX 50.
        ("GeForce GT 710", (2014, 1.0)),
        ("Radeon RX 9070 XT", (2025, 7.5)),
        ("Radeon RX 7600", (2022, 6.0)),
        (None, None),
    ],
)
def test_gpu_class(chip: object, expected: tuple[float, float] | None) -> None:
    result = gpu_class(chip)
    if expected is None:
        assert all(np.isnan(v) for v in result)
    else:
        assert result == expected


@pytest.mark.parametrize(
    ("model", "generation", "expected"),
    [
        ("Ryzen 5 4500", 4, (2020, 5.0)),
        ("Ryzen 5 9600X", 9, (2024, 5.0)),
        ("Core i7-14700F", 14, (2023, 7.0)),
        ("Core Ultra 9 285K", np.nan, (2024, 9.0)),
        ("Ryzen Threadripper Pro 9995WX", 9, (2024, 11.0)),
    ],
)
def test_cpu_release(model: str, generation: float, expected: tuple[float, float]) -> None:
    from pricewatch.ml.train import cpu_release

    assert cpu_release(model, generation) == expected


def test_sold_out_stale_prices_are_scored_but_not_learned() -> None:
    rng = np.random.default_rng(31)
    n = 200
    gb = rng.choice([8.0, 16.0, 32.0], size=n)
    price = pd.Series(np.exp(7 + 0.9 * np.log2(gb) + rng.normal(0, 0.05, n)))
    sold_out = pd.Series(np.arange(n) < 60)
    price[sold_out] *= 0.4  # last price before a market-wide increase
    features = pd.DataFrame({"log2_gb": np.log2(gb)})

    naive = m.fit_fair_value(features, price)
    fit = m.fit_fair_value(features, price, fit_mask=~sold_out)

    pct = price / fit.fair_price - 1
    assert fit.n == n - 60
    assert fit.mape_cv < 0.06 < naive.mape_cv
    assert pct[~sold_out].abs().median() < 0.05  # in-stock rows priced right
    assert pct[sold_out].median() == pytest.approx(-0.6, abs=0.05)  # stale, still scored


def test_extrapolated_rows_are_not_scored() -> None:
    rng = np.random.default_rng(41)
    n = 120
    year = rng.choice([2022.0, 2025.0], size=n)
    tier = rng.uniform(5, 9, size=n)
    # One ancient card far outside the data: about 15 SD out on year, so its
    # held-out leverage (~ z^2 / n) is above 1.
    year[0], tier[0] = 2000.0, 1.0
    price = pd.Series(np.exp(8 + 0.3 * tier + 0.05 * (year - 2020) + rng.normal(0, 0.05, n)))
    features = pd.DataFrame({"year": year, "tier": tier})

    fit = m.fit_fair_value(features, price)

    assert fit.extrapolated >= 1
    assert np.isnan(fit.fair_price.iloc[0])
    assert np.isnan(fit.z_residual.iloc[0])
    assert fit.fair_price.iloc[1:].notna().all()
    assert fit.leverage is not None and (fit.leverage.iloc[1:] <= m.MAX_LEVERAGE).all()


def test_run_models_end_to_end_on_synthetic_catalogue(seed: int = 7) -> None:
    rng = np.random.default_rng(seed)  # own stream: independent of test order
    # Twelve products (six chips, three per vendor, x two VRAM sizes), so
    # every product shares each spec value with others: product-grouped CV
    # can price each one from the rest within the leverage limit. With one
    # product per chip it could not, and only the pseudo-inverse's arbitrary
    # split of a constant column used to hide that.
    n = 180
    names = [
        "GeForce RTX 5060",
        "GeForce RTX 5060 Ti",
        "GeForce RTX 5070",
        "Radeon RX 9060 XT",
        "Radeon RX 9070",
        "Radeon RX 9070 XT",
    ]
    chip_idx = rng.integers(0, 6, size=n)
    big = rng.integers(0, 2, size=n)
    chips = np.array(names)[chip_idx]
    vram = np.where(big == 1, 16, 8)
    base = np.array([11000, 15000, 20000, 12000, 21000, 26000])[chip_idx] * np.where(
        big == 1, 1.15, 1.0
    )
    current = pd.DataFrame(
        {
            "listing_id": np.arange(n),
            "category": "gpu",
            "canonical_id": chip_idx * 2 + big,
            "manufacturer": "NVIDIA",
            "chip": chips,
            "vram_gb": vram,
            "price": base * rng.uniform(0.9, 1.1, size=n),
            "view_count": rng.lognormal(8, 1.5, size=n),
            "sales_per_day": rng.lognormal(-2, 1.5, size=n),
            "views_per_day": np.nan,
            "in_stock": True,
            "stock_quantity": np.nan,
            "age_days": 30,
        }
    )

    report = run_models(current, pd.DataFrame(), figures=None)

    ins = report.insights
    scored = ins["fair_price"].notna()
    # Some folds hold out every high-class Radeon at once; those rows lie
    # outside what the fold saw (leverage > 1) and are rightly left unscored.
    assert scored.mean() >= 0.75
    assert ins.loc[scored, "deal_score"].between(0, 100).all()
    assert ins.loc[~scored, "deal_score"].isna().all()
    advised = ins["recommendation"].notna()  # no score and no history: no advice
    assert advised[scored].all()
    assert set(ins.loc[advised, "recommendation"]) <= {m.BUY_NOW, m.WAIT, m.FAIR}
    # No history yet, so every recommendation comes from the Deal Score rules.
    assert ins.loc[advised, "recommendation_reason"].str.startswith("กฎจาก Deal Score").all()
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


def test_demand_features_are_per_product_so_stores_get_one_fair_price() -> None:
    from pricewatch.ml.train import demand_features

    frame = pd.DataFrame(
        {
            "canonical_id": [1.0, 1.0, 2.0, np.nan],
            "view_count": [1000.0, np.nan, np.nan, 50.0],  # only one store publishes views
            "sales_per_day": [0.5, np.nan, np.nan, np.nan],
        }
    )
    out = demand_features(frame)

    # Both listings of product 1 carry the product's demand, whatever the store.
    assert out["log_views"].iloc[0] == out["log_views"].iloc[1] == pytest.approx(np.log1p(1000))
    assert np.isnan(out["log_views"].iloc[2])  # no store publishes views for product 2
    assert out["log_views"].iloc[3] == pytest.approx(np.log1p(50))  # unlinked: own counter


def test_fair_price_is_one_value_per_product_across_stores() -> None:
    from pricewatch.ml.train import model_level, product_key

    rng = np.random.default_rng(21)
    rows = []
    for product in range(40):
        cores = rng.choice([4, 6, 8, 12, 16])
        for store in range(3):
            clock = 3.5 if store != 2 else 5.8  # one store's title gives the boost clock
            rows.append(
                {
                    "listing_id": len(rows),
                    "canonical_id": float(product),
                    "log2_cores": np.log2(cores),
                    "clock": clock,
                    "price": np.exp(7 + 0.9 * np.log2(cores) + rng.normal(0, 0.05)),
                }
            )
    frame = pd.DataFrame(rows)
    key = product_key(frame)
    feats = model_level(frame[["log2_cores", "clock"]], key)

    fit = m.fit_fair_value(feats, frame["price"], required=["log2_cores"], groups=key)

    spread = fit.fair_price.groupby(key).agg(lambda v: v.max() / v.min() - 1)
    assert spread.max() == pytest.approx(0.0, abs=1e-9)


def test_vif_matches_auxiliary_regression() -> None:
    from sklearn.linear_model import LinearRegression

    rng = np.random.default_rng(5)
    a = rng.normal(size=500)
    b = 0.9 * a + rng.normal(scale=0.3, size=500)  # strongly collinear with a
    c = rng.normal(size=500)
    x = np.column_stack([a, b, c])

    vif = m.variance_inflation(x, ["a", "b", "c"])

    r2_b = LinearRegression().fit(x[:, [0, 2]], b).score(x[:, [0, 2]], b)
    assert vif["b"] == pytest.approx(1 / (1 - r2_b), rel=1e-6)
    assert vif["b"] > 5
    assert vif["c"] == pytest.approx(1.0, abs=0.05)


def test_diagnostics_detect_heteroscedasticity_and_accept_normal_noise() -> None:
    from sklearn.linear_model import LinearRegression

    rng = np.random.default_rng(9)
    x = rng.uniform(0, 1, size=(800, 1))
    y_hom = 1 + 2 * x[:, 0] + rng.normal(scale=0.1, size=800)
    y_het = 1 + 2 * x[:, 0] + rng.normal(size=800) * (0.02 + 0.5 * x[:, 0])

    hom = m.regression_diagnostics(x, y_hom, LinearRegression().fit(x, y_hom), ["x"])
    het = m.regression_diagnostics(x, y_het, LinearRegression().fit(x, y_het), ["x"])

    assert hom.breusch_pagan_p > 0.01
    assert hom.jarque_bera_p > 0.01
    assert het.breusch_pagan_p < 1e-6
    assert hom.residual.mean() == pytest.approx(0.0, abs=1e-9)


def test_fair_value_model_carries_diagnostics() -> None:
    n = 100
    features = pd.DataFrame({"a": RNG.normal(size=n), "b": RNG.normal(size=n)})
    price = pd.Series(np.exp(8 + 0.3 * features["a"] + RNG.normal(0, 0.05, n)))

    fit = m.fit_fair_value(features, price)

    assert fit.diagnostics is not None
    summary = fit.diagnostics.summary()
    assert set(summary["vif"]) == set(fit.features)
    assert summary["n"] == n


def test_constant_required_feature_still_scores() -> None:
    # One GPU generation only: "generation" is complete but constant.
    n = 60
    vram = RNG.choice([8.0, 12.0, 16.0], size=n)
    features = pd.DataFrame({"log2_vram": np.log2(vram), "generation": 5.0})
    price = pd.Series(np.exp(8 + 0.8 * np.log2(vram) + RNG.normal(0, 0.05, n)))

    fit = m.fit_fair_value(features, price, required=["log2_vram", "generation"])

    assert fit.fair_price.notna().all()
    assert "generation" not in fit.features


def test_indicator_unseen_by_a_fold_does_not_blow_up_the_fair_price() -> None:
    # One product is the only one missing an optional spec, so its gap
    # indicator is constant (all zero) in the fold that holds it out. The
    # pseudo-inverse used to split the intercept onto that column and
    # predict the product at e^-9 of its price; Duan's smearing then
    # multiplied every fair price in the category by ~70 (live CPUs, 2026-11).
    n = 120
    rng = np.random.default_rng(3)
    cores = rng.choice([6.0, 8.0, 12.0, 16.0], size=n)
    sales = rng.uniform(0, 3, size=n)
    sales[0] = np.nan
    features = pd.DataFrame({"log2_cores": np.log2(cores), "log_sales": sales})
    price = pd.Series(np.exp(8 + 0.8 * np.log2(cores) + rng.normal(0, 0.05, size=n)))
    groups = pd.Series(np.arange(n, dtype=float))

    fit = m.fit_fair_value(features, price, required=["log2_cores"], groups=groups)

    assert np.isnan(fit.fair_price.iloc[0])  # outside every span its fold saw
    ratio = (fit.fair_price / price).dropna()
    assert ratio.between(0.8, 1.25).all()
    assert fit.r2_cv > 0.9


def test_gpu_mlr_leaves_out_vendor_incomparable_specs() -> None:
    from pricewatch.ml.train import NOT_IN_MLR, spec_features
    from pricewatch.models import Category

    frame = pd.DataFrame(
        {"chip": ["Radeon RX 9070 XT", "GeForce RTX 5070 Ti", None], "vram_gb": [16, 16, 8]}
    )
    specs = spec_features(frame, Category.GPU)

    assert specs["is_amd"].tolist() == [1.0, 0.0, 0.0]
    assert {"shader_cores", "boost_clock_mhz"} <= set(NOT_IN_MLR[Category.GPU])
    assert "is_amd" not in NOT_IN_MLR[Category.GPU]
