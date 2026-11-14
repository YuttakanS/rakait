import type { Category, DemandCluster, Recommendation } from "@/lib/types";

const thb = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

export function formatTHB(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : `฿${thb.format(value)}`;
}

export function formatPct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "–";
  const pct = (value * 100).toFixed(digits);
  return `${value > 0 ? "+" : ""}${pct}%`;
}

/**
 * A fraction as the whole percent every page prints (0.365 -> 37). The
 * pipeline's `shown_pct` reproduces this exactly, so reasons written there
 * quote the same numbers as the tags here.
 */
export function wholePct(fraction: number): number {
  return Math.round(fraction * 100);
}

/** "± 25%" for a fair price's error band; empty when unknown. */
export function formatBand(errorPct: number | null | undefined): string {
  return errorPct === null || errorPct === undefined ? "" : `± ${wholePct(errorPct)}%`;
}

/** Second half of every "ประเมินไม่แน่นอน" sentence: what follows from the gap. */
export const UNCERTAIN_FIT = "โมเดลยังประเมินรุ่นนี้ได้ไม่ดี จึงไม่ใช้จัดอันดับดีล";

/**
 * Fallback note for an uncertain fair price when the gap is unknown. It
 * quotes no threshold: "เกิน 40%" next to a gap the shopper computes the other
 * way (fair / price) read as a mistake (SPEC round 14).
 */
export const UNCERTAIN_NOTE = `ราคาจริงต่างจากราคายุติธรรมมาก ${UNCERTAIN_FIT}`;

/**
 * The listing's own gap in words, "ราคาจริงแพงกว่าราคายุติธรรม 42%" or
 * "ราคาจริงถูกกว่าราคายุติธรรม 60%" (`wholePct` of `pct_vs_fair`, the number
 * the shopper can check against the two prices); null without a gap. O(1).
 *
 * @param pct price / fair - 1 of the listing.
 */
export function uncertainGap(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct) || wholePct(Math.abs(pct)) === 0) return null;
  return `ราคาจริง${pct > 0 ? "แพงกว่า" : "ถูกกว่า"}ราคายุติธรรม ${wholePct(Math.abs(pct))}%`;
}

/** Lead-in of every stored "ประเมินไม่แน่นอน" reason. */
const UNCERTAIN_LEAD = "ประเมินไม่แน่นอน: ";

/**
 * Start of the pipeline's reason for a model whose fair price is above a
 * sibling's with a better spec (`train.SIBLING_REASON_PREFIX`, model
 * 2026.11-v17, SPEC round 19), e.g. "ประเมินไม่แน่นอน: ราคายุติธรรมของรุ่นนี้
 * (฿9,579) สูงกว่ารุ่นที่สเปกดีกว่า GeForce RTX 3050 8GB (฿8,328) …".
 */
export const SIBLING_REASON_PREFIX = `${UNCERTAIN_LEAD}ราคายุติธรรมของรุ่นนี้`;

/**
 * The stored reason when it is a sibling inversion, else null. Such a model
 * may sit well inside the 40% gap, so its reason cannot be rebuilt from the
 * gap and is printed as stored. O(length).
 */
export function siblingReason(stored: string | null | undefined): string | null {
  return stored?.startsWith(SIBLING_REASON_PREFIX) ? stored : null;
}

/**
 * Why an uncertain fair price is not ranked, without the "ประเมินไม่แน่นอน"
 * lead-in (the card's tag already says it): the stored sibling reason when
 * there is one (it names the sibling and both fair prices), otherwise the
 * listing's measured gap, then `UNCERTAIN_FIT`, never a guessed cause. The
 * card line and the chip tooltip print this. O(1).
 *
 * @param pct price / fair - 1 of the listing.
 * @param stored The listing's stored `recommendation_reason`.
 */
export function uncertainNote(pct: number | null | undefined, stored?: string | null): string {
  const sibling = siblingReason(stored);
  if (sibling !== null) return sibling.slice(UNCERTAIN_LEAD.length);
  const gap = uncertainGap(pct);
  return gap === null ? UNCERTAIN_NOTE : `${gap} ${UNCERTAIN_FIT}`;
}

/**
 * The pipeline's reason for such a listing, as the product page prints it.
 * A sibling inversion (2026.11-v17+) is printed as stored. A gap reason
 * (`train.uncertain_reason`, 2026.11-v12+, same words and `shown_pct`
 * rounding) is rebuilt from the stored gap, so rows stored by older models
 * (fixed "เกิน 40%" wording) read the same.
 */
export function uncertainReason(pct: number | null | undefined, stored?: string | null): string {
  return siblingReason(stored) ?? `${UNCERTAIN_LEAD}${uncertainNote(pct)}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  });
}

export const CATEGORY_LABELS: Record<Category, string> = {
  gpu: "การ์ดจอ",
  cpu: "ซีพียู",
  ram: "แรม",
  ssd: "SSD",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  buy_now: "ซื้อเลย",
  wait: "รอก่อน",
  fair_price: "ราคาเหมาะสม",
};

/**
 * Group names and plain-Thai hints (SPEC round 11: no statistics words such
 * as "มัธยฐาน" or "K-Means"; the exact rules live in the insights page's
 * statistics section). Same meaning as the labelling rule in
 * `pricewatch.ml.models`: best sellers (clearly above their stores' average
 * rank) split by views at the best sellers' median; the rest are hype (views
 * clearly above what sales suggest) or the neutral remainder ("niche"). A
 * model carries a group's badge only where its own numbers support the name
 * (`demand_label_fits`, decided in `models.label_fit`; SPEC round 17).
 */
export const CLUSTER_LABELS: Record<DemandCluster, { label: string; hint: string; wrap?: string }> = {
  hidden_gem: {
    label: "ขายดี แต่คนดูน้อย",
    hint: "ขายได้ดีกว่าสินค้าส่วนใหญ่ในร้านเดียวกัน แต่มีคนเข้าดูน้อยกว่ารุ่นขายดีทั่วไป",
  },
  community_favorite: {
    label: "ขายดี คนดูเยอะ",
    hint: "ขายได้ดีกว่าสินค้าส่วนใหญ่ในร้านเดียวกัน และมีคนเข้าดูมากกว่ารุ่นขายดีทั่วไป",
  },
  overpriced_hype: {
    label: "คนดูเยอะ แต่ขายน้อย",
    hint: "มีคนเข้าดูเยอะ แต่ขายได้น้อยกว่าที่ควรเมื่อเทียบกับคนดู",
  },
  // K-Means' remainder group. Its names so far, "คนดูน้อย ขายน้อย" (until
  // SPEC round 17) and "ไม่เด่นทั้งคนดูและยอดขาย" (round 17), claimed views
  // its models' numbers did not show; this one claims sales only, and from
  // model 2026.11-v16 the pipeline badges only models under the sales bar
  // (SPEC round 18, the user's option D). `wrap` marks where the word may
  // break on a narrow card ("|", see `Words` in badges.tsx).
  niche: {
    label: "ยอดขายไม่เด่น",
    wrap: "ยอดขาย|ไม่เด่น",
    hint: "กลุ่มที่เหลือจาก K-Means: ขายได้ไม่เด่นเมื่อเทียบกับสินค้าในร้านเดียวกัน ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม",
  },
};

/**
 * A spec value for display: booleans as ใช่ / ไม่, missing as "–", and
 * non-integer numbers rounded to at most 2 decimals with trailing zeros
 * dropped, so a median of floats (3.5999999999999996) reads "3.6".
 * Integers and strings print unchanged. O(1).
 *
 * @param value A value from `canonical_products.specs` (JSON).
 * @returns The text for the spec table.
 */
export function formatSpecValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "ใช่" : "ไม่";
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "–";
    if (Number.isInteger(value)) return String(value);
    // toFixed(2) then Number() drops trailing zeros ("3.60" -> 3.6).
    return String(Number(value.toFixed(2)));
  }
  return String(value);
}

/**
 * Stores the platform scrapes, in display order. Copy derives from this list,
 * and the order is the price chart's dash/marker order (`STORE_STYLES` in
 * price-chart.tsx, .claude/skills/design.md §3).
 */
export const MERCHANTS: readonly { slug: string; name: string }[] = [
  { slug: "jib", name: "JIB" },
  { slug: "ihavecpu", name: "IHAVECPU" },
  { slug: "itcity", name: "IT City" },
  { slug: "banana", name: "BaNANA" },
];

/** Readable names for model features shown on the insights page. */
export const FEATURE_LABELS: Record<string, string> = {
  vram_gb: "ขนาด VRAM",
  log2_vram_gb: "ขนาด VRAM",
  log2_capacity_gb: "ความจุ",
  perf_class: "ระดับชิป (รุ่น)",
  perf_x_gen: "ระดับชิป × รุ่นปี",
  generation: "รุ่นปีที่ออก (generation)",
  release_year: "ปีที่ออกวางขาย",
  tier: "ระดับรุ่น",
  shader_cores: "จำนวนคอร์กราฟิก",
  boost_clock_mhz: "Boost clock",
  bus_width_bit: "ความกว้างบัส",
  cores: "จำนวนคอร์",
  log2_cores: "จำนวนคอร์",
  log2_threads: "จำนวนเธรด",
  base_clock_ghz: "ความเร็วสัญญาณนาฬิกา",
  x3d: "มี 3D V-Cache (X3D)",
  unlocked: "ปลดล็อกโอเวอร์คล็อก",
  // 2026.11-v18+ (CPU): integrated graphics. False for Intel F / KF and Core
  // X-series parts, every Threadripper and AM4 Ryzen without a G (5600 vs 5600G).
  has_igpu: "มีกราฟิกในตัว",
  is_amd: "เป็น AMD",
  capacity_gb: "ความจุ",
  speed_mhz: "ความเร็วแรม",
  ddr5: "เป็น DDR5",
  modules: "จำนวนแถว",
  nvme: "เป็น NVMe",
  pcie_gen: "PCIe รุ่น",
  read_mbps: "ความเร็วอ่าน",
  log_views: "ยอดเข้าชม",
  // Model 2026.11-v9 and earlier: sales rates summed over stores.
  log_sales_per_day: "ยอดขายต่อวัน",
  // 2026.11-v10+: the model's sales percentile within each store, averaged
  // over stores (stores measure sales differently, so only ranks compare).
  sales_rank_pct: "อันดับยอดขายในร้าน",
};

/** "JIB, IHAVECPU, BaNANA และ IT City" */
export function merchantList(): string {
  const names = MERCHANTS.map((m) => m.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} และ ${names.at(-1)}` : (names[0] ?? "");
}

/**
 * Thai label for a model feature. Missingness indicators added by the
 * fair-value model ("boost_clock_mhz_missing") read as "ไม่ระบุ<feature>".
 */
export function featureLabel(name: string): string {
  if (name.endsWith("_missing")) {
    const base = name.slice(0, -"_missing".length);
    return `ไม่ระบุ${FEATURE_LABELS[base] ?? base}`;
  }
  return FEATURE_LABELS[name] ?? name;
}
