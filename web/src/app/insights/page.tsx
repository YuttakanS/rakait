import { CATEGORY_LABELS, CLUSTER_LABELS, formatDateTime, formatTHB } from "@/lib/format";
import { getCoverage, getMarketInsights } from "@/lib/queries";
import type { Category, DemandCluster, MarketInsight } from "@/lib/types";

export const revalidate = 900;

type Coefficient = { feature: string; beta: number; pct_effect_per_sd: number };
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
type Centroid = {
  cluster: number;
  label: DemandCluster;
  size: number;
  views: number;
  sales_per_day: number;
  normalized_price: number;
};

const num = (v: unknown): number => (typeof v === "number" ? v : Number.NaN);
const fixed = (v: unknown, d = 2): string => (Number.isFinite(num(v)) ? num(v).toFixed(d) : "–");

function find(insights: MarketInsight[], category: string, kind: string) {
  return insights.find((i) => i.category === category && i.kind === kind)?.payload;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function InsightsPage() {
  const [insights, coverage] = await Promise.all([getMarketInsights(), getCoverage()]);
  const categories = Object.keys(CATEGORY_LABELS) as Category[];
  const kmeans = find(insights, "all", "demand_kmeans");
  const hierarchy = find(insights, "all", "demand_hierarchical");
  const timing = find(insights, "all", "timing_tree");
  const linkage = find(insights, "all", "linkage_quality") as Record<string, CategoryLinkage> | undefined;
  // linkage_quality is written by the link step, not training: exclude it from "computed at".
  const computedAt = insights.find((i) => i.kind !== "linkage_quality")?.computedAt ?? null;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold">Market Insights</h1>
        <p className="mt-1 text-sm text-muted">ผลจากโมเดล ML ทั้งหมด · คำนวณล่าสุด {formatDateTime(computedAt)}</p>
      </section>

      <Card title="ข้อมูลที่ใช้">
        <div className="overflow-x-auto">
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
                <tr key={c.merchant} className="border-t border-border">
                  <td className="py-1">{c.merchantName}</td>
                  <td className="py-1 text-right">{c.listings.toLocaleString("th-TH")}</td>
                  <td className="py-1 text-right">
                    {c.listings ? `${Math.round((c.linked / c.listings) * 100)}%` : "–"}
                  </td>
                  <td className="py-1 text-right">{c.historyRows.toLocaleString("th-TH")}</td>
                  <td className="py-1 text-right">{c.firstObservation?.slice(0, 10) ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {linkage && (
        <Card title="การจับคู่สินค้า: กฎ Regex + TF-IDF Similarity">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
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
                      <td className="py-1">{CATEGORY_LABELS[c]}</td>
                      <td className="py-1 text-right">
                        {l.listings ? `${Math.round((l.rule_linked / l.listings) * 100)}%` : "–"}
                      </td>
                      <td className="py-1 text-right">{l.excluded}</td>
                      <td className="py-1 text-right">{t === null ? "ปิด" : fixed(t)}</td>
                      <td className="py-1 text-right">
                        {point ? `${fixed(num(point.precision) * 100, 1)}% · ${fixed(point.coverage * 100, 0)}%` : "–"}
                      </td>
                      <td className="py-1 text-right">{l.similarity_linked ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            ชื่อสินค้าแปลงเป็นเวกเตอร์ TF-IDF ของ character 3–5-gram แล้ววัด cosine similarity กับสินค้าที่กฎจับคู่ไว้แล้ว
            โดยสเปกหลัก (VRAM, ความจุ, DDR ฯลฯ) ต้องไม่ขัดกัน · threshold เลือกจากการทดสอบแบบ leave-one-out
            เทียบกับผลของกฎ ให้ขอบล่าง 95% ของ precision ไม่ต่ำกว่า 95% · “ปิด” = ยังไม่มี threshold ที่ผ่านเกณฑ์
            ระบบจึงไม่เดา · การ์ดจอ workstation และแรมโน้ตบุ๊กไม่อยู่ในขอบเขตโดยตั้งใจ
          </p>
          {categories.some((c) => (linkage[c]?.duplicate_candidates ?? []).length > 0) && (
            <div className="text-xs">
              <div className="font-medium">รุ่นที่อาจเป็นสินค้าเดียวกัน (รอตรวจ ไม่รวมอัตโนมัติ)</div>
              <ul className="mt-1 space-y-0.5 text-muted">
                {categories.flatMap((c) =>
                  (linkage[c]?.duplicate_candidates ?? []).map((d) => (
                    <li key={`${c}-${d.a}-${d.b}`} className="tabular">
                      {d.a} ↔ {d.b} (cosine {fixed(d.cosine)})
                    </li>
                  )),
                )}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card title="A. Simple Linear Regression: ราคาต่อหน่วยสเปก">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((c) => {
            const p = find(insights, c, "simple_regression");
            if (!p) return null;
            return (
              <div key={c} className="rounded-lg border border-border p-3">
                <div className="text-xs text-muted">{CATEGORY_LABELS[c]}</div>
                <div className="tabular text-xl font-bold">{formatTHB(num(p.slope_thb_per_unit))}</div>
                <div className="text-xs text-muted">
                  ต่อ 1 {String(p.unit)} · R² {fixed(p.r2)} · n={String(p.n)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">Ŷ = β₀ + β₁X · β₁ คือราคาที่เพิ่มขึ้นต่อสเปก 1 หน่วยในตลาดตอนนี้</p>
      </Card>

      <Card title="B. Multiple Linear Regression: ราคายุติธรรม (log-linear)">
        <div className="grid gap-4 lg:grid-cols-2">
          {categories.map((c) => {
            const p = find(insights, c, "fair_value_mlr");
            if (!p) return null;
            const coefs = (p.coefficients as Coefficient[]) ?? [];
            return (
              <div key={c} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-medium">{CATEGORY_LABELS[c]}</span>
                  <span className="tabular text-xs text-muted">
                    R²(cv) {fixed(p.r2_cv)} · MAPE {fixed(num(p.mape_cv) * 100, 1)}% · n={String(p.n)}
                  </span>
                </div>
                <table className="w-full text-xs">
                  <tbody className="tabular">
                    {coefs.map((k) => (
                      <tr key={k.feature} className="border-t border-border">
                        <td className="py-0.5">{k.feature}</td>
                        <td className="py-0.5 text-right">β={k.beta.toFixed(3)}</td>
                        <td className="py-0.5 text-right">
                          {k.pct_effect_per_sd >= 0 ? "+" : ""}
                          {(k.pct_effect_per_sd * 100).toFixed(1)}% / SD
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          log(Price) = β₀ + Σβⱼxⱼ + ε บนฟีเจอร์ที่ standardize แล้ว · residual eᵢ ติดลบมาก = ถูกกว่าตลาด → Deal
          Score สูง
        </p>
      </Card>

      <Card title="C. Regression Tree: ขอบเขตราคาตามระดับฮาร์ดแวร์ (max_depth = 4)">
        <div className="grid gap-4 lg:grid-cols-2">
          {categories.map((c) => {
            const p = find(insights, c, "tier_tree");
            if (!p) return null;
            return (
              <div key={c} className="rounded-lg border border-border p-3">
                <div className="mb-1 text-sm font-medium">
                  {CATEGORY_LABELS[c]}{" "}
                  <span className="tabular text-xs text-muted">
                    R²(cv) {fixed(p.r2_cv)} · {String(p.leaves)} leaves
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto text-[11px] leading-tight text-muted">{String(p.rules)}</pre>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="D. K-Means: กลุ่มความต้องการของตลาด">
        {kmeans ? (
          <>
            <p className="text-xs text-muted">
              X = [log(Views+1), log(SalesVelocity+1), NormalizedPrice] (StandardScaler) · k={String(kmeans.k)}{" "}
              เลือกจาก silhouette = {fixed(kmeans.silhouette)} · n={String(kmeans.n)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {((kmeans.centroids as Centroid[]) ?? []).map((c) => (
                <div key={c.cluster} className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">{CLUSTER_LABELS[c.label].label}</div>
                  <div className="text-xs text-muted">{CLUSTER_LABELS[c.label].hint}</div>
                  <div className="tabular mt-2 text-xs">
                    {c.size} สินค้า · ~{Math.round(c.views).toLocaleString("th-TH")} views ·{" "}
                    {c.sales_per_day.toFixed(2)} ชิ้น/วัน · ราคา ×{c.normalized_price.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            {hierarchy && (
              <p className="tabular text-xs text-muted">
                เทียบกับ Hierarchical Clustering (Ward, ตัดที่ k={String(hierarchy.k)}): silhouette{" "}
                {fixed(hierarchy.silhouette)} · ARI กับ K-Means {fixed(hierarchy.ari_vs_kmeans)} (1 = แบ่งกลุ่มเหมือนกัน,
                0 = ตรงกันแค่บังเอิญ) · cophenetic r {fixed(hierarchy.cophenetic_corr)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">ยังมีข้อมูลยอดขายไม่พอสำหรับจัดกลุ่ม</p>
        )}
      </Card>

      <Card title="E. Decision Tree: ซื้อเลย / รอก่อน / ราคาเหมาะสม (max_depth = 4)">
        {timing ? (
          <>
            <p className="tabular text-sm">
              Balanced accuracy (test, แบ่งตามเวลา) {fixed(num(timing.balanced_accuracy_test) * 100, 1)}% เทียบกับ
              สุ่มทาย {fixed(num(timing.baseline_balanced_accuracy) * 100, 1)}% · train {String(timing.n_train)} / test{" "}
              {String(timing.n_test)}
            </p>
            <p className="text-xs text-muted">
              Label ส่วนใหญ่คือ “ราคาเหมาะสม” (ราคาส่วนใหญ่นิ่ง) accuracy ธรรมดาจึงหลอกตา ระบบจึงวัดด้วย balanced
              accuracy และจะใช้ต้นไม้ทำคำแนะนำบนเว็บเมื่อได้อย่างน้อย 60% ·{" "}
              {timing.used_for_recommendations
                ? "ตอนนี้คำแนะนำมาจากต้นไม้นี้"
                : "ตอนนี้ยังไม่ถึงเกณฑ์ คำแนะนำจึงใช้กฎจาก Deal Score และสต็อกแทน (ต้นไม้ train ใหม่ทุก 3 ชั่วโมงเมื่อมีประวัติเพิ่ม)"}
            </p>
            <pre className="max-h-72 overflow-auto text-[11px] leading-tight text-muted">{String(timing.rules)}</pre>
          </>
        ) : (
          <p className="text-sm text-muted">
            ประวัติราคายังสั้นเกินไปสำหรับ train ต้นไม้ ตอนนี้คำแนะนำใช้กฎจาก Deal Score และสต็อกแทน
          </p>
        )}
      </Card>
    </div>
  );
}
