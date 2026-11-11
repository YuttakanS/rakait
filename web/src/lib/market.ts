/**
 * Consumer summaries of the market-insight models for /insights: a price
 * ladder per spec tier, the main price drivers in plain words, and a
 * reliability word for a fitted R². Pure functions over plain data so the
 * page stays a server component.
 */
import type { Category, SpecPoint } from "./types";

export interface LadderRow {
  /** Tier value in the axis unit (GB, cores). */
  tier: number;
  /** Cheapest current offer among models of this tier. */
  from: number;
  /** Median over models of each model's cheapest offer. */
  typical: number;
  models: number;
  cheapest: { id: number; model: string };
}

/** Marketed SSD capacities: 512 GB and 500 GB drives are the same tier. */
const SSD_TIERS = [128, 250, 500, 1000, 2000, 4000, 8000];

function tierOf(category: Category, x: number): number {
  if (category !== "ssd") return x;
  return SSD_TIERS.reduce((best, t) => (Math.abs(Math.log(t / x)) < Math.abs(Math.log(best / x)) ? t : best));
}

function median(sorted: number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Price ladder: for each spec tier, the cheapest offer and the typical price.
 *
 * Points are listings; each model counts once (its cheapest offer), so a
 * model sold by four stores does not outweigh one sold by a single store.
 * Tiers with a single model are dropped when at least three tiers have more,
 * and at most ``limit`` of the most populated tiers are kept, in tier order.
 * O(n log n) for n listings.
 */
export function priceLadder(points: SpecPoint[], category: Category, limit = 7): LadderRow[] {
  const byModel = new Map<number, SpecPoint>();
  for (const p of points) {
    if (p.category !== category || !(p.x > 0) || !(p.price > 0)) continue;
    const seen = byModel.get(p.id);
    if (!seen || p.price < seen.price) byModel.set(p.id, p);
  }
  const tiers = new Map<number, SpecPoint[]>();
  for (const p of byModel.values()) {
    const t = tierOf(category, p.x);
    tiers.set(t, [...(tiers.get(t) ?? []), p]);
  }
  let rows: LadderRow[] = [...tiers.entries()].map(([tier, models]) => {
    const prices = models.map((m) => m.price).sort((a, b) => a - b);
    const cheapest = models.reduce((a, b) => (b.price < a.price ? b : a));
    return {
      tier,
      from: prices[0],
      typical: median(prices),
      models: models.length,
      cheapest: { id: cheapest.id, model: cheapest.model },
    };
  });
  if (rows.filter((r) => r.models > 1).length >= 3) rows = rows.filter((r) => r.models > 1);
  return rows
    .sort((a, b) => b.models - a.models)
    .slice(0, limit)
    .sort((a, b) => a.tier - b.tier);
}

/** "512 GB" / "1 TB" for storage; "8 GB", "16 คอร์" otherwise. */
export function tierLabel(category: Category, tier: number): string {
  if (category === "ssd" && tier >= 1000) return `${tier / 1000} TB`;
  if (category === "cpu") return `${tier} คอร์`;
  return `${tier} GB`;
}

export interface Factor {
  feature: string;
  /** Share of the largest effect, 0–1, for an importance bar. */
  weight: number;
  /** Price rises with the feature (or when the yes/no feature is yes). */
  raises: boolean;
}

/** Yes/no features read "ถ้ามี … แพงกว่า" rather than "ยิ่งสูง ยิ่งแพง". */
export const BOOLEAN_FEATURES = new Set(["x3d", "unlocked", "is_amd", "ddr5", "nvme"]);

/**
 * Spec features a shopper can act on, largest effect first. Model plumbing
 * is left to the statistics section: missing-spec indicators, the generation
 * × tier interaction (its sign alone misleads; it adjusts perf_class) and the
 * demand signals (not a property of the hardware).
 */
export function mainFactors(coefficients: { feature: string; pct_effect_per_sd: number }[], limit = 4): Factor[] {
  const hardware = coefficients.filter(
    (c) =>
      !c.feature.endsWith("_missing") &&
      c.feature !== "perf_x_gen" &&
      // pcie_gen is 0 for SATA, so it already carries NVMe; given it, the
      // nvme coefficient is a collinear residue whose sign reads backwards.
      c.feature !== "nvme" &&
      c.feature !== "log_views" &&
      c.feature !== "log_sales_per_day" &&
      Math.abs(c.pct_effect_per_sd) >= 0.01,
  );
  const sorted = hardware.sort((a, b) => Math.abs(b.pct_effect_per_sd) - Math.abs(a.pct_effect_per_sd));
  const top = Math.abs(sorted[0]?.pct_effect_per_sd ?? 1) || 1;
  return sorted.slice(0, limit).map((c) => ({
    feature: c.feature,
    weight: Math.abs(c.pct_effect_per_sd) / top,
    raises: c.pct_effect_per_sd > 0,
  }));
}

/** Plain-Thai reliability of a fit from its R². */
export function reliability(r2: number): string {
  if (!Number.isFinite(r2)) return "–";
  if (r2 >= 0.75) return "สูง";
  if (r2 >= 0.5) return "ปานกลาง";
  return "ต่ำ";
}

/** Round a THB amount for a sentence (฿4,397 → ฿4,400). */
export function roundForCopy(value: number): number {
  const step = value >= 1000 ? 100 : value >= 100 ? 10 : 1;
  return Math.round(value / step) * step;
}

/** One-line example under a factor ("category.feature" overrides "feature"). */
export const FACTOR_HINTS: Record<string, string> = {
  perf_class: "เช่น RTX 5060 → 5070 → 5080",
  generation: "เช่น RTX 40 → RTX 50",
  release_year: "เช่น RTX 40 (2022) → RTX 50 (2025)",
  "cpu.release_year": "เช่น Ryzen 5000 (2020) → Ryzen 9000 (2024)",
  tier: "เช่น Ryzen 5 → 7 → 9, Core i5 → i7 → i9",
  log2_vram_gb: "เช่น 8GB → 16GB",
  "ram.log2_capacity_gb": "เช่น 16GB → 32GB",
  "ssd.log2_capacity_gb": "เช่น 1TB → 2TB",
  shader_cores: "จำนวนคอร์ประมวลผลกราฟิก",
  boost_clock_mhz: "ความเร็วสูงสุดของชิป",
  bus_width_bit: "ช่องทางรับส่งข้อมูลกับหน่วยความจำ",
  log2_cores: "เช่น 6 → 8 คอร์",
  log2_threads: "เช่น 12 → 16 เธรด",
  base_clock_ghz: "ความเร็วพื้นฐาน (GHz)",
  x3d: "ซีรีส์ X3D ของ AMD เน้นเล่นเกม",
  unlocked: "รุ่น K / KF / X ที่ปรับแต่งได้",
  is_amd: "เทียบกับ Intel ที่สเปกเท่ากัน",
  "gpu.is_amd": "Radeon เทียบกับ GeForce ที่สเปกเท่ากัน",
  speed_mhz: "เช่น 5200 → 6000 MHz",
  ddr5: "เทียบกับ DDR4",
  modules: "จำนวนแผงในชุด",
  nvme: "เทียบกับ SATA",
  pcie_gen: "เช่น Gen 4 → Gen 5",
  read_mbps: "ความเร็วอ่านข้อมูล (MB/s)",
};

/** "~1.5 ชิ้น/วัน" or, below one a day, "~1 ชิ้น / 33 วัน". */
export function salesRate(perDay: number): string {
  if (!(perDay > 0)) return "แทบไม่มียอดขาย";
  if (perDay >= 1) return `~${perDay.toFixed(1)} ชิ้น/วัน`;
  return `~1 ชิ้น / ${Math.round(1 / perDay).toLocaleString("th-TH")} วัน`;
}
