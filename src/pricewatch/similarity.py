"""Vector-similarity record linkage: a calibrated fallback and an audit for the rules.

Rule-based extraction (:mod:`pricewatch.normalize`) links most listings, but a
title whose product line no regex knows ("KINGMAX PQ4480", "WD SSD 2TB ...
Black") stays unlinked even when another merchant's listing of the same drive
is linked. This module represents every title as a TF-IDF vector of character
n-grams and links such listings to the nearest canonical product.

Model:

* Each title is cleaned (Thai text, warranty and category boilerplate removed)
  and embedded as an L2-normalised TF-IDF vector over character 3-5-grams
  (``char_wb``), which is robust to the spacing, hyphenation and word-order
  differences between merchants. Cosine similarity is then a dot product.
* A canonical product is represented by the sum of its rule-linked members'
  vectors (a centroid up to scale), so cos(x, c) = x . C / ||C||.
* Hard constraints: a listing may only match a product whose parsed
  attributes (VRAM, capacity, DDR generation, ...) do not contradict its own.
  Character n-grams cannot tell 1TB from 2TB reliably; the specs can.
* A match is accepted only if the best cosine >= ``threshold`` and beats the
  runner-up by ``margin``. The threshold is calibrated, not guessed: rule
  links are treated as ground truth and every linked listing is matched
  leave-one-out against the others (:func:`evaluate`), giving a
  precision/coverage curve from which the lowest threshold that keeps
  precision >= :data:`TARGET_PRECISION` is chosen.

Memory layout and cost, for n listings, c products and V vocabulary terms per
category: X is a CSR matrix (nnz ~ 60 per title), the product sums C a CSR
matrix built by one sparse product G @ X, and the n x c similarity block a
single sparse-dense product X @ C^T, O(nnz(X) * avg products per term),
stored as one contiguous float32 array (~2,000 x 700 x 4 B = 5.6 MB). The
spec mask is built by broadcasting integer codes, O(n c) per hard key, with
no Python loop over pairs.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer

from pricewatch.models import Category

#: Attributes that must agree (where both sides have them) for a match.
#: ``chip`` rather than the numeric tier for GPUs: "RTX 5060" and "RTX 5060 Ti"
#: share tier 5060. CPU suffix flags (X, X3D, F, K) separate 7600 / 7600X.
HARD_KEYS: dict[Category, tuple[str, ...]] = {
    Category.GPU: ("vram_gb", "chip", "memory_type"),
    Category.CPU: (
        "socket",
        "cores",
        "threads",
        "generation",
        "unlocked",
        "x3d",
        "has_igpu",
    ),
    Category.RAM: ("ddr", "capacity_gb", "modules", "speed_mhz"),
    Category.SSD: ("capacity_gb", "nvme", "form_factor", "pcie_gen"),
}
#: The threshold must keep the 95% Wilson lower bound of precision at or above
#: this, so a curve point backed by three lucky matches cannot be chosen.
TARGET_PRECISION = 0.95
DEFAULT_MARGIN = 0.05
_Z = 1.96
_THRESHOLDS = np.round(np.arange(0.30, 0.96, 0.05), 2)

_THAI_RE = re.compile(r"[฀-๿]+")
_NOISE_RE = re.compile(
    r"\(\s*\d+\s*Y(?:EAR)?S?\s*\)|\b\d+\s*YEARS?\b|\(\s*LT\s*\)|\bWARRANTY\b"
    r"|\bVGA\b|\bGPU\b|\bCPU\b|\bRAM\b|\bSSD\b|\bMEMORY\b|\bPC\b",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^0-9A-Z./+]+")


def clean_title(title: str) -> str:
    """Upper-case a title and strip Thai text, warranty and category words.

    "VGA (การ์ดแสดงผล) ASUS DUAL RTX 5060 - 8GB GDDR7 (3Y)" becomes
    "ASUS DUAL RTX 5060 8GB GDDR7". O(len(title)).
    """
    text = _THAI_RE.sub(" ", title.upper())
    text = _NOISE_RE.sub(" ", text)
    return _PUNCT_RE.sub(" ", text).strip()


def embed(titles: Sequence[str]) -> sparse.csr_matrix:
    """TF-IDF character n-gram vectors, one L2-normalised CSR row per title.

    IDF is fitted on the titles given (one category's whole catalogue), so
    n-grams every listing shares ("GDDR", "NVME") weigh little and model
    codes weigh a lot.
    """
    vectorizer = TfidfVectorizer(
        analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, dtype=np.float32
    )
    matrix: sparse.csr_matrix = vectorizer.fit_transform([clean_title(t) for t in titles])
    return matrix


def spec_mask(
    left: Sequence[Mapping[str, Any]], right: Sequence[Mapping[str, Any]], keys: Sequence[str]
) -> np.ndarray:
    """Boolean ``len(left) x len(right)`` matrix: True where no hard key conflicts.

    Values are mapped to shared integer codes (-1 = missing) so each key is
    one broadcast comparison over contiguous int arrays: O(n c) per key.
    """
    allowed = np.ones((len(left), len(right)), dtype=bool)
    for key in keys:
        codes: dict[Any, int] = {}  # shared by both sides so equal values get equal codes
        a = _encode(left, key, codes)[:, None]
        b = _encode(right, key, codes)[None, :]
        allowed &= (a == b) | (a < 0) | (b < 0)
    return allowed


def _encode(rows: Sequence[Mapping[str, Any]], key: str, codes: dict[Any, int]) -> np.ndarray:
    """Integer code of ``row[key]`` per row, -1 where missing."""
    out = np.full(len(rows), -1, dtype=np.int64)
    for i, row in enumerate(rows):
        value = row.get(key)
        if value is not None:
            out[i] = codes.setdefault(value, len(codes))
    return out


def _group_sums(x: sparse.csr_matrix, labels: np.ndarray, n_groups: int) -> sparse.csr_matrix:
    """Sum rows of ``x`` per label with one sparse product G @ X."""
    g = sparse.csr_matrix(
        (np.ones(len(labels), dtype=np.float32), (labels, np.arange(len(labels)))),
        shape=(n_groups, x.shape[0]),
    )
    sums: sparse.csr_matrix = (g @ x).tocsr()
    return sums


def _top_two(scores: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Best column, best score and runner-up score per row (-inf when absent)."""
    if scores.shape[1] == 1:
        best = np.zeros(scores.shape[0], dtype=np.int64)
        return best, scores[:, 0], np.full(scores.shape[0], -np.inf, dtype=scores.dtype)
    part = np.argpartition(-scores, 1, axis=1)[:, :2]
    rows = np.arange(scores.shape[0])
    first, second = scores[rows, part[:, 0]], scores[rows, part[:, 1]]
    swap = second > first
    best = np.where(swap, part[:, 1], part[:, 0])
    return best, np.maximum(first, second), np.minimum(first, second)


@dataclass(frozen=True)
class Evaluation:
    """Leave-one-out agreement of similarity matching with the rule links.

    Attributes:
        n: Rule-linked listings evaluated.
        curve: Per threshold: ``threshold``, ``coverage`` (share matched) and
            ``precision`` (share of matches equal to the rule link).
        threshold: Lowest threshold whose Wilson 95% lower bound on
            precision meets the target, or ``None`` if none does (similarity
            linking is then disabled for the category).
        margin: Required lead of the best match over the runner-up.
    """

    n: int
    curve: list[dict[str, float | None]]
    threshold: float | None
    margin: float = DEFAULT_MARGIN


def evaluate(
    x: sparse.csr_matrix,
    labels: np.ndarray,
    listing_specs: Sequence[Mapping[str, Any]],
    product_specs: Sequence[Mapping[str, Any]],
    keys: Sequence[str],
    *,
    margin: float = DEFAULT_MARGIN,
    target: float = TARGET_PRECISION,
) -> Evaluation:
    """Match every rule-linked listing against the products, excluding itself.

    Removing a listing from its own product's sum is O(1) per listing given
    the raw dot products: ||C - x||^2 = ||C||^2 - 2 x.C + 1 for unit x. A
    listing whose product has no other member cannot be matched correctly,
    exactly like a listing of a product no rule has seen.

    Args:
        x: Embeddings of the rule-linked listings.
        labels: Product index (0..c-1) of each listing.
        listing_specs: Parsed specs per listing.
        product_specs: Reconciled specs per product.
        keys: Hard keys for the category.
        margin: Required lead over the runner-up.
        target: Precision the chosen threshold must reach.

    Returns:
        The precision/coverage curve and the calibrated threshold.
    """
    n, c = x.shape[0], len(product_specs)
    if n == 0 or c == 0:
        return Evaluation(0, [], None, margin)
    sums = _group_sums(x, labels, c)
    raw = np.asarray((x @ sums.T).todense(), dtype=np.float32)  # n x c, contiguous
    sq_norm = np.asarray(sums.multiply(sums).sum(axis=1), dtype=np.float32).ravel()
    sizes = np.bincount(labels, minlength=c)

    scores = raw / np.sqrt(np.maximum(sq_norm, 1e-12))[None, :]
    rows = np.arange(n)
    own_raw = raw[rows, labels]
    rest_sq = sq_norm[labels] - 2 * own_raw + 1
    own = np.where(sizes[labels] > 1, (own_raw - 1) / np.sqrt(np.maximum(rest_sq, 1e-12)), -np.inf)
    scores[rows, labels] = own
    scores[~spec_mask(listing_specs, product_specs, keys)] = -np.inf

    best, top, runner_up = _top_two(scores)
    correct = best == labels
    decisive = _decisive(top, runner_up, margin)
    curve: list[dict[str, float | None]] = []
    chosen: float | None = None
    for t in _THRESHOLDS:
        accepted = (top >= t) & decisive
        k = int(accepted.sum())
        hits = int(correct[accepted].sum())
        precision = hits / k if k else None
        lower = wilson_lower(hits, k)
        curve.append(
            {
                "threshold": float(t),
                "coverage": k / n,
                "precision": precision,
                "precision_lower95": lower,
                "matched": k,
            }
        )
        if chosen is None and lower is not None and lower >= target:
            chosen = float(t)
    return Evaluation(n, curve, chosen, margin)


def wilson_lower(hits: int, n: int, z: float = _Z) -> float | None:
    """Lower bound of the Wilson score interval for a binomial proportion.

    Unlike the raw ratio it accounts for sample size: 3/3 correct gives
    ~0.44, 300/300 gives ~0.99. ``None`` for an empty sample.
    """
    if n == 0:
        return None
    p = hits / n
    denom = 1 + z * z / n
    centre = p + z * z / (2 * n)
    spread = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return float((centre - spread) / denom)


def _decisive(top: np.ndarray, runner_up: np.ndarray, margin: float) -> np.ndarray:
    """True where the best match leads the runner-up by ``margin``.

    A row with a single admissible product (runner-up -inf) is decisive; a
    row with none (best -inf) is not, and never yields NaN.
    """
    with np.errstate(invalid="ignore"):
        lead = top - runner_up
    decisive: np.ndarray = np.isfinite(top) & (np.isinf(runner_up) | (lead >= margin))
    return decisive


@dataclass(frozen=True)
class Match:
    """A similarity link for one previously unlinked listing."""

    query: int
    product: int
    score: float


def match(
    x_query: sparse.csr_matrix,
    query_specs: Sequence[Mapping[str, Any]],
    x_members: sparse.csr_matrix,
    labels: np.ndarray,
    product_specs: Sequence[Mapping[str, Any]],
    keys: Sequence[str],
    *,
    threshold: float,
    margin: float = DEFAULT_MARGIN,
) -> list[Match]:
    """Link query listings to the nearest admissible product, if decisive.

    Args:
        x_query: Embeddings of the unlinked listings.
        query_specs: Their parsed specs.
        x_members: Embeddings of the rule-linked listings (same vocabulary).
        labels: Product index of each member.
        product_specs: Reconciled specs per product.
        keys: Hard keys for the category.
        threshold: Minimum cosine similarity.
        margin: Required lead over the runner-up.

    Returns:
        Accepted matches.
    """
    c = len(product_specs)
    if x_query.shape[0] == 0 or c == 0:
        return []
    sums = _group_sums(x_members, labels, c)
    norms = np.sqrt(np.asarray(sums.multiply(sums).sum(axis=1), dtype=np.float32).ravel())
    scores = np.asarray((x_query @ sums.T).todense(), dtype=np.float32) / np.maximum(norms, 1e-6)
    scores[~spec_mask(query_specs, product_specs, keys)] = -np.inf
    best, top, runner_up = _top_two(scores)
    accepted = np.flatnonzero((top >= threshold) & _decisive(top, runner_up, margin))
    return [Match(int(i), int(best[i]), float(top[i])) for i in accepted]


def duplicate_candidates(
    x_members: sparse.csr_matrix,
    labels: np.ndarray,
    product_specs: Sequence[Mapping[str, Any]],
    product_names: Sequence[str],
    product_merchants: Sequence[frozenset[str]],
    keys: Sequence[str],
    *,
    threshold: float = 0.8,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Pairs of canonical products that look like the same item under two names.

    Rules split a product when merchants spell its line differently. Such
    pairs have near-identical centroids, compatible specs and, tellingly,
    disjoint merchant sets (no store lists the same drive twice). Reported
    for review, never merged automatically. O(c^2) over one category.

    Returns:
        Up to ``limit`` pairs, most similar first.
    """
    c = len(product_specs)
    if c < 2:
        return []
    sums = _group_sums(x_members, labels, c)
    norms = np.sqrt(np.asarray(sums.multiply(sums).sum(axis=1), dtype=np.float32).ravel())
    unit = sparse.diags(1 / np.maximum(norms, 1e-6)) @ sums
    sim = np.asarray((unit @ unit.T).todense(), dtype=np.float32)
    sim[~spec_mask(product_specs, product_specs, keys)] = 0
    i, j = np.triu_indices(c, k=1)
    keep = sim[i, j] >= threshold
    pairs = sorted(zip(i[keep], j[keep], sim[i, j][keep], strict=True), key=lambda p: -p[2])
    out: list[dict[str, Any]] = []
    for a, b, s in pairs:
        if product_merchants[a] & product_merchants[b]:
            continue  # one store lists both: genuinely different products
        out.append({"a": product_names[a], "b": product_names[b], "cosine": round(float(s), 3)})
        if len(out) >= limit:
            break
    return out


@dataclass
class CategoryLinkage:
    """Similarity-linkage outcome for one category."""

    evaluation: Evaluation
    matches: list[Match] = field(default_factory=list)
    duplicates: list[dict[str, Any]] = field(default_factory=list)
