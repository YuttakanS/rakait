import { wholePct } from "./format";
import type { ProductSummary } from "./types";

/** Prefix the pipeline puts on reasons from the timing tree (`train.run_models`). */
const TREE_PREFIX = "Decision Tree: ";

/**
 * A card reason: `text`, then `tail` (a number such as "±30%" or "(DEAL 80)")
 * that the card keeps on one line so a wrap never splits it.
 */
export interface CardReason {
  text: string;
  tail: string | null;
}

type ReasonInput = Pick<
  ProductSummary,
  | "inStockOffers"
  | "fairUncertain"
  | "cheapestRecommendation"
  | "cheapestReason"
  | "bestPctVsFair"
  | "fairErrorPct"
  | "bestDeal"
>;

/**
 * One short line under the card's recommendation saying why the Deal Score
 * rules (`train.rule_recommendation`) gave it, from the headline offer's own
 * numbers. Those rules give ซื้อเลย / รอก่อน only when Deal Score passes
 * 80 / 20 **and** the gap exceeds the "± Y%" band, both compared as the whole
 * percents printed here (`wholePct`, the pipeline's `shown_pct`). So a high
 * DEAL beside ราคาเหมาะสม reads "ส่วนต่างยังอยู่ในช่วง ±Y%".
 *
 * Null whenever the numbers cannot honestly explain the badge: no
 * recommendation (sold out, uncertain, unpriced), a timing-tree call (its
 * reason starts with "Decision Tree: "), or numbers that disagree with the
 * badge (ซื้อเลย on a price above fair, "ยังไม่ถึงเกณฑ์ซื้อเลย" on DEAL ≥ 80).
 * O(1).
 */
export function cardReason(p: ReasonInput): CardReason | null {
  const rec = p.cheapestRecommendation;
  const pct = p.bestPctVsFair;
  if (p.inStockOffers === 0 || p.fairUncertain || rec === null || pct === null) return null;
  if (p.cheapestReason?.startsWith(TREE_PREFIX)) return null;
  const gap = wholePct(Math.abs(pct));
  const band = p.fairErrorPct === null ? null : wholePct(p.fairErrorPct);
  const outside = band !== null && gap > band;
  const bandText = band === null ? null : `±${band}%`;
  if (rec === "buy_now") return outside && pct < 0 ? { text: "ส่วนต่างเกินช่วง", tail: bandText } : null;
  if (rec === "wait") return outside && pct > 0 ? { text: "ส่วนต่างเกินช่วง", tail: bandText } : null;
  if (Math.abs(pct) < 0.005) return { text: "ใกล้เคียงราคายุติธรรม", tail: null };
  if (band === null) return { text: "ยังไม่ทราบช่วงคลาดเคลื่อน", tail: null };
  if (!outside) return { text: "ส่วนต่างยังอยู่ในช่วง", tail: bandText };
  // Outside the band yet fair: only because Deal Score missed its threshold.
  const deal = p.bestDeal;
  if (deal === null) return null;
  if (pct < 0 && deal < 80) return { text: "ยังไม่ถึงเกณฑ์ซื้อเลย", tail: "(DEAL 80)" };
  if (pct > 0 && deal > 20) return { text: "ยังไม่ถึงเกณฑ์รอก่อน", tail: "(DEAL 20)" };
  return null;
}
