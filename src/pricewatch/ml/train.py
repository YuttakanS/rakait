"""End-to-end training: load data, fit every model, persist insights, plot figures."""

from __future__ import annotations

import json
import logging
import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import asyncpg
import numpy as np
import pandas as pd

from pricewatch.ml import models as m
from pricewatch.ml.dataset import (
    DEMAND_WINDOW_DAYS,
    category_frame,
    load_current_listings,
    load_history,
    numeric,
)
from pricewatch.models import Category

logger = logging.getLogger(__name__)

MODEL_VERSION = "2026.11-v18"
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
                "is_amd": frame.get("chip", pd.Series(dtype=object, index=frame.index))
                .astype(str)
                .str.contains(r"\bRX \d", regex=True)
                .astype(float),
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
                # Integrated graphics (normalize.py): separates Intel F / KF
                # parts (Core i5-14400F vs 14400) and, on AM4, Ryzen 5000
                # parts without a G (5600 vs 5600G) from siblings that need
                # no graphics card; Threadripper has none.
                "has_igpu": numeric(frame, "has_igpu"),
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


#: Features the fair-value MLR leaves out, per category: specs the tier tree
#: may still split on, and demand signals (``demand_features``).
#:
#: GPU: shader counts and clocks are not comparable across vendors (an RX
#: 9070 XT's 4,096 stream processors vs an RTX 5070 Ti's 8,960 CUDA cores;
#: Radeon boost clocks run ~500 MHz higher), so one slope for both mispriced
#: Radeons by up to 2x. Product-grouped CV on live GPUs (2026-11-12): R2
#: 0.761 -> 0.930, MAPE 22.7% -> 14.2%, in-stock listings "over 40% below
#: fair" 19 -> 1, with the vendor carried by ``is_amd`` instead.
#:
#: CPU (SPEC round 20, 2026.11-v18): the v17 fit priced lesser siblings
#: above better ones (i9-14900F above 14900K, Ryzen 5 5500 above 5600; 19
#: inverted pairs). Left out:
#:
#: * ``base_clock_ghz``: titles list it inconsistently (i7-14700K at 2.5 GHz,
#:   14700 at 3.45; 5500GT 4.0 vs 5600GT 3.6), and its slope was negative;
#: * ``unlocked`` (K / X): K parts sell below their locked siblings at these
#:   stores (i9-14900K 16,990 THB vs 14900 19,700; Core Ultra 7 265K vs
#:   265), so the slope was negative in every feature set tried and priced
#:   locked parts above K ones; a K part now shares its sibling's fair price;
#: * ``log_views`` (-0.07 per SD: the most-viewed CPUs are budget parts,
#:   i5-12400F, Ryzen 5 5600) and ``sales_rank_pct`` (~0): demand, not
#:   hardware; dropping them alone raised CV R2 0.851 -> 0.884.
#:
#: ``has_igpu`` is added (+0.023 per SD). Over 50 random product 5-fold
#: splits on live CPUs (2026-11-14), median v17 -> v18: R2 0.834 -> 0.870,
#: MAPE 24.4% -> 23.9%, inverted pairs 22 -> 7, otherwise scored listings
#: flagged as the lesser sibling 30.8% -> 10.9% (v18 mean: R2 0.863, MAPE
#: 24.5%, 7.8 pairs, 11.8%; v17's mean is not comparable, two of its splits
#: failed outright, R2 down to -1.1). The fixed 5-fold GroupKFold that
#: ``fit_fair_value`` reports is kinder to both: R2 0.851 -> 0.884, MAPE
#: 22.7% -> 22.4%, pairs 19 -> 6, flags 21.3% -> 7.2%; every coefficient
#: positive. Keeping ``unlocked`` gave the same CV but about twice the pairs.
#: Leaving ``has_igpu`` out too gave R2 +0.005 / MAPE -0.6 points (paired
#: splits) but a median of 10 pairs instead of 7 (over 15% flagged in 46% of
#: splits vs 26%); keeping it despite the slightly worse CV was the user's
#: decision (2026-11-14, SPEC round 20).
NOT_IN_MLR: dict[Category, tuple[str, ...]] = {
    Category.GPU: ("shader_cores", "boost_clock_mhz"),
    Category.CPU: ("base_clock_ghz", "unlocked", "log_views", "sales_rank_pct"),
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


def fair_value_features(
    frame: pd.DataFrame, specs: pd.DataFrame, category: Category, key: pd.Series
) -> pd.DataFrame:
    """The fair-value MLR's input columns for one category.

    Model-level specs (``model_level``, capacities in log2 by
    ``mlr_features``) beside the demand signals (``demand_features``), less
    the category's ``NOT_IN_MLR`` columns. O(n log n) for the per-store sales
    ranks, O(n) for the rest.

    Args:
        frame: Listings of ``category``.
        specs: ``spec_features(frame, category)``.
        category: The category of ``frame``.
        key: ``product_key(frame)``.

    Returns:
        One row per listing (aligned with ``frame``), spec columns first.

    Raises:
        KeyError: If ``NOT_IN_MLR[category]`` names a column that is not a
            feature (a typo would otherwise keep the feature in the fit).
    """
    features = pd.concat([mlr_features(model_level(specs, key)), demand_features(frame)], axis=1)
    excluded = list(NOT_IN_MLR.get(category, ()))
    # A misspelt name would silently keep the feature it meant to drop.
    unknown = [c for c in excluded if c not in features]
    if unknown:
        raise KeyError(f"NOT_IN_MLR[{category.value}] names unknown features: {unknown}")
    return features.drop(columns=excluded)


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


def store_sales_percentiles(frame: pd.DataFrame) -> tuple[pd.Series, pd.DataFrame]:
    """Within-store sales percentiles per product model (SPEC rounds 9 and 12).

    Stores measure sales differently: JIB's rate comes from its published
    sold counter, IHAVECPU's from warehouse stock drawdown (tens of units a
    day for bulk stock), so only ranks are comparable across stores. Each
    listing's rate is ranked within its own store (``merchant``; one store
    when absent), counting only the store's listings that have a rate:

    * ``sales_rank_pct``: average rank for ties, as a percentile in (0, 1];
    * ``sales_beats_pct``: share of the store's listings (with a rate) that
      sold strictly less, ``(min rank - 1) / count``.

    Both are averaged per store first, then across the stores that have one,
    so several listings of a model at one store do not outweigh another
    store. NaN when no store has a rate for the model. Grouped ranks are a
    per-store sort, O(n log n); the two means hash into O(#models) groups.

    Args:
        frame: Listings with ``listing_id`` and optionally ``canonical_id``,
            ``merchant`` and ``sales_per_day`` (negative rates count as 0).

    Returns:
        ``(key, percentiles)``: the model key per listing (``product_key``,
        aligned with ``frame``) and one row per model indexed by that key.
    """
    key = product_key(frame)
    store = frame["merchant"] if "merchant" in frame else pd.Series("", index=frame.index)
    sales = numeric(frame, "sales_per_day").clip(lower=0)
    # NaN rates keep NaN ranks and are not counted in the store's percentile.
    by_store = sales.groupby(store)
    percentiles = pd.DataFrame(
        {
            "sales_rank_pct": by_store.rank(method="average", pct=True),
            "sales_beats_pct": (by_store.rank(method="min") - 1) / by_store.transform("count"),
        },
        index=frame.index,
    )
    # Store first, then model: mean skips NaN, so only stores with a rate
    # count, each once; a model no store has a rate for stays NaN.
    return key, percentiles.groupby([key, store]).mean().groupby(level=0).mean()


def demand_features(frame: pd.DataFrame) -> pd.DataFrame:
    """Demand signals of the fair-value regression, per product model.

    Product level, not listing level, because only some stores publish these
    counters: per listing, "has views" would identify the store, and the
    same model at the same price would get a different fair price (and Deal
    Score) at each store. A fair price is a property of the product.

    * ``log_views``: ``log1p`` of the views summed over the model's listings
      (only JIB publishes views, so the sum is one store's counter);
    * ``sales_rank_pct``: the model's within-store sales percentile
      (:func:`store_sales_percentiles`, ranked among the stores' listings in
      ``frame``, i.e. within the category the regression is fitted on).
      Until 2026.11-v9 this was ``log1p`` of the sales rates summed over
      stores, which added JIB's sold counter (at most ~2 a day) to
      IHAVECPU's stock drawdown (up to ~90 a day), so its coefficient
      mostly measured "is stocked at IHAVECPU" (SPEC round 12).

    Unlinked listings are models of their own. NaN where no store publishes
    the counter (the regression adds a missingness indicator). O(n log n)
    for the per-store ranks, O(n) for the groupbys.

    Args:
        frame: Listings of one category with ``listing_id`` and optionally
            ``canonical_id``, ``merchant``, ``view_count``, ``sales_per_day``.

    Returns:
        ``log_views`` and ``sales_rank_pct`` per listing, aligned with ``frame``.
    """
    views = numeric(frame, "view_count")
    key, percentiles = store_sales_percentiles(frame)
    # min_count=1: a model no store publishes views for stays NaN.
    total_views = views.groupby(key).sum(min_count=1)
    return pd.DataFrame(
        {
            "log_views": np.log1p(key.map(total_views)),
            "sales_rank_pct": key.map(percentiles["sales_rank_pct"]),
        },
        index=frame.index,
    )


def model_demand(frame: pd.DataFrame) -> tuple[pd.Series, pd.DataFrame]:
    """Demand-clustering inputs per product model (SPEC round 8).

    One model gets one demand group, so the K-Means rows are models, not
    listings (store x model). Per model (``product_key``; an unlinked listing
    is a model of its own):

    * ``views``: sum of ``view_count`` over the stores that publish it, NaN
      when none does (such a model gets no group);
    * ``sales_per_day``: sum over the stores that publish it (negative rates
      clipped to 0), NaN when none does. For reporting only: it adds up
      metrics the stores measure differently, so it is neither clustered nor
      shown as a cross-store rate;
    * ``sales_rank_pct``: the clustered sales signal (SPEC round 9), the
      model's within-store sales percentile from
      :func:`store_sales_percentiles` (ranked over every category, as the
      clustering does). NaN when no store has a rate (such a model gets no
      group);
    * ``sales_beats_pct``: the shopper-facing share of the store's listings
      (with a rate) that sold strictly less. Not the average rank: with many
      zero-sales ties the average rank of a zero is mid-table (7 zeros of 10
      rank 0.4), while it beats nobody (0);
    * ``normalized_price``: the lowest in-stock price (every listing's when
      none is in stock) over the median price of all the model's listings.

    Pure ``groupby`` reductions over contiguous float columns (Cython, no
    per-row Python): O(n log n) for the per-store sort behind the rank, O(n)
    hashing into O(#models) groups, plus the medians.

    Args:
        frame: Current listings with ``listing_id``, ``price`` and optionally
            ``canonical_id``, ``merchant`` (one store when absent),
            ``view_count``, ``sales_per_day``, ``in_stock``.

    Returns:
        ``(key, models)``: the model key per listing (aligned with ``frame``)
        and one row per model indexed by that key, with the five columns
        above.
    """
    key = product_key(frame)
    price = frame["price"].astype(float)
    in_stock = (
        frame["in_stock"].fillna(False).astype(bool)
        if "in_stock" in frame
        else pd.Series(True, index=frame.index)
    )
    sales = numeric(frame, "sales_per_day").clip(lower=0)
    _, per_model = store_sales_percentiles(frame)
    columns = pd.DataFrame(
        {
            "views": numeric(frame, "view_count"),
            "sales_per_day": sales,
            "price": price,
            "in_stock_price": price.where(in_stock),
        },
        index=frame.index,
    )
    grouped = columns.groupby(key)
    lowest = grouped["in_stock_price"].min().fillna(grouped["price"].min())
    models = pd.DataFrame(
        {
            # min_count=1: a model no store publishes counters for stays NaN.
            "views": grouped["views"].sum(min_count=1),
            "sales_per_day": grouped["sales_per_day"].sum(min_count=1),
            "normalized_price": lowest / grouped["price"].median(),
        }
    )
    models = models.join(per_model)
    return key, models


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


#: |price / fair - 1| above which a fair price is flagged "ประเมินไม่แน่นอน".
#: Ranking listings by residual selects the model's largest overestimates:
#: on the live catalogue (2026-11-12) 98% of the top-60 "deals" was a gap
#: shared by every store of the model (the listing itself was 1% under the
#: other stores), concentrated in pre-2022 CPUs/GPUs and budget SSD/RAM
#: brands the spec features cannot see. A gap this large is far outside the
#: fit's typical error (MAPE 14-23%), so it is more likely the model than the
#: market: the listing keeps its fair price for reference but gets no Deal
#: Score (so it never ranks as a deal) and no recommendation.
UNCERTAIN_GAP = 0.40
#: What follows from an uncertain gap; the tail of every uncertain reason.
UNCERTAIN_FIT = "โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล"

#: Reason shown when no fair price could be estimated for a listing.
NO_FAIR_PRICE = "ยังประเมินราคายุติธรรมไม่ได้ เพราะชื่อสินค้าระบุสเปกหลักไม่ครบ"


def shown_pct(fraction: float) -> int:
    """Whole percent exactly as the web prints a fraction.

    Matches JavaScript ``Math.round(fraction * 100)`` (``formatBand``,
    ``FairGapTag``, ``FairDelta``, the card reason) bit for bit: halves round
    up, unlike Python's banker's ``round``. ``floor(v + 0.5)`` is not enough:
    for v = 0.49999999999999994 the float sum rounds to 1.0 while JS gives 0.
    ``v - floor(v)`` is exact for |v| < 2**52, so comparing the fraction part
    with 0.5 needs no extra rounding step. O(1).

    Args:
        fraction: A non-NaN ratio such as 0.365 for 36.5%.

    Returns:
        The rounded whole percent, e.g. 37.
    """
    value = fraction * 100
    whole = math.floor(value)
    return whole + 1 if value - whole >= 0.5 else whole


def uncertain_reason(pct_vs_fair: float) -> str:
    """Reason stored for a listing whose fair price is flagged uncertain.

    States only what was measured, the listing's own gap in the direction
    and whole percent the web prints ("ราคาจริงแพงกว่าราคายุติธรรม 42%",
    ``shown_pct``), then ``UNCERTAIN_FIT``; never a guessed cause, and no
    "เกิน 40%" threshold a shopper cannot check against the two prices
    (SPEC round 14). Mirrors ``uncertainReason`` in web/src/lib/format.ts.
    O(1).

    Args:
        pct_vs_fair: price / fair - 1 of the listing; |value| > UNCERTAIN_GAP.

    Returns:
        The full reason, prefixed "ประเมินไม่แน่นอน: ".
    """
    direction = "แพงกว่า" if pct_vs_fair > 0 else "ถูกกว่า"
    gap = shown_pct(abs(pct_vs_fair))
    return f"ประเมินไม่แน่นอน: ราคาจริง{direction}ราคายุติธรรม {gap}% {UNCERTAIN_FIT}"


#: Relative margin before a lesser sibling's fair price counts as inverted
#: (SPEC round 19): flagged when fair(worse) > fair(better) * (1 + this).
#: 5% keeps rounding-level ties out; inversions on the live catalogue
#: (2026-11-13) ran from 5% (RTX 5050 over 5060) to 53% (an SSD family).
#: Only the lesser-spec model is flagged (the user's option B).
SIBLING_TOLERANCE = 0.05

#: Spec dimensions compared between siblings, per category; every one is
#: oriented so that higher should cost more (see :func:`sibling_spec`).
SIBLING_DIMENSIONS: dict[Category, tuple[str, ...]] = {
    Category.GPU: ("perf_class", "vram_gb", "memory_rank"),
    Category.CPU: ("sku", "cores", "threads", "x3d", "unlocked", "has_igpu"),
    Category.RAM: ("capacity_gb", "speed_mhz"),
    Category.SSD: ("capacity_gb",),
}

#: GPU memory generations, slowest first. Within a launch year a faster
#: memory never sits on a cheaper tier, except the GT 1030 DDR4 variant,
#: which this keeps apart from the GDDR5 one (more VRAM, slower memory).
_GPU_MEMORY_RANK = {
    "DDR3": 1,
    "DDR4": 2,
    "GDDR5": 3,
    "GDDR5X": 4,
    "GDDR6": 5,
    "GDDR6X": 6,
    "GDDR7": 7,
}

#: CPU families, most specific first ("Ryzen Threadripper" is not a Ryzen).
_CPU_FAMILIES = ("Threadripper", "Core Ultra", "Core i", "Ryzen", "Pentium", "Athlon", "Xeon")
_CPU_SKU = re.compile(r"(?<!\d)\d{3,5}(?!\d)")
#: A trailing capacity in an SSD model name ("WD SN7100 1TB" -> "WD SN7100").
_SSD_CAPACITY = re.compile(r"\s+\d+(?:\.\d+)?\s*(?:GB|TB)\s*$", re.IGNORECASE)


def _cpu_line(model: object, generation: float = np.nan) -> tuple[str | None, float]:
    """Product line and model number of a CPU, for the sibling check.

    The model number is the first 3-5 digit number of the name (so a
    trailing "LGA1700" is ignored). The generation is the parser's
    ``generation`` spec when present (normalize.py: 14 for "Core i5-14400F",
    5 for "Ryzen 5 5600"), else the model number's leading digit(s), which
    covers Core Ultra (no parsed generation): 225 -> 2. O(len(model)).

    Args:
        model: Canonical model name, e.g. "Core i5-14400F".
        generation: The parsed ``generation`` spec, NaN when absent.

    Returns:
        ``(line, number)``, e.g. ("Core i 14", 14400.0), ("Ryzen 5", 5600.0)
        or ("Core Ultra 2", 225.0); (None, NaN) when the family or the number
        cannot be read.
    """
    if not isinstance(model, str):
        return (None, np.nan)
    family = next((f for f in _CPU_FAMILIES if f in model), None)
    number = _CPU_SKU.search(model)
    if family is None or number is None:
        return (None, np.nan)
    sku = int(number.group(0))
    if np.isfinite(generation):
        gen = int(generation)
    else:
        gen = sku // 1000 if sku >= 1000 else sku // 100
    return (f"{family} {gen}", float(sku))


def _text(frame: pd.DataFrame, column: str) -> pd.Series:
    """A text column as object dtype, all-NaN when absent."""
    if column not in frame:
        return pd.Series(np.nan, index=frame.index, dtype=object)
    return frame[column].astype(object)


def sibling_spec(
    frame: pd.DataFrame, specs: pd.DataFrame, category: Category
) -> tuple[pd.Series, pd.DataFrame]:
    """Product line and dominance dimensions per listing (SPEC round 19).

    Two products are compared only within one line, on dimensions where a
    higher value should never make a product cheaper:

    * GPU: line = vendor + launch year (``is_amd``, ``release_year``: one
      generation, e.g. GeForce RTX 50 or Radeon RX 9000); dimensions =
      ``perf_class`` (the tier ladder 5050 < 5060 < 5060 Ti < 5070 ... with
      suffixes), ``vram_gb`` and ``memory_rank`` (``_GPU_MEMORY_RANK``).
    * CPU: line = family + generation from the model name (``_cpu_line``,
      e.g. Ryzen 9000, Core i 14th gen, Core Ultra 200); dimensions = the
      model number (5500 < 5600, 14400 < 14600), ``cores``, ``threads``,
      ``x3d``, ``unlocked`` (K / X) and ``has_igpu`` (non-F). No clock: the
      parser has base clocks only, which run backwards between siblings
      (a 5500GT is listed at a higher base clock than a 5600GT).
    * RAM: line = manufacturer + DDR generation; dimensions = ``capacity_gb``
      and ``speed_mhz``.
    * SSD: line = model name without its capacity (the product family, e.g.
      "WD SN7100") + interface (SATA or NVMe PCIe generation); dimension =
      ``capacity_gb``.

    Unlinked or unnamed listings (no canonical model name) get no line: there
    is no name to quote to the shopper and their specs come from one title. A
    missing dimension is NaN, which the comparison treats as incomparable.
    O(n) vectorised, plus one regex per CPU listing.

    Args:
        frame: Listings of ``category`` (``canonical_id``, ``model``,
            ``manufacturer`` and the category's raw spec columns).
        specs: ``spec_features(frame, category)``.
        category: The category of ``frame``.

    Returns:
        ``(line, dims)`` aligned with ``frame``: a string label per listing
        (NaN = not compared) and ``SIBLING_DIMENSIONS[category]`` as floats.
    """
    linked = (
        frame["canonical_id"].notna()
        if "canonical_id" in frame
        else pd.Series(False, index=frame.index)
    )
    if category is Category.GPU:
        vendor = specs["is_amd"].map({1.0: "AMD", 0.0: "NVIDIA"})
        year = specs["release_year"] + _YEAR0
        line = vendor + " " + year.map(lambda y: f"{y:.0f}", na_action="ignore")
        dims = pd.DataFrame(
            {
                "perf_class": specs["perf_class"],
                "vram_gb": specs["vram_gb"],
                "memory_rank": _text(frame, "memory_type").map(_GPU_MEMORY_RANK).astype(float),
            }
        )
    elif category is Category.CPU:
        parsed = [
            _cpu_line(model, gen)
            for model, gen in zip(_text(frame, "model"), numeric(frame, "generation"), strict=True)
        ]
        line = pd.Series([p[0] for p in parsed], index=frame.index, dtype=object)
        dims = pd.DataFrame(
            {
                "sku": [p[1] for p in parsed],
                "cores": numeric(frame, "cores"),
                "threads": numeric(frame, "threads"),
                "x3d": numeric(frame, "x3d"),
                "unlocked": numeric(frame, "unlocked"),
                "has_igpu": numeric(frame, "has_igpu"),
            },
            index=frame.index,
        )
    elif category is Category.RAM:
        ddr = numeric(frame, "ddr").map(lambda d: f"DDR{d:.0f}", na_action="ignore")
        line = _text(frame, "manufacturer") + " " + ddr
        dims = pd.DataFrame({"capacity_gb": specs["capacity_gb"], "speed_mhz": specs["speed_mhz"]})
    else:
        family = _text(frame, "model").map(
            lambda m: _SSD_CAPACITY.sub("", m) if isinstance(m, str) else np.nan
        )
        # One interface per model: titles of one drive may omit or misread
        # its PCIe generation (Samsung 990 EVO PLUS read as 4 and 5), and a
        # per-listing value would split the model across two lines.
        pcie_gen = specs["pcie_gen"].groupby(product_key(frame)).transform("max")
        interface = pcie_gen.map(
            lambda g: "SATA" if g == 0 else f"NVMe PCIe {g:.0f}", na_action="ignore"
        )
        line = family + " " + interface
        dims = pd.DataFrame({"capacity_gb": specs["capacity_gb"]})
    named = _text(frame, "model").notna()
    return line.where(linked & named & line.notna()), dims[list(SIBLING_DIMENSIONS[category])]


#: Start of every sibling reason; the web tells it from a gap reason by it.
SIBLING_REASON_PREFIX = "ประเมินไม่แน่นอน: ราคายุติธรรมของรุ่นนี้"


def _thb(value: float) -> str:
    """Whole baht as the web prints it ("฿10,072"); halves round up like JS."""
    return f"฿{math.floor(value + 0.5):,}"


def sibling_reason(own_fair: float, better_model: str, better_fair: float) -> str:
    """Reason stored for a lesser-spec listing whose fair price is inverted.

    Only the lesser side of a pair is flagged (SPEC round 19, option B), so
    the reason always reads "this model's fair price is above the better
    sibling's". Quotes both fair prices as the product page prints them and
    the sibling's name, then ``UNCERTAIN_FIT``. The web prints it as stored
    (``uncertainReason`` in web/src/lib/format.ts recognises
    ``SIBLING_REASON_PREFIX``). O(1).

    Args:
        own_fair: This model's fair price (THB).
        better_model: The better sibling's name, e.g. "GeForce RTX 3050 8GB".
        better_fair: The better sibling's fair price (THB), lower than own.

    Returns:
        "ประเมินไม่แน่นอน: ราคายุติธรรมของรุ่นนี้ (฿9,579) สูงกว่ารุ่นที่สเปกดีกว่า
        GeForce RTX 3050 8GB (฿8,328) โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล".
    """
    return (
        f"{SIBLING_REASON_PREFIX} ({_thb(own_fair)}) สูงกว่ารุ่นที่สเปกดีกว่า {better_model} "
        f"({_thb(better_fair)}) {UNCERTAIN_FIT}"
    )


#: Inverted pairs quoted as examples in the payload (SPEC round 19: 1-3).
SIBLING_EXAMPLES = 3


@dataclass
class SiblingCheck:
    """Outcome of the sibling check for one category.

    Attributes:
        flagged: Per listing, whether its model is the lesser-spec side of
            an inverted pair (the better side is never flagged).
        reasons: Per listing, the ``sibling_reason`` of its model's widest
            pair, None when not flagged.
        pairs: One row per inverted pair (``models.SIBLING_PAIR_COLUMNS``
            plus ``worse_model`` / ``better_model`` names), widest first.
    """

    flagged: pd.Series
    reasons: pd.Series
    pairs: pd.DataFrame

    def payload(self) -> dict[str, Any]:
        """The ``fair_value_mlr`` fields of this check (2026.11-v17)."""
        examples = self.pairs.head(SIBLING_EXAMPLES)
        return {
            "sibling_tolerance": SIBLING_TOLERANCE,
            "sibling_inversions": int(len(self.pairs)),
            "sibling_flagged": int(self.flagged.sum()),
            "sibling_examples": [
                {
                    "worse": str(r.worse_model),
                    "worse_fair": int(math.floor(r.worse_fair + 0.5)),
                    "better": str(r.better_model),
                    "better_fair": int(math.floor(r.better_fair + 0.5)),
                }
                for r in examples.itertuples()
            ],
        }


def _model_mode(line: pd.Series, key: pd.Series) -> pd.Series:
    """The most frequent line label per model (ties: alphabetically first).

    One value per model whatever the order of its listings; NaN for a model
    none of whose listings has a line. One ``value_counts`` and a sort over
    (model, line) pairs: O(n log n).

    Args:
        line: Line label per listing (NaN = none).
        key: Model key per listing, aligned with ``line``.

    Returns:
        The label per model, indexed by every key in ``key``.
    """
    counts = (
        pd.DataFrame({"key": key, "line": line})
        .dropna()
        .value_counts()
        .rename("n")
        .reset_index()
        .sort_values(["key", "n", "line"], ascending=[True, False, True], kind="stable")
        .drop_duplicates("key")
    )
    models = pd.Index(key.unique()).sort_values()
    return counts.set_index("key")["line"].reindex(models).astype(object)


def sibling_check(
    frame: pd.DataFrame, specs: pd.DataFrame, category: Category, fair_price: pd.Series
) -> SiblingCheck:
    """Find sibling models whose fair prices run against their specs.

    Per model (``product_key``, the MLR's grouping): the line is the most
    frequent label of its listings (``_model_mode``), each dimension the median over them
    (as ``model_level`` reconciles specs), and the fair price the median of
    the listings' rounded fair prices (one value per model, the one the
    product page prints). ``models.sibling_inversions`` then compares the
    models of each line. Every listing of the lesser-spec model of an
    inverted pair is flagged (SPEC round 19, option B: its inflated fair
    price is what would rank as a false deal; the better model keeps its
    Deal Score) and explained by its widest pair. O(n) groupbys plus
    O(sum g^2 d) for the comparisons.

    Args:
        frame: Listings of ``category``.
        specs: ``spec_features(frame, category)``.
        category: The category of ``frame``.
        fair_price: The MLR's fair price per listing (NaN = unscored).

    Returns:
        The flags, reasons and pairs (see :class:`SiblingCheck`).
    """
    key = product_key(frame)
    line, dims = sibling_spec(frame, specs, category)
    model_line = _model_mode(line, key)
    model_dims = dims.groupby(key).median()
    model_fair = fair_price.round(0).groupby(key).median()
    names = frame.get("model", pd.Series(np.nan, index=frame.index)).groupby(key).first()
    pairs = m.sibling_inversions(model_line, model_dims, model_fair, SIBLING_TOLERANCE)
    pairs["worse_model"] = pairs["worse"].map(names)
    pairs["better_model"] = pairs["better"].map(names)
    widest = m.widest_sibling_pair(pairs)
    model_reason = pd.Series(
        [
            sibling_reason(float(own), str(names[other]), float(theirs))
            for own, other, theirs in zip(
                widest["own_fair"].to_numpy(float),
                widest["other"],
                widest["other_fair"].to_numpy(float),
                strict=True,
            )
        ],
        index=widest.index,
        dtype=object,
    )
    flagged = key.isin(widest.index)
    return SiblingCheck(
        flagged=flagged, reasons=key.map(model_reason).where(flagged, None), pairs=pairs
    )


def gap_clears_band(pct_vs_fair: float, fair_error_pct: float) -> bool:
    """Whether the shown gap exceeds the shown "± Y%" band.

    Both sides are compared as the whole percents the shopper reads, so a
    card never pairs "ถูกกว่า 20%" with "± 20%" under a "ชัดเจน" verdict.

    Args:
        pct_vs_fair: Non-NaN price / fair - 1 (negative = cheaper).
        fair_error_pct: Half-width of the 80% interval as a fraction; NaN
            when unknown, which never clears. Callers holding ``None`` for an
            unknown band check it themselves (``rule_recommendation``).

    Returns:
        True only when the band is known and the rounded gap is larger.
    """
    if pd.isna(fair_error_pct):
        return False
    return shown_pct(abs(pct_vs_fair)) > shown_pct(fair_error_pct)


def gap_within_band_reason(pct_vs_fair: float, fair_error_pct: float | None) -> str:
    """Reason for a Deal Score extreme whose gap the error band cannot confirm.

    Args:
        pct_vs_fair: Non-NaN price / fair - 1 (negative = cheaper); the
            caller filters NaN out first.
        fair_error_pct: Half-width of the 80% interval as a fraction, or
            NaN / None when unknown.

    Returns:
        A shopper-facing Thai sentence naming the gap and the band in whole
        percents as the web prints them (``shown_pct``), or saying the band
        is unknown.
    """
    side = "ถูกกว่า" if pct_vs_fair < 0 else "แพงกว่า"
    gap = f"{side}ราคายุติธรรม {shown_pct(abs(pct_vs_fair))}%"
    if fair_error_pct is None or pd.isna(fair_error_pct):
        return f"{gap} แต่ยังไม่ทราบช่วงคลาดเคลื่อนของราคานี้ จึงยังสรุปไม่ได้ว่า{side}ตลาดจริง"
    band = shown_pct(fair_error_pct)
    return f"{gap} แต่ยังอยู่ในช่วงคลาดเคลื่อน ±{band}% จึงยังสรุปไม่ได้ว่า{side}ตลาดจริง"


def gap_beyond_band_reason(pct_vs_fair: float, fair_error_pct: float) -> str:
    """Reason for a buy / wait call whose gap cleared the error band.

    Args:
        pct_vs_fair: Non-NaN price / fair - 1 (negative = cheaper).
        fair_error_pct: Non-NaN half-width of the 80% interval as a fraction.

    Returns:
        A Thai sentence naming the gap and the band in the whole percents the
        web prints (``shown_pct``), e.g. "ถูกกว่าราคายุติธรรม 52% ซึ่งเกินช่วง
        คลาดเคลื่อน ±30% จึงถูกกว่าตลาดชัดเจน".
    """
    side = "ถูกกว่า" if pct_vs_fair < 0 else "แพงกว่า"
    gap, band = shown_pct(abs(pct_vs_fair)), shown_pct(fair_error_pct)
    return f"{side}ราคายุติธรรม {gap}% ซึ่งเกินช่วงคลาดเคลื่อน ±{band}% จึง{side}ตลาดชัดเจน"


#: Shown gap (whole percent, ``shown_pct``) below which a Deal Score 21-79
#: listing may be called "ใกล้เคียงราคายุติธรรม". At 5% or more the reason names
#: the gap and the band instead: a card reading "ถูกกว่า 18%" beside "ใกล้เคียง"
#: contradicts itself. Mirrored by ``NEAR_FAIR_PCT`` in web/src/lib/card-reason.ts.
NEAR_FAIR_PCT = 5

#: Reason for a Deal Score 21-79 listing whose shown gap is under ``NEAR_FAIR_PCT``.
NEAR_FAIR_REASON = "ราคาใกล้เคียงราคายุติธรรมของสเปกนี้"


def mid_score_reason(pct_vs_fair: float, fair_error_pct: float | None) -> str:
    """Reason for a Deal Score 21-79 listing (always "ราคาเหมาะสม").

    Under ``NEAR_FAIR_PCT`` shown percent the price is called close to fair.
    From there on the reason quotes the gap like ``gap_within_band_reason``
    does. A gap that already clears the band cannot say "ยังอยู่ในช่วง", so
    it names the Deal Score threshold it missed instead (the card's
    "ยังไม่ถึงเกณฑ์ซื้อเลย (DEAL 80)"). O(1).

    Args:
        pct_vs_fair: Non-NaN price / fair - 1 (negative = cheaper).
        fair_error_pct: Half-width of the 80% interval as a fraction, or
            None when unknown.

    Returns:
        A Thai sentence in the whole percents the web prints.
    """
    if shown_pct(abs(pct_vs_fair)) < NEAR_FAIR_PCT:
        return NEAR_FAIR_REASON
    if fair_error_pct is None or not gap_clears_band(pct_vs_fair, fair_error_pct):
        return gap_within_band_reason(pct_vs_fair, fair_error_pct)
    side = "ถูกกว่า" if pct_vs_fair < 0 else "แพงกว่า"
    gap, band = shown_pct(abs(pct_vs_fair)), shown_pct(fair_error_pct)
    threshold = "ซื้อเลย (Deal Score 80 ขึ้นไป)" if pct_vs_fair < 0 else "รอก่อน (Deal Score 20 ลงมา)"
    return f"{side}ราคายุติธรรม {gap}% ซึ่งเกินช่วงคลาดเคลื่อน ±{band}% แต่ Deal Score ยังไม่ถึงเกณฑ์{threshold}"


def rule_recommendation(row: pd.Series) -> tuple[str | None, str]:
    """Transparent fallback while the timing tree is not reliable enough.

    Deal Score 80 / 20 is about one standard deviation below / above fair
    value (roughly the cheapest / dearest fifth of listings). A buy / wait
    call also needs the gap to exceed the fair price's "± Y%" error band, both
    as the whole percents the web prints (``gap_clears_band``): otherwise the
    page would call a 37% gap "clear" beside a ±45% band. Inside the band, or
    with no band, the listing gets "fair price" with the gap and band spelled
    out. Deal Score 21-79 gives "fair price" with ``mid_score_reason``
    ("close to fair" only under a 5% shown gap). A listing without a Deal
    Score gets no recommendation rather than a "fair price" verdict it has no
    evidence for. Every reason is a plain
    shopper sentence with no rule-name prefix. O(1) per row.

    Args:
        row: One listing with ``deal_score`` (float, NaN when unscored),
            ``pct_vs_fair`` (float, NaN when unpriced), ``fair_error_pct``
            (``float | None``; NaN or None when the band is unknown),
            ``in_stock`` (bool) and ``stock_quantity`` (float, NaN when the
            store does not publish it).

    Returns:
        ``(recommendation, reason)``: the recommendation is ``m.BUY_NOW``,
        ``m.WAIT``, ``m.FAIR`` or None (no Deal Score), and the reason is the
        Thai sentence shown under it.
    """
    score = row.get("deal_score")
    pct = row.get("pct_vs_fair", np.nan)
    raw_band = row.get("fair_error_pct")
    band: float | None = None if raw_band is None or pd.isna(raw_band) else float(raw_band)
    if row.get("in_stock") is False:
        return m.WAIT, "สินค้าหมดที่ร้านนี้ รอของเข้าหรือดูร้านอื่น"
    if pd.isna(score) or pd.isna(pct):
        return None, NO_FAIR_PRICE
    if score >= 80:
        if pct < 0 and band is not None and gap_clears_band(pct, band):
            quantity = row.get("stock_quantity")
            low = pd.notna(quantity) and quantity <= 3
            reason = gap_beyond_band_reason(pct, band)
            return m.BUY_NOW, reason + (" และสต็อกเหลือน้อย" if low else "")
        return m.FAIR, gap_within_band_reason(pct, band)
    if score <= 20:
        if pct > 0 and band is not None and gap_clears_band(pct, band):
            return m.WAIT, gap_beyond_band_reason(pct, band)
        return m.FAIR, gap_within_band_reason(pct, band)
    return m.FAIR, mid_score_reason(pct, band)


#: Points per chart stored in a payload (SPEC round 15): enough to show the
#: shape of a fit, small enough to keep each market_insights row ~100 KB.
CHART_POINTS = 250
#: Demand-scatter points (models of every category share one chart).
KMEANS_CHART_POINTS = 600
#: Residual histogram range and bin width (fraction of the fair price); rows
#: beyond the range are counted in the end bins and reported separately.
RESIDUAL_RANGE = 0.6
RESIDUAL_BIN = 0.05


def sample_positions(n: int, limit: int, seed: int = 42) -> np.ndarray:
    """Sorted positions of at most ``limit`` rows out of ``n``, reproducibly.

    A seeded uniform sample without replacement: the chart keeps the cloud's
    shape and the same run always shows the same points. O(n).

    Args:
        n: Rows available.
        limit: Maximum rows to keep.
        seed: Random seed of the sample.

    Returns:
        Ascending positions in ``[0, n)``; all of them when ``n <= limit``.
    """
    if n <= limit:
        return np.arange(n)
    return np.sort(np.random.default_rng(seed).choice(n, size=limit, replace=False))


def fit_points(
    price: pd.Series,
    fair: pd.Series,
    names: pd.Series,
    uncertain: pd.Series | None = None,
    limit: int = CHART_POINTS,
) -> list[list[Any]]:
    """``[price, fair price, name, uncertain]`` per scored row, sampled to ``limit``.

    Rows without a fair price are left out (nothing to plot). Prices are
    whole baht to keep the payload small. The fourth member (2026.11-v17)
    says whether the row's fair price is flagged "ประเมินไม่แน่นอน" (a gap
    over ``UNCERTAIN_GAP`` or a sibling inversion, which can sit inside the
    gap), so /ml never picks such a row as its worked example.

    Args:
        price: Listing price (THB).
        fair: Out-of-fold fair price (THB, NaN when unscored), aligned.
        names: Label per row for the tooltip (model or title), aligned.
        uncertain: ``fair_uncertain`` per row, aligned; all False when None.
        limit: Maximum rows.

    Returns:
        The sampled rows, in input order.
    """
    scored = fair.notna() & price.notna()
    flags = pd.Series(False, index=price.index) if uncertain is None else uncertain.astype(bool)
    p = price[scored].to_numpy(float)
    f = fair[scored].to_numpy(float)
    n = names[scored].astype(str).to_numpy()
    u = flags[scored].to_numpy(bool)
    keep = sample_positions(len(p), limit)
    return [[round(float(p[i])), round(float(f[i])), str(n[i])[:80], bool(u[i])] for i in keep]


def residual_histogram(
    pct_vs_fair: pd.Series, width: float = RESIDUAL_BIN, span: float = RESIDUAL_RANGE
) -> dict[str, Any]:
    """Histogram of ``price / fair - 1`` over scored rows.

    Bins are ``width`` wide from ``-span`` to ``+span``; values outside are
    clipped into the end bins and also counted in ``below`` / ``above``, so
    the chart can say how many rows lie past its edges. One vectorised
    ``np.histogram``: O(n).

    Args:
        pct_vs_fair: Fractional gap per row (NaN rows are skipped).
        width: Bin width as a fraction.
        span: Half-range as a fraction.

    Returns:
        ``edges`` (bins + 1 values), ``counts``, ``below``, ``above``, ``n``.
    """
    values = pct_vs_fair.dropna().to_numpy(float)
    bins = int(round(2 * span / width))
    edges = np.linspace(-span, span, bins + 1)
    counts, _ = np.histogram(np.clip(values, -span, span), bins=edges)
    return {
        "edges": [round(float(e), 4) for e in edges],
        "counts": [int(c) for c in counts],
        "below": int((values < -span).sum()),
        "above": int((values > span).sum()),
        "n": int(len(values)),
    }


def listing_names(frame: pd.DataFrame) -> pd.Series:
    """Canonical model name per listing, the title when unlinked.

    Args:
        frame: Listings with optional ``model`` and ``title`` columns.

    Returns:
        One string per listing, aligned with ``frame``.
    """
    title = frame["title"] if "title" in frame else pd.Series("", index=frame.index)
    if "model" not in frame:
        return title.astype(str)
    return frame["model"].where(frame["model"].notna(), title).astype(str)


def zero_share_means_no_sales(frame: pd.DataFrame) -> bool:
    """Whether a sales share of 0 can be worded as "no sales seen".

    ``sales_beats_pct`` is 0 for a model that outsold nothing in its stores,
    i.e. whose rate is each store's lowest. That is "no sales" only if the
    lowest rate of every store (among listings with a rate) is 0; in a store
    where everything sold, the slowest seller would otherwise be described
    as unsold. One grouped minimum: O(n).

    Args:
        frame: Current listings with ``sales_per_day`` and optionally
            ``merchant`` (one store when absent), as ``model_demand`` reads them.

    Returns:
        True when at least one store has rates and every such store's minimum
        (negative rates clipped to 0) is 0.
    """
    store = frame["merchant"] if "merchant" in frame else pd.Series("", index=frame.index)
    lowest = numeric(frame, "sales_per_day").clip(lower=0).groupby(store).min().dropna()
    return bool(len(lowest) > 0 and (lowest == 0).all())


def kmeans_points(
    models: pd.DataFrame,
    labels: pd.Series,
    limit: int = KMEANS_CHART_POINTS,
    *,
    fits: pd.Series | None = None,
) -> list[list[Any]]:
    """``[log1p(views), sales_rank_pct, label(, label_fits)]`` per clustered model, sampled.

    Args:
        models: ``model_demand`` rows with ``views`` and ``sales_rank_pct``.
        labels: Listing label per model (NaN for unclustered models).
        limit: Maximum rows.
        fits: ``models.label_fit`` flag per model, indexed like ``labels``.
            When given (2026.11-v16, SPEC round 18) each row gains a fourth
            element, whether the web shows the label, so /ml can draw the
            unbadged models apart; ``None`` where the flag is unknown.

    Returns:
        The sampled rows; coordinates rounded to 3 decimals.
    """
    labelled = labels.dropna()
    x = np.log1p(models.loc[labelled.index, "views"].to_numpy(float))
    y = models.loc[labelled.index, "sales_rank_pct"].to_numpy(float)
    names = labelled.astype(str).to_numpy()
    keep = sample_positions(len(names), limit)
    rows = [[round(float(x[i]), 3), round(float(y[i]), 3), str(names[i])] for i in keep]
    if fits is None:
        return rows
    flags = fits.reindex(labelled.index).to_numpy(dtype=object)
    for row, i in zip(rows, keep, strict=True):
        row.append(None if flags[i] is None or pd.isna(flags[i]) else bool(flags[i]))
    return rows


def timing_payload(timing: m.TimingModel) -> dict[str, Any]:
    """The ``(all, timing_tree)`` market-insight payload of a fitted timing tree.

    Besides the scores it carries the settings behind the labels and the
    usefulness bar (2026.11-v13), so /ml quotes the values actually used
    rather than numbers written into its copy.

    Args:
        timing: The fitted Buy / Wait tree.

    Returns:
        A JSON-ready dict.
    """
    return {
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
        "min_balanced_accuracy": m.MIN_BALANCED_ACCURACY,
        "horizon_days": m.TIMING_HORIZON_DAYS,
        "min_lookahead_days": m.TIMING_MIN_LOOKAHEAD_DAYS,
        "drop_pct": m.TIMING_DROP_PCT,
        "stock_share": m.TIMING_STOCK_SHARE,
        "test_fraction": m.TIMING_TEST_FRACTION,
        # Node-link structure for /ml: raw training counts per class.
        "tree": {"nodes": timing.nodes, "value": "class_counts"},
        "max_depth": m.MAX_TREE_DEPTH,
    }


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
    for column in ("fair_price", "residual", "pct_vs_fair", "deal_score", "fair_error_pct"):
        insights[column] = np.nan
    insights["fair_uncertain"] = False
    insights["demand_cluster"] = None
    insights["demand_driver"] = None
    insights["demand_label_fits"] = None
    insights["demand_label_miss"] = None
    report = TrainReport(insights=insights)
    # Per listing, the sibling-inversion reason of its model (None when none).
    sibling_reasons = pd.Series(None, index=current.index, dtype=object)

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
                fair_value_features(frame, specs, category, key),
                price,
                required=REQUIRED_FOR_FAIR_VALUE[category],
                groups=key,
                # Learn from what can be bought today; sold-out rows carry
                # stale prices but are still scored.
                fit_mask=frame["in_stock"].fillna(False).astype(bool),
            )
            pct = price / mlr.fair_price - 1
            # Uncertain: a gap too wide for the fit, or a fair price that runs
            # against a sibling model's (SPEC round 19, 2026.11-v17).
            siblings = sibling_check(frame, specs, category, mlr.fair_price)
            sibling_reasons.loc[frame.index] = siblings.reasons
            uncertain = (pct.abs() > UNCERTAIN_GAP) | siblings.flagged
            scores = m.deal_score(mlr.z_residual).where(~uncertain)
            insights.loc[frame.index, "fair_price"] = mlr.fair_price.round(0)
            insights.loc[frame.index, "residual"] = (price - mlr.fair_price).round(0)
            insights.loc[frame.index, "pct_vs_fair"] = pct
            insights.loc[frame.index, "deal_score"] = scores
            insights.loc[frame.index, "fair_error_pct"] = mlr.error_pct()
            insights.loc[frame.index, "fair_uncertain"] = uncertain
            report.market[(category.value, "fair_value_mlr")] = {
                "target": "log(price)",
                "coefficients": mlr.coefficient_table(),
                "intercept": mlr.intercept,
                "r2_cv": mlr.r2_cv,
                "mape_cv": mlr.mape_cv,
                "cv_folds": mlr.cv_folds,
                "n": mlr.n,
                "required": REQUIRED_FOR_FAIR_VALUE[category],
                "unscored": int(mlr.fair_price.isna().sum()),
                "extrapolated": mlr.extrapolated,
                # Every uncertain listing, gap or sibling (2026.11-v17+); the
                # sibling_* fields count the second cause on its own.
                "uncertain": int(uncertain.sum()),
                "uncertain_gap": UNCERTAIN_GAP,
                **siblings.payload(),
                "error_pct_median": float(mlr.error_pct().median()),
                # Coverage of the "± Y%" interval (2026.11-v13).
                "interval_level": m.INTERVAL_LEVEL,
                "fitted_on": "in-stock listings",
                "diagnostics": mlr.diagnostics.summary() if mlr.diagnostics else None,
                # Chart data for /ml (2026.11-v13): [price, fair, name] for at
                # most CHART_POINTS scored listings, and the % gap histogram.
                # 2026.11-v17: a fourth member per point, whether it is uncertain.
                "fit_points": fit_points(
                    price, mlr.fair_price, listing_names(frame), uncertain=uncertain
                ),
                "residual_bins": residual_histogram(pct),
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
                # Node-link structure for /ml (2026.11-v13); leaf values in THB.
                "tree": {"nodes": tier.nodes, "value": "price_thb"},
                "max_depth": m.MAX_TREE_DEPTH,
            }
            if figures:
                _plot_tree(figures, f"{category.value}_tier_tree", tier.model, tier.features)
        except ValueError as exc:
            report.notes.append(f"{category.value} tier tree: {exc}")

    # D. K-Means over product models that publish demand (all categories
    # together; price normalised within each model so categories are
    # comparable). One model, one group: every listing of a model gets its
    # model's label, so the web's filter and card badge agree (SPEC round 8).
    model_key, models = model_demand(current)
    # The evidence behind a model's group (SPEC round 16, migration 0013): the
    # very values the clustering reads, copied to every listing of the model
    # so the web never re-derives them. NaN where no store publishes them.
    insights["model_views"] = model_key.map(models["views"])
    insights["model_sales_beats_pct"] = model_key.map(models["sales_beats_pct"])
    insights["model_normalized_price"] = model_key.map(models["normalized_price"])
    try:
        seg = m.segment_demand(
            models["views"],
            models["sales_per_day"],
            models["normalized_price"],
            sales_rank_pct=models["sales_rank_pct"],
            sales_beats_pct=models["sales_beats_pct"],
        )
        insights["demand_cluster"] = model_key.map(seg.labels)
        if seg.drivers is not None:
            insights["demand_driver"] = model_key.map(seg.drivers)
        # SPEC round 17 (migration 0014): whether the model's own numbers
        # support its group's name. The rule lives in models.label_fit only;
        # the web shows the badge, filters and counts by this flag.
        unlabelled = seg.labels.iloc[0:0]
        if seg.label_fits is not None and seg.label_miss is not None:
            insights["demand_label_fits"] = model_key.map(seg.label_fits)
            insights["demand_label_miss"] = model_key.map(seg.label_miss)
            unlabelled = seg.labels[seg.label_fits.eq(False)]  # None (unknown) is not False
        report.market[("all", "demand_kmeans")] = {
            # Rows clustered: product models (2026.11-v8+); earlier payloads
            # have no "unit" and counted listings.
            "unit": "model",
            # Clustered sales feature (2026.11-v9+): the mean within-store
            # sales percentile; v8 and earlier have no key and used
            # log1p(sales_per_day summed over stores).
            "sales_feature": "store_rank_pct",
            "k": seg.k,
            "silhouette": seg.silhouette,
            "silhouette_by_k": seg.silhouette_by_k,
            "centroids": seg.centroids,
            # Per label, from the models (best-seller clusters are split by
            # views, so a centroid no longer equals one label). Their
            # sales_per_day (and the centroids') sums incomparable store
            # metrics: reporting only; the web shows sales_beats_pct.
            "segments": seg.segments,
            "split_views": seg.split_views,
            "n": int(seg.labels.notna().sum()),
            # 2026.11-v14 (SPEC round 16): medians over every clustered model,
            # the yardstick for "more views than the typical model", and the
            # margins (in SD) of the naming rule the web explains.
            "reference": seg.reference,
            "best_seller_margin_sd": m.BEST_SELLER_MARGIN_SD,
            "conversion_margin_sd": m.CONVERSION_MARGIN_SD,
            # 2026.11-v15 (SPEC round 17): the thresholds of models.label_fit,
            # quoted by the web (never re-evaluated there), the window the
            # sales rates are measured over, and how many clustered models
            # keep no badge because their numbers contradict the name.
            "label_rule": {
                "sales_bar": m.LABEL_SALES_BAR,
                "views_split": seg.split_views,
                "views_median": seg.reference.get("views_median"),
                # A cap, not the window of every rate: each listing's rate
                # is its sold delta over the span it was observed for, within
                # at most this many days of history (dataset.load_current_listings).
                "window_days": DEMAND_WINDOW_DAYS,
                # Whether "outsold nothing" (sales share 0) means "no sales
                # seen": true only when every store's lowest rate is 0.
                "zero_share_means_no_sales": zero_share_means_no_sales(current),
                # 2026.11-v16 (SPEC round 18): the remainder group's badge also
                # needs a sales share under sales_bar. Absent (v15) means it
                # always fitted, so the web words the rule only when this is true.
                "niche_below_bar": True,
            },
            "unlabelled": {
                "n": int(len(unlabelled)),
                "by_label": {str(k): int(v) for k, v in unlabelled.value_counts().items()},
            },
            # Scatter for /ml (2026.11-v13): [log1p(views), sales_rank_pct,
            # label] for at most KMEANS_CHART_POINTS clustered models.
            # 2026.11-v16: a fourth element per point, whether its label is shown.
            "points": kmeans_points(models, seg.labels, fits=seg.label_fits),
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
                # Top DENDROGRAM_BRANCHES merges and the k cut, for /ml (2026.11-v13).
                "dendrogram": m.truncated_dendrogram(h.linkage, h.k),
            }
        if figures:
            _plot_kmeans(figures, models, seg)
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
        report.market[("all", "timing_tree")] = timing_payload(timing)
        if figures:
            _plot_tree(figures, "timing_tree", timing.model, timing.features, timing.classes)
    except ValueError as exc:
        report.notes.append(f"timing tree: {exc}; using transparent rules instead")

    if timing is not None and not timing.usable:
        report.notes.append(
            f"timing tree: balanced accuracy {timing.balanced_accuracy_test:.2f} is below "
            f"{m.MIN_BALANCED_ACCURACY:.2f} "
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
        insights["recommendation_reason"] = [reason for _, reason in recs]
    # Whatever produced the recommendation, an uncertain fair price cannot
    # back a buy / wait call. A sibling inversion names the other model, so
    # it is the more specific reason when a listing has both causes.
    flagged = insights["fair_uncertain"].astype(bool)
    insights.loc[flagged, "recommendation"] = None
    insights.loc[flagged, "recommendation_reason"] = [
        sibling if isinstance(sibling, str) else uncertain_reason(float(p))
        for p, sibling in zip(
            insights.loc[flagged, "pct_vs_fair"], sibling_reasons[flagged], strict=True
        )
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
                sales_per_day, views_per_day, fair_error_pct, fair_uncertain,
                model_views, model_sales_beats_pct, model_normalized_price, demand_driver,
                demand_label_fits, demand_label_miss)
            SELECT u.listing_id, $1, $2, u.fair_price, u.residual, u.pct_vs_fair,
                   u.deal_score, u.demand_cluster, u.recommendation, u.reason,
                   u.sales_per_day, u.views_per_day, u.fair_error_pct, u.fair_uncertain,
                   u.model_views, u.model_sales_beats_pct, u.model_normalized_price,
                   u.demand_driver, u.demand_label_fits, u.demand_label_miss
            FROM unnest($3::bigint[], $4::numeric[], $5::numeric[], $6::float8[],
                        $7::smallint[], $8::text[], $9::text[], $10::text[],
                        $11::float8[], $12::float8[], $13::float8[], $14::boolean[],
                        $15::float8[], $16::float8[], $17::float8[], $18::text[],
                        $19::boolean[], $20::text[])
                 AS u (listing_id, fair_price, residual, pct_vs_fair, deal_score,
                       demand_cluster, recommendation, reason, sales_per_day, views_per_day,
                       fair_error_pct, fair_uncertain, model_views, model_sales_beats_pct,
                       model_normalized_price, demand_driver, demand_label_fits,
                       demand_label_miss)
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
            col("fair_error_pct"),
            [bool(v) for v in ins["fair_uncertain"]],
            col("model_views"),
            col("model_sales_beats_pct"),
            col("model_normalized_price"),
            col("demand_driver"),
            [None if v is None or pd.isna(v) else bool(v) for v in ins["demand_label_fits"]],
            col("demand_label_miss"),
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


def _plot_kmeans(out: Path, models: pd.DataFrame, seg: m.DemandSegments) -> None:
    """Scatter of the clustered models (``model_demand`` rows), one hue per label."""
    plt = _plt()
    labelled = seg.labels.dropna()
    fig, ax = plt.subplots(figsize=(6, 4.5))
    for label in sorted(labelled.unique()):
        idx = labelled[labelled == label].index
        ax.scatter(
            np.log1p(models.loc[idx, "views"]),
            models.loc[idx, "sales_rank_pct"],
            s=12,
            alpha=0.7,
            label=label,
        )
    if seg.split_views is not None:
        ax.axvline(
            math.log1p(seg.split_views),
            color="black",
            linestyle="--",
            linewidth=1,
            label="best-seller views split",
        )
    ax.set(
        xlabel="log(views + 1)",
        ylabel="sales percentile within store (mean over stores)",
        title=f"Demand segments per model (k={seg.k}, silhouette={seg.silhouette:.2f})",
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
    cut = m.cut_height(h.linkage, h.k)
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
