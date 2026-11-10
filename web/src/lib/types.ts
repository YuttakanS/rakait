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
  stores: number;
  minPrice: number;
  maxPrice: number;
  bestDeal: number | null;
  cheapestRecommendation: Recommendation | null;
  clusters: DemandCluster[];
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
  recommendation: Recommendation | null;
  recommendationReason: string | null;
  demandCluster: DemandCluster | null;
  salesPerDay: number | null;
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
