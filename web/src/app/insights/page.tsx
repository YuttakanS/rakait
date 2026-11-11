import { EffectBars, type Effect } from "@/components/effect-bars";
import { ChevronIcon, Glyph, InfoIcon } from "@/components/icons";
import { SpecScatter } from "@/components/spec-scatter";
import { CATEGORY_LABELS, CLUSTER_LABELS, formatDateTime, formatTHB } from "@/lib/format";
import { getCoverage, getMarketInsights, getSpecPoints } from "@/lib/queries";
import type { Category, DemandCluster, MarketInsight } from "@/lib/types";

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
const UNIT: Record<Category, { scale: number; unit: string; axis: string; axisUnit: string }> = {
  gpu: { scale: 1, unit: "ต่อ 1 GB VRAM", axis: "VRAM", axisUnit: "GB" },
  cpu: { scale: 1, unit: "ต่อ 1 คอร์", axis: "จำนวนคอร์", axisUnit: "คอร์" },
  ram: { scale: 1, unit: "ต่อ 1 GB", axis: "ความจุ", axisUnit: "GB" },
  ssd: { scale: 1000, unit: "ต่อ 1 TB", axis: "ความจุ", axisUnit: "GB" },
};

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);
const fixed = (v: unknown, d = 2): string => (Number.isFinite(num(v)) ? num(v).toFixed(d) : "–");

/**
 * K-Means can yield two clusters with the same profile name (e.g. two "niche"
 * groups at different price levels). Shoppers see one segment per name:
 * sizes add up and averages are size-weighted. Largest segment first.
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
  return [...merged.values()].sort((a, b) => b.size - a.size);
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
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
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

  return (
    <div className="space-y-12">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">ภาพรวมตลาด</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          ตอนนี้สเปกแต่ละอย่างราคาเท่าไร อะไรทำให้ของแพง และสินค้ากลุ่มไหนคนซื้อจริง สรุปจากราคาทุกร้านด้วย Machine
          Learning · คำนวณล่าสุด {formatDateTime(computedAt)}
        </p>
      </section>

      <Section title="ราคาต่อหน่วยสเปกตอนนี้" subtitle="ถ้าสเปกเพิ่มขึ้น 1 หน่วย ราคาในตลาดเพิ่มขึ้นโดยเฉลี่ยเท่านี้">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => {
            const p = find(insights, c, "simple_regression");
            if (!p) return null;
            return (
              <div key={c} className="card space-y-1 p-5">
                <div className="text-sm font-medium text-muted">{CATEGORY_LABELS[c]}</div>
                <div className="tabular text-3xl font-bold tracking-tight">
                  {formatTHB(num(p.slope_thb_per_unit) * UNIT[c].scale)}
                </div>
                <div className="text-sm text-muted">{UNIT[c].unit}</div>
                <StatNote
                  text={`จาก ${String(p.n)} รายการ`}
                  detail={`Simple Linear Regression: Ŷ = β₀ + β₁X · β₁ = ${fixed(p.slope_thb_per_unit, 1)} บาท/${String(p.unit)} · R² = ${fixed(p.r2)}`}
                />
              </div>
            );
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c) => {
            const p = find(insights, c, "simple_regression");
            const pts = points.filter((q) => q.category === c);
            if (!p || pts.length === 0) return null;
            return (
              <figure key={c} className="card space-y-2 p-4">
                <figcaption className="flex items-baseline justify-between">
                  <span className="font-medium">
                    {CATEGORY_LABELS[c]}: ราคา vs {UNIT[c].axis}
                  </span>
                  <span className="text-xs text-subtle">R² {fixed(p.r2)}</span>
                </figcaption>
                <SpecScatter
                  points={pts}
                  slope={num(p.slope_thb_per_unit)}
                  intercept={num(p.intercept_thb)}
                  xLabel={UNIT[c].axis}
                  xUnit={UNIT[c].axisUnit}
                />
              </figure>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          จุดแต่ละจุดคือสินค้าหนึ่งรายการ เส้นคือราคาตลาดเฉลี่ย · จุดที่อยู่<span className="font-medium text-foreground">ใต้เส้นมาก ๆ</span>{" "}
          คือได้สเปกเยอะในราคาต่ำกว่าตลาด
        </p>
      </Section>

      <Section
        title="อะไรทำให้ราคาแพงขึ้น"
        subtitle="ผลของแต่ละปัจจัยต่อราคา เมื่อปัจจัยอื่นเท่ากัน (โมเดลเดียวกับที่ใช้คำนวณราคายุติธรรมและ Deal Score)"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c) => {
            const p = find(insights, c, "fair_value_mlr");
            if (!p) return null;
            return (
              <div key={c} className="card space-y-3 p-5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{CATEGORY_LABELS[c]}</span>
                  <StatNote
                    text={`คลาดเคลื่อนเฉลี่ย ${fixed(num(p.mape_cv) * 100, 0)}%`}
                    detail={`Multiple Linear Regression บน log(ราคา) · R²(cross-validated) = ${fixed(p.r2_cv)} · MAPE = ${fixed(num(p.mape_cv) * 100, 1)}% · n = ${String(p.n)}`}
                  />
                </div>
                <EffectBars effects={(p.coefficients as Coefficient[]) ?? []} />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">ตัวเลขคือราคาที่เปลี่ยนไป (%) เมื่อปัจจัยนั้นสูงขึ้น 1 ส่วนเบี่ยงเบนมาตรฐาน</p>
      </Section>

      <Section title="กลุ่มความต้องการของตลาด" subtitle="แบ่งสินค้าตามยอดเข้าชมและยอดขายจริงด้วย K-Means">
        {centroids.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {centroids.map((c) => {
              const share = clustered ? c.size / clustered : 0;
              return (
                <div key={c.cluster} className="card space-y-3 p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Glyph name={c.label} className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="font-semibold">{CLUSTER_LABELS[c.label].label}</div>
                      <div className="text-xs text-muted">{CLUSTER_LABELS[c.label].hint}</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between text-xs text-muted">
                      <span>
                        <span className="tabular text-lg font-bold text-foreground">{c.size}</span> สินค้า
                      </span>
                      <span className="tabular">{Math.round(share * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-neutral-bg">
                      <div className="h-1.5 rounded-full bg-[var(--series-1)]" style={{ width: `${share * 100}%` }} />
                    </div>
                  </div>
                  <div className="tabular text-xs text-muted">
                    ~{Math.round(c.views).toLocaleString("th-TH")} views · {c.sales_per_day.toFixed(2)} ชิ้น/วัน
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="card p-6 text-sm text-muted">ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม</p>
        )}
      </Section>

      <Section title="คำแนะนำ ซื้อเลย / รอก่อน">
        <div className="card p-5 text-sm leading-relaxed">
          {timing?.used_for_recommendations ? (
            <p>คำแนะนำบนเว็บมาจาก Decision Tree ที่เรียนรู้จากประวัติราคาจริงของแต่ละรุ่น</p>
          ) : (
            <p>
              ตอนนี้คำแนะนำใช้<span className="font-medium">กฎที่อธิบายได้</span> (Deal Score และสถานะสต็อก)
              เพราะประวัติราคายังสั้นเกินไปจนโมเดลทำนายไม่ดีกว่าการเดาพอ ระบบ train ใหม่ทุก 3 ชั่วโมง
              และจะสลับไปใช้โมเดลเองเมื่อแม่นพอ
            </p>
          )}
          {timing && (
            <StatNote
              text={`ความแม่นปัจจุบัน ${fixed(num(timing.balanced_accuracy_test) * 100, 0)}% (เกณฑ์ 60%)`}
              detail={`Balanced accuracy (test แบ่งตามเวลา) ${fixed(num(timing.balanced_accuracy_test) * 100, 1)}% เทียบกับสุ่มทาย ${fixed(num(timing.baseline_balanced_accuracy) * 100, 1)}%`}
            />
          )}
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
              log(Price) = β₀ + Σβⱼxⱼ + ε บนฟีเจอร์ที่ standardize แล้ว · residual eᵢ ติดลบมาก = ถูกกว่าตลาด → Deal Score สูง
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {categories.map((c) => {
                const p = find(insights, c, "fair_value_mlr");
                if (!p) return null;
                return (
                  <div key={c} className="rounded-[var(--radius-control)] border border-border p-3">
                    <div className="mb-2 flex justify-between">
                      <span className="font-medium">{CATEGORY_LABELS[c]}</span>
                      <span className="tabular text-xs text-muted">
                        R²(cv) {fixed(p.r2_cv)} · MAPE {fixed(num(p.mape_cv) * 100, 1)}% · n={String(p.n)}
                      </span>
                    </div>
                    <table className="w-full text-xs">
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
