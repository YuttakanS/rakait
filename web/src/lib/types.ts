export type Category = "gpu" | "cpu" | "ram" | "ssd";
export type Recommendation = "buy_now" | "wait" | "fair_price";
export type DemandCluster = "community_favorite" | "overpriced_hype" | "hidden_gem" | "niche";
export type SortKey = "deal" | "price" | "stores";

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
  /** Demand cluster of that same headline offer (not another store's). */
  cheapestCluster: DemandCluster | null;
  /** Price-vs-fair delta of the headline offer (e.g. -0.12 = 12% below). */
  bestPctVsFair: number | null;
  /** Fair price of the headline offer (one value per model). */
  fairPrice: number | null;
  /** Half-width of the fair price's 80% interval, as a fraction ("± Y%"). */
  fairErrorPct: number | null;
  /** Price over 40% away from fair: shown for reference, never ranked. */
  fairUncertain: boolean;
  imageUrl: string | null;
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
  demandCluster: DemandCluster | null;
  salesPerDay: number | null;
  imageUrl: string | null;
}

export interface ProductDetail {
  id: number;
  category: Category;
  manufacturer: string;
  model: string;
  specs: Record<string, string | number | boolean | null>;
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
