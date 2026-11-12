from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
import pytest

from pricewatch.ml import models as m
from pricewatch.ml.train import gpu_class, model_demand, run_models

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

    # Two clusters sell above average; pooled, their median views fall between
    # the 50,000-view and the 500-view blob, so the split matches the blobs.
    assert (seg.labels.iloc[:30] == m.FAVORITE).all()
    assert (seg.labels.iloc[30:60] == m.HYPE).all()
    assert (seg.labels.iloc[60:90] == m.HIDDEN_GEM).all()
    assert (seg.labels.iloc[90:] == m.NICHE).all()
    assert sum(c["split_by_views"] for c in seg.centroids) == 2
    assert [s["label"] for s in seg.segments] == list(m.SEGMENT_LABELS)
    assert all(s["size"] == 30 for s in seg.segments)
    assert seg.split_views is not None and 500 < seg.split_views < 50_000
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


def _gpu_catalogue(seed: int) -> pd.DataFrame:
    """Synthetic in-stock GPU listings priced from their specs (±10% noise)."""
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
    return pd.DataFrame(
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


def test_run_models_end_to_end_on_synthetic_catalogue(seed: int = 7) -> None:
    current = _gpu_catalogue(seed)

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
    # No history yet, so every recommendation comes from the Deal Score rules,
    # whose reasons are plain shopper sentences without a rule-name prefix.
    reasons = ins.loc[advised, "recommendation_reason"]
    assert not reasons.str.contains("กฎจาก|Deal Score|Decision Tree").any()
    clear = ins["recommendation"].isin([m.BUY_NOW, m.WAIT])
    numbered = r"\d+% ซึ่งเกินช่วงคลาดเคลื่อน ±\d+%"
    assert clear.any() and ins.loc[clear, "recommendation_reason"].str.contains(numbered).all()
    assert ("gpu", "simple_regression") in report.market
    assert ("gpu", "fair_value_mlr") in report.market
    # Demand groups are per model (SPEC round 8): twelve models are too few
    # to cluster, so no listing gets a group (the catalogue tests below cover it).
    assert ("all", "demand_kmeans") not in report.market
    assert ins["demand_cluster"].isna().all()
    assert any(note.startswith("demand clustering: only 12 rows") for note in report.notes)
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


def test_name_segments_marks_above_average_sellers_for_the_views_split() -> None:
    # Centroids of the live 2026.11-v6 run shape: one cluster sells above
    # average; it is no longer named from its centroid alone.
    names = m.name_segments([(1.16, -0.38), (-0.45, -0.35), (-1.78, -0.70), (0.67, 3.62)])
    assert names == [m.HYPE, m.NICHE, m.NICHE, m.BEST_SELLERS]


def test_name_segments_finds_hype_and_requires_a_margin() -> None:
    assert m.name_segments([(0.19, -0.37), (0.1, 0.8)]) == [m.HYPE, m.BEST_SELLERS]
    # Views barely above sales is not hype.
    assert m.name_segments([(0.2, -0.1)]) == [m.NICHE]


def test_name_segments_needs_sales_clearly_above_average_for_best_sellers() -> None:
    # SPEC round 9 addendum (rule A): 0 < sales_z <= 0.5 is not a best seller.
    # The live v9 shape: many views, average sales (sales_z 0.002) is hype; a
    # price outlier with sales_z 0.12 and modest views is niche.
    names = m.name_segments([(1.29, 0.002), (0.36, 0.12), (-0.2, 0.5), (-0.2, 0.51)])
    assert names == [m.HYPE, m.NICHE, m.NICHE, m.BEST_SELLERS]


def _demand_blobs(blobs: list[tuple[float, float, int]], seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    return pd.concat(
        [
            pd.DataFrame(
                {
                    "views": rng.lognormal(np.log(views), 0.6, size),
                    "sales": rng.normal(sales, sales * 0.05, size),
                    "price": rng.normal(1.0, 0.02, size),
                }
            )
            for views, sales, size in blobs
        ],
        ignore_index=True,
    )


def test_one_best_selling_cluster_yields_both_profiles_split_by_views() -> None:
    # One small blob sells far above the rest (like the live k=6 run); its
    # views spread widely, so the median splits it into two labelled halves.
    data = _demand_blobs(
        [(20_000, 0.01, 60), (300, 0.01, 60), (2_000, 0.002, 60), (5_000, 3.0, 30)], seed=3
    )
    seg = m.segment_demand(data["views"], data["sales"], data["price"], k_range=range(4, 5))

    sellers = seg.labels.isin([m.FAVORITE, m.HIDDEN_GEM])
    assert sum(c["split_by_views"] for c in seg.centroids) == 1
    assert sellers.sum() == 30 and sellers.iloc[-30:].all()
    log_views = np.log1p(data["views"])
    median = np.median(log_views[sellers])
    assert ((seg.labels == m.FAVORITE) == (sellers & (log_views > median))).all()
    by_label = {s["label"]: s for s in seg.segments}
    assert by_label[m.FAVORITE]["size"] == 15 and by_label[m.HIDDEN_GEM]["size"] == 15
    assert by_label[m.HIDDEN_GEM]["views"] < by_label[m.FAVORITE]["views"]
    assert by_label[m.HIDDEN_GEM]["views_median"] < by_label[m.FAVORITE]["views_median"]
    # Summaries come from the listings themselves, not from the centroid.
    gems = seg.labels == m.HIDDEN_GEM
    assert by_label[m.HIDDEN_GEM]["sales_per_day"] == pytest.approx(data["sales"][gems].mean())


def test_no_best_selling_cluster_yields_neither_profile() -> None:
    labels, split = m.split_best_sellers(
        np.array([m.NICHE, m.HYPE, m.NICHE], dtype=object), np.array([1.0, 9.0, 2.0])
    )
    assert split is None
    assert labels.tolist() == [m.NICHE, m.HYPE, m.NICHE]
    segments = m.summarise_segments(
        pd.Series(labels), pd.Series([1.0, 9.0, 2.0]), pd.Series([0.0, 0.0, 0.1]), pd.Series(1.0)
    )
    assert [s["label"] for s in segments] == [m.HYPE, m.NICHE]


def test_split_best_sellers_pools_clusters_and_ties_go_to_hidden_gem() -> None:
    names = np.array([m.BEST_SELLERS] * 4 + [m.NICHE], dtype=object)
    labels, split = m.split_best_sellers(names, np.array([1.0, 2.0, 2.0, 5.0, 9.0]))
    assert split == 2.0
    assert labels.tolist() == [m.HIDDEN_GEM, m.HIDDEN_GEM, m.HIDDEN_GEM, m.FAVORITE, m.NICHE]


def test_model_demand_sums_stores_per_model_and_keeps_unlinked_listings_apart() -> None:
    nan = np.nan
    frame = pd.DataFrame(
        {
            "listing_id": [1, 2, 3, 4, 5, 6, 7, 8],
            "canonical_id": [10, 10, 10, 10, nan, 20, 30, 30],
            "view_count": [100, 300, nan, nan, 50, nan, 10, 5],
            "sales_per_day": [0.5, 0.1, nan, nan, 0.2, nan, -0.3, 0.0],
            "price": [1000, 800, 1200, 1300, 500, 200, 300, 400],
            "in_stock": [True, False, True, True, True, True, False, False],
        }
    )

    key, models = model_demand(frame)

    # Listings 1-4 share model 10; the unlinked listing 5 is a model of its own.
    assert key.iloc[:4].nunique() == 1 and key.iloc[4] not in {10.0, 20.0, 30.0}
    assert len(models) == 4
    # Several stores add up; a store that publishes no counters adds nothing.
    assert models.loc[10.0, "views"] == 400
    assert models.loc[10.0, "sales_per_day"] == pytest.approx(0.6)
    # Lowest in-stock price (1000, not the sold-out 800) over the median of
    # every listing of the model (1100).
    assert models.loc[10.0, "normalized_price"] == pytest.approx(1000 / 1100)
    # No store publishes views: no demand row, so no group.
    assert np.isnan(models.loc[20.0, "views"])
    # Sold out everywhere: every listing's lowest price; negative rates clip to 0.
    assert models.loc[30.0, "normalized_price"] == pytest.approx(300 / 350)
    assert models.loc[30.0, "views"] == 15 and models.loc[30.0, "sales_per_day"] == 0
    unlinked = models.loc[key.iloc[4]]
    assert (unlinked["views"], unlinked["normalized_price"]) == (50, 1.0)
    # No merchant column: one store. Rates 0.5, 0.1, 0.2, 0 (clipped), 0
    # rank 5, 3, 4, 1.5, 1.5 of 5; model 10 averages its two listings.
    assert models.loc[10.0, "sales_rank_pct"] == pytest.approx((1.0 + 0.6) / 2)
    assert models.loc[30.0, "sales_rank_pct"] == pytest.approx(0.3)
    assert np.isnan(models.loc[20.0, "sales_rank_pct"])
    # Sold strictly less: 0.5 beats 4 of 5, 0.1 beats the two zeros; zeros beat none.
    assert models.loc[10.0, "sales_beats_pct"] == pytest.approx((0.8 + 0.4) / 2)
    assert models.loc[30.0, "sales_beats_pct"] == 0
    assert np.isnan(models.loc[20.0, "sales_beats_pct"])


def test_zero_sales_listings_beat_nobody_though_their_average_rank_is_mid_table() -> None:
    rates = [0.0] * 7 + [0.1, 0.2, 0.3]
    frame = pd.DataFrame(
        {
            "listing_id": range(10),
            "canonical_id": range(10),
            "merchant": "jib",
            "sales_per_day": rates,
            "view_count": 100.0,
            "price": 1000.0,
        }
    )

    _, models = model_demand(frame)

    zeros = models.loc[[float(i) for i in range(7)]]
    # Average rank of 7 tied zeros is 4 of 10: fine for clustering, but a
    # shopper would read "sells better than ~40%".
    assert zeros["sales_rank_pct"].to_numpy() == pytest.approx([0.4] * 7)
    assert (zeros["sales_beats_pct"] == 0).all()
    assert models.loc[[7.0, 8.0, 9.0], "sales_beats_pct"].to_numpy() == pytest.approx(
        [0.7, 0.8, 0.9]
    )


def test_store_percentiles_are_averaged_per_store_before_across_stores() -> None:
    frame = pd.DataFrame(
        {
            "listing_id": [1, 2, 3, 4, 5],
            "canonical_id": [1, 1, 2, 1, 3],
            "merchant": ["jib", "jib", "jib", "ihavecpu", "ihavecpu"],
            "sales_per_day": [0.1, 0.3, 0.2, 50.0, 10.0],
            "view_count": 100.0,
            "price": 1000.0,
        }
    )

    _, models = model_demand(frame)

    # Model 1: JIB's two listings (1/3, 1) average to 2/3 first, then with
    # IHAVECPU's 1.0: 5/6. Pooling the three listings would give 7/9.
    assert models.loc[1.0, "sales_rank_pct"] == pytest.approx(5 / 6)
    # Beats: JIB 0 and 2/3 -> 1/3; IHAVECPU 1/2 -> (1/3 + 1/2) / 2.
    assert models.loc[1.0, "sales_beats_pct"] == pytest.approx((1 / 3 + 1 / 2) / 2)


def _two_store_frame(scale: float) -> pd.DataFrame:
    """Models 0-4 at JIB, 5-9 at IHAVECPU (rates ``scale`` x larger), 10-14 at both."""
    jib_rates = [0.01, 0.02, 0.03, 0.04, 0.05]
    rows = [
        {"canonical_id": model, "merchant": "jib", "sales_per_day": rate}
        for model, rate in enumerate(jib_rates)
    ]
    rows += [
        {"canonical_id": 5 + model, "merchant": "ihavecpu", "sales_per_day": rate * scale}
        for model, rate in enumerate(jib_rates)
    ]
    rows += [
        {"canonical_id": 10 + model, "merchant": store, "sales_per_day": rate * factor}
        for model, rate in enumerate(jib_rates)
        for store, factor in (("jib", 1.0), ("ihavecpu", scale))
    ]
    frame = pd.DataFrame(rows)
    frame["listing_id"] = range(len(frame))
    frame["price"] = 1000.0
    frame["view_count"] = 100.0
    return frame


def test_sales_rank_is_store_relative_so_a_100x_larger_scale_ranks_alike() -> None:
    _, models = model_demand(_two_store_frame(scale=100.0))

    rank = models["sales_rank_pct"]
    # Same order at each store: same signal, despite rates 100x apart.
    assert rank.loc[[0.0, 1.0, 2.0, 3.0, 4.0]].to_numpy() == pytest.approx(
        rank.loc[[5.0, 6.0, 7.0, 8.0, 9.0]].to_numpy()
    )
    # Listed at both stores: the mean of two equal percentiles.
    assert rank.loc[[10.0, 11.0, 12.0, 13.0, 14.0]].to_numpy() == pytest.approx(
        rank.loc[[0.0, 1.0, 2.0, 3.0, 4.0]].to_numpy()
    )
    # The raw sum is still kept for reporting, and is dominated by the larger scale.
    assert models.loc[14.0, "sales_per_day"] == pytest.approx(0.05 * 101)


def test_sales_rank_of_a_model_at_one_store_is_that_stores_percentile() -> None:
    frame = pd.DataFrame(
        {
            "listing_id": [1, 2, 3, 4, 5],
            "canonical_id": [10, 20, 30, 10, 40],
            "merchant": ["jib", "jib", "jib", "ihavecpu", "ihavecpu"],
            "sales_per_day": [0.3, 0.1, 0.2, np.nan, 50.0],
            "view_count": [10, 20, 30, np.nan, np.nan],
            "price": [100.0] * 5,
        }
    )

    _, models = model_demand(frame)

    # Model 10: IHAVECPU has no rate, so JIB's percentile (3 of 3) alone.
    assert models.loc[10.0, "sales_rank_pct"] == pytest.approx(1.0)
    assert models.loc[20.0, "sales_rank_pct"] == pytest.approx(1 / 3)
    # IHAVECPU's percentile counts only its listings with a rate (1 of 1).
    assert models.loc[40.0, "sales_rank_pct"] == pytest.approx(1.0)


def test_model_without_any_sales_rate_gets_no_group() -> None:
    rng = np.random.default_rng(5)
    n = 60
    frame = pd.DataFrame(
        {
            "listing_id": range(n),
            "canonical_id": range(n),
            "merchant": ["jib", "ihavecpu"] * (n // 2),
            "view_count": rng.lognormal(6, 1, n),
            "sales_per_day": rng.lognormal(-3, 1, n),
            "price": rng.uniform(900, 1100, n),
        }
    )
    frame.loc[:4, "sales_per_day"] = np.nan  # views, but no store has a rate

    key, models = model_demand(frame)
    seg = m.segment_demand(
        models["views"],
        models["sales_per_day"],
        models["normalized_price"],
        sales_rank_pct=models["sales_rank_pct"],
        sales_beats_pct=models["sales_beats_pct"],
        k_range=range(4, 5),
    )

    labels = key.map(seg.labels)
    assert labels.iloc[:5].isna().all()
    assert labels.iloc[5:].notna().all()
    assert sum(s["size"] for s in seg.segments) == n - 5
    # Segments carry both the raw rate and the mean store percentile.
    for summary in seg.segments:
        assert 0 < float(summary["sales_rank_pct"]) <= 1
        assert 0 <= float(summary["sales_beats_pct"]) < float(summary["sales_rank_pct"])
        assert float(summary["sales_per_day"]) >= 0
    assert all("sales_rank_pct" in c for c in seg.centroids)


def _multi_store_catalogue(seed: int) -> pd.DataFrame:
    """Linked models at three stores (one without counters) plus unlinked listings.

    Category "other" keeps sections A-C out of the way: only demand
    clustering and the rule recommendations run.
    """
    rng = np.random.default_rng(seed)
    blobs = [(20_000, 0.01), (300, 0.01), (2_000, 0.002), (5_000, 3.0)]
    rows = []
    listing_id = 0
    for model in range(80):
        views, sales = blobs[model % 4]
        model_views = rng.lognormal(np.log(views), 0.6)
        model_sales = rng.normal(sales, sales * 0.05)
        for store, share in (("jib", 0.7), ("ihavecpu", 0.3), ("banana", None)):
            rows.append(
                {
                    "listing_id": listing_id,
                    "category": "other",
                    "merchant": store,
                    "canonical_id": model,
                    "price": 1000 * rng.uniform(0.9, 1.1),
                    "view_count": np.nan if share is None else model_views * share,
                    "sales_per_day": np.nan if share is None else model_sales * share,
                    "views_per_day": np.nan,
                    "in_stock": True,
                    "stock_quantity": np.nan,
                    "age_days": 30,
                }
            )
            listing_id += 1
    for _ in range(8):  # unlinked: each one its own model
        rows.append(
            rows[0]
            | {
                "listing_id": listing_id,
                "canonical_id": np.nan,
                "view_count": 400.0,
                "sales_per_day": 0.01,
            }
        )
        listing_id += 1
    return pd.DataFrame(rows)


def test_every_listing_of_a_model_gets_the_model_label() -> None:
    current = _multi_store_catalogue(seed=8)

    report = run_models(current, pd.DataFrame(), figures=None)

    labels = report.insights["demand_cluster"]
    linked = current["canonical_id"].notna()
    # One group per model, including the store that publishes no counters.
    per_model = (
        labels[linked]
        .groupby(current.loc[linked, "canonical_id"])
        .agg(lambda v: v.nunique(dropna=False))
    )
    assert (per_model == 1).all()
    assert labels[linked].notna().all()
    assert labels[~linked].notna().all()
    assert set(labels) <= set(m.SEGMENT_LABELS)


def test_demand_segments_count_models_not_listings() -> None:
    current = _multi_store_catalogue(seed=9)

    report = run_models(current, pd.DataFrame(), figures=None)

    kmeans = report.market[("all", "demand_kmeans")]
    models = 80 + 8  # linked models + unlinked listings, each a model
    assert kmeans["unit"] == "model"
    assert kmeans["sales_feature"] == "store_rank_pct"
    assert all(0 < s["sales_rank_pct"] <= 1 for s in kmeans["segments"])
    assert all(0 <= s["sales_beats_pct"] < 1 for s in kmeans["segments"])
    assert kmeans["n"] == models
    assert sum(s["size"] for s in kmeans["segments"]) == models
    assert sum(c["size"] for c in kmeans["centroids"]) == models
    hierarchy = report.market[("all", "demand_hierarchical")]
    assert hierarchy["n"] == models
    # Segment sizes are model counts of the labels the listings carry.
    model_key = current["canonical_id"].fillna(-current["listing_id"] - 1)
    labelled = report.insights.assign(model=model_key).drop_duplicates("model")
    counts = labelled["demand_cluster"].value_counts()
    assert {s["label"]: s["size"] for s in kmeans["segments"]} == counts.to_dict()


def _rule_row(
    score: float, pct: float, band: float | None, in_stock: bool = True
) -> dict[str, object]:
    return {
        "deal_score": score,
        "pct_vs_fair": pct,
        "fair_error_pct": band,
        "in_stock": in_stock,
        "stock_quantity": np.nan,
    }


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        (_rule_row(95, -0.50, 0.20, in_stock=False), m.WAIT),  # cannot buy
        (_rule_row(85, -0.30, 0.20) | {"stock_quantity": 2}, m.BUY_NOW),
        (_rule_row(70, -0.15, 0.20), m.FAIR),
        (_rule_row(10, 0.30, 0.20), m.WAIT),
        (_rule_row(np.nan, np.nan, np.nan), None),  # unscored
        # Criterion 1/2: the gap must clear the "± Y%" band shown beside it.
        (_rule_row(85, -0.37, 0.45), m.FAIR),  # Ryzen 5 8500G on 2026-11-12
        (_rule_row(85, -0.20, 0.20), m.FAIR),  # on the edge is still inside
        (_rule_row(10, 0.25, 0.30), m.FAIR),
        (_rule_row(10, 0.20, 0.20), m.FAIR),
        # Criterion 5: no band, no buy / wait from price; sold out still waits.
        (_rule_row(95, -0.30, np.nan), m.FAIR),
        (_rule_row(5, 0.30, np.nan), m.FAIR),
        (_rule_row(95, -0.30, np.nan, in_stock=False), m.WAIT),
        (_rule_row(np.nan, -0.30, np.nan), None),
        (_rule_row(95, -0.30, None), m.FAIR),  # a None band is unknown, not an error
        # Compared as the whole percents the card prints: 20% vs ± 20% is not clear.
        (_rule_row(92, -0.204, 0.196), m.FAIR),
        (_rule_row(92, -0.215, 0.196), m.BUY_NOW),
        (_rule_row(8, 0.204, 0.196), m.FAIR),
        (_rule_row(8, 0.215, 0.196), m.WAIT),
        # Clearing the band is not enough without the Deal Score threshold.
        (_rule_row(70, -0.50, 0.20), m.FAIR),
        (_rule_row(30, 0.50, 0.20), m.FAIR),
    ],
)
def test_rule_recommendation(row: dict[str, object], expected: str | None) -> None:
    from pricewatch.ml.train import rule_recommendation

    label, reason = rule_recommendation(pd.Series(row))
    assert label == expected
    assert reason
    # Criterion 4: "clear" only when the gap is outside the band.
    assert ("ชัดเจน" in reason) == (label in (m.BUY_NOW, m.WAIT) and row["in_stock"] is not False)


def test_rule_reason_inside_band_states_gap_and_band() -> None:
    from pricewatch.ml.train import rule_recommendation

    _, cheap = rule_recommendation(pd.Series(_rule_row(85, -0.372, 0.448)))
    _, dear = rule_recommendation(pd.Series(_rule_row(10, 0.254, 0.30)))
    _, unknown = rule_recommendation(pd.Series(_rule_row(85, -0.30, np.nan)))

    assert cheap == "ถูกกว่าราคายุติธรรม 37% แต่ยังอยู่ในช่วงคลาดเคลื่อน ±45% จึงยังสรุปไม่ได้ว่าถูกกว่าตลาดจริง"
    assert dear == "แพงกว่าราคายุติธรรม 25% แต่ยังอยู่ในช่วงคลาดเคลื่อน ±30% จึงยังสรุปไม่ได้ว่าแพงกว่าตลาดจริง"
    assert "30%" in unknown and "ยังไม่ทราบช่วงคลาดเคลื่อน" in unknown
    assert "ชัดเจน" not in cheap + dear + unknown


def test_percents_round_half_up_like_the_web() -> None:
    from pricewatch.ml.train import gap_within_band_reason, shown_pct

    # JavaScript Math.round, not Python's banker's round (36.5 -> 36).
    assert [shown_pct(x) for x in (0.365, 0.125, 0.204, 0.196, 0.0)] == [37, 13, 20, 20, 0]
    assert gap_within_band_reason(-0.365, 0.40).startswith("ถูกกว่าราคายุติธรรม 37% ")


# Expected values were produced by JavaScript itself (Node 24):
#   node -e "for (const f of [...]) console.log(f, Math.round(f*100), f*100)"
# Math.round(-0.5) is -0 in JS; -0 == 0 here, so it is written as 0.
JS_MATH_ROUND = [
    (0.004999999999999999, 0),  # f*100 = 0.49999999999999994; floor(v + 0.5) gives 1
    (-0.004999999999999999, 0),  # f*100 = -0.49999999999999994
    (0.005, 1),  # exactly .5: rounds up
    (0.015, 2),  # 1.5
    (0.025, 3),  # 2.5 (banker's round gives 2)
    (0.125, 13),  # 12.5 (banker's round gives 12)
    (0.445, 45),  # 44.5
    (0.455, 46),  # 45.5
    (-0.005, 0),  # -0.5: JS rounds towards +inf at .5
    (-0.015, -1),  # -1.5
    (1.005, 100),  # f*100 = 100.49999999999999
    (0.285, 28),  # f*100 = 28.499999999999996
    (0.575, 57),  # f*100 = 57.49999999999999
]


@pytest.mark.parametrize(("fraction", "js_value"), JS_MATH_ROUND)
def test_shown_pct_matches_javascript_math_round(fraction: float, js_value: int) -> None:
    from pricewatch.ml.train import shown_pct

    assert shown_pct(fraction) == js_value


def test_buy_and_wait_reasons_name_gap_and_band() -> None:
    from pricewatch.ml.train import rule_recommendation

    low_stock = _rule_row(85, -0.52, 0.30) | {"stock_quantity": 2}
    assert rule_recommendation(pd.Series(_rule_row(85, -0.52, 0.30))) == (
        m.BUY_NOW,
        "ถูกกว่าราคายุติธรรม 52% ซึ่งเกินช่วงคลาดเคลื่อน ±30% จึงถูกกว่าตลาดชัดเจน",
    )
    assert rule_recommendation(pd.Series(low_stock)) == (
        m.BUY_NOW,
        "ถูกกว่าราคายุติธรรม 52% ซึ่งเกินช่วงคลาดเคลื่อน ±30% จึงถูกกว่าตลาดชัดเจน และสต็อกเหลือน้อย",
    )
    # The numbers are the card's: 0.125 -> 13% and 0.455 -> 46% (half up).
    assert rule_recommendation(pd.Series(_rule_row(10, 0.455, 0.125))) == (
        m.WAIT,
        "แพงกว่าราคายุติธรรม 46% ซึ่งเกินช่วงคลาดเคลื่อน ±13% จึงแพงกว่าตลาดชัดเจน",
    )
    # Sold out keeps its own reason; no prefix on any rule reason.
    label, reason = rule_recommendation(pd.Series(_rule_row(95, -0.5, 0.2, in_stock=False)))
    assert (label, reason) == (m.WAIT, "สินค้าหมดที่ร้านนี้ รอของเข้าหรือดูร้านอื่น")


def test_run_models_buy_and_wait_only_outside_the_error_band() -> None:
    ins = run_models(_gpu_catalogue(7), pd.DataFrame(), figures=None).insights

    rec, pct, band = ins["recommendation"], ins["pct_vs_fair"], ins["fair_error_pct"]
    assert (pct[rec == m.BUY_NOW] < -band[rec == m.BUY_NOW]).all()
    assert (pct[rec == m.WAIT] > band[rec == m.WAIT]).all()  # all in stock here
    # Extreme Deal Scores inside the band exist here and fall back to "fair".
    inside = ((ins["deal_score"] >= 80) & (pct >= -band)) | (
        (ins["deal_score"] <= 20) & (pct <= band)
    )
    assert inside.any() and (rec[inside] == m.FAIR).all()
    clear = ins["recommendation_reason"].fillna("").str.contains("ชัดเจน")
    assert rec[clear].isin([m.BUY_NOW, m.WAIT]).all()


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


def test_fair_price_far_from_market_is_flagged_and_never_ranked() -> None:
    from pricewatch.ml.train import UNCERTAIN_GAP, UNCERTAIN_REASON

    current = _gpu_catalogue(7)
    # Every store sells one product at ~35% of its spec-implied price: a gap
    # no 15-25% MAPE fit can vouch for (the live top-60 "deals" were this).
    odd = current["canonical_id"] == 3
    current.loc[odd, "price"] *= 0.35

    ins = run_models(current, pd.DataFrame(), figures=None).insights

    flagged = ins["fair_uncertain"].astype(bool)
    assert flagged[odd].all()
    assert (ins.loc[flagged, "pct_vs_fair"].abs() > UNCERTAIN_GAP).all()
    assert ins.loc[flagged, "fair_price"].notna().all()  # kept for reference
    assert ins.loc[flagged, "deal_score"].isna().all()  # so never ranked
    assert ins.loc[flagged, "recommendation"].isna().all()
    assert (ins.loc[flagged, "recommendation_reason"] == UNCERTAIN_REASON).all()
    # Everything else keeps a score and an honest error band.
    rest = ins["fair_price"].notna() & ~flagged
    assert rest.any() and ins.loc[rest, "deal_score"].notna().all()
    band = ins.loc[ins["fair_price"].notna(), "fair_error_pct"]
    assert band.between(0.01, 1.0).all()


def test_error_band_widens_with_leverage() -> None:
    fit = m.FairValueModel(
        features=[],
        coefficients=[],
        intercept=0.0,
        r2_cv=0.9,
        mape_cv=0.1,
        n=10,
        fair_price=pd.Series([100.0, 100.0, np.nan]),
        z_residual=pd.Series([0.0, 0.0, np.nan]),
        leverage=pd.Series([0.0, 0.8, np.nan]),
        sigma=0.2,
    )

    band = fit.error_pct()

    assert band.iloc[0] == pytest.approx(np.sinh(m.Z_80 * 0.2))  # ~ ±26%
    assert band.iloc[1] > band.iloc[0]
    assert np.isnan(band.iloc[2])
