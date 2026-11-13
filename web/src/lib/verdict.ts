import type { DemandCluster, Recommendation } from "@/lib/types";

/**
 * The badges one offer may show, after sold-out and conflict rules. The
 * cluster passed in is the model's demand group (one per model), the
 * recommendation the offer's own.
 */
export interface Verdict {
  /** False: show "หมด" and no price verdict at all. */
  inStock: boolean;
  recommendation: Recommendation | null;
  cluster: DemandCluster | null;
  /**
   * Why a badge was withheld. The product page prints it under the badges
   * (never hover-only); a product card prints the one-line `withheldLine`
   * (lib/demand.ts) instead and only uses this as the "withheld" flag.
   */
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
 * price. So "ซื้อเลย" (clearly below fair) beside "คนดูเยอะ แต่ขายน้อย"
 * (overpriced_hype, read as hype that does not sell) keeps ซื้อเลย, and
 * "รอก่อน" (clearly above fair) beside "ขายดี แต่คนดูน้อย" (hidden_gem, read
 * as a value find) keeps รอก่อน. Pairs not listed here are
 * compatible (a popular part can still be overpriced at one store).
 *
 * The sentence names the group the model is in and is shown on the product
 * page (hero and offer rows; `NoteText` keeps the quoted name on one line).
 * A product card does not print it (SPEC round 16): a card in a `?cluster=`
 * result whose badge is withheld names its group in one line with the
 * model's numbers, "กลุ่ม: … (คนดู N ครั้ง · ขายดีกว่า N%)" (`withheldLine`).
 */
const CONFLICTS: Partial<Record<Recommendation, Partial<Record<DemandCluster, string>>>> = {
  buy_now: {
    overpriced_hype:
      "รุ่นนี้อยู่ในกลุ่ม “คนดูเยอะ\u00a0แต่ขายน้อย” แต่ไม่แสดงป้าย เพราะราคานี้ถูกกว่าราคายุติธรรมชัดเจน ราคาบอกความคุ้มได้ตรงกว่ายอดเข้าชมและยอดขาย",
  },
  wait: {
    hidden_gem:
      "รุ่นนี้อยู่ในกลุ่ม “ขายดี\u00a0แต่คนดูน้อย” แต่ไม่แสดงป้าย เพราะราคานี้แพงกว่าราคายุติธรรมชัดเจน แม้รุ่นนี้จะขายดี",
  },
};

/**
 * Resolve the badges for one offer. A sold-out offer shows no verdict: its
 * price is a stale last-known one, so no deal built on it can be acted on.
 * (A card sold out at every store prints the model's group itself.) O(1).
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
