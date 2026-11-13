import Link from "next/link";
import { RecommendationBadge } from "@/components/badges";
import type { Effect } from "@/components/effect-bars";
import { SpecScatter } from "@/components/spec-scatter";
import { StatNote } from "@/components/stat-note";
import { demandReference, shareTile } from "@/lib/demand";
import { CATEGORY_LABELS, CLUSTER_LABELS, featureLabel, formatDateTime, formatTHB } from "@/lib/format";
import {
  BOOLEAN_FEATURES,
  FACTOR_HINTS,
  mainFactors,
  priceLadder,
  reliability,
  roundForCopy,
  salesRate,
  tierLabel,
} from "@/lib/market";
import { siblingInversions, siblingSentence } from "@/lib/ml";
import { countModelsByCluster, getMarketInsights, getSpecPoints } from "@/lib/queries";
import type { Category, DemandCluster, MarketInsight, Recommendation } from "@/lib/types";

export const revalidate = 900;

type Coefficient = Effect & { beta: number };
/**
 * One shopper-facing demand segment as stored: size and averages over the
 * clustered rows (product models from 2026.11-v8, listings before).
 */
type Segment = {
  label: DemandCluster;
  size: number;
  /** Mean views per row of the group. */
  views: number;
  /**
   * Median views per row (every payload with `segments`, 2026.11-v7+): the
   * tile's "คนดูโดยทั่วไป", since a few very popular models pull the mean up.
   */
  views_median?: number;
  /**
   * Raw rate summed over stores. From 2026.11-v9 it adds up store metrics
   * that are not comparable (SPEC round 9), so it is shown only for older
   * payloads.
   */
  sales_per_day: number;
  normalized_price: number;
  /**
   * Mean within-store sales percentile (0–1], average rank for ties: the
   * clustered feature (2026.11-v9+). Not shown: tied zero sellers rank
   * mid-table.
   */
  sales_rank_pct?: number;
  /**
   * Mean share [0–1) of the store's listings that sold strictly less
   * (2026.11-v9+): the shopper-facing "ขายดีกว่า ~N%". Absent in older
   * payloads, which show `sales_per_day`.
   */
  sales_beats_pct?: number;
  /**
   * The same two figures over the models whose label fits their numbers
   * (2026.11-v15+): the models the tile counts and the list shows.
   */
  labelled_views_median?: number;
  labelled_sales_beats_pct?: number;
};
/** A K-Means centroid as stored by models before 2026.11-v7 (one label each). */
type Centroid = Segment & { cluster: number };

/** Consumer-facing unit per category; SSD is shown per TB, not per GB. */
const UNIT: Record<Category, { scale: number; axis: string; axisUnit: string; step: string }> = {
  gpu: { scale: 1, axis: "VRAM", axisUnit: "GB", step: "VRAM เพิ่มทุก 1 GB" },
  cpu: { scale: 1, axis: "จำนวนคอร์", axisUnit: "คอร์", step: "เพิ่มทุก 1 คอร์" },
  ram: { scale: 1, axis: "ความจุ", axisUnit: "GB", step: "ความจุเพิ่มทุก 1 GB" },
  ssd: { scale: 1000, axis: "ความจุ", axisUnit: "GB", step: "ความจุเพิ่มทุก 1 TB" },
};

/** Fixed segment order, the same as the filter chips on the product list. */
const SEGMENT_ORDER: DemandCluster[] = ["hidden_gem", "community_favorite", "overpriced_hype", "niche"];

const SECTIONS = [
  { id: "ladder", label: "งบเท่านี้ได้สเปกแค่ไหน" },
  { id: "drivers", label: "อะไรทำให้แพง" },
  { id: "demand", label: "ของที่คนซื้อจริง" },
  { id: "advice", label: "ป้ายซื้อเลย / รอก่อน" },
] as const;

/** The rules behind the badges while the decision tree is below its bar (train.rule_recommendation). */
const ADVICE_RULES: { value: Recommendation; rule: string }[] = [
  {
    value: "buy_now",
    rule: "Deal Score 80 ขึ้นไป และถูกกว่าราคายุติธรรมมากกว่าช่วงคลาดเคลื่อน ± ที่แสดงคู่กัน เช่น “ถูกกว่าราคายุติธรรม 52% ซึ่งเกินช่วงคลาดเคลื่อน ±30% จึงถูกกว่าตลาดชัดเจน”",
  },
  {
    value: "wait",
    rule: "Deal Score 20 ลงมา และแพงกว่าราคายุติธรรมมากกว่าช่วงคลาดเคลื่อน ± เช่น “แพงกว่าราคายุติธรรม 46% ซึ่งเกินช่วงคลาดเคลื่อน ±13% จึงแพงกว่าตลาดชัดเจน” หรือสินค้าหมดที่ร้านนั้น",
  },
  {
    value: "fair_price",
    rule: "ที่เหลือที่มี Deal Score: ราคาใกล้เคียงราคายุติธรรม หรือส่วนต่างยังไม่เกินช่วง ± (หรือยังไม่ทราบช่วง) จึงยังสรุปไม่ได้ว่าถูกหรือแพงกว่าตลาดจริง",
  },
];

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);
const fixed = (v: unknown, d = 2): string => (Number.isFinite(num(v)) ? num(v).toFixed(d) : "–");

const isSegmentLabel = (label: unknown): label is DemandCluster =>
  typeof label === "string" && (SEGMENT_ORDER as string[]).includes(label);

const bySegmentOrder = (a: Segment, b: Segment) => SEGMENT_ORDER.indexOf(a.label) - SEGMENT_ORDER.indexOf(b.label);

/**
 * Fallback for payloads stored before 2026.11-v7, which have no per-label
 * summary. K-Means can yield two clusters with the same profile name (e.g. two
 * "niche" groups at different price levels). Shoppers see one segment per name:
 * sizes add up and averages are size-weighted. Fixed order (SEGMENT_ORDER).
 */
function mergeByLabel(centroids: Centroid[]): Segment[] {
  const merged = new Map<DemandCluster, Segment>();
  for (const c of centroids) {
    if (!isSegmentLabel(c.label)) continue;
    const m = merged.get(c.label);
    if (!m) {
      merged.set(c.label, { ...c });
      continue;
    }
    const n = m.size + c.size;
    const avg = (a: number, b: number) => (a * m.size + b * c.size) / n;
    merged.set(c.label, {
      ...m,
      size: n,
      views: avg(m.views, c.views),
      sales_per_day: avg(m.sales_per_day, c.sales_per_day),
      normalized_price: avg(m.normalized_price, c.normalized_price),
    });
  }
  return [...merged.values()].sort(bySegmentOrder);
}

/**
 * Shopper-facing segments: the per-label summary computed from the listings
 * (2026.11-v7+: best-seller clusters are split by views, so one centroid no
 * longer equals one label), else the merged centroids of an older payload.
 */
function demandSegments(kmeans: Record<string, unknown> | undefined): Segment[] {
  if (Array.isArray(kmeans?.segments)) {
    return (kmeans.segments as Segment[]).filter((s) => isSegmentLabel(s.label) && s.size > 0).sort(bySegmentOrder);
  }
  return mergeByLabel((kmeans?.centroids as Centroid[] | undefined) ?? []);
}

/**
 * " · " plus the category's sibling-check sentence (SPEC round 19), or ""
 * for a payload from before 2026.11-v17, which has no such fields.
 */
function siblingDetail(p: Record<string, unknown>): string {
  const s = siblingInversions(p);
  return s === null ? "" : ` · ${siblingSentence(s)}`;
}

function find(insights: MarketInsight[], category: string, kind: string) {
  return insights.find((i) => i.category === category && i.kind === kind)?.payload;
}

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div>
        <h2 className="display text-2xl sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

const hint = (c: Category, feature: string): string | undefined =>
  FACTOR_HINTS[`${c}.${feature}`] ?? FACTOR_HINTS[feature];

export default async function InsightsPage() {
  const [insights, points, modelCounts] = await Promise.all([
    getMarketInsights(),
    getSpecPoints(),
    countModelsByCluster(),
  ]);
  const categories = Object.keys(CATEGORY_LABELS) as Category[];
  const kmeans = find(insights, "all", "demand_kmeans");
  const timing = find(insights, "all", "timing_tree");
  // linkage_quality is written by the link step, not training: exclude it from "computed at".
  const computedAt = insights.find((i) => i.kind !== "linkage_quality")?.computedAt ?? null;
  // Tiles count models exactly as "/?cluster=…" does (live query, one group
  // per model), so a tile's number is the list's "พบ X รุ่น"; averages come
  // from the training payload. A group with no model on sale gets no tile.
  const segments = demandSegments(kmeans).filter((c) => (modelCounts[c.label] ?? 0) > 0);
  const clustered = segments.reduce((s, c) => s + (modelCounts[c.label] ?? 0), 0);
  // 2026.11-v8+ clusters product models (views summed over stores).
  const perModel = kmeans?.unit === "model";
  // 2026.11-v9+ clusters on the within-store sales percentile, not the summed
  // rate: stores measure sales differently (SPEC round 9). v8 has no key.
  const rankedSales = kmeans?.sales_feature === "store_rank_pct";
  // Thresholds and wording inputs of the K-Means payload (2026.11-v15+: the
  // tracking cap stated beside every sales share, so it is not read as
  // lifetime sales).
  const demandRef = demandReference(kmeans ?? null);
  // Views at which best sellers are split into community_favorite / hidden_gem (2026.11-v7+).
  const splitViews = num(kmeans?.split_views);
  // Group names quoted inside the split sentence; nowrap so a name never breaks across lines.
  const favoriteName = <span className="whitespace-nowrap">“{CLUSTER_LABELS.community_favorite.label}”</span>;
  const hiddenGemName = <span className="whitespace-nowrap">“{CLUSTER_LABELS.hidden_gem.label}”</span>;
  const treeInUse = timing?.used_for_recommendations === true;

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="display text-4xl sm:text-5xl">ภาพรวมตลาด</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            สรุปจากราคาทุกร้านตอนนี้ ว่างบเท่าไรได้สเปกระดับไหน อะไรทำให้ของแพง และของชิ้นไหนที่คนซื้อจริง · คำนวณล่าสุด{" "}
            {formatDateTime(computedAt)}
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
      </section>

      <Section
        id="ladder"
        title="งบเท่านี้ได้สเปกแค่ไหน"
        subtitle="ราคาเริ่มต้นและราคาทั่วไปของแต่ละระดับสเปก นับรุ่นละหนึ่งราคา (ร้านที่ถูกที่สุดตอนนี้)"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c) => {
            const p = find(insights, c, "simple_regression");
            const ladder = priceLadder(points, c);
            if (!p || ladder.length === 0) return null;
            const perUnit = roundForCopy(num(p.slope_thb_per_unit) * UNIT[c].scale);
            return (
              <div key={c} className="card space-y-4 p-5">
                <h3 className="display border-b-[3px] border-border pb-2 text-xl">{CATEGORY_LABELS[c]}</h3>
                <p className="text-sm">
                  {UNIT[c].step} ราคาเพิ่มเฉลี่ยราว{" "}
                  <span className="tabular font-bold">{formatTHB(perUnit)}</span>{" "}
                  <StatNote
                    text={`ความเชื่อถือ${reliability(num(p.r2))}`}
                    detail={`Simple Linear Regression: Ŷ = β₀ + β₁X · β₁ = ${fixed(p.slope_thb_per_unit, 1)} บาท/${String(p.unit)} · R² = ${fixed(p.r2)} · n = ${String(p.n)}`}
                  />
                </p>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1.5 font-medium">{UNIT[c].axis}</th>
                      <th className="py-1.5 text-right font-medium">เริ่มต้น</th>
                      <th className="py-1.5 text-right font-medium">ราคาทั่วไป</th>
                      <th className="hidden py-1.5 pl-4 font-medium sm:table-cell">รุ่นที่ถูกที่สุด</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {ladder.map((r) => (
                      <tr key={r.tier} className="border-t-2 border-border">
                        <td className="py-2 font-medium whitespace-nowrap">
                          {tierLabel(c, r.tier)}
                          <span className="ml-1.5 text-xs font-normal text-subtle">{r.models} รุ่น</span>
                        </td>
                        <td className="py-2 text-right font-semibold">
                          <Link href={`/product/${r.cheapest.id}`} prefetch={false} className="link" title={r.cheapest.model}>
                            {formatTHB(r.from)}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-muted">{formatTHB(r.typical)}</td>
                        <td className="hidden max-w-[11rem] truncate py-2 pl-4 font-sans sm:table-cell">
                          <Link href={`/product/${r.cheapest.id}`} prefetch={false} className="link" title={r.cheapest.model}>
                            {r.cheapest.model}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details className="group">
                  <summary className="btn btn-secondary gap-3 px-4 text-sm">
                    ดูกราฟราคาทุกรายการ
                    <span aria-hidden className="disclosure" />
                  </summary>
                  <div className="mt-2 space-y-2">
                    <SpecScatter
                      points={points.filter((q) => q.category === c)}
                      slope={num(p.slope_thb_per_unit)}
                      intercept={num(p.intercept_thb)}
                      xLabel={UNIT[c].axis}
                      xUnit={UNIT[c].axisUnit}
                    />
                    <p className="text-xs text-muted">
                      จุดหนึ่งจุดคือสินค้าหนึ่งรายการ เส้นคือราคาเฉลี่ยของตลาด · จุดที่อยู่ใต้เส้นมาก ๆ
                      คือได้สเปกเยอะในราคาต่ำกว่าตลาด
                    </p>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">กดราคาเริ่มต้นเพื่อดูรุ่นที่ถูกที่สุดของระดับนั้น</p>
      </Section>

      <Section
        id="drivers"
        title="อะไรทำให้ราคาแพงขึ้น"
        subtitle="ปัจจัยที่มีผลต่อราคามากที่สุด เรียงจากมากไปน้อย เมื่อเทียบสินค้าที่สเปกอื่นเหมือนกัน"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c) => {
            const p = find(insights, c, "fair_value_mlr");
            const factors = mainFactors((p?.coefficients as Coefficient[]) ?? []);
            if (!p || factors.length === 0) return null;
            return (
              <div key={c} className="card space-y-4 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="display text-xl">{CATEGORY_LABELS[c]}</h3>
                  <StatNote
                    text={`ราคายุติธรรมคลาดเคลื่อนเฉลี่ย ~${fixed(num(p.mape_cv) * 100, 0)}%`}
                    detail={`Multiple Linear Regression บน log(ราคา) · R²(cross-validated) = ${fixed(p.r2_cv)} · MAPE = ${fixed(num(p.mape_cv) * 100, 1)}% · n = ${String(p.n)}${siblingDetail(p)}`}
                  />
                </div>
                <ol className="space-y-3">
                  {factors.map((f, i) => {
                    const yesNo = BOOLEAN_FEATURES.has(f.feature);
                    const direction = yesNo
                      ? f.raises
                        ? "ราคาสูงกว่า"
                        : "ราคาต่ำกว่า"
                      : f.raises
                        ? "ยิ่งสูง ยิ่งแพง"
                        : "ยิ่งสูง ยิ่งถูก";
                    return (
                      <li key={f.feature} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
                        <span className="tabular flex h-6 w-6 items-center justify-center bg-foreground text-xs font-bold text-background">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{featureLabel(f.feature)}</div>
                          {hint(c, f.feature) && <div className="text-xs text-muted">{hint(c, f.feature)}</div>}
                        </div>
                        <span className="pt-0.5 text-xs whitespace-nowrap text-muted">
                          {f.raises ? "▲" : "▼"} {direction}
                        </span>
                        <div
                          className="col-start-2 col-end-4 h-3 border-2 border-border bg-surface"
                          role="img"
                          aria-label={`ผลต่อราคา ${Math.round(f.weight * 100)}% ของปัจจัยอันดับ 1`}
                        >
                          <div
                            className="h-full bg-foreground"
                            style={{ width: `${Math.max(f.weight * 100, 3)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          แถบยาว = มีผลต่อราคามาก เทียบกับปัจจัยอันดับ 1 ของหมวดนั้น · มาจากโมเดลเดียวกับที่คิดราคายุติธรรมและ Deal Score
          (ตัวเลขละเอียดและกราฟอยู่ที่{" "}
          <Link href="/ml#mlr" className="link">
            เบื้องหลัง ML
          </Link>
          )
        </p>
      </Section>

      <Section
        id="demand"
        title="ของที่คนซื้อจริง"
        subtitle={
          rankedSales
            ? "จัดกลุ่มรุ่นสินค้าจากยอดเข้าชมของทุกร้านรวมกัน และอันดับยอดขายภายในแต่ละร้าน ด้วย K-Means รุ่นหนึ่งอยู่กลุ่มเดียว · ใช้ข้อมูลเฉพาะร้านที่เปิดเผยตัวเลขเหล่านี้"
            : `จัดกลุ่มรุ่นสินค้าจากยอดเข้าชมและยอดขายจริง${perModel ? "ของทุกร้านรวมกัน" : ""}ด้วย K-Means รุ่นหนึ่งอยู่กลุ่มเดียว · ใช้ข้อมูลเฉพาะร้านที่เปิดเผยตัวเลขเหล่านี้`
        }
      >
        {segments.length > 0 ? (
          <div className={`grid gap-4 sm:grid-cols-2 ${segments.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            {segments.map((c) => {
              const models = modelCounts[c.label] ?? 0;
              const share = clustered ? models / clustered : 0;
              // v9+: share of the same store's items the group's models outsell
              // (strictly), as a whole percent; not sales_rank_pct, whose
              // average rank puts tied zero sellers mid-table.
              // The same statistic the list's group line quotes (SPEC round 18):
              // the median over the models that carry the badge when the payload
              // has it (labelled_*, 2026.11-v15+; v14: the cluster's median),
              // else an older payload's mean, titled as a mean.
              const group = demandRef.groups[c.label];
              const salesTile =
                group && group.salesBeats !== null ? shareTile(group.salesBeats, demandRef, group.salesBeatsIsMedian) : null;
              // Median when the payload has it (SPEC round 11), else the mean
              // of an older payload's merged centroids.
              const typicalViews = Number.isFinite(num(c.labelled_views_median))
                ? num(c.labelled_views_median)
                : Number.isFinite(num(c.views_median))
                  ? num(c.views_median)
                  : c.views;
              return (
                <Link
                  key={c.label}
                  href={`/?cluster=${c.label}`}
                  className="card invert-hover flex flex-col gap-4 p-5"
                >
                  <div>
                    <div className="display text-xl">{CLUSTER_LABELS[c.label].label}</div>
                    <div className="text-xs text-muted">{CLUSTER_LABELS[c.label].hint}</div>
                  </div>
                  {/* Two stat tiles side by side while each fits "~1 ชิ้น / NNN วัน" (or
                      "ขายดีกว่า ~NN%") on one line (9rem = 119 px of text + padding;
                      values are nowrap), stacked on narrower cards (4-up desktop). Same
                      width per row of cards, so tiles stack alike. */}
                  <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2 text-xs">
                    <div className="border-2 border-border p-2.5">
                      <dt className="text-muted">คนดูโดยทั่วไป</dt>
                      <dd className="tabular text-sm font-semibold">
                        {Math.round(typicalViews).toLocaleString("th-TH")} ครั้ง
                      </dd>
                    </div>
                    {salesTile ? (
                      <div className="border-2 border-border p-2.5">
                        <dt className="text-muted">{salesTile.title}</dt>
                        <dd className="tabular text-sm font-semibold whitespace-nowrap">{salesTile.value}</dd>
                        <dd className="text-muted">{salesTile.note}</dd>
                      </div>
                    ) : (
                      <div className="border-2 border-border p-2.5">
                        <dt className="text-muted">ขายได้</dt>
                        <dd className="tabular text-sm font-semibold whitespace-nowrap">{salesRate(c.sales_per_day)}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-auto flex items-baseline justify-between gap-2 text-xs text-muted">
                    <span className="tabular">
                      {models.toLocaleString("th-TH")} รุ่น ({Math.round(share * 100)}%)
                    </span>
                    <span className="font-bold text-foreground underline underline-offset-2">ดูสินค้า →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="card p-6 text-sm text-muted">ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม</p>
        )}
        {Number.isFinite(splitViews) && (
          <p className="max-w-3xl text-xs leading-relaxed text-muted">
            {favoriteName} และ {hiddenGemName} คือสินค้าที่ขายดีกว่าค่าเฉลี่ยชัดเจนทั้งคู่
            {rankedSales && " (เทียบอันดับยอดขายภายในร้าน)"} แล้วแยกกันด้วยยอดเข้าชม: คนดูมากกว่า{" "}
            <span className="tabular whitespace-nowrap">{Math.round(splitViews).toLocaleString("th-TH")} ครั้ง</span>{" "}
            (ค่ากลางของรุ่นขายดี) เป็น {favoriteName} ไม่เกินนั้นเป็น {hiddenGemName} · เส้นแบ่งนี้ใช้แยกเฉพาะ 2
            กลุ่มขายดีเท่านั้น กลุ่มที่ขายน้อยไม่ได้แบ่งด้วยเส้นนี้
          </p>
        )}
        {rankedSales && (
          <p className="max-w-3xl text-xs leading-relaxed text-muted">
            แต่ละร้านวัดยอดขายต่างกัน: JIB ใช้ยอดขายที่ร้านประกาศ ส่วน IHAVECPU ใช้สต็อกที่ลดลง
            (อาจรวมการขายส่งหรือโอนสาขา) ตัวเลขชิ้นต่อวันจึงเทียบข้ามร้านไม่ได้ ระบบจึงจัดอันดับยอดขายภายในร้านเดียวกันก่อน
            แล้วเฉลี่ยอันดับของรุ่นจากทุกร้านที่มีข้อมูล
          </p>
        )}
      </Section>

      <Section id="advice" title="ป้าย ซื้อเลย / รอก่อน คิดจากอะไร">
        <div className="card space-y-4 p-5">
          {treeInUse ? (
            <p className="text-sm leading-relaxed">
              ป้ายบนเว็บมาจาก Decision Tree ที่เรียนรู้จากประวัติราคาจริงของแต่ละรุ่น ว่าหลังจากนี้ราคามักลดลงหรือของมักหมด
            </p>
          ) : (
            <ul className="space-y-3">
              {ADVICE_RULES.map((a) => (
                <li key={a.value} className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-3">
                  <span>
                    <RecommendationBadge value={a.value} />
                  </span>
                  <span className="text-sm">{a.rule}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t-2 border-border pt-3 text-xs leading-relaxed text-muted">
            {treeInUse
              ? "ระบบ train ใหม่ทุก 3 ชั่วโมงจากราคาล่าสุด"
              : "ตอนนี้ใช้กฎตรง ๆ ข้างบน เพราะประวัติราคายังสั้นเกินไปให้โมเดลทำนายแม่นพอ ระบบ train ใหม่ทุก 3 ชั่วโมง และจะเปลี่ยนไปใช้โมเดลเองเมื่อแม่นพอ"}{" "}
            {timing && (
              <StatNote
                text={`ความแม่นของโมเดลตอนนี้ ${fixed(num(timing.balanced_accuracy_test) * 100, 0)}% (ต้องถึง 60%)`}
                detail={`Balanced accuracy (test แบ่งตามเวลา) ${fixed(num(timing.balanced_accuracy_test) * 100, 1)}% เทียบกับสุ่มทาย ${fixed(num(timing.baseline_balanced_accuracy) * 100, 1)}%`}
              />
            )}
          </p>
        </div>
      </Section>

      <Link href="/ml" className="card invert-hover flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
        <span>
          <span className="display block text-lg sm:text-xl">รายละเอียดทางสถิติย้ายไปที่ “เบื้องหลัง ML”</span>
          <span className="block text-sm text-muted">
            กราฟและวิธีอ่านของโมเดลทุกตัว: Regression, Decision Tree, K-Means, Hierarchical Clustering และการจับคู่สินค้า
          </span>
        </span>
        <span className="font-bold whitespace-nowrap underline underline-offset-2">ดูเบื้องหลัง ML →</span>
      </Link>
    </div>
  );
}
