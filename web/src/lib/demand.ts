/**
 * The evidence behind a demand-group badge (SPEC rounds 16 and 17): the
 * model's own views and sales share, the thresholds its group's name is
 * held to, and, where the numbers do not support the name, why the model
 * carries no badge.
 *
 * Whether a model's numbers support its group's name is decided once, in
 * the pipeline (`models.label_fit`), and stored per model
 * (`demand_label_fits`, `demand_label_miss`; migration 0014). Nothing here
 * re-evaluates that rule: this module reads the flag and words the result,
 * quoting the thresholds the training run stored in the `demand_kmeans`
 * payload (`label_rule`). A missing number stays null (never 0), and a
 * missing flag (rows from before model 2026.11-v15) means "show the badge
 * as before".
 *
 * Strings may carry "|" marks: places where a line may break without a
 * space (`Words` in badges.tsx keeps every other run of Thai on one line, so
 * a narrow card never splits a word). Pure functions, O(1).
 */
import { CLUSTER_LABELS, wholePct } from "./format";
import type { DemandCluster, DemandDriver, DemandEvidence } from "./types";

/** One group's typical model, from the payload's `segments`. */
export interface GroupStats {
  viewsMedian: number | null;
  /** Median share of the store's listings outsold (v14+), else the mean (older payloads). */
  salesBeats: number | null;
  salesBeatsIsMedian: boolean;
  /** Models of the group that carry its badge (`labelled`, v15+), else its K-Means size; null when absent. */
  labelled: number | null;
  /** Models K-Means put in the group (`size`); null when absent. */
  size: number | null;
}

/** What the training run stored about the groups as a whole. */
export interface DemandReference {
  /** Median views over every clustered model (v14+). */
  viewsMedian: number | null;
  /** Median sales share over every clustered model (v14+); 0 on the live catalogue. */
  salesBeatsMedian: number | null;
  /** Views at which best sellers split into ขายดี คนดูเยอะ / ขายดี แต่คนดูน้อย. */
  splitViews: number | null;
  /** Share from which a model "sells well" for a label (`label_rule.sales_bar`, v15+). */
  salesBar: number | null;
  /**
   * The most days of history a sales rate can cover (`label_rule.window_days`,
   * v15+). A cap, not the window: each listing's rate is measured over the
   * span it has been tracked for (weeks on the live catalogue), within it.
   */
  windowDays: number | null;
  /**
   * Whether a sales share of 0 ("outsold nothing in its stores") means no
   * sales were seen (`label_rule.zero_share_means_no_sales`, v15+): true
   * only when every store's lowest rate is 0. Null when not stored.
   */
  zeroMeansNoSales: boolean | null;
  /**
   * Whether the neutral remainder group's badge also needs a sales share
   * under `salesBar` (`label_rule.niche_below_bar`, 2026.11-v16+). False for
   * older payloads, whose remainder group always kept its badge: the copy
   * then states no rule for it.
   */
  nicheBelowBar: boolean;
  /** Models clustered in all (`n`). */
  clustered: number | null;
  /** Clustered models that carry no badge because their numbers contradict the name (v15+). */
  unlabelled: number | null;
  groups: Partial<Record<DemandCluster, GroupStats>>;
  /** Whether the payload lists its groups (`segments`): only then can a missing group mean "none this run". */
  hasGroups: boolean;
}

export const NO_REFERENCE: DemandReference = {
  viewsMedian: null,
  salesBeatsMedian: null,
  splitViews: null,
  salesBar: null,
  windowDays: null,
  zeroMeansNoSales: null,
  nicheBelowBar: false,
  clustered: null,
  unlabelled: null,
  groups: {},
  hasGroups: false,
};

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Reference numbers from a `demand_kmeans` payload. Tolerates every stored
 * version: a key an older model did not write becomes null, and the copy
 * built from it is simply left out. O(groups).
 */
export function demandReference(payload: Record<string, unknown> | null | undefined): DemandReference {
  if (!payload) return NO_REFERENCE;
  const reference = (payload.reference ?? {}) as Record<string, unknown>;
  const rule = (payload.label_rule ?? {}) as Record<string, unknown>;
  const unlabelled = (payload.unlabelled ?? {}) as Record<string, unknown>;
  const groups: DemandReference["groups"] = {};
  for (const s of Array.isArray(payload.segments) ? (payload.segments as Record<string, unknown>[]) : []) {
    if (typeof s?.label !== "string" || !(s.label in CLUSTER_LABELS)) continue;
    // Over the models that carry the badge when the payload has them
    // ("labelled_*", v15+): the group a shopper sees listed. Else the whole
    // K-Means cluster.
    const median = finite(s.labelled_sales_beats_pct_median) ?? finite(s.sales_beats_pct_median);
    groups[s.label as DemandCluster] = {
      viewsMedian: finite(s.labelled_views_median) ?? finite(s.views_median),
      salesBeats: median ?? finite(s.labelled_sales_beats_pct) ?? finite(s.sales_beats_pct),
      salesBeatsIsMedian: median !== null,
      labelled: finite(s.labelled) ?? finite(s.size),
      size: finite(s.size),
    };
  }
  return {
    viewsMedian: finite(reference.views_median),
    salesBeatsMedian: finite(reference.sales_beats_pct_median),
    splitViews: finite(payload.split_views),
    salesBar: finite(rule.sales_bar),
    windowDays: finite(rule.window_days),
    zeroMeansNoSales: typeof rule.zero_share_means_no_sales === "boolean" ? rule.zero_share_means_no_sales : null,
    nicheBelowBar: rule.niche_below_bar === true,
    clustered: finite(payload.n),
    unlabelled: finite(unlabelled.n),
    groups,
    hasGroups: Array.isArray(payload.segments) && payload.segments.length > 0,
  };
}

/**
 * Why a group has no model to list this run (SPEC round 18), or null when it
 * has some or the payload cannot tell. Read from the payload's `segments`:
 * no segment = K-Means named no cluster this way; a segment whose models all
 * fail the badge rule (`labelled` 0) = their numbers did not fit the name.
 * The chips, the "(i)" panel and the empty list use it. O(1).
 */
export function emptyGroupReason(cluster: DemandCluster, ref: DemandReference): string | null {
  const cause = emptyGroupCause(cluster, ref);
  return cause === null ? null : `รอบนี้ไม่มีรุ่นในกลุ่มนี้ เพราะ ${cause}`;
}

/** The cause alone ("K-Means ไม่ได้จัดกลุ่มใดให้ได้ชื่อนี้"), for the empty list under its own headline. */
export function emptyGroupCause(cluster: DemandCluster, ref: DemandReference): string | null {
  if (!ref.hasGroups) return null;
  const g = ref.groups[cluster];
  if (!g || g.size === 0) return "K-Means ไม่ได้จัดกลุ่มใดให้ได้ชื่อนี้";
  if (g.labelled !== 0) return null;
  return `K-Means จัดไว้ ${countText(g.size ?? 0)} รุ่น แต่ตัวเลขของทุกรุ่นไม่ตรงชื่อกลุ่ม`;
}

/** Whole count as printed everywhere ("35,120"). */
export const countText = (v: number): string => Math.round(v).toLocaleString("th-TH");

/** "คนดู 35,120 ครั้ง", or null without a views total. */
export function viewsText(e: DemandEvidence): string | null {
  return e.views === null ? null : `คนดู ${countText(e.views)} ครั้ง`;
}

/**
 * How a sales share prints: "zero" only for a raw 0 (no sales seen in the
 * window), "tiny" for a share above 0 that rounds to 0% (printed "ไม่ถึง 1%",
 * never "0%"), else the whole percent.
 */
export function salesShare(raw: number): { kind: "zero" | "tiny" | "pct"; pct: number } {
  const pct = wholePct(raw);
  return { kind: raw === 0 ? "zero" : pct === 0 ? "tiny" : "pct", pct };
}

/**
 * How long the sales behind a share were tracked, as words. The pipeline
 * measures each listing's rate over the span it has been observed for,
 * capped at `windowDays` of history, so the copy states a cap, never "in the
 * last N days": " ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)", or on a card
 * (`short`) " (ติดตามไม่เกิน 120 วัน)". Leading space included; "" when the
 * payload does not say. Every sentence about sales carries it: the store
 * rows print "ขายแล้ว N ชิ้น", a lifetime total, and the two must not read
 * as the same thing.
 */
export function windowText(ref: DemandReference, short = false): string {
  if (ref.windowDays === null) return "";
  const days = countText(ref.windowDays);
  return short ? ` (ติดตาม|ไม่เกิน ${days} วัน)` : ` ในช่วงที่ติดตาม (ไม่เกิน ${days} วันล่าสุด)`;
}

/**
 * A sales share of exactly 0, in words. The share is 0 when the model
 * outsold nothing in its stores, which is "no sales seen" only if every
 * store's slowest listing sold nothing; the training run says whether that
 * holds (`zeroMeansNoSales`). Otherwise the sentence says only what the
 * number means, "ยังไม่ขายดีกว่าสินค้าใดในร้าน".
 */
function zeroShareText(ref: DemandReference): string {
  return ref.zeroMeansNoSales === true ? "ยังไม่เห็นยอดขาย" : "ยังไม่ขายดีกว่า|สินค้าใดในร้าน";
}

/** The zero-share sentence with its tracking span ("…ช่วงนี้" when the payload has no cap). */
function noSalesText(ref: DemandReference, short = false): string {
  if (ref.windowDays === null) return `${zeroShareText(ref)}|ช่วงนี้`;
  const days = countText(ref.windowDays);
  return short
    ? `${zeroShareText(ref)} (ติดตาม|ไม่เกิน ${days} วัน)`
    : `${zeroShareText(ref)}|ในช่วงที่ติดตาม (ไม่เกิน ${days} วัน)`;
}

/**
 * Whether a share prints under the sales bar ("ขายดีกว่าแค่ 12%"). Both sides
 * as the whole percents the page prints, like the pipeline's rule; false
 * when the payload has no bar. Wording only: it decides no badge.
 */
function underBar(share: number, ref: DemandReference): boolean {
  return ref.salesBar !== null && wholePct(share) < wholePct(ref.salesBar);
}

/**
 * Card form: "ขายดีกว่า 12% ของสินค้าในร้าน (ติดตามไม่เกิน 120 วัน)"; `long`
 * (product page): "ขายดีกว่า 12% ของสินค้าในร้านเดียวกัน ในช่วงที่ติดตาม (ไม่เกิน
 * 120 วันล่าสุด)". Null without a sales share. Under the payload's sales bar
 * it reads "ขายดีกว่าแค่ 12% …" (the bare sentence sounded like praise for a
 * weak seller). A raw 0 reads "ยังไม่เห็นยอดขาย …" or, when the run cannot
 * vouch for that, "ยังไม่ขายดีกว่าสินค้าใดในร้าน …" (`zeroShareText`); a share
 * that only rounds to 0 reads "ขายดีกว่าไม่ถึง 1% ของสินค้าในร้าน …".
 */
export function salesText(e: DemandEvidence, ref: DemandReference, long = false): string | null {
  if (e.salesBeatsPct === null) return null;
  const share = salesShare(e.salesBeatsPct);
  if (share.kind === "zero") return noSalesText(ref, !long);
  const where = `${long ? "สินค้าใน|ร้านเดียวกัน" : "สินค้าในร้าน"}${windowText(ref, !long)}`;
  if (share.kind === "tiny") return `ขายดีกว่า|ไม่ถึง 1% ของ|${where}`;
  return `ขายดีกว่า${underBar(e.salesBeatsPct, ref) ? "แค่" : ""} ${share.pct}% ของ|${where}`;
}

/**
 * The evidence line as its "·"-separated parts. A missing number is named as
 * missing; with neither (rows from before 2026.11-v14) one sentence says so.
 */
export function evidenceParts(e: DemandEvidence, ref: DemandReference, long = false): string[] {
  const views = viewsText(e);
  const sales = salesText(e, ref, long);
  if (views === null && sales === null) return ["ยังไม่มีตัวเลข|ยอดเข้าชม|และยอดขาย|ของรุ่นนี้"];
  return [views ?? "ไม่มีข้อมูล|ยอดเข้าชม", sales ?? "ไม่มีข้อมูล|ยอดขาย"];
}

/** A group's name with its break marks (`CLUSTER_LABELS[…].wrap`), for `Words`. */
const wrapLabel = (cluster: DemandCluster): string => CLUSTER_LABELS[cluster].wrap ?? CLUSTER_LABELS[cluster].label;

/**
 * The single line a card prints when a badge-conflict rule withholds the
 * group badge (`lib/verdict.ts`): the group's name and the model's two
 * numbers in brackets, e.g. "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 31,200 ครั้ง ·
 * ขายดีกว่าแค่ 12% (ติดตามไม่เกิน 120 วัน))". It replaces the badge and the long
 * "ไม่แสดงป้าย เพราะ…" note, so such a card is no taller than any other; the
 * product page carries the explanation. Only reached for a model whose
 * label fits its numbers (an unfit model has no group on a card at all).
 * Missing numbers are named, never 0.
 */
export function withheldLine(cluster: DemandCluster, e: DemandEvidence, ref: DemandReference): string {
  const name = `กลุ่ม: ${wrapLabel(cluster)}`;
  if (e.views === null && e.salesBeatsPct === null) return `${name} (ยังไม่มีตัวเลข)`;
  let sales = "ไม่มีข้อมูล|ยอดขาย";
  if (e.salesBeatsPct !== null) {
    const share = salesShare(e.salesBeatsPct);
    sales =
      share.kind === "zero"
        ? noSalesText(ref, true)
        : share.kind === "tiny"
          ? `ขายดีกว่า|ไม่ถึง 1%${windowText(ref, true)}`
          : `ขายดีกว่า${underBar(e.salesBeatsPct, ref) ? "แค่" : ""} ${share.pct}%${windowText(ref, true)}`;
  }
  return `${name} (${viewsText(e) ?? "ไม่มีข้อมูล|ยอดเข้าชม"} · ${sales})`;
}

/**
 * The clustered features (`models.DEMAND_DIMENSIONS`), as the method note
 * names them. Their count is derived from this list, never written as "3".
 */
const DRIVER_LABELS: Record<DemandDriver, string> = {
  views: "ยอดเข้าชม",
  sales: "อันดับยอดขายในร้าน",
  price: "ราคาเทียบราคาปกติของรุ่น",
};

/** The same features in a shopper's words. */
const DRIVER_SHORT: Record<DemandDriver, string> = { views: "ยอดเข้าชม", sales: "ยอดขาย", price: "ราคา" };

/** How many features the clustering reads at once. */
export const DIMENSION_COUNT = Object.keys(DRIVER_LABELS).length;

/** "ยอดเข้าชม อันดับยอดขายในร้าน และราคาเทียบราคาปกติของรุ่น", built from the list. */
export const DIMENSIONS_TEXT = (() => {
  const names = Object.values(DRIVER_LABELS);
  return `${names.slice(0, -1).join(" ")} และ${names[names.length - 1]}`;
})();

/**
 * What a group's badge promises about a model's numbers, in words, with the
 * thresholds the training run used (`label_rule`). This is the pipeline's
 * rule (`models.label_fit`) *described*, for the product page and the "(i)"
 * panel; it is never evaluated here. The neutral remainder group promises
 * only a sales share under the bar, and only from 2026.11-v16
 * (`nicheBelowBar`; before, it always kept its badge). Null when the payload
 * lacks a threshold.
 */
export function labelRuleText(cluster: DemandCluster, ref: DemandReference): string | null {
  if (ref.salesBar === null) return null;
  const bar = wholePct(ref.salesBar);
  const window = windowText(ref);
  if (cluster === "niche") {
    return ref.nicheBelowBar ? `ขายดีกว่าไม่ถึง ${bar}% ของสินค้าในร้านเดียวกัน${window}` : null;
  }
  if (cluster === "overpriced_hype") {
    if (ref.viewsMedian === null) return null;
    return `คนดูมากกว่าค่ากลางของทุกรุ่น (${countText(ref.viewsMedian)} ครั้ง) และขายดีกว่าไม่ถึง ${bar}% ของสินค้าในร้านเดียวกัน${window}`;
  }
  if (ref.splitViews === null) return null;
  const views = cluster === "community_favorite" ? "มากกว่า" : "ไม่เกิน";
  return `ขายดีกว่าอย่างน้อย ${bar}% ของสินค้าในร้านเดียวกัน${window} และคนดู${views}เส้นแบ่งของรุ่นขายดี (${countText(ref.splitViews)} ครั้ง)`;
}

/**
 * The same rule in short form for the product page, which prints the
 * model's own numbers and the tracking cap just above it: no window, no
 * brackets, e.g. "ขายดีกว่าอย่างน้อย 50% และคนดูไม่เกิน 31,330 ครั้ง". A
 * bracket around it then never nests (SPEC round 18). Null like
 * `labelRuleText`.
 */
export function labelRuleShort(cluster: DemandCluster, ref: DemandReference): string | null {
  if (ref.salesBar === null) return null;
  const bar = wholePct(ref.salesBar);
  if (cluster === "niche") return ref.nicheBelowBar ? `ขายดีกว่าไม่ถึง ${bar}%` : null;
  if (cluster === "overpriced_hype") {
    return ref.viewsMedian === null ? null : `คนดูมากกว่า ${countText(ref.viewsMedian)} ครั้ง และขายดีกว่าไม่ถึง ${bar}%`;
  }
  if (ref.splitViews === null) return null;
  const views = cluster === "community_favorite" ? "มากกว่า" : "ไม่เกิน";
  return `ขายดีกว่าอย่างน้อย ${bar}% และคนดู${views} ${countText(ref.splitViews)} ครั้ง`;
}

/**
 * "ราคาต่ำสุดที่มีของตอนนี้ถูกกว่าราคากลางของรุ่นนี้ 18%" from the clustered
 * price feature: `normalized_price` = the model's lowest in-stock price over
 * the median price of all its listings; when it is sold out everywhere the
 * numerator is its lowest last-known price, and the sentence says so. The
 * gap is the whole percent every page prints (`wholePct`). Null when it
 * rounds to 0%: "เพราะราคาเป็นหลัก: … ใกล้เคียงราคากลาง" would contradict
 * itself, so the reason then stops at "เป็นหลัก". O(1).
 */
export function priceGapText(normalizedPrice: number, inStock: boolean): string | null {
  const what = inStock ? "ราคาต่ำสุดที่มีของตอนนี้" : "ราคาล่าสุดที่ต่ำที่สุด (ตอนนี้หมดทุกร้าน) ";
  const gap = wholePct(Math.abs(normalizedPrice - 1));
  if (gap === 0) return null;
  return `${what}${normalizedPrice < 1 ? "ถูกกว่า" : "แพงกว่า"}ราคากลางของรุ่นนี้ ${gap}%`;
}

/**
 * K-Means' remainder group ("ยอดขายไม่เด่น") in one line, for the "(i)" panel
 * and /ml: "กลุ่มที่เหลือจาก K-Means ติดป้ายเฉพาะรุ่นที่ขายดีกว่าไม่ถึง 50% ของ
 * สินค้าในร้านเดียวกัน … ไม่ได้บอกอะไรเรื่องยอดเข้าชม" (2026.11-v16+, SPEC
 * round 18, option D). An older payload's remainder group kept every badge,
 * so its line states no sales rule.
 */
export function nicheRuleText(ref: DemandReference): string {
  const rule = labelRuleText("niche", ref);
  const head = "กลุ่มที่เหลือจาก K-Means";
  return `${rule === null ? head : `${head} ติดป้ายเฉพาะรุ่นที่${rule}`} ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม`;
}

/** The product page's sentence under the evidence line of a labelled model. */
export interface DemandWhy {
  /** Why the model carries this group's badge; null when the payload cannot say. */
  why: string | null;
}

/**
 * Why a model whose label fits (`labelFits === true`) carries its group's
 * badge, printed after "ที่ได้กลุ่มนี้:" (so no colon of its own, SPEC round
 * 18): the rule in short form with the stored thresholds; for the remainder
 * group, that it is what K-Means left and (2026.11-v16+) that it sells under
 * the bar. Null for rows from before 2026.11-v15 (`labelFits` unknown): the
 * badge shows as before, with the numbers but no claim about a rule nobody
 * checked.
 */
export function demandWhy(cluster: DemandCluster, e: DemandEvidence, ref: DemandReference): DemandWhy {
  if (e.labelFits !== true) return { why: null };
  const rule = labelRuleShort(cluster, ref);
  if (cluster === "niche") {
    return {
      why:
        rule === null
          ? "กลุ่มที่เหลือจาก K-Means ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม"
          : `กลุ่มที่เหลือจาก K-Means และตัวเลขของรุ่นนี้ตรงเกณฑ์ของป้าย (${rule}) ป้ายนี้ไม่ได้บอกอะไรเรื่องยอดเข้าชม`,
    };
  }
  return { why: rule === null ? null : `ตัวเลขของรุ่นนี้ตรงเกณฑ์ของป้าย (${rule})` };
}

/** The product page's explanation for a model K-Means grouped but the site does not badge. */
export interface UnlabelledWhy {
  /** Which group K-Means put the model in, and which of its numbers does not fit the name. */
  assigned: string;
  /** What the badge would have promised (thresholds from the payload); null when unknown. */
  rule: string | null;
  /** Why K-Means put it there anyway (the stored deciding feature, price as a percent). */
  reason: string;
  /** How groups are formed, for the disclosure. */
  method: string;
}

const MISS_SUBJECT: Record<NonNullable<DemandEvidence["labelMiss"]>, string> = {
  views: "ยอดเข้าชม",
  sales: "ยอดขาย",
  both: "ยอดเข้าชมและยอดขาย",
};

/**
 * For a model whose numbers do not support its group's name
 * (`labelFits === false`, decided by the pipeline): the product page still
 * says which group K-Means assigned and why no badge is shown. The failing
 * number is the stored `labelMiss`; the deciding feature the stored
 * `demand_driver`. When that feature is the failing number itself, or none
 * is stored, "เพราะยอดขายเป็นหลัก" would contradict the sentence before it,
 * so the reason says the model as a whole still resembles the group most.
 *
 * @param assigned The K-Means group (`ProductDetail.assignedCluster`).
 * @param inStock Whether the model has an offer in stock (wording of the price gap).
 */
export function unlabelledWhy(
  assigned: DemandCluster,
  e: DemandEvidence,
  ref: DemandReference,
  inStock = true,
): UnlabelledWhy {
  const subject = e.labelMiss === null ? "ตัวเลข" : MISS_SUBJECT[e.labelMiss];
  const driverMissed =
    e.driver !== null &&
    e.driver !== "price" &&
    (e.labelMiss === "both" || e.labelMiss === e.driver || e.labelMiss === null);
  const priceGap = e.driver === "price" && e.normalizedPrice !== null ? priceGapText(e.normalizedPrice, inStock) : null;
  const reason =
    e.driver === null || driverMissed
      ? "เมื่อดูยอดเข้าชม ยอดขาย และราคารวมกัน รุ่นนี้ยังคล้ายกลุ่มนี้มากกว่ากลุ่มอื่น K-Means จึงจัดไว้กลุ่มนี้"
      : `K-Means จัดรุ่นนี้ไว้กลุ่มนี้เพราะ${DRIVER_SHORT[e.driver]}เป็นหลัก${priceGap === null ? "" : `: ${priceGap}`}`;
  const rule = labelRuleShort(assigned, ref);
  return {
    assigned: `K-Means จัดรุ่นนี้ไว้กลุ่ม “${CLUSTER_LABELS[assigned].label}” แต่ไม่ติดป้าย เพราะ${subject}ไม่ตรงเกณฑ์ของป้าย`,
    rule: rule === null ? null : `ป้ายนี้ใช้กับรุ่นที่${rule}`,
    reason,
    method: `กลุ่มจัดด้วย K-Means จาก ${DIMENSION_COUNT} อย่างพร้อมกัน (${DIMENSIONS_TEXT}) ไม่ได้ตัดที่เกณฑ์ทีละตัว รุ่นหนึ่งจึงถูกจัดเข้ากลุ่มได้แม้ตัวเลขบางตัวไม่ตรงชื่อกลุ่ม เว็บติดป้ายเฉพาะรุ่นที่ตัวเลขตรงชื่อ`,
  };
}

/**
 * A group's typical sales share: "ค่ากลางยอดขาย: ขายดีกว่า ~14% ของสินค้าในร้าน
 * ในช่วงที่ติดตาม (ไม่เกิน 120 วันล่าสุด)" (older payloads: "ค่าเฉลี่ยยอดขาย: …").
 * A median of exactly 0 is said in words ("เกินครึ่งของรุ่นในกลุ่มนี้ยังไม่เห็น
 * ยอดขาย…"), never "~0%".
 */
function groupSales(g: GroupStats, ref: DemandReference): string | null {
  if (g.salesBeats === null) return null;
  const kind = g.salesBeatsIsMedian ? "ค่ากลาง" : "ค่าเฉลี่ย";
  const share = salesShare(g.salesBeats);
  if (share.kind === "zero") {
    return g.salesBeatsIsMedian
      ? `${kind}ยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้${plain(noSalesText(ref))}`
      : `${kind}ยอดขาย: ${plain(noSalesText(ref))}`;
  }
  const amount = share.kind === "tiny" ? "ไม่ถึง 1%" : `~${share.pct}%`;
  return `${kind}ยอดขาย: ขายดีกว่า ${amount} ของสินค้าในร้าน${windowText(ref)}`;
}

const plain = (text: string): string => text.replaceAll("|", "");

/**
 * The typical model overall, for the bracket after a group's sales:
 * "ทุกรุ่น ~35%", or, when the all-model median is exactly 0 (as on the live
 * catalogue), "เกินครึ่งของทุกรุ่นยังไม่เห็นยอดขายช่วงนี้" (or "…ยังไม่ขายดีกว่า
 * สินค้าใดในร้านช่วงนี้" when the run cannot vouch that a zero share means no
 * sales). Never "ทุกรุ่น ~0%". Null when the payload has no overall median.
 */
export function overallSalesText(ref: DemandReference): string | null {
  if (ref.salesBeatsMedian === null) return null;
  const share = salesShare(ref.salesBeatsMedian);
  if (share.kind === "zero") return `เกินครึ่งของทุกรุ่น${plain(zeroShareText(ref))}ช่วงนี้`;
  return share.kind === "tiny" ? "ทุกรุ่น ไม่ถึง 1%" : `ทุกรุ่น ~${share.pct}%`;
}

/**
 * The line under the chips when a group is selected: the group's typical
 * model beside the typical model overall, with the tracking cap said once at
 * the end: "รุ่นในกลุ่มนี้: ค่ากลางคนดู 104,249 ครั้ง (ทุกรุ่น 19,120 ครั้ง) ·
 * ค่ากลางยอดขาย: ขายดีกว่า ~17% ของสินค้าในร้าน (ทุกรุ่น: เกินครึ่งยังไม่เห็นยอดขาย) ·
 * ติดตามไม่เกิน 120 วัน". At most one bracket per half (SPEC round 18: two
 * stacked brackets took four lines at 375 px), and when the group's sales and
 * the overall sales read the same, one sentence says both ("เกินครึ่งของรุ่นใน
 * กลุ่มนี้และของทุกรุ่นยังไม่เห็นยอดขาย"). Parts whose numbers the payload lacks
 * are left out; null when it has none. O(1).
 */
export function groupComparison(cluster: DemandCluster, ref: DemandReference): string | null {
  const g = ref.groups[cluster];
  if (!g) return null;
  const parts: string[] = [];
  if (g.viewsMedian !== null) {
    const all = ref.viewsMedian === null ? "" : ` (ทุกรุ่น ${countText(ref.viewsMedian)} ครั้ง)`;
    parts.push(`ค่ากลางคนดู ${countText(g.viewsMedian)} ครั้ง${all}`);
  }
  const sales = comparedSales(g, ref);
  if (sales !== null) parts.push(sales);
  if (!parts.length) return null;
  const span = sales !== null && ref.windowDays !== null ? ` · ติดตามไม่เกิน ${countText(ref.windowDays)} วัน` : "";
  return `รุ่นในกลุ่มนี้: ${parts.join(" · ")}${span}`;
}

/** "~17%" or "ไม่ถึง 1%" for a share above 0. */
const approxPct = (s: ReturnType<typeof salesShare>): string => (s.kind === "tiny" ? "ไม่ถึง 1%" : `~${s.pct}%`);

/**
 * The sales half of `groupComparison`, group and all models in one sentence
 * with at most one bracket. A share of exactly 0 is words, never "~0%"; with
 * no tracking cap stored it says "…ช่วงนี้" itself.
 */
function comparedSales(g: GroupStats, ref: DemandReference): string | null {
  if (g.salesBeats === null) return null;
  const kind = g.salesBeatsIsMedian ? "ค่ากลาง" : "ค่าเฉลี่ย";
  const none = `${plain(zeroShareText(ref))}${ref.windowDays === null ? "ช่วงนี้" : ""}`;
  const own = salesShare(g.salesBeats);
  const overall = ref.salesBeatsMedian === null ? null : salesShare(ref.salesBeatsMedian);
  if (own.kind === "zero") {
    // A mean of 0: none of the group's models outsold anything.
    if (!g.salesBeatsIsMedian) return `${kind}ยอดขาย: ${none}`;
    if (overall?.kind === "zero") return `ยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้และของทุกรุ่น${none}`;
    return `${kind}ยอดขาย: เกินครึ่งของรุ่นในกลุ่มนี้${none}${overall === null ? "" : ` (ทุกรุ่น ${approxPct(overall)})`}`;
  }
  const head = `${kind}ยอดขาย: ขายดีกว่า ${approxPct(own)} ของสินค้าในร้าน`;
  if (overall === null) return head;
  if (overall.kind === "zero") return `${head} (ทุกรุ่น: เกินครึ่ง${none})`;
  if (g.salesBeatsIsMedian && approxPct(overall) === approxPct(own)) return `${head} เท่ากับทุกรุ่น`;
  return `${head} (ทุกรุ่น ${approxPct(overall)})`;
}

/** A group's typical numbers for the "(i)" panel, in the same shape, or null. */
export function groupNumbers(cluster: DemandCluster, ref: DemandReference): string | null {
  const g = ref.groups[cluster];
  if (!g) return null;
  const parts: string[] = [];
  if (g.viewsMedian !== null) parts.push(`ค่ากลางคนดู ${countText(g.viewsMedian)} ครั้ง`);
  const sales = groupSales(g, ref);
  if (sales !== null) parts.push(sales);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * "มี 9 รุ่นจาก 308 รุ่นที่ K-Means จัดกลุ่มแล้วแต่ไม่ติดป้าย …", from the payload's
 * counts (v15+); null when it has none or none is unlabelled.
 */
export function unlabelledText(ref: DemandReference): string | null {
  if (ref.unlabelled === null || ref.clustered === null || ref.unlabelled <= 0) return null;
  return `มี ${countText(ref.unlabelled)} รุ่นจาก ${countText(ref.clustered)} รุ่นที่ K-Means จัดกลุ่มแล้วแต่ไม่ติดป้าย เพราะยอดเข้าชมหรือยอดขายของรุ่นนั้นไม่ตรงกับชื่อกลุ่ม (K-Means ดูราคาด้วย) รุ่นเหล่านี้แสดงแค่ตัวเลข และไม่อยู่ในรายการของกลุ่ม`;
}

/**
 * The /insights sales tile of a group: what the figure is, its typical share
 * as a headline, and what it is a share of. `median` (v14+ payloads) titles
 * it "ยอดขายโดยทั่วไป", like the views tile beside it and the median the list
 * quotes (SPEC round 18: the tile showed a mean while the list said median);
 * a mean (older payloads) is titled "ยอดขายเฉลี่ย". A share of exactly 0 is
 * words, never "~0%" (a median of 0: "เกินครึ่งของรุ่นในกลุ่มนี้"); one that
 * rounds to 0 is "ไม่ถึง 1%".
 */
export function shareTile(share: number, ref: DemandReference, median = false): { title: string; value: string; note: string } {
  const kind = salesShare(share);
  const span = windowText(ref);
  const title = median ? "ยอดขายโดยทั่วไป" : "ยอดขายเฉลี่ย";
  if (kind.kind === "zero") {
    return { title, value: plain(zeroShareText(ref)), note: median ? `เกินครึ่งของรุ่นในกลุ่มนี้${span}` : span.trim() };
  }
  return {
    title,
    value: kind.kind === "tiny" ? "ขายดีกว่าไม่ถึง 1%" : `ขายดีกว่า ~${kind.pct}%`,
    note: `ของสินค้าในร้านเดียวกัน${span}`,
  };
}
