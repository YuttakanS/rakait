import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "@/lib/db";
import type {
  Category,
  CoverageRow,
  DemandCluster,
  DemandDriver,
  DemandEvidence,
  MarketInsight,
  Offer,
  PricePoint,
  ProductDetail,
  ProductList,
  Recommendation,
  SortKey,
  SpecPoint,
} from "@/lib/types";

/**
 * Thumbnail URL read through to_jsonb so the query also runs against a
 * database where migration 0010 (image_url) has not been applied yet.
 */
const IMAGE = sql`to_jsonb(l) ->> 'image_url'`;

/** Listings scraped within this window count as currently on sale. */
const ACTIVE = sql`l.last_scraped_at > now() - interval '2 days' AND l.current_price IS NOT NULL`;

/**
 * A product model's demand group, over its active listings (needs `i` =
 * listing_insights). Model 2026.11-v8+ gives every listing of a model the same
 * label, so this is that label. Older runs labelled each listing; the most
 * common label stands for the model (ties: the first alphabetically), so the
 * card badge, the `?cluster=` filter, the product page and the /insights
 * counts still name one group per model. NULLs are ignored.
 */
const MODEL_CLUSTER = sql`mode() WITHIN GROUP (ORDER BY i.demand_cluster)`;

/**
 * The evidence behind that group (SPEC round 16): the model's views, sales
 * percentile, normalised price and deciding feature, as `pricewatch train`
 * stored them on every listing of the model (migration 0013). Aggregated
 * exactly like `MODEL_CLUSTER` (`mode()`, NULLs ignored), so the numbers
 * and the badge stand for the same majority of the model's listings even if
 * some rows disagree. Read from `ev.doc` = `to_jsonb(i)`, like `IMAGE`, so
 * the query also runs before the migration is applied: the keys are then
 * absent and every value is NULL (the page says the numbers are not there
 * yet). Needs `EVIDENCE_DOC` joined after `i`. Nothing is recomputed here.
 */
const MODEL_EVIDENCE = sql`
  mode() WITHIN GROUP (ORDER BY (ev.doc ->> 'model_views')::float8) AS model_views,
  mode() WITHIN GROUP (ORDER BY (ev.doc ->> 'model_sales_beats_pct')::float8) AS model_sales_beats_pct,
  mode() WITHIN GROUP (ORDER BY (ev.doc ->> 'model_normalized_price')::float8) AS model_normalized_price,
  mode() WITHIN GROUP (ORDER BY ev.doc ->> 'demand_driver') AS demand_driver`;

/**
 * `to_jsonb(i)` built once per listing row for `MODEL_EVIDENCE`. OFFSET 0
 * keeps the planner from inlining the subquery, which would rebuild the
 * document for each of the four keys.
 */
const EVIDENCE_DOC = sql`LEFT JOIN LATERAL (SELECT to_jsonb(i) AS doc OFFSET 0) ev ON true`;

const DRIVERS: readonly DemandDriver[] = ["views", "sales", "price"];

/** `MODEL_EVIDENCE` columns of one row as a `DemandEvidence` (NULL stays null). */
function evidenceOf(r: Record<string, unknown>): DemandEvidence {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    views: num(r.model_views),
    salesBeatsPct: num(r.model_sales_beats_pct),
    normalizedPrice: num(r.model_normalized_price),
    driver: DRIVERS.find((d) => d === r.demand_driver) ?? null,
  };
}

/**
 * Days of price_history behind `max_seen_price`: the pipeline's
 * DEMAND_WINDOW_DAYS. Exported so the hero's "สูงสุดที่เคยเห็นใน N วัน"
 * quotes the same window the query uses.
 */
export const SEEN_WINDOW_DAYS = 120;
const SEEN_WINDOW = sql`make_interval(days => ${SEEN_WINDOW_DAYS})`;

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
 *
 * The card describes one offer: the cheapest in-stock one (price, Deal
 * Score, fair-price delta and recommendation all from it, so they never
 * contradict each other). A sold-out listing keeps its last price, often
 * months stale (a sold-out RTX 5060 Ti 16GB still read ฿16,490 against
 * ฿27,000+ in stock), so it only headlines a model sold out everywhere. The
 * demand group is the model's (`MODEL_CLUSTER`), the same value the
 * `?cluster=` filter selects on, so every filtered card carries that group.
 *
 * `total` counts every matching model before the LIMIT (a window over the
 * grouped rows, same query), so "พบ X รุ่น" and the /insights tiles agree.
 *
 * `max_seen_price` is the highest price any listing of the model (every
 * store, sold out or not) recorded in price_history over the last 120 days:
 * a correlated scalar subquery on (canonical_product_id) then the
 * (listing_id, scraped_at) primary key. It is not a sort key, so the planner
 * evaluates it after the top-N sort, once per returned row (≤ LIMIT, ~4 ms
 * for 60 rows on the live catalogue), still in this one statement.
 */
export async function listProducts(filter: ProductFilter): Promise<ProductList> {
  // Buyable first under every sort: a model sold out everywhere carries only
  // stale last prices, so its "deal" cannot be acted on. (An output alias
  // cannot appear inside an ORDER BY expression, hence the aggregate.)
  const buyable = sql`bool_or(l.in_stock) DESC`;
  const order =
    filter.sort === "price"
      ? sql`${buyable}, min_price ASC`
      : filter.sort === "stores"
        ? sql`${buyable}, in_stock_stores DESC, best_deal DESC NULLS LAST`
        : sql`${buyable}, best_deal DESC NULLS LAST, in_stock_stores DESC`;
  const rows = await sql`
    SELECT c.id, c.category, c.manufacturer, c.model,
           count(*)::int AS offers,
           count(DISTINCT l.merchant_id)::int AS stores,
           count(DISTINCT l.merchant_id) FILTER (WHERE l.in_stock)::int AS in_stock_stores,
           count(*) FILTER (WHERE l.in_stock)::int AS in_stock_offers,
           coalesce(min(l.current_price) FILTER (WHERE l.in_stock), min(l.current_price))::float8
               AS min_price,
           coalesce(max(l.current_price) FILTER (WHERE l.in_stock), max(l.current_price))::float8
               AS max_price,
           (array_agg(i.deal_score ORDER BY l.in_stock DESC, l.current_price))[1]::int AS best_deal,
           (array_agg(i.recommendation ORDER BY l.in_stock DESC, l.current_price))[1] AS cheapest_rec,
           (array_agg(i.recommendation_reason ORDER BY l.in_stock DESC, l.current_price))[1]
               AS cheapest_reason,
           ${MODEL_CLUSTER} AS model_cluster,
           ${MODEL_EVIDENCE},
           (array_agg(i.pct_vs_fair ORDER BY l.in_stock DESC, l.current_price))[1] AS best_pct,
           (array_agg(i.fair_price ORDER BY l.in_stock DESC, l.current_price))[1]::float8 AS fair_price,
           (array_agg(i.fair_error_pct ORDER BY l.in_stock DESC, l.current_price))[1] AS fair_error_pct,
           coalesce((array_agg(i.fair_uncertain ORDER BY l.in_stock DESC, l.current_price))[1], false)
               AS fair_uncertain,
           (SELECT max(h.price)
              FROM merchant_listings hl
              JOIN price_history h ON h.listing_id = hl.id
             WHERE hl.canonical_product_id = c.id
               AND h.scraped_at > now() - ${SEEN_WINDOW})::float8
               AS max_seen_price,
           count(*) OVER ()::int AS total,
           (array_agg(${IMAGE} ORDER BY l.in_stock DESC, l.current_price)
                FILTER (WHERE ${IMAGE} IS NOT NULL))[1] AS image_url
    FROM canonical_products c
    JOIN merchant_listings l ON l.canonical_product_id = c.id
    LEFT JOIN listing_insights i ON i.listing_id = l.id
    ${EVIDENCE_DOC}
    WHERE ${ACTIVE}
      ${filter.category ? sql`AND c.category = ${filter.category}` : sql``}
      ${filter.query ? sql`AND (c.model ILIKE ${"%" + filter.query + "%"} OR l.title ILIKE ${"%" + filter.query + "%"})` : sql``}
    GROUP BY c.id
    ${filter.cluster ? sql`HAVING ${MODEL_CLUSTER} = ${filter.cluster}` : sql``}
    ORDER BY ${order}
    LIMIT ${filter.limit ?? 60}
  `;
  const products = rows.map((r) => ({
    id: Number(r.id),
    category: r.category as Category,
    manufacturer: r.manufacturer as string,
    model: r.model as string,
    offers: r.offers as number,
    stores: r.stores as number,
    inStockStores: r.in_stock_stores as number,
    inStockOffers: r.in_stock_offers as number,
    minPrice: r.min_price as number,
    maxPrice: r.max_price as number,
    bestDeal: (r.best_deal as number | null) ?? null,
    cheapestRecommendation: (r.cheapest_rec as Recommendation | null) ?? null,
    cheapestReason: (r.cheapest_reason as string | null) ?? null,
    modelCluster: (r.model_cluster as DemandCluster | null) ?? null,
    demand: evidenceOf(r),
    bestPctVsFair: (r.best_pct as number | null) ?? null,
    fairPrice: (r.fair_price as number | null) ?? null,
    fairErrorPct: (r.fair_error_pct as number | null) ?? null,
    fairUncertain: r.fair_uncertain as boolean,
    maxSeenPrice: (r.max_seen_price as number | null) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
  }));
  return { products, total: rows.length ? (rows[0].total as number) : 0 };
}

/**
 * Models per demand group, counted exactly as the product list counts them
 * (canonical products with an active listing, `MODEL_CLUSTER`), so an
 * /insights tile and "พบ X รุ่น" on `/?cluster=…` show the same number.
 * One grouped scan of the active listings.
 */
export async function countModelsByCluster(): Promise<Partial<Record<DemandCluster, number>>> {
  const rows = await sql`
    SELECT cluster, count(*)::int AS models
    FROM (
      SELECT ${MODEL_CLUSTER} AS cluster
      FROM canonical_products c
      JOIN merchant_listings l ON l.canonical_product_id = c.id
      LEFT JOIN listing_insights i ON i.listing_id = l.id
      WHERE ${ACTIVE}
      GROUP BY c.id
    ) AS per_model
    WHERE cluster IS NOT NULL
    GROUP BY cluster
  `;
  return Object.fromEntries(rows.map((r) => [r.cluster as DemandCluster, r.models as number]));
}

export async function getProduct(id: number): Promise<ProductDetail | null> {
  const [product] = await sql`
    SELECT c.id, c.category, c.manufacturer, c.model, c.specs,
           d.demand_cluster, d.model_views, d.model_sales_beats_pct,
           d.model_normalized_price, d.demand_driver
    FROM canonical_products c
    LEFT JOIN LATERAL (
      SELECT ${MODEL_CLUSTER} AS demand_cluster, ${MODEL_EVIDENCE}
      FROM merchant_listings l
      LEFT JOIN listing_insights i ON i.listing_id = l.id
      ${EVIDENCE_DOC}
      WHERE l.canonical_product_id = c.id AND ${ACTIVE}
    ) d ON true
    WHERE c.id = ${id}
  `;
  if (!product) return null;
  const offers = await sql`
    SELECT l.id, m.slug, m.name, l.title, l.brand, l.url,
           l.current_price::float8 AS price, l.in_stock, l.stock_quantity,
           l.view_count, l.sold_count, l.last_scraped_at,
           i.fair_price::float8 AS fair_price, i.pct_vs_fair, i.deal_score,
           i.fair_error_pct, coalesce(i.fair_uncertain, false) AS fair_uncertain,
           i.recommendation, i.recommendation_reason, i.sales_per_day,
           ${IMAGE} AS image_url
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
    demandCluster: (product.demand_cluster as DemandCluster | null) ?? null,
    demand: evidenceOf(product),
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
        fairErrorPct: (r.fair_error_pct as number | null) ?? null,
        fairUncertain: r.fair_uncertain as boolean,
        recommendation: (r.recommendation as Recommendation | null) ?? null,
        recommendationReason: (r.recommendation_reason as string | null) ?? null,
        salesPerDay: (r.sales_per_day as number | null) ?? null,
        imageUrl: (r.image_url as string | null) ?? null,
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

/**
 * Spec value vs price for every active, linked listing: the points behind the
 * simple-regression charts. Feature per category mirrors SLR_FEATURES in
 * ml/train.py. One query; at most a few thousand rows.
 */
export async function getSpecPoints(): Promise<SpecPoint[]> {
  const rows = await sql`
    SELECT c.id::int AS id, c.category, c.model, l.current_price::float8 AS price,
           (CASE c.category
              WHEN 'gpu' THEN c.specs ->> 'vram_gb'
              WHEN 'cpu' THEN c.specs ->> 'cores'
              ELSE c.specs ->> 'capacity_gb'
            END)::float8 AS x
    FROM merchant_listings l
    JOIN canonical_products c ON c.id = l.canonical_product_id
    WHERE ${ACTIVE}
  `;
  return rows
    .filter((r) => r.x !== null)
    .map((r) => ({
      id: r.id as number,
      category: r.category as Category,
      model: r.model as string,
      price: r.price as number,
      x: r.x as number,
    }));
}

/**
 * The parts of the K-Means payload the product list and product pages quote
 * (group medians, the best-seller views split and the overall medians):
 * `lib/demand.ts` turns them into a `DemandReference`. The
 * scatter points and centroids stay in the database. Cached for the page
 * revalidation window, so the dynamic product list does not add a database
 * round trip per request; null before the first training run.
 */
export const getDemandPayload = unstable_cache(
  async (): Promise<Record<string, unknown> | null> => {
    const [row] = await sql`
      SELECT jsonb_build_object(
               'segments', payload -> 'segments',
               'split_views', payload -> 'split_views',
               'reference', payload -> 'reference') AS payload
      FROM market_insights
      WHERE category = 'all' AND kind = 'demand_kmeans'
    `;
    return (row?.payload as Record<string, unknown> | undefined) ?? null;
  },
  ["demand-kmeans-reference"],
  { revalidate: 900 },
);

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
