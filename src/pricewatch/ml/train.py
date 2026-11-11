"""End-to-end training: load data, fit every model, persist insights, plot figures."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asyncpg
import numpy as np
import pandas as pd

from pricewatch.ml import models as m
from pricewatch.ml.dataset import category_frame, load_current_listings, load_history, numeric
from pricewatch.models import Category

logger = logging.getLogger(__name__)

MODEL_VERSION = "2026.11-v2"
FIGURES_DIR = Path(__file__).resolve().parents[3] / "reports" / "figures"

# Simple-regression variable per category: (feature column, unit label).
SLR_FEATURES: dict[Category, tuple[str, str]] = {
    Category.GPU: ("vram_gb", "GB VRAM"),
    Category.RAM: ("capacity_gb", "GB RAM"),
    Category.SSD: ("capacity_gb", "GB storage"),
    Category.CPU: ("cores", "CPU core"),
}

_NV_SUFFIX = {"Ti Super": 0.7, "Ti": 0.5, "Super": 0.3}
_AMD_SUFFIX = {"XTX": 0.8, "XT": 0.5, "GRE": 0.3}

#: Launch year per GPU series. Model numbers are not comparable across
#: vendors or eras (GT 710 is a 2014 card, "7" > RTX 50's "5"; Radeon 9000 is
#: NVIDIA 50's contemporary), so the regression gets the year instead.
_NV_SERIES_YEAR = {
    ("GT", 7): 2014,
    ("GTX", 9): 2015,
    ("GT", 10): 2017,
    ("GTX", 10): 2016,
    ("GTX", 16): 2019,
    ("RTX", 20): 2018,
    ("RTX", 30): 2020,
    ("RTX", 40): 2022,
    ("RTX", 50): 2025,
}
_AMD_SERIES_YEAR = {5: 2019, 6: 2020, 7: 2022, 9: 2025}

#: Reference year: release years enter the model as years since 2020, so the
#: coefficient table stays readable.
_YEAR0 = 2020


def gpu_class(chip: object) -> tuple[float, float]:
    """Map a chip name to (launch year, performance class).

    NVIDIA "RTX 5070 Ti" -> (2025, 7.5); AMD "RX 9070 XT" -> (2025, 7.5);
    NVIDIA "GT 710" -> (2014, 1). Suffixes add a fraction of a class; an
    unknown series has a NaN year.
    """
    if not isinstance(chip, str):
        return (np.nan, np.nan)
    if (nv := re.search(r"(RTX|GTX|GT) (\d{3,4})(?: (Ti Super|Ti|Super))?", chip)) is not None:
        number = int(nv.group(2))
        year = _NV_SERIES_YEAR.get((nv.group(1), number // 100), np.nan)
        return (year, (number % 100) / 10 + _NV_SUFFIX.get(nv.group(3) or "", 0.0))
    if (amd := re.search(r"RX (\d{4})(?: (XTX|XT|GRE))?", chip)) is not None:
        number = int(amd.group(1))
        tier = (number % 100) // 10 if number >= 9000 else (number % 1000) // 100
        year = _AMD_SERIES_YEAR.get(number // 1000, np.nan)
        return (year, tier + _AMD_SUFFIX.get(amd.group(2) or "", 0.0))
    return (np.nan, np.nan)


#: Launch year per CPU family generation (Ryzen 4000 desktop parts are 2020
#: Zen 2 silicon; Ryzen 8000 desktop APUs and 9000 both 2024).
_RYZEN_YEAR = {1: 2017, 2: 2018, 3: 2019, 4: 2020, 5: 2020, 7: 2022, 8: 2024, 9: 2024}
_INTEL_CORE_YEAR = {10: 2020, 11: 2021, 12: 2021, 13: 2022, 14: 2023}


def cpu_release(model: object, generation: object) -> tuple[float, float]:
    """Map a CPU model to (launch year, product tier).

    Tier is the brand's own ladder: Ryzen 3/5/7/9, Core i3-i9 and Core Ultra
    5/7/9 share one scale; Threadripper is 11 and Pentium 1. Six cores at
    2,590 THB is a Ryzen 5 4500 from 2020, not a 2024 Ryzen 5 9600X: without
    the year and tier, core counts alone priced the two alike.
    """
    if not isinstance(model, str):
        return (np.nan, np.nan)
    gen = (
        int(generation)
        if isinstance(generation, (int, float)) and np.isfinite(generation)
        else None
    )
    if "Threadripper" in model:
        tier = 11.0
    elif "Pentium" in model:
        tier = 1.0
    elif (t := re.search(r"(?:Ryzen|Core i|Core Ultra) ?(\d)\b", model)) is not None:
        tier = float(t.group(1))
    else:
        tier = np.nan
    if "Core Ultra" in model:
        year: float = 2024
    elif "Pentium" in model:
        year = 2020
    elif model.startswith("Ryzen") and gen is not None:
        year = _RYZEN_YEAR.get(gen, np.nan)
    elif model.startswith("Core i") and gen is not None:
        year = _INTEL_CORE_YEAR.get(gen, np.nan)
    else:
        year = np.nan
    return (year, tier)


def spec_features(frame: pd.DataFrame, category: Category) -> pd.DataFrame:
    """Numeric hardware features per category (no demand signals)."""
    if category is Category.GPU:
        year_class = frame.get("chip", pd.Series(dtype=object)).map(gpu_class)
        return pd.DataFrame(
            {
                "vram_gb": numeric(frame, "vram_gb"),
                "perf_class": [yc[1] for yc in year_class] if len(year_class) else np.nan,
                "release_year": [yc[0] - _YEAR0 for yc in year_class]
                if len(year_class)
                else np.nan,
                "shader_cores": numeric(frame, "shader_cores"),
                "boost_clock_mhz": numeric(frame, "boost_clock_mhz"),
                "bus_width_bit": numeric(frame, "bus_width_bit"),
            },
            index=frame.index,
        )
    if category is Category.CPU:
        models = frame.get("model", pd.Series(dtype=object, index=frame.index))
        gens = numeric(frame, "generation")
        year_tier = [cpu_release(mo, g) for mo, g in zip(models, gens, strict=True)]
        return pd.DataFrame(
            {
                # Log scale: each extra core is worth less, and 64-96 core
                # workstation parts would otherwise dominate a linear fit.
                "log2_cores": np.log2(numeric(frame, "cores")),
                "log2_threads": np.log2(numeric(frame, "threads")),
                "base_clock_ghz": numeric(frame, "base_clock_ghz"),
                "x3d": numeric(frame, "x3d"),
                "unlocked": numeric(frame, "unlocked"),
                "is_amd": (frame["manufacturer"] == "AMD").astype(float)
                if "manufacturer" in frame
                else 0.0,
                "release_year": [yt[0] - _YEAR0 for yt in year_tier] if year_tier else np.nan,
                "tier": [yt[1] for yt in year_tier] if year_tier else np.nan,
            },
            index=frame.index,
        )
    if category is Category.RAM:
        return pd.DataFrame(
            {
                "capacity_gb": numeric(frame, "capacity_gb"),
                "speed_mhz": numeric(frame, "speed_mhz"),
                "ddr5": (numeric(frame, "ddr") == 5).astype(float),
                "modules": numeric(frame, "modules"),
            },
            index=frame.index,
        )
    nvme = numeric(frame, "nvme")
    return pd.DataFrame(
        {
            "capacity_gb": numeric(frame, "capacity_gb"),
            "nvme": nvme,
            "pcie_gen": numeric(frame, "pcie_gen").fillna(nvme * 3),
            "read_mbps": numeric(frame, "read_mbps"),
        },
        index=frame.index,
    )


#: Specs the fair-value model log-transforms. Price scales with capacity as a
#: power law (a 2 TB drive costs about twice a 1 TB one), so in a model of
#: log(price) the regressor must be log(capacity); a linear term extrapolates
#: exponentially (an 8 TB SSD came out at 1.9 million THB).
_LOG2_FOR_MLR: tuple[str, ...] = ("vram_gb", "capacity_gb")

#: Specs a listing must have for a fair price to be estimated at all. Optional
#: specs may be missing (imputed with a missingness indicator).
REQUIRED_FOR_FAIR_VALUE: dict[Category, list[str]] = {
    Category.GPU: ["log2_vram_gb", "perf_class", "release_year"],
    Category.CPU: ["log2_cores", "log2_threads"],
    Category.RAM: ["log2_capacity_gb", "speed_mhz"],
    Category.SSD: ["log2_capacity_gb", "nvme"],
}


def mlr_features(specs: pd.DataFrame) -> pd.DataFrame:
    """Spec features as the fair-value MLR sees them (capacities in log2)."""
    out = specs.copy()
    for column in _LOG2_FOR_MLR:
        if column in out:
            out[f"log2_{column}"] = np.log2(out.pop(column).where(lambda v: v > 0))
    # No class x generation interaction: it was fitted on model numbers as
    # generations; with launch years it lowered product-grouped CV R2 (0.805
    # without, 0.792 with) and let the 2014-2017 GT cards extrapolate.
    return out


def product_key(frame: pd.DataFrame) -> pd.Series:
    """Canonical product per listing; an unlinked listing is its own product."""
    own = -frame["listing_id"].astype(float) - 1  # negative: never collides with an id
    if "canonical_id" not in frame:
        return own
    return frame["canonical_id"].astype(float).fillna(own)


def model_level(specs: pd.DataFrame, key: pd.Series) -> pd.DataFrame:
    """Each spec replaced by its median over the listings of the same model.

    Titles disagree on specs of one product (an i9-14900F read as 1.5 GHz base
    at one store and 5.8 GHz, its boost, at another); a fair price is a
    property of the product, so it is computed from one reconciled spec row.
    Medians ignore missing values. O(n) with one groupby.
    """
    return specs.groupby(key).transform("median")


def demand_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Demand signals of the specification, per canonical product.

    Views and sales velocity are summed over every listing of the same model
    and logged. Product level, not listing level, because only JIB publishes
    these counters: per listing, "has views" would identify the store, and the
    same model at the same price would get a different fair price (and Deal
    Score) at each store. A fair price is a property of the product.
    Unlinked listings keep their own counters. O(n) with one groupby.
    """
    views = numeric(frame, "view_count")
    sales = numeric(frame, "sales_per_day").clip(lower=0)
    key = frame["canonical_id"] if "canonical_id" in frame else pd.Series(np.nan, index=frame.index)
    linked = key.notna()

    def per_product(values: pd.Series) -> pd.Series:
        # min_count=1: a model no store publishes counters for stays NaN.
        total = values[linked].groupby(key[linked]).transform(lambda v: v.sum(min_count=1))
        return total.reindex(frame.index).where(linked, values)

    return pd.DataFrame(
        {
            "log_views": np.log1p(per_product(views)),
            "log_sales_per_day": np.log1p(per_product(sales)),
        },
        index=frame.index,
    )


def current_timing_features(history: pd.DataFrame, current: pd.DataFrame) -> pd.DataFrame:
    """Timing-tree features as of each listing's latest observation."""
    if history.empty:
        return pd.DataFrame(index=current.index, columns=m.TIMING_FEATURES, dtype=float)
    last = history.groupby("listing_id").tail(2)
    feats: dict[int, dict[str, float]] = {}
    for listing_id, obs in last.groupby("listing_id"):
        prices = obs["price"].to_numpy(float)
        feats[int(str(listing_id))] = {
            "pct_change_prev": prices[-1] / prices[0] - 1 if len(prices) == 2 else 0.0,
        }
    own_pct = history.groupby("listing_id")["price"].apply(
        lambda p: float((p.to_numpy() <= p.to_numpy()[-1]).mean())
    )
    out = pd.DataFrame(index=current.index)
    ids = current["listing_id"].astype(int)
    model_median = current.groupby("canonical_id")["price"].transform("median")
    out["pct_vs_model_median"] = (current["price"] / model_median - 1).where(
        current["canonical_id"].notna()
    )
    out["price_percentile_own"] = ids.map(own_pct).astype(float)
    out["pct_change_prev"] = ids.map(lambda i: feats.get(i, {}).get("pct_change_prev", 0.0))
    out["sales_per_day"] = numeric(current, "sales_per_day")
    out["days_listed"] = numeric(current, "age_days")
    return out


#: Reason shown when no fair price could be estimated for a listing.
NO_FAIR_PRICE = "ยังประเมินราคายุติธรรมไม่ได้ เพราะชื่อสินค้าระบุสเปกหลักไม่ครบ"


def rule_recommendation(row: pd.Series) -> tuple[str | None, str]:
    """Transparent fallback while the timing tree is not reliable enough.

    Deal Score 80 / 20 is about one standard deviation below / above fair
    value (roughly the cheapest / dearest fifth of listings). A listing
    without a Deal Score gets no recommendation rather than a "fair price"
    verdict it has no evidence for.
    """
    score = row.get("deal_score")
    if row.get("in_stock") is False:
        return m.WAIT, "สินค้าหมดที่ร้านนี้ รอของเข้าหรือดูร้านอื่น"
    if pd.isna(score):
        return None, NO_FAIR_PRICE
    if pd.notna(score) and score >= 80:
        quantity = row.get("stock_quantity")
        low = pd.notna(quantity) and quantity <= 3
        return m.BUY_NOW, "ถูกกว่าราคายุติธรรมของสเปกนี้ชัดเจน" + (" และสต็อกเหลือน้อย" if low else "")
    if pd.notna(score) and score <= 20:
        return m.WAIT, "แพงกว่าราคายุติธรรมของสเปกนี้ชัดเจน"
    return m.FAIR, "ราคาใกล้เคียงราคายุติธรรมของสเปกนี้"


@dataclass
class TrainReport:
    """Everything one training run produced, for persistence and printing."""

    insights: pd.DataFrame
    market: dict[tuple[str, str], dict[str, Any]] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def run_models(current: pd.DataFrame, history: pd.DataFrame, figures: Path | None) -> TrainReport:
    """Fit every model on in-memory frames (no database access)."""
    insights = pd.DataFrame(
        {
            "listing_id": current["listing_id"].astype(int),
            "sales_per_day": numeric(current, "sales_per_day"),
            "views_per_day": numeric(current, "views_per_day"),
        },
        index=current.index,
    )
    for column in ("fair_price", "residual", "pct_vs_fair", "deal_score"):
        insights[column] = np.nan
    insights["demand_cluster"] = None
    report = TrainReport(insights=insights)

    for category in Category:
        frame = category_frame(current, category)
        if len(frame) < 15:
            report.notes.append(f"{category.value}: only {len(frame)} listings, skipped")
            continue
        price = frame["price"]
        specs = spec_features(frame, category)

        # A. Simple linear regression.
        column, unit = SLR_FEATURES[category]
        try:
            slr = m.simple_regression(numeric(frame, column), price, column)
            resid = slr.residuals.dropna()
            budget = resid[resid < -resid.std()].nsmallest(5).index
            report.market[(category.value, "simple_regression")] = {
                "feature": column,
                "unit": unit,
                "slope_thb_per_unit": slr.slope,
                "intercept_thb": slr.intercept,
                "r2": slr.r2,
                "n": slr.n,
                "budget_listing_ids": frame.loc[budget, "listing_id"].astype(int).tolist(),
            }
            if figures:
                _plot_slr(figures, category, numeric(frame, column), price, slr, unit)
        except ValueError as exc:
            report.notes.append(f"{category.value} simple regression: {exc}")

        # B. Multiple linear regression -> fair value and Deal Score.
        try:
            key = product_key(frame)
            mlr = m.fit_fair_value(
                pd.concat([mlr_features(model_level(specs, key)), demand_features(frame)], axis=1),
                price,
                required=REQUIRED_FOR_FAIR_VALUE[category],
                groups=key,
                # Learn from what can be bought today; sold-out rows carry
                # stale prices but are still scored.
                fit_mask=frame["in_stock"].fillna(False).astype(bool),
            )
            scores = m.deal_score(mlr.z_residual)
            insights.loc[frame.index, "fair_price"] = mlr.fair_price.round(0)
            insights.loc[frame.index, "residual"] = (price - mlr.fair_price).round(0)
            insights.loc[frame.index, "pct_vs_fair"] = price / mlr.fair_price - 1
            insights.loc[frame.index, "deal_score"] = scores
            report.market[(category.value, "fair_value_mlr")] = {
                "target": "log(price)",
                "coefficients": mlr.coefficient_table(),
                "intercept": mlr.intercept,
                "r2_cv": mlr.r2_cv,
                "mape_cv": mlr.mape_cv,
                "n": mlr.n,
                "required": REQUIRED_FOR_FAIR_VALUE[category],
                "unscored": int(mlr.fair_price.isna().sum()),
                "extrapolated": mlr.extrapolated,
                "fitted_on": "in-stock listings",
                "diagnostics": mlr.diagnostics.summary() if mlr.diagnostics else None,
            }
            if figures:
                _plot_mlr(figures, category, price, mlr)
                if mlr.diagnostics is not None:
                    _plot_mlr_diagnostics(figures, category, mlr.diagnostics)
        except ValueError as exc:
            report.notes.append(f"{category.value} fair-value model: {exc}")

        # C. Regression tree over hardware tiers.
        try:
            tier = m.fit_tier_tree(specs, price)
            report.market[(category.value, "tier_tree")] = {
                "rules": tier.rules,
                "r2_cv": tier.r2_cv,
                "leaves": tier.leaves,
                "features": tier.features,
            }
            if figures:
                _plot_tree(figures, f"{category.value}_tier_tree", tier.model, tier.features)
        except ValueError as exc:
            report.notes.append(f"{category.value} tier tree: {exc}")

    # D. K-Means over listings that publish demand (all categories together;
    # price normalised within each canonical model so categories are comparable).
    model_median = current.groupby(current["canonical_id"].fillna(-current["listing_id"]))[
        "price"
    ].transform("median")
    try:
        seg = m.segment_demand(
            numeric(current, "view_count"),
            numeric(current, "sales_per_day"),
            current["price"] / model_median,
        )
        insights["demand_cluster"] = seg.labels
        report.market[("all", "demand_kmeans")] = {
            "k": seg.k,
            "silhouette": seg.silhouette,
            "silhouette_by_k": seg.silhouette_by_k,
            "centroids": seg.centroids,
            "n": int(seg.labels.notna().sum()),
        }
        if seg.hierarchy is not None:
            h = seg.hierarchy
            report.market[("all", "demand_hierarchical")] = {
                "linkage": "ward",
                "k": h.k,
                "silhouette": h.silhouette,
                "ari_vs_kmeans": h.ari_vs_kmeans,
                "cophenetic_corr": h.cophenetic_corr,
                "n": int(len(h.linkage) + 1),
            }
        if figures:
            _plot_kmeans(figures, current, seg)
            if seg.hierarchy is not None:
                _plot_dendrogram(figures, seg.hierarchy)
    except ValueError as exc:
        report.notes.append(f"demand clustering: {exc}")

    # E. Buy / Wait / Fair decision tree from labelled price paths.
    insights["recommendation"], insights["recommendation_reason"] = None, None
    timing: m.TimingModel | None = None
    try:
        examples = m.label_price_paths(history)
        timing = m.fit_timing_tree(examples)
        report.market[("all", "timing_tree")] = {
            "rules": timing.rules,
            "accuracy_test": timing.accuracy_test,
            "baseline_accuracy_test": timing.baseline_accuracy_test,
            "balanced_accuracy_test": timing.balanced_accuracy_test,
            "baseline_balanced_accuracy": timing.baseline_balanced_accuracy,
            "used_for_recommendations": timing.usable,
            "confusion": timing.confusion,
            "classes": timing.classes,
            "n_train": timing.n_train,
            "n_test": timing.n_test,
            "class_counts": timing.class_counts,
        }
        if figures:
            _plot_tree(figures, "timing_tree", timing.model, timing.features, timing.classes)
    except ValueError as exc:
        report.notes.append(f"timing tree: {exc}; using transparent rules instead")

    if timing is not None and not timing.usable:
        report.notes.append(
            f"timing tree: balanced accuracy {timing.balanced_accuracy_test:.2f} is below 0.60 "
            f"(chance {timing.baseline_balanced_accuracy:.2f}); using transparent rules"
        )
        timing = None

    merged = pd.concat([current[["in_stock", "stock_quantity"]], insights], axis=1)
    if timing is not None:
        feats = current_timing_features(history, current)
        x = feats[timing.features].astype(float).fillna(pd.Series(timing.medians))
        insights["recommendation"] = timing.model.predict(x)
        insights["recommendation_reason"] = [
            "Decision Tree: " + m.explain_path(timing, feats.loc[i]) for i in feats.index
        ]
    else:
        recs = merged.apply(rule_recommendation, axis=1)
        insights["recommendation"] = [r[0] for r in recs]
        insights["recommendation_reason"] = [
            "กฎจาก Deal Score: " + reason if rec is not None else reason for rec, reason in recs
        ]
    return report


async def persist(conn: asyncpg.Connection, report: TrainReport) -> int:
    """Replace stored insights with this run's results in one transaction."""
    now = datetime.now(timezone.utc)
    ins = report.insights

    def col(name: str) -> list[Any]:
        return [None if pd.isna(v) else v for v in ins[name].tolist()]

    async with conn.transaction():
        await conn.execute("DELETE FROM listing_insights")
        await conn.execute(
            """
            INSERT INTO listing_insights (
                listing_id, computed_at, model_version, fair_price, residual, pct_vs_fair,
                deal_score, demand_cluster, recommendation, recommendation_reason,
                sales_per_day, views_per_day)
            SELECT u.listing_id, $1, $2, u.fair_price, u.residual, u.pct_vs_fair,
                   u.deal_score, u.demand_cluster, u.recommendation, u.reason,
                   u.sales_per_day, u.views_per_day
            FROM unnest($3::bigint[], $4::numeric[], $5::numeric[], $6::float8[],
                        $7::smallint[], $8::text[], $9::text[], $10::text[],
                        $11::float8[], $12::float8[])
                 AS u (listing_id, fair_price, residual, pct_vs_fair, deal_score,
                       demand_cluster, recommendation, reason, sales_per_day, views_per_day)
            """,
            now,
            MODEL_VERSION,
            [int(v) for v in ins["listing_id"]],
            col("fair_price"),
            col("residual"),
            col("pct_vs_fair"),
            [None if pd.isna(v) else int(v) for v in ins["deal_score"]],
            col("demand_cluster"),
            col("recommendation"),
            col("recommendation_reason"),
            col("sales_per_day"),
            col("views_per_day"),
        )
        # linkage_quality belongs to `pricewatch link`, which runs before train.
        await conn.execute("DELETE FROM market_insights WHERE kind <> 'linkage_quality'")
        await conn.executemany(
            "INSERT INTO market_insights (category, kind, computed_at, payload) "
            "VALUES ($1, $2, $3, $4)",
            [
                (cat, kind, now, json.dumps(payload, default=_json_default))
                for (cat, kind), payload in report.market.items()
            ],
        )
    return len(ins)


def _json_default(value: object) -> object:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")


async def train(conn: asyncpg.Connection, *, figures: Path | None = FIGURES_DIR) -> TrainReport:
    """Load data, fit all models, persist insights and return the report."""
    current = await load_current_listings(conn)
    history = await load_history(conn)
    if current.empty:
        raise ValueError("no current listings to train on")
    if figures is not None:
        figures.mkdir(parents=True, exist_ok=True)
    report = run_models(current.reset_index(drop=True), history, figures)
    await persist(conn, report)
    return report


# ------------------------------------------------------------------ figures


def _plt() -> Any:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    return plt


def _plot_slr(
    out: Path, category: Category, x: pd.Series, y: pd.Series, slr: m.SimpleRegression, unit: str
) -> None:
    plt = _plt()
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.scatter(x, y, s=12, alpha=0.6)
    grid = np.linspace(np.nanmin(x), np.nanmax(x), 50)
    ax.plot(grid, slr.intercept + slr.slope * grid, color="black", linewidth=1.5)
    ax.set(
        xlabel=slr.feature,
        ylabel="price (THB)",
        title=f"{category.value.upper()}: {slr.slope:,.0f} THB per {unit} (R²={slr.r2:.2f})",
    )
    fig.tight_layout()
    fig.savefig(out / f"{category.value}_simple_regression.png", dpi=150)
    plt.close(fig)


def _plot_mlr(out: Path, category: Category, price: pd.Series, mlr: m.FairValueModel) -> None:
    plt = _plt()
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
    ax1.scatter(mlr.fair_price, price, s=12, alpha=0.6)
    lim = [
        float(min(price.min(), mlr.fair_price.min())),
        float(max(price.max(), mlr.fair_price.max())),
    ]
    ax1.plot(lim, lim, color="black", linewidth=1)
    ax1.set(
        xlabel="fair price (out-of-fold)",
        ylabel="listed price",
        title=f"R²(cv, log)={mlr.r2_cv:.2f}",
    )
    ax2.hist(mlr.z_residual, bins=30)
    ax2.set(xlabel="standardised residual", ylabel="listings", title="residual distribution")
    fig.suptitle(f"{category.value.upper()} fair-value MLR")
    fig.tight_layout()
    fig.savefig(out / f"{category.value}_fair_value_mlr.png", dpi=150)
    plt.close(fig)


#: Single-series report figures: one mark hue, grey reference lines.
_MARK = "#2a6fdb"
_REF = "#6b7280"
_VIF_WARN = 10.0


def _plot_mlr_diagnostics(out: Path, category: Category, d: m.RegressionDiagnostics) -> None:
    """Residual-vs-fitted, normal Q-Q and VIF panels for one fair-value model."""
    from scipy import stats

    plt = _plt()
    fig, (ax1, ax2, ax3) = plt.subplots(1, 3, figsize=(15, 4.5))
    for ax in (ax1, ax2, ax3):
        ax.grid(color="#e5e7eb", linewidth=0.6)
        ax.set_axisbelow(True)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)

    # 1. Residual vs fitted: a funnel means heteroscedasticity, a curve a
    # missing non-linear term. A rolling median makes the trend visible.
    ax1.scatter(d.fitted, d.residual, s=10, alpha=0.5, color=_MARK, linewidths=0)
    ax1.axhline(0, color=_REF, linewidth=1)
    order = np.argsort(d.fitted)
    window = max(5, len(order) // 15)
    trend = pd.Series(d.residual[order]).rolling(window, center=True, min_periods=3).median()
    ax1.plot(d.fitted[order], trend, color="black", linewidth=1.5, label="rolling median")
    ax1.legend(fontsize=8, frameon=False)
    ax1.set(
        xlabel="fitted log(price)",
        ylabel="residual",
        title=f"Residual vs fitted (Breusch-Pagan p={d.breusch_pagan_p:.3g})",
    )

    # 2. Normal Q-Q of standardised residuals against the 45-degree line.
    z = (d.residual - d.residual.mean()) / (d.residual.std(ddof=1) or 1.0)
    (theory, sample), _ = stats.probplot(z, dist="norm")
    ax2.scatter(theory, sample, s=10, alpha=0.6, color=_MARK, linewidths=0)
    lim = [float(min(theory.min(), sample.min())), float(max(theory.max(), sample.max()))]
    ax2.plot(lim, lim, color=_REF, linewidth=1)
    ax2.set(
        xlabel="theoretical normal quantile",
        ylabel="standardised residual",
        title=(
            f"Normal Q-Q (skew={d.skew:.2f}, excess kurt={d.excess_kurtosis:.2f}, "
            f"JB p={d.jarque_bera_p:.3g})"
        ),
    )
    ax2.title.set_fontsize(9)

    # 3. VIF per feature, log scale (interaction terms reach the hundreds).
    names = list(d.vif)
    values = np.array([d.vif[n] for n in names])
    ax3.barh(names, values, color=_MARK, height=0.6)
    ax3.axvline(_VIF_WARN, color=_REF, linestyle="--", linewidth=1, label="VIF = 10")
    ax3.set_xscale("log")
    # VIF >= 1 by definition: anchor bars at 1 and label round values only
    # (default log minor-tick labels collide).
    ticks = [t for t in (1, 2, 5, 10, 20, 50, 100, 200, 500, 1000) if t <= values.max() * 1.5]
    ax3.set_xlim(1, max(values.max(), _VIF_WARN) * 1.5)
    ax3.set_xticks(ticks, [str(t) for t in ticks])
    ax3.xaxis.set_minor_formatter(plt.NullFormatter())
    ax3.invert_yaxis()
    ax3.legend(fontsize=8, frameon=False)
    ax3.set(xlabel="variance inflation factor (log scale)", title="Collinearity (VIF)")
    ax3.tick_params(axis="y", labelsize=7)

    fig.suptitle(
        f"{category.value.upper()} fair-value MLR diagnostics (in-sample, n={len(d.residual)})"
    )
    fig.tight_layout()
    fig.savefig(out / f"{category.value}_mlr_diagnostics.png", dpi=150)
    plt.close(fig)


def _plot_tree(
    out: Path, name: str, model: Any, features: list[str], classes: list[str] | None = None
) -> None:
    from sklearn.tree import plot_tree

    plt = _plt()
    fig, ax = plt.subplots(figsize=(16, 7))
    plot_tree(model, feature_names=features, class_names=classes, filled=True, fontsize=7, ax=ax)
    fig.tight_layout()
    fig.savefig(out / f"{name}.png", dpi=150)
    plt.close(fig)


def _plot_kmeans(out: Path, current: pd.DataFrame, seg: m.DemandSegments) -> None:
    plt = _plt()
    labelled = seg.labels.dropna()
    fig, ax = plt.subplots(figsize=(6, 4.5))
    for label in sorted(labelled.unique()):
        idx = labelled[labelled == label].index
        ax.scatter(
            np.log1p(numeric(current, "view_count")[idx]),
            np.log1p(numeric(current, "sales_per_day")[idx].clip(lower=0)),
            s=12,
            alpha=0.7,
            label=label,
        )
    ax.set(
        xlabel="log(views + 1)",
        ylabel="log(sales per day + 1)",
        title=f"Demand segments (k={seg.k}, silhouette={seg.silhouette:.2f})",
    )
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out / "demand_kmeans.png", dpi=150)
    plt.close(fig)


def _plot_dendrogram(out: Path, h: m.HierarchyComparison) -> None:
    from scipy.cluster.hierarchy import dendrogram

    plt = _plt()
    fig, ax = plt.subplots(figsize=(7, 4))
    # Only the last 30 merges: thousands of leaves are unreadable, and the
    # top of the tree is where the k-cluster cut is decided.
    dendrogram(h.linkage, truncate_mode="lastp", p=30, ax=ax, no_labels=True)
    cut = (h.linkage[-h.k, 2] + h.linkage[-h.k + 1, 2]) / 2 if h.k > 1 else None
    if cut is not None:
        ax.axhline(cut, color="grey", linestyle="--", linewidth=1, label=f"cut at k={h.k}")
        ax.legend(fontsize=8)
    ax.set(
        ylabel="Ward merge distance",
        title=(
            f"Demand hierarchy (ARI vs K-Means={h.ari_vs_kmeans:.2f}, "
            f"cophenetic r={h.cophenetic_corr:.2f})"
        ),
    )
    fig.tight_layout()
    fig.savefig(out / "demand_hierarchical.png", dpi=150)
    plt.close(fig)
