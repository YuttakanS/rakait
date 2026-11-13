export type Category = "gpu" | "cpu" | "ram" | "ssd";
export type Recommendation = "buy_now" | "wait" | "fair_price";
export type DemandCluster = "community_favorite" | "overpriced_hype" | "hidden_gem" | "niche";
export type SortKey = "deal" | "price" | "stores";
/** A clustered feature, as stored in `listing_insights.demand_driver`. */
export type DemandDriver = "views" | "sales" | "price";

/**
 * The numbers behind a model's demand group, exactly as the clustering read
 * them (`train.model_demand`, stored per listing by migration 0013). Null
 * means not known: no store publishes the counter, or the row predates model
 * 2026.11-v14. Never 0 for "unknown".
 */
export interface DemandEvidence {
  /** Views summed over the stores that publish them. */
  views: number | null;
  /** Share [0, 1) of the same store's listings that sold strictly less, averaged over stores. */
  salesBeatsPct: number | null;
  /** Lowest in-stock price over the median price of the model's listings. */
  normalizedPrice: number | null;
  /** The feature that most keeps the model in its cluster rather than the nearest other group. */
  driver: DemandDriver | null;
  /**
   * Whether the model's numbers support its group's name, as decided by the
   * pipeline (`models.label_fit`, migration 0014). False: no badge, not
   * listed under the group. Null: no group, or a row from before model
   * 2026.11-v15 (the badge then shows as before).
   */
  labelFits: boolean | null;
  /** Which numbers fail the name when `labelFits` is false. */
  labelMiss: "views" | "sales" | "both" | null;
}

export interface ProductSummary {
  id: number;
  category: Category;
  manufacturer: string;
  model: string;
  offers: number;
  /** Stores listing the model, sold out or not. */
  stores: number;
  /** Stores with the model in stock: the "ดูราคา N ร้าน" count. */
  inStockStores: number;
  /** Offers currently in stock; 0 means the prices shown are last-known. */
  inStockOffers: number;
  minPrice: number;
  maxPrice: number;
  bestDeal: number | null;
  cheapestRecommendation: Recommendation | null;
  /** That offer's recommendation_reason ("Decision Tree: …" from the timing tree). */
  cheapestReason: string | null;
  /**
   * The model's demand group as shown: one per model (2026.11-v8+), the
   * value the `?cluster=` filter selects on, and null when the model's
   * numbers do not support the group's name (`demand.labelFits === false`).
   * Not tied to the headline offer.
   */
  modelCluster: DemandCluster | null;
  /** The evidence for `modelCluster` (shown under the badge). */
  demand: DemandEvidence;
  /** Price-vs-fair delta of the headline offer (e.g. -0.12 = 12% below). */
  bestPctVsFair: number | null;
  /** Fair price of the headline offer (one value per model). */
  fairPrice: number | null;
  /** Half-width of the fair price's 80% interval, as a fraction ("± Y%"). */
  fairErrorPct: number | null;
  /**
   * Fair price shown for reference, never ranked: over 40% away from the
   * price, or above a better-spec sibling's (`cheapestReason` says which).
   */
  fairUncertain: boolean;
  /**
   * Highest price any store recorded for the model in price_history over the
   * last 120 days (the pipeline's window); null without history.
   */
  maxSeenPrice: number | null;
  imageUrl: string | null;
}

/** One page of the product list plus the number of models matching in all. */
export interface ProductList {
  products: ProductSummary[];
  /** Matching models before the page limit. */
  total: number;
}

export interface Offer {
  listingId: number;
  merchant: string;
  merchantName: string;
  title: string;
  brand: string | null;
  url: string;
  price: number;
  inStock: boolean;
  stockQuantity: number | null;
  viewCount: number | null;
  soldCount: number | null;
  lastScrapedAt: string;
  fairPrice: number | null;
  pctVsFair: number | null;
  dealScore: number | null;
  fairErrorPct: number | null;
  fairUncertain: boolean;
  recommendation: Recommendation | null;
  recommendationReason: string | null;
  salesPerDay: number | null;
  imageUrl: string | null;
}

export interface ProductDetail {
  id: number;
  category: Category;
  manufacturer: string;
  model: string;
  specs: Record<string, string | number | boolean | null>;
  /**
   * The model's demand group as shown (once, in the product hero): null when
   * its numbers do not support the name (`demand.labelFits === false`).
   */
  demandCluster: DemandCluster | null;
  /** The group K-Means assigned, whether or not it is shown as a badge. */
  assignedCluster: DemandCluster | null;
  /** The evidence for `demandCluster`. */
  demand: DemandEvidence;
  offers: Offer[];
}

export interface PricePoint {
  merchant: string;
  day: string;
  minPrice: number;
}

export interface MarketInsight {
  category: Category | "all";
  kind: string;
  computedAt: string;
  payload: Record<string, unknown>;
}

export interface CoverageRow {
  merchant: string;
  merchantName: string;
  listings: number;
  linked: number;
  historyRows: number;
  firstObservation: string | null;
}

/** One listing on a simple-regression scatter: spec value vs price. */
export interface SpecPoint {
  /** Canonical product id (links to /product/[id]). */
  id: number;
  category: Category;
  x: number;
  price: number;
  model: string;
}
