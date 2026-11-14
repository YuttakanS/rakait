import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { RecommendationBadge } from "@/components/badges";
import { CategoryTabs } from "@/components/category-tabs";
import { EffectBars, type Effect } from "@/components/effect-bars";
import {
  DemandScatter,
  DendrogramChart,
  FitScatter,
  LineKey,
  LinkageCurve,
  MarkerSwatch,
  ResidualHistogram,
  UncertainKey,
} from "@/components/ml-charts";
import { SpecScatter } from "@/components/spec-scatter";
import { TreeDiagram } from "@/components/tree-diagram";
import {
  CATEGORY_LABELS,
  CLUSTER_LABELS,
  RECOMMENDATION_LABELS,
  featureLabel,
  formatDateTime,
  formatTHB,
  workstationNote,
} from "@/lib/format";
import {
  demandPoints,
  dendrogram,
  fitExample,
  fitPoints,
  fitUncertain,
  leaves,
  minorityLeaf,
  marketCheck,
  mlrInputs,
  workstationExcluded,
  workstationProductIds,
  pathTo,
  priceLeafText,
  residualBins,
  siblingExampleText,
  siblingInversions,
  silhouetteByK,
  treeFeatures,
  treeNodes,
  treeOutline,
  translateRules,
  type ClassValue,
  type CurvePoint,
  type TreeNode,
} from "@/lib/ml";
import { FORMULAS, formulaUnits } from "@/lib/formula";
import { countText, demandReference, emptyGroupReason, labelRuleText, nicheRuleText, unlabelledText } from "@/lib/demand";
import { countModelsByCluster, getCoverage, getMarketInsights, getSpecPoints } from "@/lib/queries";
import type { Category, DemandCluster, MarketInsight, Recommendation } from "@/lib/types";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "เบื้องหลัง ML – RakaIT",
  description: "โมเดล Machine Learning ทุกตัวที่ใช้คิดราคายุติธรรม Deal Score กลุ่มความต้องการ และป้ายซื้อเลย / รอก่อน พร้อมกราฟจากข้อมูลจริง",
};

type Payload = Record<string, unknown>;
type Coefficient = Effect & { beta: number };
type Diagnostics = {
  max_vif: number;
  skew: number;
  excess_kurtosis: number;
  jarque_bera_p: number;
  breusch_pagan_p: number;
};
type CategoryLinkage = {
  listings: number;
  rule_linked: number;
  excluded: number;
  products: number;
  similarity_linked?: number;
  evaluation?: { threshold: number | null; curve: CurvePoint[] };
};
type Centroid = {
  label: string;
  size: number;
  views: number;
  log_views?: number;
  sales_rank_pct?: number;
  normalized_price?: number;
  /** Standardised coordinates (the space K-Means measured distances in). */
  views_z?: number;
  sales_z?: number;
  price_z?: number;
};

/** The clustered dimensions, in `models.DEMAND_DIMENSIONS` order, as the K-Means note names them. */
const DIMENSION_NAMES = {
  views: "ยอดเข้าชม",
  sales: "อันดับยอดขายในร้าน",
  price: "ราคาเทียบราคาปกติของรุ่น",
} as const;
type Dimension = keyof typeof DIMENSION_NAMES;
const DIMENSIONS = Object.keys(DIMENSION_NAMES) as Dimension[];

/** A z value as its direction from the all-model mean: "สูงกว่าค่าเฉลี่ย 0.13 SD". */
const zWords = (v: number): string => `${v < 0 ? "ต่ำกว่า" : "สูงกว่า"}ค่าเฉลี่ย ${Math.abs(v).toFixed(2)} SD`;

/** A centroid's value on one dimension, in that dimension's own unit. */
function dimensionValue(c: Centroid, d: Dimension): string {
  if (d === "views") return `${countText(c.views)} ครั้ง`;
  if (d === "sales") return Number.isFinite(num(c.sales_rank_pct)) ? `${Math.round(num(c.sales_rank_pct) * 100)}%` : "–";
  if (!Number.isFinite(num(c.normalized_price))) return "–";
  const gap = Math.round((num(c.normalized_price) - 1) * 100);
  return gap === 0 ? "เท่าราคาปกติ" : `${gap > 0 ? "แพงกว่า" : "ถูกกว่า"}ราคาปกติ ${Math.abs(gap)}%`;
}

type NumberedCentroid = Centroid & { index: number };
type Coordinates = [number, number, number];

/** A centroid's standardised coordinates in `DIMENSIONS` order, or null for payloads without them. */
const zOf = (c: Centroid): Coordinates | null =>
  [c.views_z, c.sales_z, c.price_z].every((v) => Number.isFinite(num(v))) ? [num(c.views_z), num(c.sales_z), num(c.price_z)] : null;

/**
 * K-Means centroids whose name reads against where they sit on the
 * views x sales chart (SPEC round 18): the remainder group ("ยอดขายไม่เด่น",
 * a sales claim only) above the all-model average on sales, or "คนดูเยอะ แต่ขายน้อย" at or below
 * average views or above average sales. For each, the dimension that most
 * separates it from the nearest other centroid (largest |Δz| in the
 * standardised space K-Means measured), from the payload's
 * `views_z / sales_z / price_z`; no number is written into the copy.
 * O(k² · dimensions).
 */
function offChartCentroids(centroids: NumberedCentroid[]) {
  return centroids.flatMap((c) => {
    const z = zOf(c);
    if (z === null) return [];
    const above = DIMENSIONS.filter((d, i) => (c.label === "niche" ? d === "sales" : d !== "price") && z[i] > 0);
    const off = c.label === "niche" ? above.length > 0 : c.label === "overpriced_hype" ? z[0] <= 0 || z[1] > 0 : false;
    if (!off) return [];
    let nearest: { other: NumberedCentroid; d2: number; otherZ: Coordinates } | null = null;
    for (const o of centroids) {
      const oz = zOf(o);
      if (o === c || oz === null) continue;
      const d2 = oz.reduce((sum, v, i) => sum + (v - z[i]) ** 2, 0);
      if (nearest === null || d2 < nearest.d2) nearest = { other: o, d2, otherZ: oz };
    }
    if (nearest === null) return [];
    const { other, otherZ } = nearest;
    const gaps = z.map((v, i) => Math.abs(v - otherZ[i]));
    const split = gaps.indexOf(Math.max(...gaps));
    return [{ c, z, above, other, otherZ, split }];
  });
}

/** SLR axis per category (the spec getSpecPoints reads, as train.SLR_FEATURES). */
const AXIS: Record<Category, { name: string; unit: string }> = {
  gpu: { name: "VRAM", unit: "GB" },
  cpu: { name: "จำนวนคอร์", unit: "คอร์" },
  ram: { name: "ความจุ", unit: "GB" },
  ssd: { name: "ความจุ", unit: "GB" },
};

const SECTIONS = [
  { id: "data", label: "ข้อมูลที่ใช้" },
  { id: "slr", label: "Simple Linear Regression" },
  { id: "mlr", label: "Multiple Linear Regression" },
  { id: "tier-tree", label: "Regression Tree" },
  { id: "kmeans", label: "K-Means" },
  { id: "ward", label: "Hierarchical (Ward)" },
  { id: "timing-tree", label: "Decision Tree" },
  { id: "linkage", label: "การจับคู่สินค้า" },
] as const;

const DEMAND_ORDER: DemandCluster[] = ["hidden_gem", "community_favorite", "overpriced_hype", "niche"];

/** K-Means cluster names (`models.name_segments`); best sellers are split by views afterwards. */
const CLUSTER_NAMES: Record<string, string> = {
  best_sellers: "ขายดี (แยกต่อด้วยยอดเข้าชม)",
  overpriced_hype: CLUSTER_LABELS.overpriced_hype.label,
  niche: CLUSTER_LABELS.niche.label,
};

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);
const fixed = (v: unknown, d = 2): string => (Number.isFinite(num(v)) ? num(v).toFixed(d) : "–");
const pct = (v: unknown, d = 0): string => (Number.isFinite(num(v)) ? `${(num(v) * 100).toFixed(d)}%` : "–");
const pValue = (v: unknown): string => (!Number.isFinite(num(v)) ? "–" : num(v) < 0.001 ? "< 0.001" : fixed(v, 3));
/** A finite number from a payload, else null (keys absent from older models). */
const opt = (v: unknown): number | null => (Number.isFinite(num(v)) ? num(v) : null);
/** Thai-formatted number with separators and a real minus sign (β tables). */
const signed = (v: unknown, d: number): string =>
  Number.isFinite(num(v))
    ? `${num(v) < 0 ? "−" : ""}${Math.abs(num(v)).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: d })}`
    : "–";
const thb1 = (v: unknown): string => signed(v, 1);
const thb0 = (v: unknown): string => signed(v, 0);
const count = (v: unknown): string => (Number.isFinite(num(v)) ? num(v).toLocaleString("th-TH") : "–");

function find(insights: MarketInsight[], category: string, kind: string): Payload | undefined {
  return insights.find((i) => i.category === category && i.kind === kind)?.payload;
}

/** THB with a real minus sign before the baht sign: −฿21,426, never ฿-21,426. */
const signedTHB = (v: number): string => (v < 0 ? `−${formatTHB(-v)}` : formatTHB(v));

/**
 * A formula or definition, in mono on a sunken block. It wraps (at spaces,
 * "·" included) instead of scrolling, so a phone shows the whole of it.
 */
function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="tabular border-2 border-border bg-surface-muted px-3 py-2 text-sm break-words whitespace-normal">
      {/* Plain text breaks only between `formulaUnits` (each nowrap): Thai
          words never split ("ต่ำ|สุด") and short math runs stay whole;
          every character of the source is kept. */}
      {typeof children === "string"
        ? formulaUnits(children).map((unit, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">{unit}</span>
            </Fragment>
          ))
        : children}
    </p>
  );
}

/** A table wider than a phone: scrolls inside itself, with a visible cue below md. */
function ScrollTable({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto">{children}</div>
      <p className="text-xs text-subtle md:hidden" aria-hidden>
        เลื่อนตารางไปทางขวาได้ →
      </p>
    </div>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="display text-lg">{title}</h3>
      <div className="max-w-3xl space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/** One method: (ก) what it does, (ข) live chart, (ค) how to read it, (ง) what the result says. */
function Method({
  id,
  index,
  title,
  subtitle,
  what,
  chart,
  read,
  result,
}: {
  id: string;
  index: number;
  title: string;
  subtitle: string;
  what: ReactNode;
  chart: ReactNode;
  read: ReactNode;
  result: ReactNode;
}) {
  return (
    // lg+: the header is sticky (~141 px), so anchors stop 160 px below the top.
    <section id={id} className="scroll-mt-20 space-y-6 border-t-[3px] border-border pt-8 lg:scroll-mt-40">
      <div>
        <p className="tabular text-xs text-muted">วิธีที่ {index}</p>
        <h2 className="display text-2xl sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      <Part title="วิธีนี้ทำอะไร">{what}</Part>
      <div className="card min-w-0 space-y-3 p-4 sm:p-5">
        <h3 className="display text-lg">กราฟจากข้อมูลล่าสุด</h3>
        {chart}
      </div>
      <Part title="อ่านกราฟนี้อย่างไร">{read}</Part>
      <Part title="ผลที่ได้บอกอะไร">{result}</Part>
    </section>
  );
}

/** Shown where a chart needs data the current payload does not have yet. */
function NotYet({ what }: { what: string }) {
  return (
    <p className="border-2 border-border bg-surface-muted p-4 text-sm text-muted">
      ยังไม่มีข้อมูล {what} ในผลการ train รอบนี้ กราฟจะขึ้นหลังระบบ train รอบถัดไป
    </p>
  );
}

/** Legacy text rules of payloads before 2026.11-v13, with Thai feature names. */
function RulesText({ rules }: { rules: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto border-2 border-border bg-surface-muted p-3 text-xs leading-relaxed text-muted">
      {typeof rules === "string" ? translateRules(rules) : "–"}
    </pre>
  );
}

/** How to read the legacy text rules (shown instead of the box-and-line text). */
const RULES_READ =
  "ตอนนี้ต้นไม้แสดงเป็นข้อความ: อ่านจากบนลงล่าง ทุกบรรทัดที่เยื้องเข้าไปคือคำถามถัดไป บรรทัดคู่ที่เยื้องเท่ากันคือสองคำตอบของคำถามเดียวกัน (≤ กับ >) และบรรทัดสุดท้ายของแต่ละกิ่งคือผลของกลุ่มนั้น";

const classLeafText = (n: TreeNode): string => {
  const v = n.value as ClassValue;
  const counts = Object.entries(v.counts)
    .map(([k, c]) => `${RECOMMENDATION_LABELS[k as Recommendation] ?? k} ${c}`)
    .join(", ");
  return `แนะนำ ${RECOMMENDATION_LABELS[v.winner as Recommendation] ?? v.winner} [${counts}]`;
};

/** The leaf most rows reach: the worked example under a tree. */
const biggestLeaf = (nodes: TreeNode[]): TreeNode => leaves(nodes).reduce((a, b) => (b.n > a.n ? b : a));

export default async function MlPage() {
  // Live counts per group, the same query as the home page chips' list and
  // the /insights tiles, so /ml can quote the numbers those pages show.
  const [insights, coverage, specPoints, liveCounts] = await Promise.all([
    getMarketInsights(),
    getCoverage(),
    getSpecPoints(),
    countModelsByCluster(),
  ]);
  const categories = Object.keys(CATEGORY_LABELS) as Category[];
  const computedAt = insights.find((i) => i.kind !== "linkage_quality")?.computedAt ?? null;
  const kmeans = find(insights, "all", "demand_kmeans");
  const ward = find(insights, "all", "demand_hierarchical");
  const timing = find(insights, "all", "timing_tree");
  const linkage = find(insights, "all", "linkage_quality") as Record<string, CategoryLinkage> | undefined;

  // ---- A. Simple linear regression
  const slr = categories.flatMap((c) => {
    const p = find(insights, c, "simple_regression");
    // Only the points the line was fitted on (v20 leaves workstation CPUs out).
    const left = workstationProductIds(p);
    return p ? [{ c, p, points: specPoints.filter((q) => q.category === c && !left.has(q.id)) }] : [];
  });
  const slrExample = (() => {
    const first = slr.find((s) => s.points.length > 0);
    if (!first) return null;
    const sorted = [...first.points].sort((a, b) => a.price - b.price);
    const point = sorted[sorted.length >> 1];
    const predicted = num(first.p.intercept_thb) + num(first.p.slope_thb_per_unit) * point.x;
    return { ...first, point, predicted };
  })();
  const weakestSlr = slr.reduce<(typeof slr)[number] | null>((a, b) => (a === null || num(b.p.r2) < num(a.p.r2) ? b : a), null);

  // ---- B. Multiple linear regression
  const mlr = categories.flatMap((c) => {
    const p = find(insights, c, "fair_value_mlr");
    if (!p) return [];
    const features = ((p.coefficients as Coefficient[] | undefined) ?? []).map((k) => String(k.feature));
    return [{ c, p, points: fitPoints(p), bins: residualBins(p), inputs: mlrInputs(c, features) }];
  });
  // Categories whose fit uses demand signals, from the payloads (none for CPU since v18).
  const demandFits = mlr.filter((m) => m.inputs.demand.length > 0);
  const demandLabels = [...new Set(demandFits.flatMap((m) => m.inputs.demand))];
  // Gap beyond which a fair price is flagged uncertain (train.UNCERTAIN_GAP, one value for every category).
  const uncertainGap = mlr.map((m) => opt(m.p.uncertain_gap)).find((v) => v !== null) ?? null;
  const gapPct = uncertainGap === null ? null : Math.round(uncertainGap * 100);
  const binWidth = (() => {
    const b = mlr.find((m) => m.bins)?.bins;
    return b ? Math.round((b.edges[1] - b.edges[0]) * 100) : null;
  })();
  // Sibling-inversion margin (train.SIBLING_TOLERANCE, 2026.11-v17+); null hides the rule.
  const siblingTolerance = mlr.map((m) => siblingInversions(m.p)?.tolerance ?? null).find((v) => v !== null) ?? null;
  // Market check (train.MARKET_GAP, 2026.11-v20+); null hides the rule.
  const marketGap = mlr.map((m) => marketCheck(m.p)?.gap ?? null).find((v) => v !== null) ?? null;
  const cvFolds = mlr.map((m) => opt(m.p.cv_folds)).find((v) => v !== null) ?? null;
  const intervalLevel = mlr.map((m) => opt(m.p.interval_level)).find((v) => v !== null) ?? null;
  const intervalPct = intervalLevel === null ? null : Math.round(intervalLevel * 100);
  const mlrExample = (() => {
    const first = mlr.find((m) => m.points.length > 0);
    if (!first) return null;
    // Never a listing flagged uncertain (wide gap or sibling inversion).
    const point = fitExample(first.points, uncertainGap);
    return point === null ? null : { c: first.c, point, gap: point[0] / point[1] - 1 };
  })();

  // ---- C. Regression tree
  const tier = categories.flatMap((c) => {
    const p = find(insights, c, "tier_tree");
    return p ? [{ c, p, nodes: treeNodes(p) }] : [];
  });
  const tierExample = (() => {
    const first = tier.find((t) => t.nodes !== null);
    if (!first?.nodes) return null;
    const leaf = biggestLeaf(first.nodes);
    return { c: first.c, leaf, path: pathTo(first.nodes, leaf.id) };
  })();
  const maxDepth = [...tier.map((t) => opt(t.p.max_depth)), opt(timing?.max_depth)].find((v) => v !== null) ?? null;

  // ---- D. K-Means
  const rankedSales = kmeans?.sales_feature === "store_rank_pct";
  // Which grouped models keep a badge on the site (2026.11-v15+): the rule is
  // evaluated in the pipeline (models.label_fit); here only its stored
  // thresholds and counts are quoted.
  const demandRef = demandReference(kmeans ?? null);
  const labelRules = (["hidden_gem", "community_favorite", "overpriced_hype"] as const).flatMap((c) => {
    const rule = labelRuleText(c, demandRef);
    return rule === null ? [] : [{ c, rule }];
  });
  const unlabelledByLabel = Object.entries(
    ((kmeans?.unlabelled as { by_label?: Record<string, unknown> } | undefined)?.by_label ?? {}) as Record<string, unknown>,
  ).filter((entry): entry is [DemandCluster, number] => entry[0] in CLUSTER_LABELS && typeof entry[1] === "number");
  const points = demandPoints(kmeans);
  const centroids = ((kmeans?.centroids as Centroid[] | undefined) ?? []).map((c, i) => ({
    ...c,
    index: i + 1,
    x: Number.isFinite(num(c.log_views)) ? num(c.log_views) : Math.log1p(num(c.views)),
    y: num(c.sales_rank_pct),
  }));
  const plotCentroids = centroids.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y));
  const silhouettes = silhouetteByK(kmeans);
  const bestSilhouette = Math.max(...silhouettes.map((s) => s.score), 0.01);
  const splitViews = num(kmeans?.split_views);
  // Per group: K-Means' members (payload `segments[].size`, else the drawn
  // points), those whose label fits (`labelled`, v15+) and those listed on
  // the site now (live, like the home page and /insights). O(points).
  const segmentSizes = DEMAND_ORDER.map((label) => {
    const drawn = points.filter((p) => p[2] === label).length;
    const g = demandRef.groups[label];
    return { label, drawn, size: g?.size ?? drawn, labelled: g?.labelled ?? null, live: liveCounts[label] ?? 0 };
  });
  // 2026.11-v16 points carry whether the model's label is shown (4th value).
  const fitKnown = points.some((p) => typeof p[3] === "boolean");
  const unfitDrawn = points.filter((p) => p[3] === false).length;
  const exampleCentroid = plotCentroids.reduce<(typeof plotCentroids)[number] | null>(
    (a, b) => (a === null || b.size > a.size ? b : a),
    null,
  );
  // Both read the sales axis as a within-store rank (2026.11-v9+); older
  // log-sales payloads get neither.
  const offCentroids = rankedSales ? offChartCentroids(centroids) : [];
  // Horizontal bands of dots: many models on one sales rank (average ranks
  // give every tie, e.g. every model a store saw no sales of, the same
  // value). Ranks held by at least 5% of the plotted models (and 5), at most two. O(points).
  const salesBands = (() => {
    if (!rankedSales) return [];
    const byRank = new Map<string, number>();
    for (const p of points) byRank.set(p[1].toFixed(3), (byRank.get(p[1].toFixed(3)) ?? 0) + 1);
    return [...byRank.entries()]
      .filter(([, n]) => n >= Math.max(5, points.length * 0.05))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([y, n]) => ({ y: Number(y), n }));
  })();
  const viewsMedian = opt((kmeans?.reference as Payload | undefined)?.views_median);

  // ---- E. Ward
  const dendro = dendrogram(ward);

  // ---- F. Timing tree
  const timingNodes = treeNodes(timing);
  const treeInUse = timing?.used_for_recommendations === true;
  const timingClasses = (timing?.classes as string[] | undefined) ?? [];
  const confusion = (timing?.confusion as number[][] | undefined) ?? [];
  const timingExample = timingNodes ? { leaf: biggestLeaf(timingNodes), nodes: timingNodes } : null;
  // Only the features the fitted tree splits on are explained (SPEC round 18).
  const timingFeatures = timingNodes ? treeFeatures(timingNodes) : [];
  const timingMinority = timingNodes ? minorityLeaf(timingNodes) : null;
  const recommendationName = (c: string): string => RECOMMENDATION_LABELS[c as Recommendation] ?? c;
  // Labelling settings and the usefulness bar, stored from 2026.11-v13 (absent: no number shown).
  const horizonDays = opt(timing?.horizon_days);
  const dropPct = opt(timing?.drop_pct) === null ? null : Math.round(num(timing?.drop_pct) * 1000) / 10;
  const testPct = opt(timing?.test_fraction) === null ? null : Math.round(num(timing?.test_fraction) * 100);
  const barPct = opt(timing?.min_balanced_accuracy) === null ? null : Math.round(num(timing?.min_balanced_accuracy) * 100);
  const stockPct = opt(timing?.stock_share) === null ? null : Math.round(num(timing?.stock_share) * 100);
  // "Below the bar" only when the payload says what the bar is and the score is under it.
  const belowBar =
    opt(timing?.min_balanced_accuracy) !== null &&
    opt(timing?.balanced_accuracy_test) !== null &&
    num(timing?.balanced_accuracy_test) < num(timing?.min_balanced_accuracy);

  // ---- G. Record linkage
  const linkageRows = categories.flatMap((c) => {
    const l = linkage?.[c];
    if (!l) return [];
    const t = l.evaluation?.threshold ?? null;
    const curve = l.evaluation?.curve ?? [];
    return [{ c, l, t, curve, chosen: curve.find((p) => p.threshold === t) }];
  });
  const linkageExample = linkageRows.find((r) => r.chosen);

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="display text-4xl sm:text-5xl">เบื้องหลัง ML</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            โมเดล Machine Learning ทุกตัวที่อยู่เบื้องหลังราคายุติธรรม Deal Score กลุ่มความต้องการ และป้ายซื้อเลย / รอก่อน
            แต่ละหัวข้อบอกว่าวิธีนั้นทำอะไร แสดงกราฟจากข้อมูลจริงล่าสุด วิธีอ่านกราฟ และผลที่ได้ · ตัวเลขทุกตัวมาจากการ train
            ล่าสุด {formatDateTime(computedAt)}
          </p>
        </div>
        <nav aria-label="ไปที่หัวข้อ" className="flex flex-wrap gap-2">
          {SECTIONS.map((x) => (
            <a
              key={x.id}
              href={`#${x.id}`}
              className="inline-flex min-h-11 items-center border-2 border-border bg-surface px-3 text-sm font-medium hover:bg-foreground hover:text-background"
            >
              {x.label}
            </a>
          ))}
        </nav>
        <p className="text-xs text-muted">
          สรุปสำหรับผู้ซื้ออยู่ที่{" "}
          <Link href="/insights" className="link">
            ภาพรวมตลาด
          </Link>
        </p>
      </section>

      <section id="data" className="scroll-mt-20 space-y-4 lg:scroll-mt-40">
        <h2 className="display text-2xl sm:text-3xl">ข้อมูลที่ใช้</h2>
        <p className="max-w-3xl text-sm leading-relaxed">
          ระบบเก็บราคาจากหน้าเว็บของแต่ละร้านอัตโนมัติ แล้วจับคู่สินค้าแต่ละรายการเข้ากับรุ่นมาตรฐาน (หัวข้อสุดท้าย)
          ทุกโมเดลข้างล่างเรียนจากข้อมูลชุดนี้ · “รายการ” คือสินค้าหนึ่งชิ้นในร้านหนึ่ง ส่วน “รุ่น” คือรุ่นสินค้าที่อาจขายหลายร้าน
        </p>
        <div className="card min-w-0 p-4 sm:p-5">
          <ScrollTable>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 font-medium">ร้าน</th>
                <th className="py-1 text-right font-medium">สินค้าที่ขายอยู่</th>
                <th className="py-1 text-right font-medium">จับคู่รุ่นได้</th>
                <th className="py-1 text-right font-medium">จุดข้อมูลราคา</th>
                <th className="py-1 text-right font-medium">ข้อมูลเก่าสุด</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {coverage.map((c) => (
                <tr key={c.merchant} className="border-t-2 border-border">
                  <td className="py-1.5">{c.merchantName}</td>
                  <td className="py-1.5 text-right">{c.listings.toLocaleString("th-TH")}</td>
                  <td className="py-1.5 text-right">{c.listings ? `${Math.round((c.linked / c.listings) * 100)}%` : "–"}</td>
                  <td className="py-1.5 text-right">{c.historyRows.toLocaleString("th-TH")}</td>
                  <td className="py-1.5 text-right">{c.firstObservation?.slice(0, 10) ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </ScrollTable>
        </div>
      </section>

      {/* ------------------------------------------------ A. SLR */}
      <Method
        id="slr"
        index={1}
        title="Simple Linear Regression"
        subtitle="ราคาเพิ่มขึ้นเท่าไรต่อสเปกหนึ่งหน่วย"
        what={
          <>
            <p>
              ลากเส้นตรงหนึ่งเส้นผ่านกลุ่มจุด (ราคา, สเปกหลัก) ให้ใกล้ทุกจุดที่สุด โดยทำให้ผลรวมของระยะห่างยกกำลังสองน้อยที่สุด
              (Ordinary Least Squares หรือ OLS) ความชันของเส้นคือราคาที่เพิ่มขึ้นเมื่อสเปกเพิ่มหนึ่งหน่วย
            </p>
            <Formula>{FORMULAS.slr}</Formula>
            <p className="text-xs text-muted">
              ŷ = ราคาที่เส้นทำนาย, x = สเปก (เช่น GB), β₁ = ความชัน (บาทต่อหน่วย), β₀ = จุดตัดแกน (ราคาเมื่อ x = 0)
            </p>
          </>
        }
        chart={
          slr.length > 0 ? (
            <CategoryTabs
              label="เลือกหมวดของกราฟ Simple Linear Regression"
              panels={slr.map(({ c, p, points: pts }) => ({
                id: c,
                label: CATEGORY_LABELS[c],
                content: (
                  <div className="space-y-2">
                    <Formula>
                      ราคา = {signedTHB(Math.round(num(p.intercept_thb)))} {num(p.slope_thb_per_unit) < 0 ? "−" : "+"}{" "}
                      {formatTHB(Math.abs(Math.round(num(p.slope_thb_per_unit))))} ×{" "}
                      {AXIS[c].name} · R² = {fixed(p.r2)} · n = {count(p.n)}
                    </Formula>
                    <SpecScatter
                      points={pts}
                      slope={num(p.slope_thb_per_unit)}
                      intercept={num(p.intercept_thb)}
                      xLabel={AXIS[c].name}
                      xUnit={AXIS[c].unit}
                    />
                    {workstationExcluded(p) > 0 && <p className="text-xs text-muted">{workstationNote(workstationExcluded(p))}</p>}
                  </div>
                ),
              }))}
            />
          ) : (
            <NotYet what="Simple Linear Regression" />
          )
        }
        read={
          <>
            <p>
              แกนนอนคือสเปก แกนตั้งคือราคา สี่เหลี่ยมกลวงหนึ่งจุดคือสินค้าหนึ่งรายการที่ขายอยู่ตอนนี้ เส้นทึบหนาคือเส้นที่โมเดลลากได้
              จุดที่อยู่ใต้เส้นคือได้สเปกเท่ากันในราคาต่ำกว่าเส้น ส่วนจุดเหนือเส้นคือแพงกว่าที่เส้นคาด ชี้หรือแตะจุดเพื่อดูชื่อรุ่น
            </p>
            {slrExample && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง ({CATEGORY_LABELS[slrExample.c]}):</span>{" "}
                {slrExample.point.model} มี {AXIS[slrExample.c].name} {slrExample.point.x.toLocaleString("th-TH")}{" "}
                {AXIS[slrExample.c].unit} ราคา <span className="tabular">{formatTHB(slrExample.point.price)}</span> ส่วนเส้นทำนายไว้{" "}
                <span className="tabular">{formatTHB(Math.round(slrExample.predicted))}</span> จุดนี้จึงอยู่
                {slrExample.point.price < slrExample.predicted ? "ใต้" : "เหนือ"}เส้น{" "}
                <span className="tabular">{formatTHB(Math.round(Math.abs(slrExample.point.price - slrExample.predicted)))}</span>
              </p>
            )}
          </>
        }
        result={
          <>
            <p>
              R² (สัมประสิทธิ์การตัดสินใจ) บอกว่าเส้นอธิบายความต่างของราคาได้กี่ส่วน จาก 0 (อธิบายไม่ได้เลย) ถึง 1 (จุดอยู่บนเส้นพอดี)
            </p>
            <ul className="list-inside list-disc space-y-1">
              {slr.map(({ c, p }) => (
                <li key={c}>
                  {CATEGORY_LABELS[c]}: {AXIS[c].name} เพิ่ม 1 {AXIS[c].unit} ราคาเพิ่มเฉลี่ย{" "}
                  <span className="tabular font-semibold">{formatTHB(Math.round(num(p.slope_thb_per_unit)))}</span> · R²{" "}
                  <span className="tabular">{fixed(p.r2)}</span> (อธิบายได้ราว {pct(p.r2)})
                </li>
              ))}
            </ul>
            {weakestSlr && Number.isFinite(num(weakestSlr.p.r2)) && (
              <p>
                ข้อจำกัด: สเปกเดียวอธิบายราคาได้ไม่ครบ หมวดที่อธิบายได้น้อยที่สุดคือ {CATEGORY_LABELS[weakestSlr.c]} (R²{" "}
                <span className="tabular">{fixed(weakestSlr.p.r2)}</span>) เพราะราคายังขึ้นกับรุ่นชิป ปีที่ออก และแบรนด์
                ระบบจึงใช้ Multiple Linear Regression ในหัวข้อถัดไปเพื่อคิดราคายุติธรรม · เส้นมาจากการ train ล่าสุด
                ส่วนจุดคือราคาตอนนี้ จึงอาจต่างกันเล็กน้อย
              </p>
            )}
            <p>
              β₀ (จุดตัดแกน) มีไว้ให้เส้นวางพอดีกับช่วงข้อมูลที่มีเท่านั้น ไม่ใช่ราคาของสินค้าที่สเปกเป็น 0 จึงติดลบได้
              และไม่ควรใช้เส้นนี้ทำนายสเปกที่เล็กหรือใหญ่กว่าช่วงข้อมูล (extrapolation)
            </p>
            <ScrollTable>
              <table className="w-full min-w-[420px] text-xs">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 font-medium">หมวด</th>
                    <th className="py-1 font-medium">X</th>
                    <th className="py-1 text-right font-medium">β₁ (บาท/หน่วย)</th>
                    <th className="py-1 text-right font-medium">β₀</th>
                    <th className="py-1 text-right font-medium">R²</th>
                    <th className="py-1 text-right font-medium">n</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {slr.map(({ c, p }) => (
                    <tr key={c} className="border-t-2 border-border">
                      <td className="py-1.5">{CATEGORY_LABELS[c]}</td>
                      <td className="py-1.5 font-sans">{featureLabel(String(p.feature))}</td>
                      <td className="py-1.5 text-right">{thb1(p.slope_thb_per_unit)}</td>
                      <td className="py-1.5 text-right">{thb0(p.intercept_thb)}</td>
                      <td className="py-1.5 text-right">{fixed(p.r2)}</td>
                      <td className="py-1.5 text-right">{count(p.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </>
        }
      />

      {/* ------------------------------------------------ B. MLR */}
      <Method
        id="mlr"
        index={2}
        title="Multiple Linear Regression"
        subtitle="ราคายุติธรรมและ Deal Score"
        what={
          <>
            <p>
              เหมือนหัวข้อก่อน แต่ใช้สเปกหลายตัวพร้อมกัน (เช่น VRAM ระดับชิป ปีที่ออก และแบรนด์
              {demandFits.length > 0 && (
                <>
                  {" "}
                  ส่วนหมวด{demandFits.map((m) => CATEGORY_LABELS[m.c]).join(" / ")} ใช้{demandLabels.join("และ")}ด้วย
                </>
              )}
              ) ทำนาย log(ราคา) ผลที่ได้คือ <span className="font-semibold">ราคายุติธรรม</span> ของสเปกนั้น
              แล้วเทียบกับราคาจริงเพื่อให้ <span className="font-semibold">Deal Score</span>
            </p>
            <Formula>{FORMULAS.mlr}</Formula>
            <Formula>{FORMULAS.dealScore}</Formula>
            <p className="text-xs text-muted">
              ใช้ log เพราะราคาเพิ่มเป็นสัดส่วน (เช่น +20%) มากกว่าเป็นจำนวนบาทคงที่ · residual คือส่วนต่างระหว่างราคาจริงกับราคาที่โมเดลคาด ·
              s = ขนาดความคลาดเคลื่อนทั่วไปของโมเดล, h = leverage (สเปกนี้ห่างจากข้อมูลที่โมเดลเคยเห็นแค่ไหน), Φ = ฟังก์ชันสะสมของการแจกแจงปกติ ·
              Deal Score 50 = เท่าราคายุติธรรม, ยิ่งสูงยิ่งถูกกว่าตลาด · ราคายุติธรรมของแต่ละรุ่นคิดจากโมเดลที่ไม่เคยเห็นรุ่นนั้น
              (cross-validation แบบแบ่งตามรุ่น) จึงไม่ลอกราคาของตัวเอง
            </p>
          </>
        }
        chart={
          mlr.length > 0 ? (
            <CategoryTabs
              label="เลือกหมวดของกราฟ Multiple Linear Regression"
              panels={mlr.map(({ c, p, points: pts, bins, inputs }) => ({
                id: c,
                label: CATEGORY_LABELS[c],
                content: (
                  <div className="space-y-5">
                    <p className="tabular text-xs text-muted">
                      R²(cv) {fixed(p.r2_cv)} · MAPE {pct(p.mape_cv, 1)} · n = {count(p.n)}
                    </p>
                    {inputs.specs.length > 0 && (
                      <p className="text-sm">
                        <span className="font-semibold">ฟีเจอร์ที่ใช้:</span> {inputs.specs.join(" · ")}
                        {inputs.demand.length > 0 ? (
                          <> · ข้อมูลฝั่งคนซื้อ: {inputs.demand.join(" · ")}</>
                        ) : (
                          <> · ไม่ใช้ยอดเข้าชมหรือยอดขาย ราคายุติธรรมคิดจากสเปกอย่างเดียว</>
                        )}
                        {inputs.pricesUnlocked === false && (
                          <>
                            {" "}
                            · ไม่คิดส่วนเพิ่มของรุ่นปลดล็อก (K / X) รุ่น K / X จึงได้ราคายุติธรรมเท่ารุ่นที่ล็อกซึ่งสเปกอื่นเท่ากัน
                          </>
                        )}
                        {/* 2026.11-v19+: Threadripper is listed but left out of the fit. */}
                        {workstationExcluded(p) > 0 && <> · {workstationNote(workstationExcluded(p))}</>}
                      </p>
                    )}
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">ราคาจริงเทียบราคายุติธรรม</h4>
                      {pts.length > 0 ? (
                        <>
                          <FitScatter
                            points={pts}
                            gap={opt(p.uncertain_gap)}
                            label={`ราคาจริงเทียบราคายุติธรรมของ ${CATEGORY_LABELS[c]} ${pts.length} รายการ`}
                          />
                          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span>
                              <LineKey marker="none" /> y = x (ราคาจริง = ราคายุติธรรม)
                            </span>
                            {opt(p.uncertain_gap) !== null &&
                              (pts.some((q) => q.length === 4) ? (
                                // 2026.11-v17: the flag is per point, and a
                                // sibling inversion can sit inside the band.
                                <>
                                  <span>
                                    <LineKey marker="none" dash="6 5" /> ห่าง ±{Math.round(num(p.uncertain_gap) * 100)}%
                                  </span>
                                  <span>
                                    <UncertainKey /> ประเมินไม่แน่นอน (ห่างเกินเส้นประ หรือราคากลับด้านกับรุ่นพี่น้อง){" "}
                                    <span className="tabular">{pts.filter(fitUncertain).length.toLocaleString("th-TH")}</span> จุด
                                  </span>
                                </>
                              ) : (
                                <span>
                                  <LineKey marker="none" dash="6 5" /> ห่าง ±{Math.round(num(p.uncertain_gap) * 100)}% (เกินนี้ =
                                  ประเมินไม่แน่นอน)
                                </span>
                              ))}
                            <span>
                              แสดง {pts.length.toLocaleString("th-TH")} รายการ
                              {num(p.n) > pts.length ? " (สุ่มมาจากทั้งหมด)" : ""}
                            </span>
                          </p>
                        </>
                      ) : (
                        <NotYet what="จุดราคาจริงเทียบราคายุติธรรม" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">จำนวนรายการตามส่วนต่างจากราคายุติธรรม (residual)</h4>
                      {bins ? (
                        <>
                          <ResidualHistogram
                            bins={bins}
                            gap={opt(p.uncertain_gap)}
                            label={`histogram ส่วนต่างจากราคายุติธรรมของ ${CATEGORY_LABELS[c]}`}
                          />
                          {bins.below + bins.above > 0 && (
                            <p className="text-xs text-muted">
                              แท่งริมซ้าย / ขวารวม {bins.below} / {bins.above} รายการที่ห่างเกิน{" "}
                              {Math.round(Math.abs(bins.edges[0]) * 100)}%
                            </p>
                          )}
                        </>
                      ) : (
                        <NotYet what="histogram ของ residual" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold">ผลของแต่ละฟีเจอร์ต่อราคา (% ต่อ 1 SD)</h4>
                      <EffectBars effects={(p.coefficients as Coefficient[]) ?? []} />
                    </div>
                  </div>
                ),
              }))}
            />
          ) : (
            <NotYet what="Multiple Linear Regression" />
          )
        }
        read={
          <>
            <p>
              <span className="font-semibold">กราฟจุด:</span> แกนนอนคือราคายุติธรรม แกนตั้งคือราคาจริง ทั้งสองแกนเป็นสเกล log
              (ระยะเท่ากันหมายถึงคูณเท่ากัน เช่น ฿1k → ฿10k ยาวเท่า ฿10k → ฿100k) จุดบนเส้นทึบ y = x
              คือราคาจริงเท่าราคายุติธรรม <span className="font-semibold">จุดใต้เส้นคือถูกกว่าตลาด</span> จุดเหนือเส้นคือแพงกว่า
              {gapPct !== null && <> และจุดที่เลยเส้นประออกไปคือห่างเกิน {gapPct}% ซึ่งระบบถือว่าโมเดลประเมินรุ่นนั้นไม่แน่นอน</>}
              {siblingTolerance !== null && (
                <>
                  {" "}
                  · จุดกากบาทคือรายการที่ประเมินไม่แน่นอน ซึ่งรวมรุ่นที่ราคายุติธรรมกลับด้านกับรุ่นพี่น้อง
                  {marketGap !== null && <> และรุ่นที่ราคายุติธรรมสูงกว่าราคาที่ร้านขายตั้งแต่ {Math.round(marketGap * 100)}%</>}{" "}
                  (หัวข้อผลลัพธ์ด้านล่าง) แม้จะอยู่ในเส้นประ
                </>
              )}
            </p>
            <p>
              <span className="font-semibold">Histogram:</span> แต่ละแท่งนับจำนวนรายการที่ส่วนต่างตกในช่วงนั้น
              {binWidth !== null && <> (ช่วงละ {binWidth}%)</>} เส้นทึบกลางคือ 0%{gapPct !== null && <> เส้นประคือ ±{gapPct}%</>}{" "}
              ถ้าโมเดลดี แท่งจะสูงสุดใกล้ 0 และลาดลงสองข้างเท่า ๆ กัน
            </p>
            <p>
              <span className="font-semibold">แถบผลของฟีเจอร์:</span> แถบทึบไปทางขวา = ฟีเจอร์นั้นสูงขึ้นแล้วราคาแพงขึ้น
              แถบกลวงไปทางซ้าย = ทำให้ถูกลง ตัวเลขคือ % ที่ราคาเปลี่ยนเมื่อฟีเจอร์เพิ่ม 1 SD (ส่วนเบี่ยงเบนมาตรฐาน
              คือระยะห่างจากค่าเฉลี่ยตามปกติของฟีเจอร์นั้น) · “ไม่ระบุ…” คือตัวบอกว่าชื่อสินค้าไม่ได้บอกสเปกนั้น
            </p>
            {mlrExample && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง ({CATEGORY_LABELS[mlrExample.c]}):</span> {mlrExample.point[2]} ราคาจริง{" "}
                <span className="tabular">{formatTHB(mlrExample.point[0])}</span> ราคายุติธรรม{" "}
                <span className="tabular">{formatTHB(mlrExample.point[1])}</span> จุดจึงอยู่
                {mlrExample.gap < 0 ? "ใต้" : "เหนือ"}เส้น y = x คือ{mlrExample.gap < 0 ? "ถูกกว่า" : "แพงกว่า"}ราคายุติธรรม{" "}
                <span className="tabular">{Math.round(Math.abs(mlrExample.gap) * 100)}%</span>
              </p>
            )}
          </>
        }
        result={
          <>
            <p>
              R²(cv) คือ R² ที่วัดแบบ cross-validation (แบ่งข้อมูลเป็น{cvFolds !== null ? ` ${cvFolds} ` : "หลาย"}ส่วน ให้โมเดลทำนายส่วนที่ไม่ได้ใช้ train) จึงบอกความแม่นกับรุ่นที่โมเดลไม่เคยเห็น
              · MAPE คือราคายุติธรรมคลาดจากราคาจริงเฉลี่ยกี่ % · ช่วงคลาดเคลื่อน ± คือครึ่งความกว้างของช่วงที่ราคาควรอยู่{intervalPct !== null ? ` ด้วยความมั่นใจ ${intervalPct}%` : ""}
            </p>
            <ul className="space-y-3">
              {mlr.map(({ c, p }) => {
                const d = p.diagnostics as Diagnostics | null | undefined;
                const jbFail = d ? num(d.jarque_bera_p) < 0.05 : false;
                const bpFail = d ? num(d.breusch_pagan_p) < 0.05 : false;
                const vifHigh = d ? num(d.max_vif) > 10 : false;
                const siblings = siblingInversions(p);
                const market = marketCheck(p);
                return (
                  <li key={c} className="border-l-[3px] border-border pl-3">
                    <div className="font-semibold">{CATEGORY_LABELS[c]}</div>
                    <div>
                      R²(cv) <span className="tabular">{fixed(p.r2_cv)}</span> · ราคายุติธรรมคลาดเฉลี่ย{" "}
                      <span className="tabular">{pct(p.mape_cv, 0)}</span> · ช่วงคลาดเคลื่อนทั่วไป{" "}
                      <span className="tabular">±{pct(p.error_pct_median, 0)}</span> · เรียนจาก{" "}
                      <span className="tabular">{count(p.n)}</span> รายการที่มีของ
                      {Number.isFinite(num(p.uncertain)) && (
                        <>
                          {" "}
                          · ประเมินไม่แน่นอน <span className="tabular">{count(p.uncertain)}</span> รายการ
                        </>
                      )}
                      {Number.isFinite(num(p.unscored)) && (
                        <>
                          {" "}
                          · ยังไม่มีราคายุติธรรม <span className="tabular">{count(p.unscored)}</span> รายการ (สเปกไม่ครบหรือห่างจากข้อมูลเกินไป)
                        </>
                      )}
                    </div>
                    {siblings && (
                      <div>
                        รุ่นพี่น้องที่ราคายุติธรรมกลับด้าน <span className="tabular">{count(siblings.pairs)}</span> คู่
                        {siblings.pairs > 0 && (
                          <>
                            {" "}
                            (รุ่นที่ด้อยกว่าติดป้ายประเมินไม่แน่นอน <span className="tabular">{count(siblings.flagged)}</span> รายการ)
                          </>
                        )}
                        {siblings.examples.length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-muted">
                            {siblings.examples.map((e) => (
                              <li key={`${e.worse}|${e.better}`} className="tabular">
                                {siblingExampleText(e)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {market && (
                      <div>
                        ราคายุติธรรมสูงกว่าราคาที่ร้านขายตั้งแต่{" "}
                        <span className="tabular">{Math.round(market.gap * 100)}%</span>{" "}
                        <span className="tabular">{count(market.flagged)}</span> รายการ
                        {market.flagged > 0 && (
                          <>
                            {" "}
                            (เป็นรุ่นที่ขายร้านเดียว <span className="tabular">{count(market.singleStore)}</span> รายการ)
                          </>
                        )}
                      </div>
                    )}
                    {d && (
                      <div className="text-muted">
                        ตรวจสมมติฐาน: residual {jbFail ? "ไม่ได้กระจายแบบระฆังคว่ำ (การแจกแจงปกติ)" : "กระจายใกล้เคียงแบบปกติ"} (Jarque–Bera
                        p <span className="tabular">{pValue(d.jarque_bera_p)}</span>) · ความคลาดเคลื่อน
                        {bpFail ? "ไม่เท่ากันในแต่ละช่วงราคา" : "ใกล้เคียงกันทุกช่วงราคา"} (Breusch–Pagan p{" "}
                        <span className="tabular">{pValue(d.breusch_pagan_p)}</span>) · ความเบ้ (skew){" "}
                        <span className="tabular">{fixed(d.skew)}</span> และ excess kurtosis{" "}
                        <span className="tabular">{fixed(d.excess_kurtosis)}</span> (ทั้งคู่เป็น 0 เมื่อกระจายแบบปกติ; kurtosis
                        บวก = มีรายการที่ห่างมากบ่อยกว่าปกติ) · VIF สูงสุด{" "}
                        <span className="tabular">{fixed(d.max_vif, 1)}</span>
                        {vifHigh ? " (มีฟีเจอร์ที่บอกข้อมูลซ้ำกันมาก ค่า β แต่ละตัวจึงแปลผลแยกกันได้ยาก)" : " (ฟีเจอร์ไม่ซ้อนกันมาก)"}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p>
              ข้อจำกัด: p-value ต่ำกว่า 0.05 ในการตรวจข้างบนแปลว่าข้อสมมติของ OLS ไม่เป็นจริงเต็มที่
              Deal Score จึงควรอ่านเป็นอันดับเทียบกันระหว่างรายการ ไม่ใช่ความน่าจะเป็นที่แม่นยำ
              {gapPct !== null && (
                <>
                  {" "}
                  และรายการที่ห่างจากราคายุติธรรมเกิน {gapPct}% จะไม่ได้ Deal Score เพราะส่วนต่างขนาดนั้นน่าจะมาจากโมเดลมากกว่าตลาด
                </>
              )}
            </p>
            {siblingTolerance !== null && (
              <p>
                <span className="font-semibold">ตรวจรุ่นพี่น้อง:</span> เทียบรุ่นในสายเดียวกัน (การ์ดจอ: ค่ายและรุ่นปีเดียวกัน ·
                ซีพียู: ตระกูลและเจเนอเรชันเดียวกัน · แรม: แบรนด์และ DDR เดียวกัน · SSD: รุ่นเดียวกันต่างความจุ)
                ถ้ารุ่นหนึ่งสเปกด้อยกว่าหรือเท่ากับอีกรุ่นทุกด้าน (เช่น ระดับชิป VRAM จำนวนคอร์ ความจุ) แต่ราคายุติธรรมสูงกว่าเกิน{" "}
                {Math.round(siblingTolerance * 100)}% โมเดลเรียงสองรุ่นนี้ผิด รุ่นที่ด้อยกว่าจะได้ป้ายประเมินไม่แน่นอนและไม่ได้ Deal Score
                เพราะราคายุติธรรมที่สูงเกินจริงจะทำให้ดูเหมือนเป็นดีล ส่วนรุ่นที่ดีกว่ายังได้ Deal Score ตามปกติ
                จำนวนคู่และตัวอย่างของแต่ละหมวดอยู่ในรายการด้านบน
              </p>
            )}
            {marketGap !== null && (
              <p>
                <span className="font-semibold">ตรวจกับราคาตลาด:</span> เทียบราคายุติธรรมกับราคากลางของรุ่นเดียวกันจากทุกร้าน
                โดยนับร้านละหนึ่งราคา (ร้านที่มีของก่อน ถ้าไม่มีร้านไหนมีของ ใช้ราคาล่าสุดของทุกร้าน)
                ถ้าราคายุติธรรมสูงกว่าตั้งแต่ {Math.round(marketGap * 100)}%
                (ปัดเป็นจำนวนเต็มแบบตัวเลขบนเว็บ) รายการนั้นได้ป้ายประเมินไม่แน่นอนและไม่ได้ Deal Score
                เพราะถ้าร้านขายรุ่นนี้ในราคานั้นกันอยู่แล้ว ส่วนต่างนั้นมาจากโมเดลไม่ใช่ดีล เหตุผลบนหน้าสินค้าบอกว่าเทียบกับราคากลางของทุกร้าน
                หรือราคาของร้านเดียวที่ขาย ข้อเสียคือรุ่นที่ขายร้านเดียวจะเทียบกับราคาของตัวเอง
                จึงขึ้นเป็นดีลได้ไม่เกินราว {Math.round((1 - 1 / (1 + marketGap)) * 100)}% ใต้ราคายุติธรรม
                ถ้ารายการติดทั้งข้อนี้และข้อรุ่นพี่น้อง จะแสดงเหตุผลของรุ่นพี่น้อง จำนวนของแต่ละหมวดอยู่ในรายการด้านบน
              </p>
            )}
            <details className="group">
              <summary className="flex min-h-11 items-center gap-2 text-sm font-medium">
                ดูค่า β ทุกตัว
                <span aria-hidden className="disclosure" />
              </summary>
              <div className="grid gap-4 md:grid-cols-2">
                {mlr.map(({ c, p }) => (
                  <div key={c} className="min-w-0 border-2 border-border p-3">
                    <div className="mb-1 font-medium">{CATEGORY_LABELS[c]}</div>
                    <table className="w-full text-xs">
                      <tbody className="tabular">
                        {((p.coefficients as Coefficient[]) ?? []).map((k) => (
                          <tr key={k.feature} className="border-t-2 border-border">
                            <td className="py-0.5 pr-2 break-all">
                              {featureLabel(k.feature)} <span className="text-subtle">({k.feature})</span>
                            </td>
                            <td className="py-0.5 text-right whitespace-nowrap">β = {k.beta.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </details>
          </>
        }
      />

      {/* ------------------------------------------------ C. Regression tree */}
      <Method
        id="tier-tree"
        index={3}
        title="Regression Tree"
        subtitle="แบ่งระดับราคาตามสเปก"
        what={
          <>
            <p>
              ถามคำถามใช่ / ไม่ใช่ทีละข้อ เช่น “VRAM ไม่เกิน 10 GB ไหม” แต่ละครั้งเลือกคำถามที่แบ่งสินค้าออกเป็นสองกลุ่มที่ราคาภายในกลุ่มใกล้กันที่สุด
              (ผลรวมความคลาดเคลื่อนกำลังสองต่ำที่สุด) จำกัดจำนวนชั้นของคำถาม{maxDepth !== null && <> (max_depth = {maxDepth})</>} เพื่อไม่ให้จำข้อมูลมากเกินไป (overfitting)
            </p>
            <Formula>{FORMULAS.tierTree}</Formula>
          </>
        }
        chart={
          tier.length > 0 ? (
            <CategoryTabs
              label="เลือกหมวดของ Regression Tree"
              panels={tier.map(({ c, p, nodes }) => ({
                id: c,
                label: CATEGORY_LABELS[c],
                content: (
                  <div className="space-y-2">
                    <p className="tabular text-xs text-muted">
                      R²(cv) {fixed(p.r2_cv)} · {String(p.leaves)} ใบ (ระดับราคา)
                    </p>
                    {workstationExcluded(p) > 0 && <p className="text-xs text-muted">{workstationNote(workstationExcluded(p))}</p>}
                    {nodes ? (
                      <TreeDiagram
                        nodes={nodes}
                        label={`Regression Tree ของ ${CATEGORY_LABELS[c]}: ${String(p.leaves)} ใบ แต่ละใบบอกราคาทั่วไปของสินค้าที่ตอบคำถามแบบเดียวกัน`}
                        outline={treeOutline(nodes, priceLeafText)}
                      />
                    ) : (
                      <>
                        <p className="text-xs text-muted">ผลการ train รอบนี้ยังไม่มีโครงสร้างต้นไม้ จึงแสดงเป็นกฎแบบข้อความไปก่อน</p>
                        <RulesText rules={p.rules} />
                      </>
                    )}
                  </div>
                ),
              }))}
            />
          ) : (
            <NotYet what="Regression Tree" />
          )
        }
        read={
          <>
            {tier.some((t) => t.nodes) ? (
              <p>
                อ่านจากบนลงล่าง กล่องเทา (node ภายใน) คือคำถาม เดินตามเส้นที่ป้ายตรงกับคำตอบ: ทุกคำถาม ทั้งแบบ “≤” และแบบมี /
                ไม่มี เช่น “เป็น AMD?” ใช่ไปซ้าย ไม่ใช่ไปขวา จนถึงกล่องขอบหนาด้านล่างสุด (node ใบ) ซึ่งบอกราคาทั่วไปของสินค้ากลุ่มนั้น
                n คือจำนวนรายการที่มาถึงกล่องนั้น แถบบนกล่องใบบอกระดับราคาตามแถบตัวอย่าง “ถูก → แพง” ใต้ต้นไม้
                (ราคาเขียนไว้ในกล่องเสมอ) · ต้นไม้กว้างกว่าจอเลื่อนซ้ายขวาได้ในกรอบ หรือกด “ดูต้นไม้นี้เป็นข้อความ”
              </p>
            ) : (
              <p>{RULES_READ} (ราคาทั่วไป ≈ ราคาของกลุ่มนั้น)</p>
            )}
            {tierExample && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง ({CATEGORY_LABELS[tierExample.c]}):</span> ใบที่มีสินค้ามากที่สุด
                ได้จากการตอบ {tierExample.path.join(" → ") || "(ราก)"} มีสินค้า{" "}
                <span className="tabular">{tierExample.leaf.n.toLocaleString("th-TH")}</span> รายการ ราคาทั่วไป{" "}
                <span className="tabular">{formatTHB(tierExample.leaf.value as number)}</span>
              </p>
            )}
          </>
        }
        result={
          <>
            <ul className="list-inside list-disc space-y-1">
              {tier.map(({ c, p }) => {
                const m = find(insights, c, "fair_value_mlr");
                return (
                  <li key={c}>
                    {CATEGORY_LABELS[c]}: R²(cv) <span className="tabular">{fixed(p.r2_cv)}</span> ด้วย{" "}
                    <span className="tabular">{String(p.leaves)}</span> ระดับราคา
                    {m && (
                      <>
                        {" "}
                        (Multiple Linear Regression ได้ <span className="tabular">{fixed(m.r2_cv)}</span>)
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p>
              ข้อจำกัด: ต้นไม้ให้ราคาเป็นขั้นบันได มีได้แค่เท่าจำนวนใบ (
              {tier.map(({ c, p }) => `${CATEGORY_LABELS[c]} ${String(p.leaves)} ขั้น`).join(", ")}) สินค้าในใบเดียวกันได้ราคาทำนายเท่ากันหมด
              ราคาในใบคือค่าเฉลี่ยบนสเกล log แปลงกลับเป็นบาท (geometric mean) จึงต่ำกว่าค่าเฉลี่ยธรรมดาเล็กน้อย
              ระบบใช้ต้นไม้นี้เพื่อดูว่าสเปกไหนแบ่งระดับราคาได้ชัด ส่วนราคายุติธรรมยังมาจาก Multiple Linear Regression
            </p>
          </>
        }
      />

      {/* ------------------------------------------------ D. K-Means */}
      <Method
        id="kmeans"
        index={4}
        title="K-Means Clustering"
        subtitle="จัดกลุ่มรุ่นสินค้าตามยอดเข้าชมและยอดขาย"
        what={
          <>
            <p>
              วางทุกรุ่นเป็นจุดในพื้นที่ 3 มิติ แล้วหาจุดศูนย์กลาง (centroid) k จุด ให้ทุกรุ่นอยู่กลุ่มของ centroid ที่ใกล้ที่สุด
              และให้ระยะรวมภายในกลุ่มน้อยที่สุด ทำซ้ำ “จัดกลุ่ม → ย้าย centroid ไปค่าเฉลี่ยของกลุ่ม” จนไม่เปลี่ยน
              ค่า k เลือกจากค่า silhouette ที่ดีที่สุด
            </p>
            <Formula>{rankedSales ? FORMULAS.kmeansRanked : FORMULAS.kmeansRates}</Formula>
            <p className="text-xs text-muted">
              ใช้อันดับยอดขายภายในร้านแทนจำนวนชิ้น เพราะแต่ละร้านวัดยอดขายต่างกัน (JIB ใช้ยอดขายที่ร้านประกาศ ส่วน IHAVECPU ใช้สต็อกที่ลดลง)
              {(opt(kmeans?.best_seller_margin_sd) !== null || opt(kmeans?.conversion_margin_sd) !== null) && (
                <>
                  {" "}
                  · เกณฑ์ตั้งชื่อกลุ่ม (วัดที่ centroid หลังปรับสเกล หน่วยเป็น SD คือส่วนเบี่ยงเบนมาตรฐาน):
                  {opt(kmeans?.best_seller_margin_sd) !== null && (
                    <> “ขายดี” = อันดับยอดขายสูงกว่าค่าเฉลี่ยของทุกรุ่นเกิน {String(kmeans?.best_seller_margin_sd)} SD</>
                  )}
                  {opt(kmeans?.best_seller_margin_sd) !== null && opt(kmeans?.conversion_margin_sd) !== null && ","}
                  {opt(kmeans?.conversion_margin_sd) !== null && (
                    <> “คนดูเยอะ แต่ขายน้อย” = ยอดเข้าชมสูงกว่าอันดับยอดขายเกิน {String(kmeans?.conversion_margin_sd)} SD</>
                  )}
                </>
              )}{" "}
              · silhouette วัดว่าแต่ละจุดใกล้กลุ่มตัวเองมากกว่ากลุ่มข้างเคียงแค่ไหน จาก −1 ถึง 1 (ยิ่งสูงยิ่งแยกกลุ่มชัด)
            </p>
          </>
        }
        chart={
          kmeans ? (
            <div className="space-y-6">
              {points.length > 0 && rankedSales ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">รุ่นสินค้าบนแกนยอดเข้าชม × อันดับยอดขายในร้าน</h4>
                  <DemandScatter
                    points={points}
                    centroids={plotCentroids}
                    splitLogViews={Number.isFinite(splitViews) ? Math.log1p(splitViews) : null}
                    label={`รุ่นสินค้า ${points.length} รุ่น บนแกนยอดเข้าชมและอันดับยอดขาย แบ่งเป็น ${String(kmeans.k)} กลุ่ม`}
                  />
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {DEMAND_ORDER.map((label) => (
                      <li key={label}>
                        <MarkerSwatch label={label} /> {CLUSTER_LABELS[label].label}
                        {Number.isFinite(splitViews) && (label === "hidden_gem" || label === "community_favorite") && (
                          <span className="tabular">
                            {" "}
                            (คนดู{label === "hidden_gem" ? "ไม่เกิน" : "มากกว่า"} {countText(splitViews)} ครั้ง)
                          </span>
                        )}
                        {/* A name with no point this run says why (SPEC round 18). */}
                        {/* Also a v16 group whose points are all faded (labelled 0). */}
                        {(segmentSizes.find((g) => g.label === label)?.drawn === 0 || emptyGroupReason(label, demandRef)) && (
                          <> · {emptyGroupReason(label, demandRef) ?? "รอบนี้ไม่มีจุดของกลุ่มนี้บนกราฟ"}</>
                        )}
                      </li>
                    ))}
                    {fitKnown && unfitDrawn > 0 && (
                      <li>
                        <MarkerSwatch label="niche" faded /> สีจาง = ตัวเลขไม่ตรงชื่อกลุ่ม เว็บไม่ติดป้าย (
                        <span className="tabular">{count(unfitDrawn)}</span> รุ่น)
                      </li>
                    )}
                    {Number.isFinite(splitViews) && (
                      <li>
                        <LineKey marker="none" dash="6 5" /> เส้นแบ่งยอดเข้าชมของรุ่นขายดี
                      </li>
                    )}
                  </ul>
                  <ul className="grid gap-1 text-xs text-muted sm:grid-cols-2">
                    {plotCentroids.map((c) => (
                      <li key={c.index}>
                        <span className="tabular inline-flex h-5 min-w-5 items-center justify-center bg-foreground px-1 font-bold text-background">
                          {c.index}
                        </span>{" "}
                        centroid กลุ่ม {c.index}: {CLUSTER_NAMES[c.label] ?? c.label} ·{" "}
                        <span className="tabular">{count(c.size)}</span> รุ่น
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <NotYet what="จุดของแต่ละรุ่น" />
              )}
              {silhouettes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">ค่า silhouette ของแต่ละ k ที่ลอง</h4>
                  <ul className="space-y-1.5" aria-label="ค่า silhouette ของแต่ละ k">
                    {silhouettes.map((s) => {
                      const chosen = s.k === num(kmeans.k);
                      return (
                        <li key={s.k} className="grid grid-cols-[3.5rem_1fr_6.5rem] items-center gap-2 text-xs">
                          <span className="tabular font-semibold">k = {s.k}</span>
                          <div className="h-4 border-2 border-border bg-surface">
                            <div
                              className={chosen ? "h-full bg-foreground" : "h-full border-r-2 border-border bg-surface-muted"}
                              style={{ width: `${Math.max((Math.max(s.score, 0) / bestSilhouette) * 100, 2)}%` }}
                            />
                          </div>
                          <span className="tabular whitespace-nowrap">
                            {s.score.toFixed(3)}
                            {chosen && <span className="ml-1 font-bold">← เลือก</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <NotYet what="กลุ่มความต้องการ" />
          )
        }
        read={
          <>
            <p>
              แกนนอนคือยอดเข้าชมรวมทุกร้านของรุ่นนั้นบนสเกล log (ตัวเลขใต้แกนคือจำนวนครั้งจริง k = พัน, M = ล้าน)
              แกนตั้งคืออันดับยอดขายในร้าน (100% = ขายดีที่สุดในร้าน) จุดหนึ่งจุดคือหนึ่งรุ่น รูปทรงของจุดคือกลุ่มที่ K-Means
              จัดให้รุ่นนั้น เรียกด้วยชื่อเดียวกับป้ายบนเว็บซึ่งมี {DEMAND_ORDER.length} ชื่อ ไม่ใช่หมายเลขกลุ่มของ K-Means:
              กลุ่ม K-Means ที่มีความหมายเดียวกัน (เช่นสองกลุ่มที่ “{CLUSTER_LABELS.niche.label}” แต่ราคาต่างกัน)
              ใช้ชื่อเดียวกัน
              {fitKnown
                ? unfitDrawn > 0 &&
                  ` จุดสีจางคือรุ่นที่ K-Means จัดไว้ในกลุ่มนั้นแต่ตัวเลขของรุ่นเองไม่ตรงชื่อกลุ่ม เว็บจึงไม่ติดป้ายให้ (${count(unfitDrawn)} รุ่น) จุดสีเข้มคือรุ่นที่ติดป้ายบนเว็บ`
                : demandRef.unlabelled !== null &&
                  demandRef.unlabelled > 0 &&
                  ` จุดทุกจุดวาดตามกลุ่มที่ K-Means จัด รวม ${count(demandRef.unlabelled)} รุ่นที่เว็บไม่ติดป้ายเพราะตัวเลขไม่ตรงชื่อกลุ่ม แต่ผลการ train รอบนี้ยังไม่ได้เก็บว่าเป็นจุดไหน`}{" "}
              ส่วนสี่เหลี่ยมข้าวหลามตัดสีทึบที่มีเลขคือ centroid ของกลุ่ม K-Means ที่ 1 ถึง {String(kmeans?.k ?? "k")} · มิติที่
              3 (ราคาเทียบราคาปกติ) ไม่ได้วาด จึงมีจุดต่างกลุ่มที่ดูทับกันได้
            </p>
            <p>
              เส้นประแนวตั้งแบ่งรุ่นขายดีออกเป็น “{CLUSTER_LABELS.community_favorite.label}” (ขวา, □) กับ “
              {CLUSTER_LABELS.hidden_gem.label}” (ซ้าย, ■) เพราะ K-Means ให้รุ่นขายดีอยู่กลุ่มเดียวกันโดยไม่สนว่าคนดูมากหรือน้อย
              แต่ผู้ซื้ออยากแยก “ขายดีเพราะคนรู้จัก” กับ “ขายดีทั้งที่คนดูน้อย” ระบบจึงแบ่งรุ่นขายดีต่อด้วยค่ากลางของยอดเข้าชม
              {Number.isFinite(splitViews) ? (
                <>
                  {" "}
                  ของรุ่นขายดีด้วยกัน (<span className="tabular">{countText(splitViews)}</span> ครั้ง): “คนดูน้อย”
                  ในชื่อนี้จึงแปลว่าคนดูไม่เกิน <span className="tabular">{countText(splitViews)}</span> ครั้ง
                  เมื่อเทียบกับรุ่นขายดีด้วยกัน ไม่ใช่เทียบกับทุกรุ่น
                  {viewsMedian !== null && (
                    <>
                      {" "}
                      (ค่ากลางของทุกรุ่นคือ <span className="tabular">{countText(viewsMedian)}</span> ครั้ง)
                    </>
                  )}
                </>
              ) : (
                " ของรุ่นขายดีด้วยกัน"
              )}
            </p>
            {salesBands.length > 0 && (
              <p>
                จุดที่เรียงเป็นแถบแนวนอนที่ราว{" "}
                {salesBands.map((b, i) => (
                  <span key={b.y}>
                    {i > 0 && " และ "}
                    <span className="tabular">{Math.round(b.y * 100)}%</span> (<span className="tabular">{count(b.n)}</span> รุ่น)
                  </span>
                ))}{" "}
                คือรุ่นที่อันดับยอดขายในร้านเท่ากัน เช่น รุ่นที่ร้านยังไม่เห็นยอดขายเลยในช่วงที่ติดตาม:
                รุ่นที่ยอดขายเท่ากันได้อันดับเฉลี่ย (average rank) เดียวกัน จึงวางที่ความสูงเดียวกัน
              </p>
            )}
            {offCentroids.length > 0 && (
              <div className="space-y-1">
                <p>
                  <span className="font-semibold">centroid ที่ตำแหน่งบนกราฟดูไม่ตรงชื่อ:</span> ชื่อกลุ่มตั้งจากเกณฑ์ SD ข้างบน
                  และ K-Means วัดระยะจากทั้ง {DIMENSIONS.length} มิติพร้อมกัน จึงมีกลุ่มที่แยกออกมาเพราะมิติอื่น
                </p>
                <ul className="list-inside list-disc space-y-1">
                  {offCentroids.map(({ c, z, other, otherZ, split }) => (
                    <li key={c.index}>
                      centroid กลุ่ม {c.index} (“{CLUSTER_NAMES[c.label] ?? c.label}”) อยู่ที่คนดู{" "}
                      <span className="tabular">{dimensionValue(c, "views")}</span> และอันดับยอดขาย{" "}
                      <span className="tabular">{dimensionValue(c, "sales")}</span>
                      {c.label === "niche" ? (
                        <>
                          {" "}
                          ซึ่งอันดับยอดขาย{zWords(z[1])} (หลังปรับสเกล) แต่ยังไม่ถึงเกณฑ์ “ขายดี”
                          และคนดูไม่ได้เกินยอดขายถึงเกณฑ์ จึงอยู่ในกลุ่มที่เหลือ
                        </>
                      ) : (
                        <>
                          {" "}
                          ชื่อนี้ดูที่คนดูเทียบกับยอดขายของกลุ่มเอง (คนดูสูงกว่ายอดขาย{" "}
                          <span className="tabular">{(z[0] - z[1]).toFixed(2)}</span> SD) ไม่ได้เทียบกับค่าเฉลี่ยของทุกรุ่น
                        </>
                      )}{" "}
                      · มิติที่ต่างจาก centroid กลุ่ม {other.index} (กลุ่มที่ใกล้ที่สุด) มากที่สุดคือ
                      {DIMENSION_NAMES[DIMENSIONS[split]]}: <span className="tabular">{dimensionValue(c, DIMENSIONS[split])}</span> (
                      {zWords(z[split])}) เทียบกับ<span className="tabular">{dimensionValue(other, DIMENSIONS[split])}</span> (
                      {zWords(otherZ[split])})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p>กราฟแท่ง silhouette: แท่งทึบคือ k ที่เลือก แท่งยาวกว่า = แบ่งกลุ่มได้ชัดกว่า</p>
            {exampleCentroid && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง:</span> centroid กลุ่ม {exampleCentroid.index} (
                {CLUSTER_NAMES[exampleCentroid.label] ?? exampleCentroid.label}) อยู่ที่ยอดเข้าชมราว{" "}
                <span className="tabular">{Math.round(Math.expm1(exampleCentroid.x)).toLocaleString("th-TH")}</span> ครั้ง
                และอันดับยอดขาย <span className="tabular">{pct(exampleCentroid.y)}</span> มีสมาชิก{" "}
                <span className="tabular">{count(exampleCentroid.size)}</span> รุ่น
              </p>
            )}
          </>
        }
        result={
          kmeans ? (
            <>
              <p>
                เลือก k = <span className="tabular font-semibold">{String(kmeans.k)}</span> เพราะได้ silhouette สูงสุด{" "}
                <span className="tabular">{fixed(kmeans.silhouette)}</span> จาก{" "}
                <span className="tabular">{count(kmeans.n)}</span> รุ่นที่มีข้อมูลยอดเข้าชมและยอดขาย
                {num(kmeans.silhouette) < 0.5
                  ? " ค่านี้ต่ำกว่า 0.5 แปลว่ากลุ่มยังซ้อนกันบางส่วน รุ่นที่อยู่ใกล้ขอบกลุ่มอาจย้ายกลุ่มได้เมื่อข้อมูลเปลี่ยน"
                  : " ค่านี้สูงกว่า 0.5 แปลว่ากลุ่มแยกกันค่อนข้างชัด"}
              </p>
              {points.length > 0 && (
                <div className="space-y-1">
                  <ul className="list-inside list-disc space-y-1">
                    {segmentSizes
                      .filter((s) => s.size > 0 || s.live > 0)
                      .map((s) => (
                        <li key={s.label}>
                          {CLUSTER_LABELS[s.label].label}: K-Means จัด <span className="tabular">{count(s.size)}</span> รุ่น
                          {s.labelled !== null && (
                            <>
                              {" "}
                              · ติดป้าย <span className="tabular">{count(s.labelled)}</span> รุ่น
                            </>
                          )}{" "}
                          · แสดงบนเว็บตอนนี้ <span className="tabular">{count(s.live)}</span> รุ่น
                        </li>
                      ))}
                  </ul>
                  <p className="text-xs text-muted">
                    “แสดงบนเว็บตอนนี้” นับแบบเดียวกับหน้าแรกและหน้าภาพรวมตลาด คือเฉพาะรุ่นที่ติดป้ายและยังมีรายการขายอยู่ตอนนี้
                    จึงน้อยกว่าหรือเท่ากับจำนวนที่ติดป้าย ส่วนจำนวนที่ K-Means จัดรวมรุ่นที่ตัวเลขไม่ตรงชื่อกลุ่มด้วย
                  </p>
                </div>
              )}
              {labelRules.length > 0 && (
                <div className="space-y-1">
                  <p>
                    <span className="font-semibold">ป้ายกลุ่มบนเว็บ:</span> K-Means จัดกลุ่มจากยอดเข้าชม อันดับยอดขาย
                    และราคาพร้อมกัน รุ่นหนึ่งจึงถูกจัดเข้ากลุ่มได้แม้ยอดเข้าชมหรือยอดขายของตัวเองไม่ตรงกับชื่อกลุ่ม
                    เว็บจึงติดป้ายเฉพาะรุ่นที่ตัวเลขตรงกับเกณฑ์ของชื่อนั้น:
                  </p>
                  <ul className="list-inside list-disc space-y-1">
                    {labelRules.map(({ c, rule }) => (
                      <li key={c}>
                        “{CLUSTER_LABELS[c].label}” = {rule}
                        {emptyGroupReason(c, demandRef) && <> · {emptyGroupReason(c, demandRef)}</>}
                      </li>
                    ))}
                    <li>
                      “{CLUSTER_LABELS.niche.label}” = {nicheRuleText(demandRef)}
                      {/* Before 2026.11-v16 the remainder group kept every model's badge. */}
                      {!demandRef.nicheBelowBar && " ทุกรุ่นในกลุ่มนี้ติดป้ายได้"}
                      {emptyGroupReason("niche", demandRef) && <> · {emptyGroupReason("niche", demandRef)}</>}
                    </li>
                  </ul>
                  <p>
                    {unlabelledText(demandRef) ??
                      (demandRef.unlabelled === 0 && demandRef.clustered !== null
                        ? `ทั้ง ${count(demandRef.clustered)} รุ่นที่จัดกลุ่มมีตัวเลขตรงกับชื่อกลุ่ม จึงติดป้ายทุกรุ่น`
                        : null)}
                    {unlabelledByLabel.length > 0 && (
                      <>
                        {" "}
                        (
                        {unlabelledByLabel
                          .map(([label, n]) => `“${CLUSTER_LABELS[label].label}” ${n.toLocaleString("th-TH")} รุ่น`)
                          .join(", ")}
                        )
                      </>
                    )}
                  </p>
                </div>
              )}
              <p>
                ข้อจำกัด: ใช้ได้เฉพาะรุ่นที่ร้านเปิดเผยยอดเข้าชมหรือยอดขาย และ K-Means ถือว่ากลุ่มเป็นก้อนกลมขนาดใกล้กัน
                ระบบจึงตรวจซ้ำด้วย Hierarchical Clustering ในหัวข้อถัดไป · ชื่อกลุ่มบนเว็บดูได้ที่{" "}
                <Link href="/insights#demand" className="link">
                  ของที่คนซื้อจริง
                </Link>
              </p>
            </>
          ) : (
            <p>ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม</p>
          )
        }
      />

      {/* ------------------------------------------------ E. Ward */}
      <Method
        id="ward"
        index={5}
        title="Hierarchical Clustering (Ward)"
        subtitle="ตรวจซ้ำว่ากลุ่มของ K-Means ไม่ได้เกิดจากความบังเอิญ"
        what={
          <>
            <p>
              เริ่มจากให้ทุกรุ่นเป็นกลุ่มของตัวเอง แล้วรวมสองกลุ่มที่ “รวมแล้วความกระจายภายในกลุ่มเพิ่มน้อยที่สุด” ทีละคู่
              จนเหลือกลุ่มเดียว (วิธี Ward ใช้เป้าหมายเดียวกับ K-Means) ผลคือต้นไม้ที่เรียกว่า dendrogram ตัดที่ความสูงหนึ่งก็ได้ k กลุ่ม
            </p>
            <Formula>{FORMULAS.ward}</Formula>
          </>
        }
        chart={
          ward && dendro ? (
            <div className="space-y-2">
              <DendrogramChart
                data={dendro}
                k={num(ward.k)}
                label={`dendrogram แบบ Ward ${dendro.leaf_sizes.length} กิ่งบนสุด ตัดที่ k = ${String(ward.k)}`}
              />
              <p className="text-xs text-muted">
                แสดง {dendro.leaf_sizes.length} กิ่งบนสุดจาก {count(ward.n)} รุ่น · ตัวเลขใต้กิ่ง (เมื่อจอกว้างพอ) คือจำนวนรุ่นในกิ่งนั้น
              </p>
            </div>
          ) : (
            <NotYet what="dendrogram" />
          )
        }
        read={
          <>
            <p>
              แกนตั้งคือความสูงของการรวม (ต้นทุนแบบ Ward) รูป ∩ แต่ละรูปคือการรวมสองกลุ่มเข้าด้วยกัน ยิ่งรวมสูงยิ่งแปลว่าสองกลุ่มนั้นต่างกันมาก
              เส้นประแนวนอนคือเส้นตัด (ตัวเลขตัวหนาบนแกนตั้งคือความสูงของเส้นตัด) วางไว้กลางช่องว่างระหว่างการรวมที่ทำให้เหลือ k
              กลุ่มกับการรวมครั้งถัดไป
              ทุกเส้นแนวตั้งที่มันตัดผ่านคือหนึ่งกลุ่ม มีเลข 1, 2, … กำกับบนเส้นตัดเรียงจากซ้ายไปขวา (ไม่ใช่เลขเดียวกับ centroid ของ
              K-Means ข้างบน กลุ่ม 1 ของสองวิธีจึงอาจเป็นคนละกลุ่ม) และกิ่งย่อยใต้เส้นตัดของแต่ละกลุ่มวางบนแถบพื้นเทาสลับกับพื้นว่าง
              กิ่งล่างสุดแต่ละกิ่งรวมหลายรุ่นไว้แล้ว (ไม่ได้วาดทุกรุ่น)
            </p>
            {ward && dendro && dendro.cut_height !== null && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง:</span> เส้นตัดอยู่ที่ความสูง{" "}
                <span className="tabular">{fixed(dendro.cut_height)}</span> ตัดผ่านเส้นแนวตั้ง{" "}
                <span className="tabular">{String(ward.k)}</span> เส้น (เลข 1 ถึง {String(ward.k)}) จึงได้ {String(ward.k)} กลุ่ม
                เท่ากับจำนวนกลุ่มของ K-Means
              </p>
            )}
          </>
        }
        result={
          ward ? (
            <>
              <p>
                ARI กับ K-Means = <span className="tabular font-semibold">{fixed(ward.ari_vs_kmeans)}</span> (Adjusted Rand Index:
                1 = สองวิธีแบ่งกลุ่มเหมือนกันทุกรุ่น, 0 = ตรงกันแค่ระดับสุ่ม) · silhouette ของ Ward{" "}
                <span className="tabular">{fixed(ward.silhouette)}</span>
                {kmeans && (
                  <>
                    {" "}
                    เทียบกับ K-Means <span className="tabular">{fixed(kmeans.silhouette)}</span>
                  </>
                )}{" "}
                · cophenetic r <span className="tabular">{fixed(ward.cophenetic_corr)}</span> (ต้นไม้รักษาระยะห่างจริงระหว่างรุ่นได้ดีแค่ไหน
                มากกว่า 0.7 ถือว่าดี)
              </p>
              <p>
                {num(ward.ari_vs_kmeans) >= 0.8
                  ? "สองวิธีที่ทำงานต่างกันแบ่งกลุ่มตรงกันมาก (ARI ตั้งแต่ 0.8) จึงสนับสนุนว่ากลุ่มของ K-Means ไม่ได้มาจากการสุ่มจุดเริ่มต้น"
                  : num(ward.ari_vs_kmeans) >= 0.5
                    ? "สองวิธีแบ่งกลุ่มตรงกันระดับปานกลาง (ARI 0.5–0.8): โครงใหญ่ของกลุ่มคล้ายกัน แต่รุ่นจำนวนหนึ่งถูกจัดต่างกลุ่ม"
                    : "สองวิธีแบ่งกลุ่มตรงกันน้อย (ARI ต่ำกว่า 0.5) แปลว่าขอบเขตระหว่างกลุ่มยังไม่ชัด"}{" "}
                {num(ward.cophenetic_corr) < 0.7 && "ค่า cophenetic ต่ำกว่า 0.7 แปลว่าต้นไม้สรุประยะห่างจริงได้ไม่ครบ "}
                {num(ward.silhouette) < 0.5 && "และ silhouette ต่ำกว่า 0.5 แปลว่ากลุ่มยังซ้อนกันบางส่วน "}
                ข้อจำกัด: ป้ายกลุ่มจึงควรอ่านเป็นแนวโน้ม โดยเฉพาะรุ่นที่อยู่ใกล้ขอบระหว่างกลุ่ม
              </p>
            </>
          ) : (
            <p>ยังไม่มีผล Hierarchical Clustering ในการ train รอบนี้</p>
          )
        }
      />

      {/* ------------------------------------------------ F. Decision tree */}
      <Method
        id="timing-tree"
        index={6}
        title="Decision Tree"
        subtitle="ซื้อเลย / รอก่อน / ราคาเหมาะสม จากประวัติราคา"
        what={
          <>
            <p>
              Decision Tree แบบจำแนกประเภท (classification) เรียนจากประวัติราคาว่า หลังจากเห็นราคาหนึ่งแล้ว
              {horizonDays !== null ? `ภายใน ${horizonDays} วัน ` : "ในช่วงถัดไป "}เกิดอะไรขึ้น: ราคาลดลง
              {dropPct !== null ? ` อย่างน้อย ${dropPct}%` : "ชัดเจน"} (ควร “รอก่อน”), ของหมดหรือ
              {stockPct !== null ? ` สต็อกลดเหลือไม่เกิน ${stockPct}%` : "สต็อกลดลงมาก"} (ควร “ซื้อเลย”)
              หรือนิ่ง (“ราคาเหมาะสม”) เลือกคำถามที่ทำให้แต่ละกลุ่มมีคำตอบเป็นแบบเดียวกันมากที่สุด (Gini impurity ต่ำสุด)
              {maxDepth !== null && <> ลึกไม่เกิน {maxDepth} ชั้น</>}
            </p>
            <Formula>{FORMULAS.gini}</Formula>
            <p className="text-xs text-muted">
              แบ่งข้อมูล train / test ตามเวลา
              {testPct !== null && <> ({100 - testPct}% แรก / {testPct}% หลัง)</>} เพื่อไม่ให้โมเดลเห็นอนาคตของช่วงที่ใช้ทดสอบ
            </p>
          </>
        }
        chart={
          timing ? (
            timingNodes ? (
              <div className="space-y-2">
                <TreeDiagram
                  nodes={timingNodes}
                  label={`Decision Tree ซื้อเลย / รอก่อน: ${leaves(timingNodes).length} ใบ`}
                  outline={treeOutline(timingNodes, classLeafText)}
                />
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  สีกรอบใบ = ป้ายที่ใบนั้นทำนาย:
                  <RecommendationBadge value="buy_now" />
                  <RecommendationBadge value="wait" />
                  <RecommendationBadge value="fair_price" />
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted">ผลการ train รอบนี้ยังไม่มีโครงสร้างต้นไม้ จึงแสดงเป็นกฎแบบข้อความไปก่อน</p>
                <RulesText rules={timing.rules} />
              </>
            )
          ) : (
            <NotYet what="Decision Tree (ประวัติราคายังสั้นเกินไปที่จะ train)" />
          )
        }
        read={
          <>
            {!timingNodes && timing && <p>{RULES_READ} (แนะนำ: … คือป้ายที่กลุ่มนั้นได้)</p>}
            <p>
              {timingNodes
                ? "อ่านเหมือน Regression Tree: เริ่มที่กล่องบนสุด เดินตามเส้นที่ป้าย “ใช่ / ไม่ใช่” ตรงกับคำตอบ (ใช่ไปซ้ายเสมอ) จนถึงใบ"
                : "เมื่อมีโครงสร้างต้นไม้ จะวาดเป็นกล่องและเส้นแบบ Regression Tree:"}{" "}
              แต่ละใบบอกป้ายที่โมเดลจะทำนาย (สีกรอบเหมือนป้ายบนเว็บ) จำนวนตัวอย่าง n และสัดส่วนที่เป็นป้ายนั้นจริงในข้อมูล train
              ชี้ที่ใบเพื่อดูจำนวนของทุกป้าย · ต้นไม้นี้ใช้ class_weight = &quot;balanced&quot; คือให้น้ำหนักตัวอย่างของป้ายที่พบน้อยมากกว่า
              (ไม่อย่างนั้นโมเดลจะทาย “ราคาเหมาะสม” แทบทุกครั้ง) ใบจึงอาจทาย “ซื้อเลย” หรือ “รอก่อน” ได้ แม้ป้ายนั้นจะเป็นส่วนน้อยของแถวในใบ
              (% ในกล่องน้อยกว่าครึ่ง)
            </p>
            {timingMinority && (
              <p>
                <span className="font-semibold">ตัวอย่างใบที่ป้ายส่วนน้อยชนะ:</span> ใบ “
                {recommendationName((timingMinority.leaf.value as ClassValue).winner)}” มี n ={" "}
                <span className="tabular">{count(timingMinority.total)}</span> แต่เป็นป้ายนี้จริงแค่{" "}
                <span className="tabular">{count(timingMinority.winnerRows)}</span> ตัวอย่าง (
                <span className="tabular">{Math.round((timingMinority.winnerRows / timingMinority.total) * 100)}%</span>)
                เพราะแบบ balanced แต่ละตัวอย่างมีน้ำหนัก = จำนวนตัวอย่างทั้งหมด ÷ (จำนวนป้าย × จำนวนตัวอย่างของป้ายนั้น) ในข้อมูล train
                นี้คือ{" "}
                <span className="tabular">
                  {Object.entries(timingMinority.weights)
                    .map(([c, w]) => `“${recommendationName(c)}” ×${w.toFixed(2)}`)
                    .join(", ")}
                </span>{" "}
                ใบนี้จึงมีน้ำหนักรวม{" "}
                <span className="tabular">
                  {Object.entries(timingMinority.weighted)
                    .filter(([, w]) => w > 0)
                    .map(([c, w]) => `${recommendationName(c)} ${w.toFixed(1)}`)
                    .join(" เทียบกับ ")}
                </span>{" "}
                และป้ายที่น้ำหนักรวมมากที่สุดเป็นคำตอบของใบ
              </p>
            )}
            {timingFeatures.length > 0 && (
              <div className="space-y-1">
                <p>คำถามในต้นไม้นี้ใช้ {timingFeatures.length} ฟีเจอร์:</p>
                <ul className="list-inside list-disc space-y-1">
                  {timingFeatures.map((f) => (
                    <li key={f.feature}>
                      <span className="font-semibold">{f.label}</span>
                      {f.note && <>: {f.note}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {timingExample && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง:</span> ใบที่มีตัวอย่างมากที่สุดได้จากการตอบ{" "}
                {pathTo(timingExample.nodes, timingExample.leaf.id).join(" → ") || "(ราก)"} มี{" "}
                <span className="tabular">{timingExample.leaf.n.toLocaleString("th-TH")}</span> ตัวอย่าง และทำนายว่า “
                {RECOMMENDATION_LABELS[(timingExample.leaf.value as ClassValue).winner as Recommendation] ??
                  (timingExample.leaf.value as ClassValue).winner}
                ”
              </p>
            )}
          </>
        }
        result={
          timing ? (
            <>
              <p>
                Balanced accuracy (ค่าเฉลี่ยของความแม่นแยกตามแต่ละป้าย ไม่ให้ป้ายที่มีมากกลบป้ายที่มีน้อย) บนช่วง test ={" "}
                <span className="tabular font-semibold">{pct(timing.balanced_accuracy_test, 1)}</span> เทียบกับเดาสุ่ม{" "}
                <span className="tabular">{pct(timing.baseline_balanced_accuracy, 1)}</span> · accuracy ธรรมดา{" "}
                <span className="tabular">{pct(timing.accuracy_test, 1)}</span> เทียบกับทายป้ายที่พบบ่อยที่สุดทุกครั้ง{" "}
                <span className="tabular">{pct(timing.baseline_accuracy_test, 1)}</span> · train{" "}
                <span className="tabular">{count(timing.n_train)}</span> / test <span className="tabular">{count(timing.n_test)}</span> ตัวอย่าง
              </p>
              <p className={treeInUse ? "" : "font-semibold"}>
                {treeInUse
                  ? `ผ่านเกณฑ์${barPct !== null ? ` ${barPct}%` : ""} แล้ว ป้ายซื้อเลย / รอก่อนบนเว็บจึงมาจากต้นไม้นี้`
                  : belowBar
                    ? `ข้อจำกัด: balanced accuracy ยังไม่ถึงเกณฑ์ ${barPct}% ป้ายบนเว็บตอนนี้จึงใช้กฎจาก Deal Score และช่วงคลาดเคลื่อน ± แทน`
                    : "ข้อจำกัด: ระบบยังไม่ใช้ต้นไม้นี้กับป้ายบนเว็บ ป้ายตอนนี้จึงใช้กฎจาก Deal Score และช่วงคลาดเคลื่อน ± แทน"}{" "}
                <Link href="/insights#advice" className="link font-normal">
                  ดูกฎที่ใช้อยู่
                </Link>
              </p>
              {confusion.length > 0 && timingClasses.length === confusion.length && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">
                    Confusion matrix บนช่วง test: แถว = ป้ายที่เกิดจริง คอลัมน์ = ป้ายที่ต้นไม้ทาย ตัวเลขบนเส้นทแยงคือทายถูก
                  </p>
                  <ScrollTable>
                    <table className="min-w-[360px] text-xs">
                      <thead className="text-muted">
                        <tr>
                          <th className="py-1 pr-3 text-left font-medium">จริง \ ทาย</th>
                          {timingClasses.map((c) => (
                            <th key={c} className="px-2 py-1 text-right font-medium">
                              {RECOMMENDATION_LABELS[c as Recommendation] ?? c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {confusion.map((row, i) => (
                          <tr key={timingClasses[i]} className="border-t-2 border-border">
                            <th className="py-1 pr-3 text-left font-medium">
                              {RECOMMENDATION_LABELS[timingClasses[i] as Recommendation] ?? timingClasses[i]}
                            </th>
                            {row.map((v, j) => (
                              <td key={j} className={`px-2 py-1 text-right ${i === j ? "font-bold" : ""}`}>
                                {v.toLocaleString("th-TH")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollTable>
                </div>
              )}
            </>
          ) : (
            <p>
              ประวัติราคายังไม่พอให้ train ต้นไม้ ป้ายบนเว็บจึงใช้กฎจาก Deal Score ·{" "}
              <Link href="/insights#advice" className="link">
                ดูกฎที่ใช้อยู่
              </Link>
            </p>
          )
        }
      />

      {/* ------------------------------------------------ G. Record linkage */}
      <Method
        id="linkage"
        index={7}
        title="การจับคู่สินค้า (Regex + TF-IDF)"
        subtitle="รู้ได้อย่างไรว่าสินค้าต่างร้านคือรุ่นเดียวกัน"
        what={
          <>
            <p>
              ขั้นแรกใช้กฎ Regex (รูปแบบข้อความ) ดึงรุ่นและสเปกจากชื่อสินค้า เช่น “RTX 5060 Ti 16GB” รายการที่กฎอ่านไม่ออก
              จะแปลงชื่อเป็นเวกเตอร์ TF-IDF (คำที่พบบ่อยในชื่อนี้แต่พบน้อยในชื่ออื่นได้น้ำหนักมาก) แล้วหารุ่นที่ชื่อคล้ายที่สุดด้วย cosine
              similarity จับคู่ก็ต่อเมื่อความคล้ายถึง threshold ที่ทดสอบแล้วว่าแม่นพอ
            </p>
            <Formula>{FORMULAS.cosine}</Formula>
          </>
        }
        chart={
          linkageRows.some((r) => r.curve.length > 1) ? (
            <div className="space-y-2">
              <CategoryTabs
                label="เลือกหมวดของกราฟการจับคู่สินค้า"
                panels={linkageRows
                  .filter((r) => r.curve.length > 1)
                  .map((r) => ({
                    id: r.c,
                    label: CATEGORY_LABELS[r.c],
                    content: (
                      <LinkageCurve
                        curve={r.curve}
                        threshold={r.t}
                        label={`precision และ coverage ของ ${CATEGORY_LABELS[r.c]} ที่แต่ละ threshold`}
                      />
                    ),
                  }))}
              />
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  <LineKey marker="square" /> precision (จับคู่ถูก)
                </span>
                <span>
                  <LineKey marker="triangle" dash="2 4" /> coverage (จับคู่ได้, เส้นจุด)
                </span>
                <span>
                  <LineKey marker="none" dash="14 6" /> threshold ที่เลือก (เส้นประยาว)
                </span>
              </p>
            </div>
          ) : (
            <NotYet what="กราฟ precision / coverage" />
          )
        }
        read={
          <>
            <p>
              แกนนอนคือ threshold ของ cosine similarity แกนตั้งคือ % · precision (เส้นทึบ) คือในบรรดาที่จับคู่ได้ จับถูกกี่ % · coverage
              (เส้นจุด) คือจับคู่ได้กี่ % ของทั้งหมด ยิ่งตั้ง threshold สูง ยิ่งแม่นแต่จับคู่ได้น้อยลง เส้นประยาวแนวตั้งคือ threshold ที่ระบบเลือก
              ถ้าไม่มีเส้นนี้แปลว่าไม่มีค่าไหนแม่นพอ ระบบจึงไม่เดา
            </p>
            {linkageExample?.chosen && (
              <p>
                <span className="font-semibold">ตัวอย่างจากข้อมูลจริง ({CATEGORY_LABELS[linkageExample.c]}):</span> ที่ threshold{" "}
                <span className="tabular">{fixed(linkageExample.t)}</span> จับคู่ถูก{" "}
                <span className="tabular">{pct(linkageExample.chosen.precision, 1)}</span> และจับคู่ได้{" "}
                <span className="tabular">{pct(linkageExample.chosen.coverage)}</span> ของรายการที่ทดสอบ
              </p>
            )}
          </>
        }
        result={
          linkageRows.length > 0 ? (
            <>
              <ScrollTable>
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1 font-medium">หมวด</th>
                      <th className="py-1 text-right font-medium">จับคู่ด้วยกฎ</th>
                      <th className="py-1 text-right font-medium">ไม่อยู่ในขอบเขต</th>
                      <th className="py-1 text-right font-medium">threshold (cosine)</th>
                      <th className="py-1 text-right font-medium">precision · coverage</th>
                      <th className="py-1 text-right font-medium">จับคู่ด้วย similarity</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {linkageRows.map(({ c, l, t, chosen }) => (
                      <tr key={c} className="border-t-2 border-border">
                        <td className="py-1.5">{CATEGORY_LABELS[c]}</td>
                        <td className="py-1.5 text-right">{l.listings ? `${Math.round((l.rule_linked / l.listings) * 100)}%` : "–"}</td>
                        <td className="py-1.5 text-right">{l.excluded}</td>
                        <td className="py-1.5 text-right">{t === null ? "ปิด" : fixed(t)}</td>
                        <td className="py-1.5 text-right">
                          {chosen ? `${pct(chosen.precision, 1)} · ${pct(chosen.coverage)}` : "–"}
                        </td>
                        <td className="py-1.5 text-right">{l.similarity_linked ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
              <p>
                threshold เลือกจากการทดสอบแบบ leave-one-out (ซ่อนรายการหนึ่งแล้วดูว่าจับคู่กลับได้ถูกรุ่นไหม เทียบกับผลของกฎ)
                ให้ขอบล่างของช่วงความเชื่อมั่น 95% (Wilson) ของ precision ไม่ต่ำกว่า 95% · “ปิด” = ยังไม่มี threshold ที่ผ่านเกณฑ์
              </p>
              <p>ข้อจำกัด: การ์ดจอ workstation และแรมโน้ตบุ๊กไม่อยู่ในขอบเขตโดยตั้งใจ และรายการที่ชื่อไม่บอกสเปกหลักจะยังไม่ถูกจับคู่</p>
            </>
          ) : (
            <p>ยังไม่มีผลการจับคู่สินค้า</p>
          )
        }
      />
    </div>
  );
}
