import type { DemandCluster, Recommendation } from "@/lib/types";

/** The badges one offer may show, after sold-out and conflict rules. */
export interface Verdict {
  /** False: show "หมด" and no price verdict at all. */
  inStock: boolean;
  recommendation: Recommendation | null;
  cluster: DemandCluster | null;
  /** Why a badge was withheld; shown under the badges, never hover-only. */
  note: string | null;
}

/**
 * Recommendation × demand cluster pairs that contradict each other, with the
 * sentence explaining which one is kept.
 *
 * Priority: the price verdict (ซื้อเลย / รอก่อน) outranks the demand cluster.
 * The verdict compares this offer's own price with the fair price of its
 * specs; the cluster is a popularity signal from views and sales that
 * BaNANA and IT City do not even publish, and it says nothing direct about
 * price. So "ซื้อเลย" (clearly below fair) beside "กระแสแรง ขายไม่ออก" (read
 * as overpriced hype) keeps ซื้อเลย, and "รอก่อน" (clearly above fair)
 * beside "ช้างเผือก" (a value find) keeps รอก่อน. Pairs not listed here are
 * compatible (a popular part can still be overpriced at one store).
 */
const CONFLICTS: Partial<Record<Recommendation, Partial<Record<DemandCluster, string>>>> = {
  buy_now: {
    overpriced_hype:
      "ไม่แสดงป้าย “กระแสแรง ขายไม่ออก” เพราะราคานี้ถูกกว่าราคายุติธรรมชัดเจน ราคาบอกความคุ้มได้ตรงกว่ายอดเข้าชมและยอดขาย",
  },
  wait: {
    hidden_gem:
      "ไม่แสดงป้าย “ช้างเผือก” เพราะร้านนี้ตั้งราคาสูงกว่าราคายุติธรรมชัดเจน แม้รุ่นนี้จะขายดี",
  },
};

/**
 * Resolve the badges for one offer. A sold-out offer shows no verdict: its
 * price is a stale last-known one, so neither a deal nor a demand label
 * built on it can be acted on. O(1).
 */
export function resolveVerdict(offer: {
  inStock: boolean;
  recommendation: Recommendation | null;
  cluster: DemandCluster | null;
}): Verdict {
  if (!offer.inStock) return { inStock: false, recommendation: null, cluster: null, note: null };
  const note =
    offer.recommendation && offer.cluster ? (CONFLICTS[offer.recommendation]?.[offer.cluster] ?? null) : null;
  return {
    inStock: true,
    recommendation: offer.recommendation,
    cluster: note ? null : offer.cluster,
    note,
  };
}
