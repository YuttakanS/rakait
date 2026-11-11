"""Record linkage: map merchant listings onto canonical products in bulk.

Two stages per category (see :mod:`pricewatch.similarity`):

1. Rules: the regex extractor derives a canonical key; listings sharing a key
   are one product.
2. Similarity fallback: listings the rules could not key (and that are not
   deliberately excluded) are matched to the nearest rule-built product by
   TF-IDF cosine, at a threshold calibrated leave-one-out against the rules.

:func:`plan_links` is pure (no I/O) and does all of the work;
:func:`link_listings` reads, plans and writes in three set-based statements.
"""

from __future__ import annotations

import json
import statistics
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import asyncpg
import numpy as np

from pricewatch import similarity as sim
from pricewatch.models import Category
from pricewatch.normalize import Extracted, extract

ProductKey = tuple[str, str, str]  # (category, manufacturer, model)


@dataclass(frozen=True)
class LinkSummary:
    """Outcome of one linking pass.

    Attributes:
        listings: Listings examined.
        linked: Listings assigned a canonical product (by either stage).
        products: Distinct canonical products referenced.
        by_similarity: Of ``linked``, listings linked by the similarity fallback.
    """

    listings: int
    linked: int
    products: int
    by_similarity: int = 0


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


@dataclass(frozen=True)
class ListingRow:
    """The fields of one listing that linkage reads."""

    id: int
    merchant: str
    category: str
    title: str
    spec_text: str | None


@dataclass
class LinkPlan:
    """Everything a linking pass will write.

    Attributes:
        parsed: Extraction result per listing id.
        product_specs: Reconciled specs per canonical product (rule members).
        assignment: Listing id -> (product key, method, score).
        report: Per-category evaluation, fallback and duplicate findings,
            JSON-ready, persisted as ``market_insights (all, linkage_quality)``.
    """

    parsed: dict[int, Extracted] = field(default_factory=dict)
    product_specs: dict[ProductKey, dict[str, Any]] = field(default_factory=dict)
    assignment: dict[int, tuple[ProductKey, str, float | None]] = field(default_factory=dict)
    report: dict[str, Any] = field(default_factory=dict)


def plan_links(rows: Sequence[ListingRow]) -> LinkPlan:
    """Run both linkage stages over all listings, without touching the database.

    Cost: O(n) regex extraction, then per category one TF-IDF fit and the
    sparse products described in :mod:`pricewatch.similarity`.

    Args:
        rows: Every listing.

    Returns:
        The plan.
    """
    plan = LinkPlan()
    by_category: dict[str, list[ListingRow]] = defaultdict(list)
    for row in rows:
        plan.parsed[row.id] = extract(Category(row.category), row.title, row.spec_text)
        by_category[row.category].append(row)

    for category, members in sorted(by_category.items()):
        plan.report[category] = _plan_category(Category(category), members, plan)
    return plan


def _plan_category(category: Category, rows: list[ListingRow], plan: LinkPlan) -> dict[str, Any]:
    """Link one category: rules first, then the calibrated similarity fallback."""
    groups: dict[ProductKey, list[dict[str, Any]]] = defaultdict(list)
    merchants: dict[ProductKey, set[str]] = defaultdict(set)
    linked_idx: list[int] = []
    query_idx: list[int] = []
    keys_of: list[ProductKey | None] = []
    for i, row in enumerate(rows):
        ex = plan.parsed[row.id]
        if ex.model is not None and ex.manufacturer is not None:
            key = (category.value, ex.manufacturer, ex.model)
            groups[key].append(ex.specs)
            merchants[key].add(row.merchant)
            plan.assignment[row.id] = (key, "rule", None)
            linked_idx.append(i)
            keys_of.append(key)
        else:
            if not ex.excluded:
                query_idx.append(i)
            keys_of.append(None)

    products = sorted(groups)
    for key in products:
        plan.product_specs[key] = reconcile_specs(groups[key])
    report: dict[str, Any] = {
        "listings": len(rows),
        "rule_linked": len(linked_idx),
        "excluded": sum(1 for r in rows if plan.parsed[r.id].excluded),
        "unlinked_candidates": len(query_idx),
        "products": len(products),
    }
    if not products:
        return report

    index = {key: j for j, key in enumerate(products)}
    hard = sim.HARD_KEYS[category]
    x = sim.embed([r.title for r in rows])  # one vocabulary for members and queries
    labels = np.array([index[k] for k in keys_of if k is not None], dtype=np.int64)
    x_members = x[linked_idx]
    member_specs = [plan.parsed[rows[i].id].specs for i in linked_idx]
    product_specs = [plan.product_specs[k] for k in products]

    evaluation = sim.evaluate(x_members, labels, member_specs, product_specs, hard)
    report["evaluation"] = {
        "n": evaluation.n,
        "threshold": evaluation.threshold,
        "margin": evaluation.margin,
        "curve": evaluation.curve,
    }

    matched: list[dict[str, Any]] = []
    if evaluation.threshold is not None and query_idx:
        matches = sim.match(
            x[query_idx],
            [plan.parsed[rows[i].id].specs for i in query_idx],
            x_members,
            labels,
            product_specs,
            hard,
            threshold=evaluation.threshold,
            margin=evaluation.margin,
        )
        for m in matches:
            row = rows[query_idx[m.query]]
            key = products[m.product]
            plan.assignment[row.id] = (key, "similarity", m.score)
            matched.append({"title": row.title, "product": key[2], "cosine": round(m.score, 3)})
    report["similarity_linked"] = len(matched)
    report["similarity_matches"] = matched

    report["duplicate_candidates"] = sim.duplicate_candidates(
        x_members,
        labels,
        product_specs,
        [k[2] for k in products],
        [frozenset(merchants[k]) for k in products],
        hard,
    )
    return report


async def link_listings(conn: asyncpg.Connection) -> LinkSummary:
    """Parse every listing, upsert canonical products and link listings to them.

    Three set-based statements regardless of row count: one read, one
    multi-row upsert of canonical products, one bulk update of listings; plus
    one upsert of the linkage-quality report.

    Args:
        conn: Open database connection.

    Returns:
        Counts describing the pass.
    """
    records = await conn.fetch(
        """
        SELECT l.id, m.slug AS merchant, l.category, l.title, l.spec_text
        FROM merchant_listings l JOIN merchants m ON m.id = l.merchant_id
        """
    )
    plan = plan_links([ListingRow(**dict(r)) for r in records])
    keys = sorted(plan.product_specs)

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
            [json.dumps(plan.product_specs[k]) for k in keys],
        )
        product_ids = {(p["category"], p["manufacturer"], p["model"]): p["id"] for p in products}

        listing_ids = list(plan.parsed)
        assigned = [plan.assignment.get(i) for i in listing_ids]
        await conn.execute(
            """
            UPDATE merchant_listings AS l
            SET canonical_product_id = u.canonical_id, brand = u.brand, specs = u.specs,
                link_method = u.method, link_score = u.score, linked_at = now()
            FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::jsonb[], $5::text[],
                        $6::real[])
                 AS u (id, canonical_id, brand, specs, method, score)
            WHERE l.id = u.id
            """,
            listing_ids,
            [product_ids[a[0]] if a else None for a in assigned],
            [plan.parsed[i].brand for i in listing_ids],
            [json.dumps(plan.parsed[i].specs) for i in listing_ids],
            [a[1] if a else None for a in assigned],
            [a[2] if a else None for a in assigned],
        )
        await conn.execute(
            """
            INSERT INTO market_insights (category, kind, computed_at, payload)
            VALUES ('all', 'linkage_quality', $1, $2::jsonb)
            ON CONFLICT (category, kind)
            DO UPDATE SET computed_at = EXCLUDED.computed_at, payload = EXCLUDED.payload
            """,
            datetime.now(timezone.utc),
            json.dumps(plan.report, default=_json_default),
        )

    linked = sum(1 for a in assigned if a is not None)
    by_similarity = sum(1 for a in assigned if a is not None and a[1] == "similarity")
    return LinkSummary(
        listings=len(listing_ids),
        linked=linked,
        products=len(product_ids),
        by_similarity=by_similarity,
    )


def _json_default(value: object) -> object:
    """Serialise NumPy scalars and NaN (as null) in the report."""
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.floating):
        return None if np.isnan(value) else float(value)
    raise TypeError(f"not JSON serialisable: {type(value).__name__}")
