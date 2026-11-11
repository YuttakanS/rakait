import Link from "next/link";
import { RecommendationBadge } from "@/components/badges";
import { EffectBars, type Effect } from "@/components/effect-bars";
import { CategoryGlyph, ChevronIcon, Glyph, InfoIcon } from "@/components/icons";
import { SpecScatter } from "@/components/spec-scatter";
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
import { getCoverage, getMarketInsights, getSpecPoints } from "@/lib/queries";
import type { Category, DemandCluster, MarketInsight, Recommendation } from "@/lib/types";

export const revalidate = 900;

type Coefficient = Effect & { beta: number };
type Diagnostics = {
  max_vif: number;
  skew: number;
  excess_kurtosis: number;
  jarque_bera_p: number;
  breusch_pagan_p: number;
};
type Centroid = {
  cluster: number;
  label: DemandCluster;
  size: number;
  views: number;
  sales_per_day: number;
  normalized_price: number;
};
type CurvePoint = { threshold: number; coverage: number; precision: number | null };
type CategoryLinkage = {
  listings: number;
  rule_linked: number;
  excluded: number;
  products: number;
  similarity_linked?: number;
  evaluation?: { threshold: number | null; curve: CurvePoint[] };
  duplicate_candidates?: { a: string; b: string; cosine: number }[];
};

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
    rule: "Deal Score 80 ขึ้นไป และถูกกว่าราคายุติธรรมมากกว่าช่วงคลาดเคลื่อน ± ที่แสดงคู่กัน: ถูกกว่าราคายุติธรรมของสเปกนี้ชัดเจน",
  },
  {
    value: "wait",
    rule: "Deal Score 20 ลงมา และแพงกว่าราคายุติธรรมมากกว่าช่วงคลาดเคลื่อน ± (แพงกว่าชัดเจน) หรือสินค้าหมดที่ร้านนั้น",
  },
  {
    value: "fair_price",
    rule: "ที่เหลือที่มี Deal Score: ราคาใกล้เคียงราคายุติธรรม หรือส่วนต่างยังไม่เกินช่วง ± (หรือยังไม่ทราบช่วง) จึงยังสรุปไม่ได้ว่าถูกหรือแพงกว่าตลาดจริง",
  },
];

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);
const fixed = (v: unknown, d = 2): string => (Number.isFinite(num(v)) ? num(v).toFixed(d) : "–");

/**
 * K-Means can yield two clusters with the same profile name (e.g. two "niche"
 * groups at different price levels). Shoppers see one segment per name:
 * sizes add up and averages are size-weighted. Fixed order (SEGMENT_ORDER).
 */
function mergeByLabel(centroids: Centroid[]): Centroid[] {
  const merged = new Map<DemandCluster, Centroid>();
  for (const c of centroids) {
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
  return [...merged.values()].sort((a, b) => SEGMENT_ORDER.indexOf(a.label) - SEGMENT_ORDER.indexOf(b.label));
}

function find(insights: MarketInsight[], category: string, kind: string) {
  return insights.find((i) => i.category === category && i.kind === kind)?.payload;
}

/** One-line OLS assumption checks under an MLR coefficient table. */
function DiagnosticsLine({ d }: { d: Diagnostics }) {
  const p = (v: number): string => (v < 0.001 ? "<0.001" : fixed(v, 3));
  return (
    <p className="tabular mt-2 border-t border-border pt-2 text-xs text-muted">
      max VIF {fixed(d.max_vif, 1)} · skew {fixed(d.skew)} · excess kurt {fixed(d.excess_kurtosis)} · JB p{" "}
      {p(d.jarque_bera_p)} · BP p {p(d.breusch_pagan_p)}
    </p>
  );
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
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Small grey statistic with the full detail in a native tooltip (ⓘ). */
function StatNote({ text, detail }: { text: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-subtle" title={detail}>
      {text} <InfoIcon className="h-3 w-3" />
    </span>
  );
}

const hint = (c: Category, feature: string): string | undefined =>
  FACTOR_HINTS[`${c}.${feature}`] ?? FACTOR_HINTS[feature];

/** Icon disc used by section cards. */
function IconDisc({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
      {children}
    </span>
  );
}

export default async function InsightsPage() {
  const [insights, coverage, points] = await Promise.all([getMarketInsights(), getCoverage(), getSpecPoints()]);
  const categories = Object.keys(CATEGORY_LABELS) as Category[];
  const kmeans = find(insights, "all", "demand_kmeans");
  const hierarchy = find(insights, "all", "demand_hierarchical");
  const timing = find(insights, "all", "timing_tree");
  const linkage = find(insights, "all", "linkage_quality") as Record<string, CategoryLinkage> | undefined;
  // linkage_quality is written by the link step, not training: exclude it from "computed at".
  const computedAt = insights.find((i) => i.kind !== "linkage_quality")?.computedAt ?? null;
  const centroids = mergeByLabel((kmeans?.centroids as Centroid[]) ?? []);
  const clustered = centroids.reduce((s, c) => s + c.size, 0);
  const treeInUse = timing?.used_for_recommendations === true;

  return (
    <div className="space-y-12">
      <section className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">ภาพรวมตลาด</h1>
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
              className="rounded-full border border-border bg-surface px-3 py-2 text-sm text-muted transition-colors hover:border-accent-soft hover:text-accent focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none"
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
                <div className="flex items-center gap-3">
                  <IconDisc>
                    <CategoryGlyph category={c} className="h-5 w-5" />
                  </IconDisc>
                  <h3 className="text-lg font-semibold">{CATEGORY_LABELS[c]}</h3>
                </div>
                <p className="text-sm">
                  {UNIT[c].step} ราคาเพิ่มเฉลี่ยราว{" "}
                  <span className="tabular font-semibold text-accent">{formatTHB(perUnit)}</span>{" "}
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
                      <tr key={r.tier} className="border-t border-border">
                        <td className="py-2 font-medium whitespace-nowrap">
                          {tierLabel(c, r.tier)}
                          <span className="ml-1.5 text-xs font-normal text-subtle">{r.models} รุ่น</span>
                        </td>
                        <td className="py-2 text-right font-semibold">
                          <Link
                            href={`/product/${r.cheapest.id}`}
                            className="hover:text-accent hover:underline"
                            title={r.cheapest.model}
                          >
                            {formatTHB(r.from)}
                          </Link>
                        </td>
                        <td className="py-2 text-right text-muted">{formatTHB(r.typical)}</td>
                        <td className="hidden max-w-[11rem] truncate py-2 pl-4 sm:table-cell">
                          <Link href={`/product/${r.cheapest.id}`} className="text-accent hover:underline" title={r.cheapest.model}>
                            {r.cheapest.model}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details className="group">
                  <summary className="inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-accent">
                    ดูกราฟราคาทุกรายการ
                    <ChevronIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
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
                  <h3 className="text-lg font-semibold">{CATEGORY_LABELS[c]}</h3>
                  <StatNote
                    text={`ราคายุติธรรมคลาดเคลื่อนเฉลี่ย ~${fixed(num(p.mape_cv) * 100, 0)}%`}
                    detail={`Multiple Linear Regression บน log(ราคา) · R²(cross-validated) = ${fixed(p.r2_cv)} · MAPE = ${fixed(num(p.mape_cv) * 100, 1)}% · n = ${String(p.n)}`}
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
                        <span className="tabular flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-muted">
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
                          className="col-start-2 col-end-4 h-1.5 rounded-full bg-neutral-bg"
                          role="img"
                          aria-label={`ผลต่อราคา ${Math.round(f.weight * 100)}% ของปัจจัยอันดับ 1`}
                        >
                          <div
                            className="h-1.5 rounded-full bg-[var(--series-1)]"
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
          (ตัวเลขละเอียดอยู่ในรายละเอียดทางสถิติด้านล่าง)
        </p>
      </Section>

      <Section
        id="demand"
        title="ของที่คนซื้อจริง"
        subtitle="จัดกลุ่มสินค้าจากยอดเข้าชมและยอดขายจริงด้วย K-Means · ใช้ข้อมูลเฉพาะร้านที่เปิดเผยตัวเลขเหล่านี้"
      >
        {centroids.length > 0 ? (
          <div className={`grid gap-4 sm:grid-cols-2 ${centroids.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
            {centroids.map((c) => {
              const share = clustered ? c.size / clustered : 0;
              return (
                <Link
                  key={c.label}
                  href={`/?cluster=${c.label}`}
                  className="card card-interactive flex flex-col gap-4 p-5 focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none"
                >
                  <div className="flex items-center gap-3">
                    <IconDisc>
                      <Glyph name={c.label} className="h-5 w-5" />
                    </IconDisc>
                    <div>
                      <div className="font-semibold">{CLUSTER_LABELS[c.label].label}</div>
                      <div className="text-xs text-muted">{CLUSTER_LABELS[c.label].hint}</div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-[var(--radius-control)] bg-surface-muted p-2.5">
                      <dt className="text-muted">คนดูเฉลี่ย</dt>
                      <dd className="tabular text-sm font-semibold">{Math.round(c.views).toLocaleString("th-TH")} ครั้ง</dd>
                    </div>
                    <div className="rounded-[var(--radius-control)] bg-surface-muted p-2.5">
                      <dt className="text-muted">ขายได้</dt>
                      <dd className="tabular text-sm font-semibold">{salesRate(c.sales_per_day)}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex items-baseline justify-between gap-2 text-xs text-muted">
                    <span className="tabular">
                      {c.size.toLocaleString("th-TH")} รายการ ({Math.round(share * 100)}%)
                    </span>
                    <span className="font-medium text-accent">ดูสินค้า →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="card p-6 text-sm text-muted">ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม</p>
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
          <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted">
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

      <details className="card group p-5">
        <summary className="flex items-center justify-between gap-2 font-semibold">
          <span>รายละเอียดทางสถิติ (สำหรับคนที่อยากรู้ลึก)</span>
          <ChevronIcon className="h-5 w-5 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-5 space-y-8 text-sm">
          <div className="space-y-2">
            <h3 className="font-semibold">ข้อมูลที่ใช้</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px]">
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
                    <tr key={c.merchant} className="border-t border-border">
                      <td className="py-1.5">{c.merchantName}</td>
                      <td className="py-1.5 text-right">{c.listings.toLocaleString("th-TH")}</td>
                      <td className="py-1.5 text-right">
                        {c.listings ? `${Math.round((c.linked / c.listings) * 100)}%` : "–"}
                      </td>
                      <td className="py-1.5 text-right">{c.historyRows.toLocaleString("th-TH")}</td>
                      <td className="py-1.5 text-right">{c.firstObservation?.slice(0, 10) ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Simple Linear Regression: ราคาต่อหน่วยสเปก</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead className="text-left text-xs text-muted">
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
                  {categories.map((c) => {
                    const p = find(insights, c, "simple_regression");
                    if (!p) return null;
                    return (
                      <tr key={c} className="border-t border-border">
                        <td className="py-1.5">{CATEGORY_LABELS[c]}</td>
                        <td className="py-1.5">{String(p.feature)}</td>
                        <td className="py-1.5 text-right">{fixed(p.slope_thb_per_unit, 1)}</td>
                        <td className="py-1.5 text-right">{fixed(p.intercept_thb, 0)}</td>
                        <td className="py-1.5 text-right">{fixed(p.r2)}</td>
                        <td className="py-1.5 text-right">{String(p.n)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {linkage && (
            <div className="space-y-2">
              <h3 className="font-semibold">การจับคู่สินค้า: กฎ Regex + TF-IDF Similarity</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="text-left text-xs text-muted">
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
                    {categories.map((c) => {
                      const l = linkage[c];
                      if (!l) return null;
                      const t = l.evaluation?.threshold ?? null;
                      const point = l.evaluation?.curve.find((p) => p.threshold === t);
                      return (
                        <tr key={c} className="border-t border-border">
                          <td className="py-1.5">{CATEGORY_LABELS[c]}</td>
                          <td className="py-1.5 text-right">
                            {l.listings ? `${Math.round((l.rule_linked / l.listings) * 100)}%` : "–"}
                          </td>
                          <td className="py-1.5 text-right">{l.excluded}</td>
                          <td className="py-1.5 text-right">{t === null ? "ปิด" : fixed(t)}</td>
                          <td className="py-1.5 text-right">
                            {point
                              ? `${fixed(num(point.precision) * 100, 1)}% · ${fixed(point.coverage * 100, 0)}%`
                              : "–"}
                          </td>
                          <td className="py-1.5 text-right">{l.similarity_linked ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">
                threshold เลือกจากการทดสอบ leave-one-out เทียบกับผลของกฎ ให้ขอบล่าง 95% (Wilson) ของ precision ≥ 95% ·
                “ปิด” = ยังไม่มี threshold ที่ผ่านเกณฑ์ ระบบจึงไม่เดา · การ์ดจอ workstation และแรมโน้ตบุ๊กไม่อยู่ในขอบเขตโดยตั้งใจ
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold">Multiple Linear Regression: สัมประสิทธิ์</h3>
            <p className="text-xs text-muted">
              log(Price) = β₀ + Σβⱼxⱼ + ε บนฟีเจอร์ที่ standardize แล้ว · แถบ = % ราคาที่เปลี่ยนเมื่อฟีเจอร์เพิ่ม 1 SD ·
              residual eᵢ ติดลบมาก = ถูกกว่าตลาด → Deal Score สูง
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {categories.map((c) => {
                const p = find(insights, c, "fair_value_mlr");
                if (!p) return null;
                return (
                  <div key={c} className="rounded-[var(--radius-control)] border border-border p-3">
                    <div className="mb-2 flex justify-between gap-2">
                      <span className="font-medium">{CATEGORY_LABELS[c]}</span>
                      <span className="tabular text-xs text-muted">
                        R²(cv) {fixed(p.r2_cv)} · MAPE {fixed(num(p.mape_cv) * 100, 1)}% · n={String(p.n)}
                      </span>
                    </div>
                    <EffectBars effects={(p.coefficients as Coefficient[]) ?? []} />
                    <table className="mt-3 w-full text-xs">
                      <tbody className="tabular">
                        {((p.coefficients as Coefficient[]) ?? []).map((k) => (
                          <tr key={k.feature} className="border-t border-border">
                            <td className="py-0.5">{k.feature}</td>
                            <td className="py-0.5 text-right">β={k.beta.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {p.diagnostics ? <DiagnosticsLine d={p.diagnostics as Diagnostics} /> : null}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted">
              ตรวจสมมติฐาน OLS บน residual ในตัวอย่าง: VIF &gt; 10 = ตัวแปรซ้อนกัน (เทอม interaction ซ้อนกับตัวแม่โดยธรรมชาติ) ·
              Jarque–Bera / Breusch–Pagan p &lt; 0.05 = residual ไม่ปกติ / ความแปรปรวนไม่คงที่ จึงตีความ Deal Score เป็นอันดับเทียบกัน
              ไม่ใช่ความน่าจะเป็นแม่นยำ
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Regression Tree: ขอบเขตราคาตามระดับฮาร์ดแวร์ (max_depth = 4)</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {categories.map((c) => {
                const p = find(insights, c, "tier_tree");
                if (!p) return null;
                return (
                  <div key={c} className="rounded-[var(--radius-control)] border border-border p-3">
                    <div className="mb-1 font-medium">
                      {CATEGORY_LABELS[c]}{" "}
                      <span className="tabular text-xs font-normal text-muted">
                        R²(cv) {fixed(p.r2_cv)} · {String(p.leaves)} leaves
                      </span>
                    </div>
                    <pre className="max-h-64 overflow-auto text-xs leading-tight text-muted">{String(p.rules)}</pre>
                  </div>
                );
              })}
            </div>
          </div>

          {kmeans && (
            <div className="space-y-1">
              <h3 className="font-semibold">K-Means และ Hierarchical Clustering</h3>
              <p className="tabular text-xs text-muted">
                X = [log(Views+1), log(SalesVelocity+1), NormalizedPrice] (StandardScaler) · k={String(kmeans.k)} เลือกจาก
                silhouette = {fixed(kmeans.silhouette)} · n={String(kmeans.n)}
                {hierarchy &&
                  ` · Ward (k=${String(hierarchy.k)}): silhouette ${fixed(hierarchy.silhouette)}, ARI กับ K-Means ${fixed(hierarchy.ari_vs_kmeans)}, cophenetic r ${fixed(hierarchy.cophenetic_corr)}`}
              </p>
            </div>
          )}

          {timing && (
            <div className="space-y-1">
              <h3 className="font-semibold">Decision Tree: ซื้อเลย / รอก่อน / ราคาเหมาะสม (max_depth = 4)</h3>
              <p className="tabular text-xs text-muted">
                Balanced accuracy {fixed(num(timing.balanced_accuracy_test) * 100, 1)}% · สุ่มทาย{" "}
                {fixed(num(timing.baseline_balanced_accuracy) * 100, 1)}% · train {String(timing.n_train)} / test{" "}
                {String(timing.n_test)}
              </p>
              <pre className="max-h-72 overflow-auto text-xs leading-tight text-muted">{String(timing.rules)}</pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
