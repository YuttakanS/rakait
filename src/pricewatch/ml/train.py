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

MODEL_VERSION = "2026.11-v1"
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


def gpu_class(chip: object) -> tuple[float, float]:
    """Map a chip name to (generation, performance class) on a common scale.

    NVIDIA "RTX 5070 Ti" -> (5, 7.5); AMD "RX 9070 XT" -> (9, 7.5);
    AMD "RX 7600" -> (7, 6). Suffixes add a fraction of a class.
    """
    if not isinstance(chip, str):
        return (np.nan, np.nan)
    if (nv := re.search(r"(?:RTX|GTX|GT) (\d{3,4})(?: (Ti Super|Ti|Super))?", chip)) is not None:
        number = int(nv.group(1))
        gen = number // 1000 if number >= 1000 else number // 100
        return (gen, (number % 100) / 10 + _NV_SUFFIX.get(nv.group(2) or "", 0.0))
    if (amd := re.search(r"RX (\d{4})(?: (XTX|XT|GRE))?", chip)) is not None:
        number = int(amd.group(1))
        tier = (number % 100) // 10 if number >= 9000 else (number % 1000) // 100
        return (number // 1000, tier + _AMD_SUFFIX.get(amd.group(2) or "", 0.0))
    return (np.nan, np.nan)


def spec_features(frame: pd.DataFrame, category: Category) -> pd.DataFrame:
    """Numeric hardware features per category (no demand signals)."""
    if category is Category.GPU:
        gen_class = frame.get("chip", pd.Series(dtype=object)).map(gpu_class)
        return pd.DataFrame(
            {
                "vram_gb": numeric(frame, "vram_gb"),
                "perf_class": [gc[1] for gc in gen_class] if len(gen_class) else np.nan,
                "generation": [gc[0] for gc in gen_class] if len(gen_class) else np.nan,
                "shader_cores": numeric(frame, "shader_cores"),
                "boost_clock_mhz": numeric(frame, "boost_clock_mhz"),
                "bus_width_bit": numeric(frame, "bus_width_bit"),
            },
            index=frame.index,
        )
    if category is Category.CPU:
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


def demand_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Demand signals of the specification: log views and log sales velocity."""
    return pd.DataFrame(
        {
            "log_views": np.log1p(numeric(frame, "view_count")),
            "log_sales_per_day": np.log1p(numeric(frame, "sales_per_day").clip(lower=0)),
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


def rule_recommendation(row: pd.Series) -> tuple[str, str]:
    """Transparent fallback while the timing tree is not reliable enough.

    Deal Score 80 / 20 is about one standard deviation below / above fair
    value (roughly the cheapest / dearest fifth of listings).
    """
    score = row.get("deal_score")
    if row.get("in_stock") is False:
        return m.WAIT, "สินค้าหมดที่ร้านนี้ รอของเข้าหรือดูร้านอื่น"
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
            mlr = m.fit_fair_value(pd.concat([specs, demand_features(frame)], axis=1), price)
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
            }
            if figures:
                _plot_mlr(figures, category, price, mlr)
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
        insights["recommendation_reason"] = ["กฎจาก Deal Score: " + r[1] for r in recs]
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
        await conn.execute("DELETE FROM market_insights")
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
