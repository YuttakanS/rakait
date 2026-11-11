import Link from "next/link";
import { notFound } from "next/navigation";
import { DealScore, SoldOutTag, VerdictBadges } from "@/components/badges";
import { DealMeter } from "@/components/deal-meter";
import { ChevronIcon, ExternalIcon } from "@/components/icons";
import { PriceChart } from "@/components/price-chart";
import { ProductImage } from "@/components/product-image";
import { CATEGORY_LABELS, MERCHANT_COLORS, formatTHB } from "@/lib/format";
import { getPriceHistory, getProduct } from "@/lib/queries";
import type { Offer } from "@/lib/types";
import { resolveVerdict } from "@/lib/verdict";

export const revalidate = 900;

/**
 * Incremental static regeneration: no product is pre-built, each is rendered
 * on its first request and then served from the CDN edge for 15 minutes, so
 * repeat visitors in Thailand never wait on the Sydney database round trip.
 */
export function generateStaticParams(): { id: string }[] {
  return [];
}

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

function StoreDot({ merchant }: { merchant: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: MERCHANT_COLORS[merchant] ?? "var(--accent)" }}
      aria-hidden
    />
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-surface-muted px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

const VISIBLE_OFFERS = 6;

function verdictOf(o: Offer) {
  return resolveVerdict({ inStock: o.inStock, recommendation: o.recommendation, cluster: o.demandCluster });
}

/**
 * One store's offer: identity, price, price-vs-fair meter, verdict. A
 * sold-out offer keeps its row (dimmed, marked หมด) but shows its stale last
 * price small and no Deal Score, meter or recommendation.
 */
function OfferRow({ offer: o, best }: { offer: Offer; best: boolean }) {
  const verdict = verdictOf(o);
  return (
    <li
      className={`card grid items-center gap-x-6 gap-y-3 p-4 md:grid-cols-[minmax(0,1fr)_8.5rem_minmax(200px,16rem)_7.5rem] ${
        best ? "ring-2 ring-[var(--good-strong)]" : ""
      } ${o.inStock ? "" : "opacity-70"}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StoreDot merchant={o.merchant} />
          <span className="font-semibold">{o.merchantName}</span>
          {best && <span className="rounded-full bg-good-bg px-2 py-0.5 text-xs font-semibold text-good">ถูกที่สุด</span>}
          {o.inStock ? (
            <span className="text-xs text-good">
              ● มีของ
              {o.stockQuantity !== null && ` (${o.stockQuantity} ชิ้น)`}
            </span>
          ) : (
            <SoldOutTag />
          )}
        </div>
        <a
          href={o.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-start gap-1 text-xs text-muted hover:text-accent"
        >
          <span className="line-clamp-2">{o.title}</span>
          <ExternalIcon className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
        </a>
        {(o.viewCount !== null || o.soldCount !== null) && (
          <div className="flex flex-wrap gap-x-3 text-xs text-subtle">
            {o.viewCount !== null && <span>{o.viewCount.toLocaleString("th-TH")} views</span>}
            {o.soldCount !== null && <span>ขายแล้ว {o.soldCount.toLocaleString("th-TH")}</span>}
            {o.salesPerDay !== null && <span>~{o.salesPerDay.toFixed(2)} ชิ้น/วัน</span>}
          </div>
        )}
      </div>

      {o.inStock ? (
        <>
          <div className="tabular text-2xl font-bold tracking-tight md:text-right">{formatTHB(o.price)}</div>
          <DealMeter
            price={o.price}
            fair={o.fairPrice}
            pct={o.pctVsFair}
            errorPct={o.fairErrorPct}
            uncertain={o.fairUncertain}
          />
          <div className="flex flex-col items-start gap-1.5 md:items-end" title={o.recommendationReason ?? undefined}>
            <DealScore score={o.dealScore} />
            <VerdictBadges verdict={verdict} align="end" showNote={false} />
          </div>
          {verdict.note && (
            // Full row width: the verdict column is too narrow for a sentence.
            <p className="text-xs leading-snug text-muted md:col-span-4 md:text-right">{verdict.note}</p>
          )}
        </>
      ) : (
        <>
          <div className="tabular text-sm text-muted md:text-right">
            ราคาล่าสุด <span className="font-semibold">{formatTHB(o.price)}</span>
          </div>
          <span className="text-xs text-muted">ไม่นำมาเทียบ เพราะสินค้าหมด</span>
          <span aria-hidden className="hidden md:block" />
        </>
      )}
    </li>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(id)) notFound();
  const [product, history] = await Promise.all([getProduct(id), getPriceHistory(id)]);
  if (!product) notFound();

  // Offers arrive in-stock first, then by price. Sold-out offers carry stale
  // last prices, so the headline price, the price range and the savings are
  // computed from in-stock offers only.
  const inStock = product.offers.filter((o) => o.inStock);
  const cheapest = inStock[0] ?? null;
  const lastKnown = product.offers[0] ?? null;
  const names = Object.fromEntries(product.offers.map((o) => [o.merchant, o.merchantName]));
  const specs = Object.entries(product.specs).filter(([k]) => k in SPEC_LABELS);
  const maxInStock = inStock.length ? Math.max(...inStock.map((o) => o.price)) : null;
  const saving = cheapest && maxInStock !== null && maxInStock > cheapest.price ? maxInStock - cheapest.price : null;
  const image = product.offers.find((o) => o.imageUrl)?.imageUrl ?? null;
  const stores = new Set(product.offers.map((o) => o.merchant)).size;
  const inStockStores = new Set(inStock.map((o) => o.merchant)).size;

  return (
    <div className="space-y-8">
      <Link href="/" className="inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-accent">
        ← กลับไปหน้ารวม
      </Link>

      {/* Hero: the answer first: cheapest price, where, and how it compares. */}
      <section className="card grid gap-6 p-5 sm:p-6 md:grid-cols-[260px_1fr]">
        <ProductImage
          src={image}
          alt={product.model}
          category={product.category}
          size={260}
          priority
          className="mx-auto aspect-square w-full max-w-[220px] border border-border md:max-w-none" />
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted">
              {CATEGORY_LABELS[product.category]} · {product.manufacturer}
            </p>
            <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">{product.model}</h1>
          </div>

          {cheapest ? (
            <>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                  <div className="text-xs font-medium text-muted">ราคาต่ำสุดตอนนี้</div>
                  <div className="tabular text-4xl font-bold tracking-tight text-accent">{formatTHB(cheapest.price)}</div>
                </div>
                <div className="flex items-center gap-1.5 pb-1.5 text-sm">
                  ที่ <StoreDot merchant={cheapest.merchant} />
                  <span className="font-semibold">{cheapest.merchantName}</span>
                  <DealScore score={cheapest.dealScore} />
                </div>
              </div>

              <div className="max-w-md">
                <DealMeter
                  price={cheapest.price}
                  fair={cheapest.fairPrice}
                  pct={cheapest.pctVsFair}
                  errorPct={cheapest.fairErrorPct}
                  uncertain={cheapest.fairUncertain}
                />
              </div>
              <VerdictBadges verdict={verdictOf(cheapest)} className="max-w-xl" />
              {cheapest.recommendationReason && (
                <p className="text-sm text-muted">{cheapest.recommendationReason}</p>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="ราคาสูงสุด (มีของ)" value={formatTHB(maxInStock)} />
                <Stat
                  label="ประหยัดได้สูงสุด"
                  value={saving !== null ? formatTHB(saving) : "–"}
                  tone={saving !== null ? "text-good" : ""}
                />
                <Stat label="ร้านที่มีของ" value={`${inStockStores} / ${stores} ร้าน`} />
                <Stat label="รายการที่มีของ" value={`${inStock.length} / ${product.offers.length} รายการ`} />
              </div>
            </>
          ) : lastKnown ? (
            <div className="space-y-2">
              <SoldOutTag label="หมดทุกร้าน" />
              <p className="tabular text-sm text-muted">
                ราคาล่าสุด <span className="font-semibold">{formatTHB(lastKnown.price)}</span> ที่ {lastKnown.merchantName} ·
                ไม่มีราคาต่ำสุดหรือส่วนลดให้เทียบ จนกว่าจะมีของเข้า
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">ตอนนี้ไม่มีร้านไหนขายรุ่นนี้</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">เทียบราคาแต่ละร้าน</h2>
          <span className="text-xs text-muted">เรียงจากมีของและราคาต่ำสุด</span>
        </div>
        <ul className="space-y-3">
          {product.offers.slice(0, VISIBLE_OFFERS).map((o) => (
            <OfferRow key={o.listingId} offer={o} best={o === cheapest && inStock.length > 1} />
          ))}
        </ul>
        {product.offers.length > VISIBLE_OFFERS && (
          <details className="group">
            <summary className="card flex items-center justify-center gap-1 p-3 text-sm font-medium text-accent hover:bg-surface-muted">
              ดูอีก {product.offers.length - VISIBLE_OFFERS} รายการ
              <ChevronIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 space-y-3">
              {product.offers.slice(VISIBLE_OFFERS).map((o) => (
                <OfferRow key={o.listingId} offer={o} best={false} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="card space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">ประวัติราคา</h2>
          <p className="text-xs text-muted">ชี้หรือแตะบนกราฟเพื่อดูราคาของทุกร้านในวันนั้น</p>
        </div>
        <PriceChart points={history} names={names} />
      </section>

      {specs.length > 0 && (
        <section className="card space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">สเปกระดับรุ่น</h2>
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-border py-2 text-sm">
                <dt className="text-muted">{SPEC_LABELS[k]}</dt>
                <dd className="tabular font-medium">{specValue(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-subtle">รวมจากทุกร้าน: ตัวเลขใช้ค่ามัธยฐาน ข้อความใช้ค่าที่พบบ่อยที่สุด</p>
        </section>
      )}
    </div>
  );
}
