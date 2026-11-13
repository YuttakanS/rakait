"""Sibling models whose fair prices run against their specs (SPEC round 19).

Only the lesser-spec model of an inverted pair is flagged (the user's option
B): its inflated fair price is what would rank as a false deal, while the
better model keeps its Deal Score.
"""

import numpy as np
import pandas as pd
import pytest
from test_ml import _gpu_catalogue

from pricewatch.ml import models as m
from pricewatch.ml import train
from pricewatch.ml.train import (
    SIBLING_REASON_PREFIX,
    SIBLING_TOLERANCE,
    UNCERTAIN_FIT,
    run_models,
    sibling_check,
    sibling_reason,
    sibling_spec,
    spec_features,
)
from pricewatch.models import Category


def _pairs(
    rows: dict[str, tuple[str | None, float, float, float]], tolerance: float = SIBLING_TOLERANCE
) -> pd.DataFrame:
    """``sibling_inversions`` over products given as name -> (line, tier, vram, fair)."""
    frame = pd.DataFrame(rows, index=["line", "tier", "vram", "fair"]).T
    return m.sibling_inversions(
        frame["line"], frame[["tier", "vram"]].astype(float), frame["fair"].astype(float), tolerance
    )


def _flagged(pairs: pd.DataFrame) -> set[str]:
    return set(m.widest_sibling_pair(pairs).index)


def test_sibling_priced_in_spec_order_is_not_flagged() -> None:
    pairs = _pairs({"6GB": ("rtx30", 5, 6, 8_000), "8GB": ("rtx30", 5, 8, 9_000)})

    assert pairs.empty
    assert _flagged(pairs) == set()


def test_inversion_beyond_tolerance_flags_only_the_lesser_model() -> None:
    pairs = _pairs({"6GB": ("rtx30", 5, 6, 10_072), "8GB": ("rtx30", 5, 8, 7_935)})

    assert pairs[["worse", "better"]].values.tolist() == [["6GB", "8GB"]]
    assert pairs.loc[0, "ratio"] == pytest.approx(10_072 / 7_935)
    # Option B: the better 8GB model keeps its Deal Score.
    assert _flagged(pairs) == {"6GB"}


def test_inversion_within_tolerance_is_not_flagged() -> None:
    just_under = 7_935 * (1 + SIBLING_TOLERANCE) - 1
    pairs = _pairs({"6GB": ("rtx30", 5, 6, just_under), "8GB": ("rtx30", 5, 8, 7_935)})

    assert pairs.empty


def test_models_of_different_lines_are_not_compared() -> None:
    pairs = _pairs({"old 8GB": ("rtx30", 5, 8, 20_000), "new 16GB": ("rtx50", 6, 16, 9_000)})

    assert pairs.empty


def test_pair_without_dominance_is_not_compared() -> None:
    # More VRAM but a lower tier: neither model is better on every dimension.
    pairs = _pairs(
        {"5060 Ti 16GB": ("rtx50", 6.5, 16, 30_000), "5070 12GB": ("rtx50", 7, 12, 20_000)}
    )

    assert pairs.empty


def test_model_without_fair_price_or_line_is_not_compared() -> None:
    pairs = _pairs(
        {
            "unpriced": ("rtx30", 5, 6, np.nan),
            "unlined": (None, 5, 6, 50_000),
            "8GB": ("rtx30", 5, 8, 7_935),
        }
    )

    assert pairs.empty


def test_model_inverted_against_several_siblings_is_explained_by_the_widest_pair() -> None:
    pairs = _pairs(
        {
            "5050": ("rtx50", 5, 8, 24_000),
            "5060": ("rtx50", 6, 8, 22_000),
            "5070": ("rtx50", 7, 12, 20_000),
        }
    )

    # 5050 < 5060 < 5070, each priced above the next: three inverted pairs.
    assert len(pairs) == 3
    assert pairs["ratio"].is_monotonic_decreasing
    widest = m.widest_sibling_pair(pairs)
    # The best model is never flagged; 5050 cites 5070 (24k / 20k), not 5060.
    assert set(widest.index) == {"5050", "5060"}
    assert widest.loc["5050", "other"] == "5070"
    assert widest.loc["5050", ["own_fair", "other_fair"]].tolist() == [24_000, 20_000]


def test_sibling_reason_quotes_both_models_as_the_web_prints_them() -> None:
    reason = sibling_reason(10_072.0, "GeForce RTX 3050 8GB", 7_935.0)

    assert reason == (
        "ประเมินไม่แน่นอน: ราคายุติธรรมของรุ่นนี้ (฿10,072) สูงกว่ารุ่นที่สเปกดีกว่า "
        f"GeForce RTX 3050 8GB (฿7,935) {UNCERTAIN_FIT}"
    )
    assert reason.startswith(SIBLING_REASON_PREFIX)
    # Whole baht round half up, like the web's Intl formatting of a rounded value.
    assert "(฿1,001)" in sibling_reason(1_000.5, "x", 900.0)


def _gpu_frame(rows: list[tuple[int, str, str, float, str, float]]) -> pd.DataFrame:
    """Listings as (canonical id, model, chip, VRAM, memory type, fair price)."""
    frame = pd.DataFrame(
        rows, columns=["canonical_id", "model", "chip", "vram_gb", "memory_type", "fair"]
    )
    frame["listing_id"] = np.arange(len(frame))
    frame["category"] = "gpu"
    return frame


def test_sibling_check_flags_every_listing_of_the_lesser_model_with_its_reason() -> None:
    frame = _gpu_frame(
        [
            (1, "GeForce RTX 3050 6GB", "GeForce RTX 3050", 6, "GDDR6", 10_072),
            (1, "GeForce RTX 3050 6GB", "GeForce RTX 3050", 6, "GDDR6", 10_072),
            (2, "GeForce RTX 3050 8GB", "GeForce RTX 3050", 8, "GDDR6", 7_935),
            # Another generation: never compared with the RTX 30 cards.
            (3, "GeForce RTX 5060 8GB", "GeForce RTX 5060", 8, "GDDR7", 5_000),
            # Unlinked: no model name to quote, so never compared.
            (None, None, "GeForce RTX 3050", 4, "GDDR6", 90_000),
        ]
    )
    specs = spec_features(frame, Category.GPU)

    check = sibling_check(frame, specs, Category.GPU, frame["fair"])

    assert check.flagged.tolist() == [True, True, False, False, False]
    expected = sibling_reason(10_072, "GeForce RTX 3050 8GB", 7_935)
    assert check.reasons.tolist()[:2] == [expected, expected]
    assert check.reasons[~check.flagged].isna().all()
    assert check.payload() == {
        "sibling_tolerance": SIBLING_TOLERANCE,
        "sibling_inversions": 1,
        "sibling_flagged": 2,
        "sibling_examples": [
            {
                "worse": "GeForce RTX 3050 6GB",
                "worse_fair": 10_072,
                "better": "GeForce RTX 3050 8GB",
                "better_fair": 7_935,
            }
        ],
    }


def test_slower_gpu_memory_keeps_a_larger_variant_apart() -> None:
    # GT 1030 4GB DDR4 is slower than the 2GB GDDR5 card: no dominance.
    frame = _gpu_frame(
        [
            (1, "GeForce GT 1030 2GB", "GeForce GT 1030", 2, "GDDR5", 3_000),
            (2, "GeForce GT 1030 4GB", "GeForce GT 1030", 4, "DDR4", 2_000),
        ]
    )

    check = sibling_check(frame, spec_features(frame, Category.GPU), Category.GPU, frame["fair"])

    assert not check.flagged.any()


@pytest.mark.parametrize(
    ("model", "line", "sku"),
    [
        ("Ryzen 5 5600", "Ryzen 5", 5600),
        ("Ryzen 9 9950X3D2", "Ryzen 9", 9950),
        ("Core i5-14400F", "Core i 14", 14400),
        ("Core Ultra 7 265KF", "Core Ultra 2", 265),
        ("Ryzen Threadripper Pro 7995WX", "Threadripper 7", 7995),
    ],
)
def test_cpu_line_reads_family_generation_and_model_number(model: str, line: str, sku: int) -> None:
    frame = pd.DataFrame(
        {
            "listing_id": [0],
            "canonical_id": [1],
            "model": [model],
            "manufacturer": ["AMD" if "Ryzen" in model else "Intel"],
            "cores": [8],
            "threads": [16],
            "x3d": [False],
            "unlocked": [True],
            "has_igpu": [True],
        }
    )

    lines, dims = sibling_spec(frame, spec_features(frame, Category.CPU), Category.CPU)

    assert lines.iloc[0] == line
    assert dims.loc[0, "sku"] == sku


def test_ssd_family_drops_the_capacity_and_keeps_the_interface() -> None:
    frame = pd.DataFrame(
        {
            "listing_id": [0, 1],
            "canonical_id": [1, 2],
            "model": ["WD SN7100 1TB", "WD SA510 500GB"],
            "capacity_gb": [1000, 500],
            "nvme": [True, False],
            "pcie_gen": [4, np.nan],
        }
    )

    lines, dims = sibling_spec(frame, spec_features(frame, Category.SSD), Category.SSD)

    assert lines.tolist() == ["WD SN7100 NVMe PCIe 4", "WD SA510 SATA"]
    assert dims["capacity_gb"].tolist() == [1000, 500]


def test_run_models_takes_the_lesser_sibling_out_of_the_deal_ranking(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = _gpu_catalogue(7)
    current["model"] = current["chip"] + np.where(current["vram_gb"] == 16, " 16GB", " 8GB")
    current["memory_type"] = np.where(current["chip"].str.contains("Radeon"), "GDDR6", "GDDR7")
    baseline = run_models(current, pd.DataFrame(), figures=None).insights
    # A tolerance of -100% calls every dominated model "inverted", so the
    # plumbing is exercised on whatever fair prices the fit produced.
    monkeypatch.setattr(train, "SIBLING_TOLERANCE", -1.0)

    report = run_models(current, pd.DataFrame(), figures=None)

    ins = report.insights
    sibling = ins["recommendation_reason"].fillna("").str.startswith(SIBLING_REASON_PREFIX)
    priced = ins["fair_price"].notna()
    # Every priced model below the top of its vendor's ladder is dominated.
    top = current["model"].isin(["GeForce RTX 5070 16GB", "Radeon RX 9070 XT 16GB"])
    assert (sibling == (priced & ~top)).all()
    assert ins.loc[sibling, "fair_uncertain"].astype(bool).all()
    assert ins.loc[sibling, "deal_score"].isna().all()
    assert ins.loc[sibling, "recommendation"].isna().all()
    assert ins.loc[sibling, "fair_price"].notna().all()  # kept for the product page
    # The better side keeps the very Deal Score it had without the check.
    kept = priced & top & ~ins["fair_uncertain"].astype(bool)
    assert kept.any()
    pd.testing.assert_series_equal(ins.loc[kept, "deal_score"], baseline.loc[kept, "deal_score"])
    payload = report.market[("gpu", "fair_value_mlr")]
    assert payload["sibling_tolerance"] == -1.0
    assert payload["sibling_flagged"] == int(sibling.sum())
    assert payload["sibling_inversions"] >= len(payload["sibling_examples"]) > 0
    assert len(payload["sibling_examples"]) <= train.SIBLING_EXAMPLES
    # /ml reads the flag per chart point (2026.11-v17) to skip its example.
    assert any(point[3] for point in payload["fit_points"])
    assert all(isinstance(point[3], bool) for point in payload["fit_points"])


def test_missing_dimension_makes_a_model_incomparable() -> None:
    # VRAM unknown: neither "is no better than" nor "is better than" holds.
    pairs = _pairs({"6GB?": ("rtx30", 5, np.nan, 20_000), "8GB": ("rtx30", 5, 8, 7_935)})

    assert pairs.empty


def test_inputs_are_aligned_by_product_key_not_position() -> None:
    line = pd.Series(["a", "a"], index=["8GB", "6GB"])
    dims = pd.DataFrame({"vram": [6.0, 8.0]}, index=["6GB", "8GB"])
    fair = pd.Series([7_935.0, 10_072.0], index=["8GB", "6GB"])

    pairs = m.sibling_inversions(line, dims, fair, SIBLING_TOLERANCE)

    assert pairs[["worse", "better"]].values.tolist() == [["6GB", "8GB"]]


def test_a_model_gets_one_line_whatever_its_listings_say() -> None:
    # One drive read as PCIe 4 at one store and 5 at another: still one line,
    # so its 2TB sibling is compared with it either way round.
    frame = pd.DataFrame(
        {
            "listing_id": [0, 1, 2],
            "canonical_id": [1, 1, 2],
            "model": ["Samsung 990 EVO PLUS 1TB"] * 2 + ["Samsung 990 EVO PLUS 2TB"],
            "capacity_gb": [1000, 1000, 2000],
            "nvme": [True, True, True],
            "pcie_gen": [4, 5, 5],
        }
    )
    lines, _ = sibling_spec(frame, spec_features(frame, Category.SSD), Category.SSD)
    fair = pd.Series([9_000.0, 9_000.0, 6_000.0], index=frame.index)

    check = sibling_check(frame, spec_features(frame, Category.SSD), Category.SSD, fair)

    assert lines.nunique() == 1
    assert check.flagged.tolist() == [True, True, False]


def test_cpu_number_ignores_a_trailing_socket_and_uses_the_parsed_generation() -> None:
    frame = pd.DataFrame(
        {
            "listing_id": [0, 1],
            "canonical_id": [1, 2],
            "model": ["Core i5-14400F LGA1700", "Core Ultra 5 225F"],
            "generation": [14, np.nan],
        }
    )

    lines, dims = sibling_spec(frame, spec_features(frame, Category.CPU), Category.CPU)

    assert lines.tolist() == ["Core i 14", "Core Ultra 2"]
    assert dims["sku"].tolist() == [14400, 225]
