/**
 * The evidence behind a demand-group badge (SPEC round 16): the model's own
 * views and sales percentile, how they compare with every clustered model,
 * and, when they do not fit the group's name, which clustered feature put
 * the model there.
 *
 * Every number comes from the training run: per model from
 * `listing_insights` (migration 0013, written by `train.model_demand`), per
 * group and overall from the `demand_kmeans` payload. Nothing is re-derived
 * here, and a missing number stays null (never 0): rows written before model
 * 2026.11-v14 have none, and the page then says so.
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
  /** Median share of the store's listings outsold (v14), else the mean (older payloads). */
  salesBeats: number | null;
  salesBeatsIsMedian: boolean;
}

/** What a model's numbers are measured against. */
export interface DemandReference {
  /** Median views over every clustered model (v14+). */
  viewsMedian: number | null;
  /** Median `sales_beats_pct` over every clustered model (v14+). */
  salesBeatsMedian: number | null;
  /** Views at which best sellers split into ขายดี คนดูเยอะ / ขายดี แต่คนดูน้อย. */
  splitViews: number | null;
  groups: Partial<Record<DemandCluster, GroupStats>>;
}

export const NO_REFERENCE: DemandReference = {
  viewsMedian: null,
  salesBeatsMedian: null,
  splitViews: null,
  groups: {},
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
  const groups: DemandReference["groups"] = {};
  for (const s of Array.isArray(payload.segments) ? (payload.segments as Record<string, unknown>[]) : []) {
    if (typeof s?.label !== "string" || !(s.label in CLUSTER_LABELS)) continue;
    const median = finite(s.sales_beats_pct_median);
    groups[s.label as DemandCluster] = {
      viewsMedian: finite(s.views_median),
      salesBeats: median ?? finite(s.sales_beats_pct),
      salesBeatsIsMedian: median !== null,
    };
  }
  return {
    viewsMedian: finite(reference.views_median),
    salesBeatsMedian: finite(reference.sales_beats_pct_median),
    splitViews: finite(payload.split_views),
    groups,
  };
}

/** Whole count as printed everywhere ("35,120"). */
export const countText = (v: number): string => Math.round(v).toLocaleString("th-TH");

/** "คนดู 35,120 ครั้ง", or null without a views total. */
export function viewsText(e: DemandEvidence): string | null {
  return e.views === null ? null : `คนดู ${countText(e.views)} ครั้ง`;
}

/**
 * Where a number sits against its yardstick, judged the way the page prints
 * the two (SPEC round 16 review):
 *
 * - "near" when both print the same after rounding (`shown`), so the copy
 *   never says "35% … สูงกว่าค่ากลาง (35%)", and a near number is never
 *   counted as contradicting a group's name;
 * - otherwise "above" only when the value clears the yardstick by more than
 *   floating-point noise (`TOLERANCE`): `split_views` is `expm1(median
 *   log1p(views))`, which came out 1731.9999999999995 for a model with
 *   exactly 1,732 views, and a bare `>` put that model above its own split.
 *
 * O(1).
 */
export type Side = "above" | "below" | "near";

/** Relative slack for "above": far below any real difference, above float rounding. */
const TOLERANCE = 1e-9;

export function compareSide(value: number, yardstick: number, shown: (v: number) => number): Side {
  if (shown(value) === shown(yardstick)) return "near";
  return value > yardstick * (1 + TOLERANCE) ? "above" : "below";
}

/**
 * How a sales share prints: "zero" only for a raw 0 (the model outsold
 * nothing), "tiny" for a share above 0 that rounds to 0% (printed "ไม่ถึง 1%",
 * never "0%" or "nothing"), else the whole percent.
 */
export function salesShare(raw: number): { kind: "zero" | "tiny" | "pct"; pct: number } {
  const pct = wholePct(raw);
  return { kind: raw === 0 ? "zero" : pct === 0 ? "tiny" : "pct", pct };
}

/**
 * "ขายดีกว่า 12% ของสินค้าในร้าน" (`long`: "…ในร้านเดียวกัน"), or null without
 * a sales percentile. With `below` (the share is under the all-model median)
 * it reads "ขายดีกว่าแค่ 12% …": the bare sentence sounded like praise for a
 * weak seller. A real 0 (the model outsold nothing in its stores, e.g. tied
 * zero sellers) is said in words, not as "ขายดีกว่า 0%"; a share that only
 * rounds to 0 reads "ขายดีกว่าไม่ถึง 1% ของสินค้าในร้าน".
 */
export function salesText(e: DemandEvidence, long = false, below = false): string | null {
  if (e.salesBeatsPct === null) return null;
  const share = salesShare(e.salesBeatsPct);
  const where = long ? "สินค้าใน|ร้านเดียวกัน" : "สินค้าในร้าน";
  if (share.kind === "zero") return `ยังไม่ขายดีกว่า|${long ? "สินค้าใดใน|ร้านเดียวกัน" : "สินค้าใดในร้าน"}`;
  if (share.kind === "tiny") return `ขายดีกว่า|ไม่ถึง 1% ของ|${where}`;
  return `ขายดีกว่า${below ? "แค่" : ""} ${share.pct}% ของ|${where}`;
}

/**
 * The evidence line as its "·"-separated parts. A missing number is named as
 * missing; with neither (rows from before 2026.11-v14) one sentence says so.
 * `salesBelow`: see `salesText`.
 */
export function evidenceParts(e: DemandEvidence, long = false, salesBelow = false): string[] {
  const views = viewsText(e);
  const sales = salesText(e, long, salesBelow);
  if (views === null && sales === null) return ["ยังไม่มีตัวเลข|ยอดเข้าชม|และยอดขาย|ของรุ่นนี้"];
  return [views ?? "ไม่มีข้อมูล|ยอดเข้าชม", sales ?? "ไม่มีข้อมูล|ยอดขาย"];
}

/** What each group's name claims about views and sales. */
const CLAIMS: Record<DemandCluster, { views: boolean; sales: boolean }> = {
  hidden_gem: { views: false, sales: true },
  community_favorite: { views: true, sales: true },
  overpriced_hype: { views: true, sales: false },
  niche: { views: false, sales: false },
};

const BEST_SELLERS = new Set<DemandCluster>(["hidden_gem", "community_favorite"]);

/**
 * The views figure a group's name is read against: for the two best-seller
 * groups the split between them (`split_views`, the rule that names them),
 * for the others the median of every clustered model.
 */
function viewsYardstick(
  cluster: DemandCluster,
  ref: DemandReference,
): { value: number; name: string; short: string } | null {
  if (BEST_SELLERS.has(cluster) && ref.splitViews !== null) {
    return { value: ref.splitViews, name: "เส้นแบ่งของรุ่นขายดี", short: "เส้นแบ่ง|รุ่นขายดี" };
  }
  return ref.viewsMedian === null
    ? null
    : { value: ref.viewsMedian, name: "ค่ากลางของทุกรุ่น", short: "ค่ากลาง" };
}

/**
 * Each of the model's two numbers against its yardstick (`compareSide`, with
 * the rounding the page prints: whole views, whole percent); null where the
 * number or the yardstick is missing.
 */
export function evidenceSides(
  cluster: DemandCluster,
  e: DemandEvidence,
  ref: DemandReference,
): { views: Side | null; sales: Side | null } {
  const yard = viewsYardstick(cluster, ref);
  return {
    views: yard === null || e.views === null ? null : compareSide(e.views, yard.value, Math.round),
    sales:
      ref.salesBeatsMedian === null || e.salesBeatsPct === null
        ? null
        : compareSide(e.salesBeatsPct, ref.salesBeatsMedian, wholePct),
  };
}

/**
 * Which of the model's numbers contradict its group's name. A number that is
 * missing, has no yardstick, or prints the same as its yardstick ("near")
 * contradicts nothing.
 */
export function nameMismatch(
  cluster: DemandCluster,
  e: DemandEvidence,
  ref: DemandReference,
): { views: boolean; sales: boolean } {
  const side = evidenceSides(cluster, e, ref);
  const against = (s: Side | null, claimedHigh: boolean) => s !== null && s !== "near" && (s === "above") !== claimedHigh;
  return { views: against(side.views, CLAIMS[cluster].views), sales: against(side.sales, CLAIMS[cluster].sales) };
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

/** The same features in a shopper's words (cards, the product page's reason). */
const DRIVER_SHORT: Record<DemandDriver, string> = { views: "ยอดเข้าชม", sales: "ยอดขาย", price: "ราคา" };

const plain = (text: string): string => text.replaceAll("|", "");

/** How many features the clustering reads at once. */
export const DIMENSION_COUNT = Object.keys(DRIVER_LABELS).length;

/** "ยอดเข้าชม อันดับยอดขายในร้าน และราคาเทียบราคาปกติของรุ่น", built from the list. */
export const DIMENSIONS_TEXT = (() => {
  const names = Object.values(DRIVER_LABELS);
  return `${names.slice(0, -1).join(" ")} และ${names[names.length - 1]}`;
})();

function mismatchSubject(m: { views: boolean; sales: boolean }): string {
  return m.views && m.sales ? "ยอดเข้าชม|และยอดขาย" : m.views ? "ยอดเข้าชม" : "ยอดขาย";
}

/**
 * Whether the stored deciding feature (`demand_driver`) is one of the very
 * numbers that contradict the name. It happens: a model in "คนดูน้อย ขายน้อย"
 * can have views above the all-model median and still sit far nearer its own
 * centroid than the high-views group's on that same axis. "ยอดเข้าชมไม่ตรง
 * ชื่อกลุ่ม · อยู่กลุ่มนี้เพราะยอดเข้าชม" would contradict itself, so the copy
 * then says the number is past the yardstick but the model as a whole still
 * resembles this group most.
 */
export function driverIsMismatched(driver: DemandDriver | null, m: { views: boolean; sales: boolean }): boolean {
  return (driver === "views" && m.views) || (driver === "sales" && m.sales);
}

const SIDE_WORD: Record<Exclude<Side, "near">, string> = { above: "สูงกว่า", below: "ต่ำกว่า" };

/** "ยอดเข้าชมสูงกว่าค่ากลาง และยอดขายต่ำกว่าค่ากลาง" for the numbers that contradict the name. */
function mismatchSides(cluster: DemandCluster, e: DemandEvidence, ref: DemandReference): string {
  const m = nameMismatch(cluster, e, ref);
  const side = evidenceSides(cluster, e, ref);
  const yard = viewsYardstick(cluster, ref);
  const parts: string[] = [];
  if (m.views && yard !== null && side.views !== null && side.views !== "near") {
    parts.push(`ยอดเข้าชม|${SIDE_WORD[side.views]}|${yard.short}`);
  }
  if (m.sales && side.sales !== null && side.sales !== "near") {
    parts.push(`ยอดขาย|${SIDE_WORD[side.sales]}|ค่ากลาง`);
  }
  return parts.join(" และ");
}

/**
 * The card's one short line when the model's numbers contradict its group's
 * name (SPEC round 16 criterion 5), in a shopper's words (no "มิติ", "ชี้ขาด"
 * or "ใกล้กลุ่ม"; the product page has the detail). Two shapes:
 *
 * - another feature decided the group: "ยอดเข้าชมไม่ตรงชื่อกลุ่ม · อยู่กลุ่มนี้
 *   เพราะราคา" (the number that contradicts, then the stored `demand_driver`);
 * - the deciding feature is the contradicting number itself
 *   (`driverIsMismatched`) or none is stored: "ยอดเข้าชมสูงกว่าค่ากลาง
 *   แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด".
 *
 * Null when nothing contradicts or nothing can be compared.
 */
export function cardConflict(cluster: DemandCluster, e: DemandEvidence, ref: DemandReference): string | null {
  const m = nameMismatch(cluster, e, ref);
  if (!m.views && !m.sales) return null;
  if (e.driver === null || driverIsMismatched(e.driver, m)) {
    return `${mismatchSides(cluster, e, ref)} แต่โดยรวม|ยังคล้ายกลุ่มนี้|ที่สุด`;
  }
  return `${mismatchSubject(m)}|ไม่ตรงชื่อกลุ่ม · อยู่กลุ่มนี้|เพราะ${DRIVER_SHORT[e.driver]}`;
}

/**
 * The single line a card prints when a conflict rule withholds the group
 * badge (`lib/verdict.ts`): the group's name and the model's two numbers in
 * brackets, e.g. "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 3,120 ครั้ง · ขายดีกว่าแค่
 * 12%)". It replaces the badge, the long "ไม่แสดงป้าย เพราะ…" note and the
 * separate contradiction line, so such a card is no taller than any other;
 * the product page carries the explanation. Missing numbers are named,
 * never 0.
 *
 * When a number contradicts the group's name (`nameMismatch`) the line still
 * admits it, with the shortest form of the card rule (`cardConflict`):
 * "… · อยู่กลุ่มนี้เพราะราคา" when another feature decided the group, else
 * "… · ตัวเลขไม่ตรงชื่อกลุ่ม แต่โดยรวมยังคล้ายกลุ่มนี้ที่สุด".
 */
export function withheldLine(cluster: DemandCluster, e: DemandEvidence, ref: DemandReference): string {
  const name = `กลุ่ม: ${CLUSTER_LABELS[cluster].label}`;
  if (e.views === null && e.salesBeatsPct === null) return `${name} (ยังไม่มีตัวเลข)`;
  let sales = "ไม่มีข้อมูล|ยอดขาย";
  if (e.salesBeatsPct !== null) {
    const share = salesShare(e.salesBeatsPct);
    const below = evidenceSides(cluster, e, ref).sales === "below";
    sales =
      share.kind === "zero"
        ? "ยังไม่ขายดีกว่า|สินค้าใด"
        : share.kind === "tiny"
          ? "ขายดีกว่า|ไม่ถึง 1%"
          : `ขายดีกว่า${below ? "แค่" : ""} ${share.pct}%`;
  }
  const m = nameMismatch(cluster, e, ref);
  const admit =
    !m.views && !m.sales
      ? ""
      : e.driver === null || driverIsMismatched(e.driver, m)
        ? " · ตัวเลข|ไม่ตรงชื่อกลุ่ม แต่โดยรวม|ยังคล้ายกลุ่มนี้|ที่สุด"
        : ` · อยู่กลุ่มนี้|เพราะ${DRIVER_SHORT[e.driver]}`;
  return `${name} (${viewsText(e) ?? "ไม่มีข้อมูล|ยอดเข้าชม"} · ${sales})${admit}`;
}

/** The product page's sentences beside the group badge (`demandWhy`). */
export interface DemandWhy {
  /** "ที่ได้กลุ่มนี้" normally; "ตัวเลขของรุ่นนี้" when a number contradicts the name. */
  lead: string;
  /**
   * The model's two numbers against their yardsticks. With a contradiction
   * it opens with it: "ยอดเข้าชมไม่ตรงกับชื่อกลุ่ม คนดูน้อยกว่า…". Null when
   * nothing can be compared.
   */
  why: string | null;
  /** One plain sentence on why the model is in the group anyway; null without a contradiction. */
  reason: string | null;
  /** How groups are formed, for the "(details)" under a contradiction; null without one. */
  method: string | null;
}

const VERSUS: Record<Side, string> = { above: "สูงกว่า", below: "ต่ำกว่า", near: "ใกล้เคียง" };

/**
 * "ราคาต่ำสุดที่มีของตอนนี้ถูกกว่าราคากลางของรุ่นนี้ 18%" from the clustered
 * price feature: `normalized_price` = the model's lowest in-stock price over
 * the median price of all its listings; when it is sold out everywhere the
 * numerator is its lowest last-known price, and the sentence says so. The
 * gap is the whole percent every page prints (`wholePct`). Null when it
 * rounds to 0%: "อยู่กลุ่มนี้เพราะราคาเป็นหลัก: … ใกล้เคียงราคากลาง" would
 * contradict itself, so the reason then stops at "เป็นหลัก". O(1).
 */
export function priceGapText(normalizedPrice: number, inStock: boolean): string | null {
  const what = inStock ? "ราคาต่ำสุดที่มีของตอนนี้" : "ราคาล่าสุดที่ต่ำที่สุด (ตอนนี้หมดทุกร้าน) ";
  const gap = wholePct(Math.abs(normalizedPrice - 1));
  if (gap === 0) return null;
  return `${what}${normalizedPrice < 1 ? "ถูกกว่า" : "แพงกว่า"}ราคากลางของรุ่นนี้ ${gap}%`;
}

/**
 * The product page's sentences under the evidence line.
 *
 * - `why`: the model's two numbers against their yardsticks ("คนดูมากกว่า
 *   ค่ากลางของทุกรุ่น (5,300 ครั้ง) แต่ขายดีกว่าแค่ 8% ของสินค้าในร้านเดียวกัน
 *   ต่ำกว่าค่ากลางของทุกรุ่น (35%)"; a number that prints the same as its
 *   yardstick reads "ใกล้เคียง…"). A clause needs both the model's number and
 *   its yardstick (payload 2026.11-v14+).
 * - With a contradiction the lead changes to "ตัวเลขของรุ่นนี้" and `why`
 *   states it first ("ยอดเข้าชมไม่ตรงกับชื่อกลุ่ม …"); `reason` then says in
 *   one plain sentence why the model is in the group anyway: the stored
 *   deciding feature (for price, with the gap as a percent), or, when that
 *   feature is the contradicting number itself or none is stored, that the
 *   model as a whole still resembles this group most. `method` (K-Means over
 *   every feature at once) goes behind a disclosure.
 *
 * Nothing is bent to make the sentence agree with the name.
 *
 * @param inStock Whether the model has an offer in stock (wording of the price gap).
 */
export function demandWhy(
  cluster: DemandCluster,
  e: DemandEvidence,
  ref: DemandReference,
  inStock = true,
): DemandWhy {
  const yard = viewsYardstick(cluster, ref);
  const side = evidenceSides(cluster, e, ref);
  const clauses: { text: string; side: Side }[] = [];
  if (side.views !== null && yard !== null) {
    const word = side.views === "near" ? "ใกล้เคียง" : side.views === "above" ? "มากกว่า" : "น้อยกว่า";
    clauses.push({ text: `คนดู${word}${yard.name} (${countText(yard.value)} ครั้ง)`, side: side.views });
  }
  if (side.sales !== null && e.salesBeatsPct !== null && ref.salesBeatsMedian !== null) {
    const share = salesShare(e.salesBeatsPct);
    const versus = `${VERSUS[side.sales]}ค่ากลางของทุกรุ่น (${wholePct(ref.salesBeatsMedian)}%)`;
    const text =
      share.kind === "zero"
        ? `ยังไม่ขายดีกว่าสินค้าใดในร้านเดียวกัน ${versus}`
        : share.kind === "tiny"
          ? `ขายดีกว่าไม่ถึง 1% ของสินค้าในร้านเดียวกัน ${versus}`
          : `ขายดีกว่า${side.sales === "below" ? "แค่" : ""} ${share.pct}% ของสินค้าในร้านเดียวกัน ${versus}`;
    clauses.push({ text, side: side.sales });
  }
  const normal = "ที่ได้กลุ่มนี้";
  if (clauses.length === 0) return { lead: normal, why: null, reason: null, method: null };
  // "แต่" only when the two numbers point opposite ways; a "near" one sides with neither.
  const opposite =
    clauses.length === 2 &&
    clauses[0].side !== "near" &&
    clauses[1].side !== "near" &&
    clauses[0].side !== clauses[1].side;
  const numbers = clauses.map((c) => c.text).join(opposite ? " แต่" : " และ");

  const m = nameMismatch(cluster, e, ref);
  if (!m.views && !m.sales) return { lead: normal, why: numbers, reason: null, method: null };
  const priceGap = e.driver === "price" && e.normalizedPrice !== null ? priceGapText(e.normalizedPrice, inStock) : null;
  const reason =
    e.driver === null || driverIsMismatched(e.driver, m)
      ? "เมื่อดูยอดเข้าชม ยอดขาย และราคารวมกัน รุ่นนี้ยังคล้ายกลุ่มนี้มากกว่ากลุ่มอื่น"
      : `รุ่นนี้อยู่กลุ่มนี้เพราะ${DRIVER_SHORT[e.driver]}เป็นหลัก${priceGap === null ? "" : `: ${priceGap}`}`;
  return {
    lead: "ตัวเลขของรุ่นนี้",
    why: `${plain(mismatchSubject(m))}ไม่ตรงกับชื่อกลุ่ม ${numbers}`,
    reason,
    method: `กลุ่มจัดด้วย K-Means จาก ${DIMENSION_COUNT} อย่างพร้อมกัน (${DIMENSIONS_TEXT}) ไม่ได้ตัดที่ค่ากลางทีละตัว รุ่นหนึ่งจึงอยู่ในกลุ่มได้แม้ตัวเลขบางตัวไม่ตรงชื่อกลุ่ม`,
  };
}

/** "ค่ากลางยอดขาย: ขายดีกว่า ~14% ของสินค้าในร้าน" (older payloads: "ค่าเฉลี่ยยอดขาย: …"). */
function groupSales(g: GroupStats): string | null {
  if (g.salesBeats === null) return null;
  return `${g.salesBeatsIsMedian ? "ค่ากลาง" : "ค่าเฉลี่ย"}ยอดขาย: ขายดีกว่า ~${wholePct(g.salesBeats)}% ของสินค้าในร้าน`;
}

/**
 * The line under the chips when a group is selected: the group's typical
 * model beside the typical model overall, both halves in the same shape:
 * "รุ่นในกลุ่มนี้: ค่ากลางคนดู 104,249 ครั้ง (ทุกรุ่น 30,512 ครั้ง) · ค่ากลางยอดขาย:
 * ขายดีกว่า ~14% ของสินค้าในร้าน (ทุกรุ่น ~35%)". Parts whose numbers the
 * payload lacks are left out; null when it has none.
 */
export function groupComparison(cluster: DemandCluster, ref: DemandReference): string | null {
  const g = ref.groups[cluster];
  if (!g) return null;
  const parts: string[] = [];
  if (g.viewsMedian !== null) {
    const all = ref.viewsMedian === null ? "" : ` (ทุกรุ่น ${countText(ref.viewsMedian)} ครั้ง)`;
    parts.push(`ค่ากลางคนดู ${countText(g.viewsMedian)} ครั้ง${all}`);
  }
  const sales = groupSales(g);
  if (sales !== null) {
    parts.push(`${sales}${ref.salesBeatsMedian === null ? "" : ` (ทุกรุ่น ~${wholePct(ref.salesBeatsMedian)}%)`}`);
  }
  return parts.length ? `รุ่นในกลุ่มนี้: ${parts.join(" · ")}` : null;
}

/** A group's typical numbers for the "(i)" panel, in the same shape, or null. */
export function groupNumbers(cluster: DemandCluster, ref: DemandReference): string | null {
  const g = ref.groups[cluster];
  if (!g) return null;
  const parts: string[] = [];
  if (g.viewsMedian !== null) parts.push(`ค่ากลางคนดู ${countText(g.viewsMedian)} ครั้ง`);
  const sales = groupSales(g);
  if (sales !== null) parts.push(sales);
  return parts.length ? parts.join(" · ") : null;
}
