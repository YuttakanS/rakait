"""Record linkage: map merchant listings onto canonical products in bulk."""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any

import asyncpg

from pricewatch.models import Category
from pricewatch.normalize import Extracted, extract


@dataclass(frozen=True)
class LinkSummary:
    """Outcome of one linking pass.

    Attributes:
        listings: Listings examined.
        linked: Listings assigned a canonical product.
        products: Distinct canonical products referenced.
    """

    listings: int
    linked: int
    products: int


def reconcile_specs(spec_dicts: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge per-listing specs of one model into model-level specs.

    Numeric attributes take the median across listings, so one merchant's
    typo cannot skew the model; categorical attributes take the most common
    value. Attributes missing from some merchants are filled from the others.

    Args:
        spec_dicts: Specs parsed from each listing of the model.

    Returns:
        Reconciled specs.
    """
    values: dict[str, list[Any]] = defaultdict(list)
    for specs in spec_dicts:
        for key, value in specs.items():
            if value is not None:
                values[key].append(value)
    merged: dict[str, Any] = {}
    for key, seen in values.items():
        if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in seen):
            median = statistics.median(seen)
            merged[key] = int(median) if all(isinstance(v, int) for v in seen) else median
        else:
            merged[key] = Counter(map(json.dumps, seen)).most_common(1)[0][0]
            merged[key] = json.loads(merged[key])
    return merged


async def link_listings(conn: asyncpg.Connection) -> LinkSummary:
    """Parse every listing, upsert canonical products and link listings to them.

    Three set-based statements regardless of row count: one read, one
    multi-row upsert of canonical products, one bulk update of listings.

    Args:
        conn: Open database connection.

    Returns:
        Counts describing the pass.
    """
    rows = await conn.fetch("SELECT id, category, title, spec_text FROM merchant_listings")
    parsed: list[tuple[int, str, Extracted]] = [
        (
            row["id"],
            row["category"],
            extract(Category(row["category"]), row["title"], row["spec_text"]),
        )
        for row in rows
    ]

    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for _, category, ex in parsed:
        if ex.model is not None and ex.manufacturer is not None:
            groups[(category, ex.manufacturer, ex.model)].append(ex.specs)
    keys = sorted(groups)

    async with conn.transaction():
        products = await conn.fetch(
            """
            INSERT INTO canonical_products (category, manufacturer, model, specs)
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::jsonb[])
            ON CONFLICT (category, manufacturer, model) DO UPDATE SET specs = EXCLUDED.specs
            RETURNING id, category, manufacturer, model
            """,
            [k[0] for k in keys],
            [k[1] for k in keys],
            [k[2] for k in keys],
            [json.dumps(reconcile_specs(groups[k])) for k in keys],
        )
        product_ids = {(p["category"], p["manufacturer"], p["model"]): p["id"] for p in products}

        listing_ids: list[int] = []
        canonical_ids: list[int | None] = []
        brands: list[str | None] = []
        specs: list[str] = []
        for listing_id, category, ex in parsed:
            key = (category, ex.manufacturer or "", ex.model or "")
            listing_ids.append(listing_id)
            canonical_ids.append(product_ids.get(key))
            brands.append(ex.brand)
            specs.append(json.dumps(ex.specs))
        await conn.execute(
            """
            UPDATE merchant_listings AS l
            SET canonical_product_id = u.canonical_id, brand = u.brand,
                specs = u.specs, linked_at = now()
            FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::jsonb[])
                 AS u (id, canonical_id, brand, specs)
            WHERE l.id = u.id
            """,
            listing_ids,
            canonical_ids,
            brands,
            specs,
        )

    linked = sum(1 for cid in canonical_ids if cid is not None)
    return LinkSummary(listings=len(parsed), linked=linked, products=len(product_ids))
