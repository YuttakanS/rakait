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

export const CLUSTER_LABELS: Record<DemandCluster, { label: string; hint: string }> = {
  hidden_gem: { label: "ช้างเผือก", hint: "ยอดเข้าชมน้อย แต่ขายดี" },
  community_favorite: { label: "ขวัญใจชุมชน", hint: "คนดูเยอะและซื้อจริง" },
  overpriced_hype: { label: "กระแสแรง ขายไม่ออก", hint: "คนดูเยอะ แต่ยอดขายต่ำ" },
  niche: { label: "เฉพาะกลุ่ม", hint: "ยอดเข้าชมและยอดขายต่ำ" },
};

/**
 * Stores the platform scrapes, in display order. Copy derives from this list,
 * and the order is the chart colour order (ux-ui.md §3: validated as adjacent
 * pairs in this order), so do not reorder without re-running the validator.
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
  log2_cores: "จำนวนคอร์",
  log2_threads: "จำนวนเธรด",
  base_clock_ghz: "ความเร็วสัญญาณนาฬิกา",
  x3d: "มี 3D V-Cache (X3D)",
  unlocked: "ปลดล็อกโอเวอร์คล็อก",
  is_amd: "เป็น AMD",
  capacity_gb: "ความจุ",
  speed_mhz: "ความเร็วแรม",
  ddr5: "เป็น DDR5",
  modules: "จำนวนแถว",
  nvme: "เป็น NVMe",
  pcie_gen: "PCIe รุ่น",
  read_mbps: "ความเร็วอ่าน",
  log_views: "ยอดเข้าชม",
  log_sales_per_day: "ยอดขายต่อวัน",
};

/** "JIB, IHAVECPU, BaNANA และ IT City" */
export function merchantList(): string {
  const names = MERCHANTS.map((m) => m.name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} และ ${names.at(-1)}` : (names[0] ?? "");
}

export const MERCHANT_COLORS: Record<string, string> = {
  jib: "var(--store-jib)",
  ihavecpu: "var(--store-ihavecpu)",
  banana: "var(--store-banana)",
  itcity: "var(--store-itcity)",
};

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
