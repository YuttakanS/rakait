import Link from "next/link";
import { notFound } from "next/navigation";
import { ClusterBadge, DealScore, RecommendationBadge } from "@/components/badges";
import { PriceChart } from "@/components/price-chart";
import { CATEGORY_LABELS, formatPct, formatTHB } from "@/lib/format";
import { getPriceHistory, getProduct } from "@/lib/queries";

export const revalidate = 900;

const SPEC_LABELS: Record<string, string> = {
  chip: "ชิป",
  vram_gb: "VRAM (GB)",
  memory_type: "ชนิดหน่วยความจำ",
  bus_width_bit: "Bus (bit)",
  boost_clock_mhz: "Boost clock (MHz)",
  shader_cores: "CUDA / Stream cores",
  cores: "Cores",
  threads: "Threads",
  base_clock_ghz: "Base clock (GHz)",
  socket: "Socket",
  cache_mb: "Cache (MB)",
  ddr: "DDR",
  capacity_gb: "ความจุ (GB)",
  speed_mhz: "ความเร็ว (MHz)",
  modules: "จำนวนแถว",
  module_gb: "ต่อแถว (GB)",
  cas_latency: "CL",
  nvme: "NVMe",
  pcie_gen: "PCIe Gen",
  form_factor: "Form factor",
  read_mbps: "อ่าน (MB/s)",
};

function specValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  if (v === null || v === undefined || v === "") return "–";
  return String(v);
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(id)) notFound();
  const [product, history] = await Promise.all([getProduct(id), getPriceHistory(id)]);
  if (!product) notFound();

  const inStock = product.offers.filter((o) => o.inStock);
  const cheapest = (inStock.length ? inStock : product.offers)[0];
  const names = Object.fromEntries(product.offers.map((o) => [o.merchant, o.merchantName]));
  const specs = Object.entries(product.specs).filter(([k]) => k in SPEC_LABELS);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← กลับไปหน้ารวม
      </Link>

      <section className="space-y-1">
        <p className="text-xs text-muted">
          {CATEGORY_LABELS[product.category]} · {product.manufacturer}
        </p>
        <h1 className="text-2xl font-bold">{product.model}</h1>
        {cheapest && (
          <p className="text-sm">
            ถูกสุดตอนนี้ <span className="tabular text-lg font-bold">{formatTHB(cheapest.price)}</span> ที่{" "}
            {cheapest.merchantName}
            {product.offers.length > 1 && (
              <span className="text-muted">
                {" "}
                · ส่วนต่างระหว่างร้านสูงสุด{" "}
                {formatTHB(Math.max(...product.offers.map((o) => o.price)) - cheapest.price)}
              </span>
            )}
          </p>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">ร้าน / สินค้า</th>
              <th className="px-3 py-2 text-right font-medium">ราคา</th>
              <th className="px-3 py-2 text-right font-medium">ราคายุติธรรม</th>
              <th className="px-3 py-2 font-medium">Deal</th>
              <th className="px-3 py-2 font-medium">คำแนะนำ</th>
              <th className="px-3 py-2 font-medium">สต็อก / ความต้องการ</th>
            </tr>
          </thead>
          <tbody>
            {product.offers.map((o) => (
              <tr key={o.listingId} className="border-b border-border align-top last:border-0">
                <td className="px-3 py-2">
                  <div className="font-medium">{o.merchantName}</div>
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 text-xs text-muted hover:text-accent"
                  >
                    {o.title}
                  </a>
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold">{formatTHB(o.price)}</td>
                <td className="tabular px-3 py-2 text-right">
                  {formatTHB(o.fairPrice)}
                  {o.pctVsFair !== null && (
                    <div className={`text-xs ${o.pctVsFair < 0 ? "text-[var(--good)]" : "text-muted"}`}>
                      {o.pctVsFair < 0
                        ? `ถูกกว่า ${formatPct(-o.pctVsFair)}`.replace("+", "")
                        : `แพงกว่า ${formatPct(o.pctVsFair)}`.replace("+", "")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <DealScore score={o.dealScore} />
                </td>
                <td className="px-3 py-2">
                  <RecommendationBadge value={o.recommendation} />
                  {o.recommendationReason && (
                    <div className="mt-1 max-w-[220px] text-[11px] leading-snug text-muted">
                      {o.recommendationReason}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>
                    {o.inStock ? "มีของ" : "สินค้าหมด"}
                    {o.stockQuantity !== null && ` (${o.stockQuantity} ชิ้น)`}
                  </div>
                  {o.viewCount !== null && <div className="text-muted">{o.viewCount.toLocaleString("th-TH")} views</div>}
                  {o.soldCount !== null && <div className="text-muted">ขายแล้ว {o.soldCount.toLocaleString("th-TH")}</div>}
                  {o.salesPerDay !== null && (
                    <div className="text-muted">~{o.salesPerDay.toFixed(2)} ชิ้น/วัน</div>
                  )}
                  {o.demandCluster && (
                    <div className="mt-1">
                      <ClusterBadge value={o.demandCluster} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">ประวัติราคา</h2>
        <PriceChart points={history} names={names} />
      </section>

      {specs.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 font-semibold">สเปกระดับรุ่น (รวมจากทุกร้าน)</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-border py-1">
                <dt className="text-muted">{SPEC_LABELS[k]}</dt>
                <dd className="tabular">{specValue(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
