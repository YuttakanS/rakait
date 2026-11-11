import numpy as np
import pytest

from pricewatch import similarity as sim
from pricewatch.db.linking import ListingRow, plan_links


def test_clean_title_strips_thai_warranty_and_category_words() -> None:
    title = "VGA (การ์ดแสดงผล) ASUS DUAL RTX 5060 - 8GB GDDR7 (3Y)"
    assert sim.clean_title(title) == "ASUS DUAL RTX 5060 8GB GDDR7"


def test_spec_mask_blocks_conflicts_but_not_missing_values() -> None:
    left = [{"capacity_gb": 1000}, {"capacity_gb": 2000}, {}]
    right = [{"capacity_gb": 1000}, {"capacity_gb": 2000}]
    mask = sim.spec_mask(left, right, ["capacity_gb"])
    assert mask.tolist() == [[True, False], [False, True], [True, True]]


@pytest.mark.parametrize(("hits", "n", "low", "high"), [(3, 3, 0.4, 0.5), (300, 300, 0.98, 1.0)])
def test_wilson_lower_accounts_for_sample_size(hits: int, n: int, low: float, high: float) -> None:
    value = sim.wilson_lower(hits, n)
    assert value is not None and low < value < high
    assert sim.wilson_lower(0, 0) is None


def _members() -> tuple[list[str], np.ndarray, list[dict], list[dict]]:
    titles, labels, specs = [], [], []
    families = [("SAMSUNG 990 PRO", 1000), ("WD BLACK SN850X", 1000), ("KINGSTON NV3", 2000)]
    for p, (line, cap) in enumerate(families):
        for i in range(40):
            titles.append(f"{line} {cap}GB NVME M.2 PCIE 4 VARIANT{i % 4} SHOP{i}")
            labels.append(p)
            specs.append({"capacity_gb": cap})
    product_specs = [{"capacity_gb": cap} for _, cap in families]
    return titles, np.array(labels), specs, product_specs


def test_evaluate_calibrates_a_threshold_on_separable_products() -> None:
    titles, labels, specs, product_specs = _members()
    ev = sim.evaluate(sim.embed(titles), labels, specs, product_specs, ["capacity_gb"])

    assert ev.n == 120
    assert ev.threshold is not None
    point = next(p for p in ev.curve if p["threshold"] == ev.threshold)
    assert point["precision"] == 1.0
    assert point["precision_lower95"] >= sim.TARGET_PRECISION


def test_evaluate_cannot_match_a_singleton_product() -> None:
    titles = ["SAMSUNG 990 PRO 1TB", "SAMSUNG 990 PRO 1TB NVME", "SAMSUNG 990 EVO 1TB"]
    labels = np.array([0, 0, 1])
    specs = [{}, {}, {}]
    ev = sim.evaluate(sim.embed(titles), labels, specs, [{}, {}], [])
    # The EVO listing's own product has no other member: any match is wrong.
    first = ev.curve[0]
    assert first["matched"] == 3 and first["precision"] == pytest.approx(2 / 3)


def test_match_respects_specs_and_margin() -> None:
    titles, labels, specs, product_specs = _members()
    queries = [
        "WD BLACK SN850X 1TB NVME HEATSINK",  # clear match
        "WD BLACK SN850X 2TB NVME HEATSINK",  # capacity conflicts with SN850X 1TB
    ]
    x = sim.embed(titles + queries)
    found = sim.match(
        x[len(titles) :],
        [{"capacity_gb": 1000}, {"capacity_gb": 2000}],
        x[: len(titles)],
        labels,
        product_specs,
        ["capacity_gb"],
        threshold=0.3,
    )
    assert [(m.query, m.product) for m in found] == [(0, 1)]


def test_duplicate_candidates_need_disjoint_merchants() -> None:
    # A third, unrelated product gives the IDF a realistic background, as the
    # full catalogue does in production.
    titles = (
        ["SANDISK OPTIMUS GX 7100 1TB NVME"] * 3
        + ["SANDISK OPTIMUS GX7100 1TB NVME"] * 3
        + ["KINGSTON NV3 1TB NVME"] * 3
    )
    labels = np.repeat([0, 1, 2], 3)
    names = ["GX 7100 1TB", "GX7100 1TB", "NV3 1TB"]
    args = (sim.embed(titles), labels, [{}, {}, {}], names)

    disjoint = [frozenset({"jib"}), frozenset({"banana"}), frozenset({"jib"})]
    found = sim.duplicate_candidates(*args, disjoint, [], threshold=0.6)
    assert [(d["a"], d["b"]) for d in found] == [("GX 7100 1TB", "GX7100 1TB")]
    shared = [frozenset({"jib"})] * 3
    assert sim.duplicate_candidates(*args, shared, [], threshold=0.6) == []


def test_plan_links_falls_back_to_similarity_and_respects_exclusions() -> None:
    rows: list[ListingRow] = []
    kits = [
        ("CORSAIR VENGEANCE", "16GB (8GBx2)", 5200),
        ("KINGSTON FURY BEAST", "32GB (16GBx2)", 6000),
    ]
    for i in range(80):
        name, layout, speed = kits[i % 2]
        rows.append(
            ListingRow(
                i, ["jib", "banana"][i % 2], "ram", f"{name} {layout} DDR5 {speed}MHz C{i}", None
            )
        )
    # No speed in the title, so the rules cannot build a key; the title and the
    # DDR5 / 16GB / 2-module specs still point at the Corsair kit.
    rows.append(
        ListingRow(1000, "ihavecpu", "ram", "CORSAIR VENGEANCE 16GB (8GBx2) DDR5 RGB", None)
    )
    rows.append(
        ListingRow(1001, "jib", "ram", "CRUCIAL 16GB DDR5-4800 SODIMM (CT16G48C40S5)", None)
    )

    plan = plan_links(rows)

    key, method, score = plan.assignment[1000]
    assert method == "similarity" and key[2] == "Corsair DDR5 16GB (2x8GB) 5200MHz"
    assert score is not None and 0 < score <= 1
    assert 1001 not in plan.assignment  # notebook RAM is excluded, never matched
    report = plan.report["ram"]
    assert report["excluded"] == 1 and report["similarity_linked"] == 1
    assert report["evaluation"]["threshold"] is not None
