import "server-only";
import { sql } from "@/lib/db";
import type {
  Category,
  CoverageRow,
  DemandCluster,
  MarketInsight,
  Offer,
  PricePoint,
  ProductDetail,
  ProductSummary,
  Recommendation,
  SortKey,
} from "@/lib/types";

/** Listings scraped within this window count as currently on sale. */
const ACTIVE = sql`l.last_scraped_at > now() - interval '2 days' AND l.current_price IS NOT NULL`;

export interface ProductFilter {
  category?: Category;
  cluster?: DemandCluster;
  query?: string;
  sort: SortKey;
  limit?: number;
}

/**
 * Canonical products currently on sale, aggregated across merchants in one
 * grouped query (one round trip; the planner uses the canonical index).
 */
export async function listProducts(filter: ProductFilter): Promise<ProductSummary[]> {
  const order =
    filter.sort === "price"
      ? sql`min_price ASC`
      : filter.sort === "stores"
        ? sql`stores DESC, best_deal DESC NULLS LAST`
        : sql`best_deal DESC NULLS LAST, stores DESC`;
  const rows = await sql`
    SELECT c.id, c.category, c.manufacturer, c.model,
           count(*)::int AS offers,
           count(DISTINCT l.merchant_id)::int AS stores,
           min(l.current_price)::float8 AS min_price,
           max(l.current_price)::float8 AS max_price,
           max(i.deal_score)::int AS best_deal,
           (array_agg(i.recommendation ORDER BY l.current_price))[1] AS cheapest_rec,
           coalesce(array_agg(DISTINCT i.demand_cluster)
                    FILTER (WHERE i.demand_cluster IS NOT NULL), '{}') AS clusters
    FROM canonical_products c
    JOIN merchant_listings l ON l.canonical_product_id = c.id
    LEFT JOIN listing_insights i ON i.listing_id = l.id
    WHERE ${ACTIVE}
      ${filter.category ? sql`AND c.category = ${filter.category}` : sql``}
      ${filter.query ? sql`AND (c.model ILIKE ${"%" + filter.query + "%"} OR l.title ILIKE ${"%" + filter.query + "%"})` : sql``}
    GROUP BY c.id
    ${filter.cluster ? sql`HAVING bool_or(i.demand_cluster = ${filter.cluster})` : sql``}
    ORDER BY ${order}
    LIMIT ${filter.limit ?? 60}
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    category: r.category as Category,
    manufacturer: r.manufacturer as string,
    model: r.model as string,
    offers: r.offers as number,
    stores: r.stores as number,
    minPrice: r.min_price as number,
    maxPrice: r.max_price as number,
    bestDeal: (r.best_deal as number | null) ?? null,
    cheapestRecommendation: (r.cheapest_rec as Recommendation | null) ?? null,
    clusters: r.clusters as DemandCluster[],
  }));
}

export async function getProduct(id: number): Promise<ProductDetail | null> {
  const [product] = await sql`
    SELECT id, category, manufacturer, model, specs FROM canonical_products WHERE id = ${id}
  `;
  if (!product) return null;
  const offers = await sql`
    SELECT l.id, m.slug, m.name, l.title, l.brand, l.url,
           l.current_price::float8 AS price, l.in_stock, l.stock_quantity,
           l.view_count, l.sold_count, l.last_scraped_at,
           i.fair_price::float8 AS fair_price, i.pct_vs_fair, i.deal_score,
           i.recommendation, i.recommendation_reason, i.demand_cluster, i.sales_per_day
    FROM merchant_listings l
    JOIN merchants m ON m.id = l.merchant_id
    LEFT JOIN listing_insights i ON i.listing_id = l.id
    WHERE l.canonical_product_id = ${id} AND ${ACTIVE}
    ORDER BY l.in_stock DESC, l.current_price ASC
  `;
  return {
    id: Number(product.id),
    category: product.category as Category,
    manufacturer: product.manufacturer as string,
    model: product.model as string,
    specs: product.specs as ProductDetail["specs"],
    offers: offers.map(
      (r): Offer => ({
        listingId: Number(r.id),
        merchant: r.slug as string,
        merchantName: r.name as string,
        title: r.title as string,
        brand: (r.brand as string | null) ?? null,
        url: r.url as string,
        price: r.price as number,
        inStock: r.in_stock as boolean,
        stockQuantity: (r.stock_quantity as number | null) ?? null,
        viewCount: r.view_count === null ? null : Number(r.view_count),
        soldCount: r.sold_count === null ? null : Number(r.sold_count),
        lastScrapedAt: (r.last_scraped_at as Date).toISOString(),
        fairPrice: (r.fair_price as number | null) ?? null,
        pctVsFair: (r.pct_vs_fair as number | null) ?? null,
        dealScore: (r.deal_score as number | null) ?? null,
        recommendation: (r.recommendation as Recommendation | null) ?? null,
        recommendationReason: (r.recommendation_reason as string | null) ?? null,
        demandCluster: (r.demand_cluster as DemandCluster | null) ?? null,
        salesPerDay: (r.sales_per_day as number | null) ?? null,
      }),
    ),
  };
}

/** Daily lowest price per merchant for one canonical product. */
export async function getPriceHistory(id: number): Promise<PricePoint[]> {
  const rows = await sql`
    SELECT m.slug, date_trunc('day', h.scraped_at) AS day, min(h.price)::float8 AS min_price
    FROM price_history h
    JOIN merchant_listings l ON l.id = h.listing_id
    JOIN merchants m ON m.id = l.merchant_id
    WHERE l.canonical_product_id = ${id} AND h.price IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 2
  `;
  return rows.map((r) => ({
    merchant: r.slug as string,
    day: (r.day as Date).toISOString(),
    minPrice: r.min_price as number,
  }));
}

export async function getMarketInsights(): Promise<MarketInsight[]> {
  const rows = await sql`SELECT category, kind, computed_at, payload FROM market_insights`;
  return rows.map((r) => ({
    category: r.category as MarketInsight["category"],
    kind: r.kind as string,
    computedAt: (r.computed_at as Date).toISOString(),
    payload: r.payload as Record<string, unknown>,
  }));
}

export async function getCoverage(): Promise<CoverageRow[]> {
  const rows = await sql`
    SELECT m.slug, m.name,
           count(DISTINCT l.id) FILTER (WHERE ${ACTIVE})::int AS listings,
           count(DISTINCT l.id) FILTER (WHERE ${ACTIVE} AND l.canonical_product_id IS NOT NULL)::int
               AS linked,
           count(h.*)::int AS history_rows,
           min(h.scraped_at) AS first_observation
    FROM merchants m
    LEFT JOIN merchant_listings l ON l.merchant_id = m.id
    LEFT JOIN price_history h ON h.listing_id = l.id
    GROUP BY m.id
    HAVING count(l.id) > 0
    ORDER BY listings DESC
  `;
  return rows.map((r) => ({
    merchant: r.slug as string,
    merchantName: r.name as string,
    listings: r.listings as number,
    linked: r.linked as number,
    historyRows: r.history_rows as number,
    firstObservation: r.first_observation ? (r.first_observation as Date).toISOString() : null,
  }));
}

export async function getLastUpdated(): Promise<string | null> {
  const [row] = await sql`SELECT max(finished_at) AS at FROM scrape_runs WHERE error IS NULL`;
  return row?.at ? (row.at as Date).toISOString() : null;
}
