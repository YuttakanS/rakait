"""Load modelling datasets from PostgreSQL into column-oriented frames.

Heavy lifting stays in SQL: per-listing demand rates are computed with window
functions in one pass over ``price_history`` (O(n log n) for the sort inside
each partition), so Python only receives one row per listing. Frames are
column-major (pandas/NumPy), which keeps each feature contiguous in memory for
vectorised model code.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg
import numpy as np
import pandas as pd

from pricewatch.models import Category

# Demand window: long enough to span several archived monthly snapshots.
DEMAND_WINDOW_DAYS = 120

_CURRENT_LISTINGS_SQL = f"""
WITH obs AS (
    SELECT h.listing_id, h.scraped_at, h.price, h.sold_count, h.view_count,
           h.stock_quantity,
           lag(h.stock_quantity) OVER (PARTITION BY h.listing_id ORDER BY h.scraped_at)
               AS prev_stock
    FROM price_history AS h
    WHERE h.scraped_at > now() - interval '{DEMAND_WINDOW_DAYS} days'
),
agg AS (
    SELECT listing_id,
           count(*) AS n_obs,
           extract(epoch FROM max(scraped_at) - min(scraped_at)) / 86400.0 AS span_days,
           extract(epoch FROM max(scraped_at) FILTER (WHERE sold_count IS NOT NULL)
                            - min(scraped_at) FILTER (WHERE sold_count IS NOT NULL)) / 86400.0
               AS sold_span_days,
           max(sold_count) - min(sold_count) AS sold_delta,
           extract(epoch FROM max(scraped_at) FILTER (WHERE view_count IS NOT NULL)
                            - min(scraped_at) FILTER (WHERE view_count IS NOT NULL)) / 86400.0
               AS view_span_days,
           max(view_count) - min(view_count) AS view_delta,
           -- Units leaving inventory; restocks (increases) are ignored.
           sum(greatest(prev_stock - stock_quantity, 0)) AS stock_drawdown,
           count(stock_quantity) AS n_stock_obs
    FROM obs
    GROUP BY listing_id
)
SELECT l.id AS listing_id, l.category, m.slug AS merchant, l.title, l.url, l.brand,
       l.current_price::float8 AS price, l.view_count, l.sold_count, l.in_stock,
       l.stock_quantity, l.first_seen_at, l.last_scraped_at, l.specs AS listing_specs,
       c.id AS canonical_id, c.model, c.manufacturer, c.specs AS model_specs,
       a.n_obs, a.span_days, a.sold_span_days, a.sold_delta, a.view_span_days,
       a.view_delta, a.stock_drawdown, a.n_stock_obs
FROM merchant_listings AS l
JOIN merchants AS m ON m.id = l.merchant_id
LEFT JOIN canonical_products AS c ON c.id = l.canonical_product_id
LEFT JOIN agg AS a ON a.listing_id = l.id
WHERE l.last_scraped_at > now() - interval '2 days'
  AND l.current_price IS NOT NULL
"""

_HISTORY_SQL = """
SELECT h.listing_id, l.category, l.canonical_product_id AS canonical_id, h.scraped_at,
       h.price::float8 AS price, h.in_stock, h.sold_count, h.stock_quantity, l.first_seen_at
FROM price_history AS h
JOIN merchant_listings AS l ON l.id = h.listing_id
WHERE h.price IS NOT NULL
ORDER BY h.listing_id, h.scraped_at
"""

# Minimum span before a counter delta is trusted as a rate.
_MIN_SPAN_DAYS = 0.5


def _decode(value: Any) -> dict[str, Any]:
    """Decode a JSONB value; NULL (None, or NaN once pandas has seen it) is empty."""
    if isinstance(value, str):
        decoded: dict[str, Any] = json.loads(value)
        return decoded
    if isinstance(value, dict):
        return dict(value)
    return {}


def _rate(delta: pd.Series, span: pd.Series) -> pd.Series:
    """Vectorised delta / span, NaN where the span is too short to trust."""
    span = span.astype(float)
    return (delta.astype(float) / span).where(span >= _MIN_SPAN_DAYS)


async def load_current_listings(conn: asyncpg.Connection) -> pd.DataFrame:
    """Return one row per currently listed, priced product with its features.

    Model-level specs (reconciled across merchants) are overlaid with the
    listing's own parsed specs, so e.g. a JIB CPU title lacking a core count
    inherits it from the same model at another merchant.

    Args:
        conn: Open database connection.

    Returns:
        Frame with identity columns, ``price``, spec columns (one per spec
        key), ``sales_per_day``, ``views_per_day`` and ``age_days``.
    """
    rows = await conn.fetch(_CURRENT_LISTINGS_SQL)
    frame = pd.DataFrame([dict(r) for r in rows])
    if frame.empty:
        return frame

    specs = [
        {**_decode(model), **{k: v for k, v in _decode(own).items() if v is not None}}
        for model, own in zip(frame.pop("model_specs"), frame.pop("listing_specs"), strict=True)
    ]
    frame = pd.concat([frame, pd.DataFrame(specs, index=frame.index)], axis=1)

    sold_rate = _rate(frame["sold_delta"], frame["sold_span_days"])
    stock_rate = _rate(frame["stock_drawdown"], frame["span_days"]).where(frame["n_stock_obs"] > 1)
    frame["sales_per_day"] = sold_rate.fillna(stock_rate)
    frame["views_per_day"] = _rate(frame["view_delta"], frame["view_span_days"])
    now = pd.Timestamp.now(tz="UTC")
    frame["age_days"] = (now - pd.to_datetime(frame["first_seen_at"], utc=True)).dt.days
    frame["price"] = frame["price"].astype(float)
    return frame


async def load_history(conn: asyncpg.Connection) -> pd.DataFrame:
    """Return every priced observation, sorted by listing then time."""
    rows = await conn.fetch(_HISTORY_SQL)
    frame = pd.DataFrame([dict(r) for r in rows])
    if not frame.empty:
        frame["scraped_at"] = pd.to_datetime(frame["scraped_at"], utc=True)
        frame["first_seen_at"] = pd.to_datetime(frame["first_seen_at"], utc=True)
    return frame


def category_frame(frame: pd.DataFrame, category: Category) -> pd.DataFrame:
    """Rows of one category with all-NaN columns dropped."""
    subset = frame[frame["category"] == category.value]
    return subset.dropna(axis=1, how="all").copy()


def numeric(frame: pd.DataFrame, column: str, default: float = np.nan) -> pd.Series:
    """Column as float64, or a constant column if absent."""
    if column not in frame:
        return pd.Series(default, index=frame.index, dtype="float64")
    return pd.to_numeric(frame[column], errors="coerce").astype("float64")
