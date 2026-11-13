import Link from "next/link";
import { notFound } from "next/navigation";
import { ClusterBadge, DealScore, NoteText, SoldOutTag, VerdictBadges, Words } from "@/components/badges";
import { DealMeter } from "@/components/deal-meter";
import { PriceChart } from "@/components/price-chart";
import { ProductImage } from "@/components/product-image";
import { demandReference, demandWhy, evidenceParts, unlabelledWhy, type DemandReference } from "@/lib/demand";
import { CATEGORY_LABELS, CLUSTER_LABELS, formatSpecValue, formatTHB, uncertainReason } from "@/lib/format";
import { salesRate } from "@/lib/market";
import { getDemandPayload, getPriceHistory, getProduct } from "@/lib/queries";
import type { DemandCluster, DemandEvidence, Offer, ProductDetail } from "@/lib/types";
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

/**
 * An offer's sales rate, named by how its store measures it (SPEC round 11):
 * IHAVECPU's rate is stock drawdown (may include wholesale or branch
 * transfers), JIB's comes from the sold count the store publishes. The two
 * are not comparable, so each row says which one it is. Nothing at all when
 * the rate is unknown; a rate of zero reads as no sales (or, at IHAVECPU, no
 * stock drawdown) seen lately.
 */
function salesText(merchant: string, perDay: number | null): string | null {
  if (perDay === null || !Number.isFinite(perDay)) return null;
  const drawdown = merchant === "ihavecpu";
  if (perDay <= 0) return drawdown ? "สต็อกยังไม่ลดลงช่วงนี้" : "ยังไม่เห็นยอดขายช่วงนี้";
  return `${drawdown ? "สต็อกลดลง" : "ขายได้"} ${salesRate(perDay)}`;
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border-2 border-border bg-surface-muted px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className={`tabular text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

const VISIBLE_OFFERS = 6;

/** How the two numbers are measured, with the link to the method (both demand blocks). */
function DemandMeasureNote() {
  return (
    <p className="text-xs text-subtle">
      ยอดเข้าชมรวมจากทุกร้านที่เปิดเผยยอด อันดับยอดขายเทียบกับสินค้าในร้านเดียวกันแล้วเฉลี่ยข้ามร้าน ·{" "}
      <Link href="/ml#kmeans" className="link">
        ดูวิธีจัดกลุ่ม
      </Link>
    </p>
  );
}

/** The model's two numbers, "·"-separated, each wrapping only between words. */
function EvidenceNumbers({ evidence, reference }: { evidence: DemandEvidence; reference: DemandReference }) {
  return (
    <>
      {evidenceParts(evidence, reference, true).map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          <Words text={part} />
        </span>
      ))}
    </>
  );
}

/**
 * The evidence for the model's demand group, beside its badge in the hero
 * (SPEC rounds 16 and 17): both numbers (a missing one named as missing)
 * and, when the pipeline confirmed that they support the group's name, the
 * rule the badge is held to with its stored thresholds. The group is named
 * in words here, so the block also reads on its own when a badge-conflict
 * rule withholds the badge.
 */
function DemandEvidenceBlock({
  cluster,
  evidence,
  reference,
}: {
  cluster: DemandCluster;
  evidence: DemandEvidence;
  reference: DemandReference;
}) {
  const { why } = demandWhy(cluster, evidence, reference);
  return (
    <div className="max-w-xl space-y-1 border-l-[3px] border-border pl-3 text-sm">
      <p>
        <span className="font-semibold">
          กลุ่ม <span className="whitespace-nowrap">“{CLUSTER_LABELS[cluster].label}”</span>:
        </span>{" "}
        <EvidenceNumbers evidence={evidence} reference={reference} />
      </p>
      {why && <p className="text-muted">ที่ได้กลุ่มนี้: {why}</p>}
      <DemandMeasureNote />
    </div>
  );
}

/**
 * For a model K-Means grouped but whose numbers do not support the group's
 * name (`labelFits === false`, decided by the pipeline; SPEC round 17). It
 * has no badge anywhere and is not listed under the group; here the page
 * shows its numbers, says which group K-Means assigned and which number
 * does not fit, why K-Means put it there (the stored deciding feature, a
 * price gap as a percent), and keeps the method behind a disclosure.
 */
function UnlabelledDemandBlock({
  assigned,
  evidence,
  reference,
  inStock,
}: {
  assigned: DemandCluster;
  evidence: DemandEvidence;
  reference: DemandReference;
  /** Whether any store has the model in stock (wording of the price gap). */
  inStock: boolean;
}) {
  const why = unlabelledWhy(assigned, evidence, reference, inStock);
  return (
    <div className="max-w-xl space-y-1 border-l-[3px] border-border pl-3 text-sm">
      <p>
        <span className="font-semibold">ความต้องการของรุ่นนี้:</span>{" "}
        <EvidenceNumbers evidence={evidence} reference={reference} />
      </p>
      <p className="text-muted">
        {why.assigned}
        {why.rule && <> ({why.rule})</>}
      </p>
      <p className="text-muted">{why.reason}</p>
      <details className="group">
        <summary className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-foreground">
          ทำไมตัวเลขไม่ตรงชื่อกลุ่มได้
          <span aria-hidden className="disclosure" />
        </summary>
        <p className="border-2 border-border bg-surface-muted p-3 text-xs leading-relaxed text-muted">{why.method}</p>
      </details>
      <DemandMeasureNote />
    </div>
  );
}

/** The demand block of the hero: the labelled group's, the unlabelled model's, or none. */
function DemandBlock({
  product,
  reference,
  inStock,
}: {
  product: Pick<ProductDetail, "demandCluster" | "assignedCluster" | "demand">;
  reference: DemandReference;
  inStock: boolean;
}) {
  if (product.demandCluster) {
    return <DemandEvidenceBlock cluster={product.demandCluster} evidence={product.demand} reference={reference} />;
  }
  if (product.assignedCluster && product.demand.labelFits === false) {
    return (
      <UnlabelledDemandBlock
        assigned={product.assignedCluster}
        evidence={product.demand}
        reference={reference}
        inStock={inStock}
      />
    );
  }
  return null;
}

/**
 * An offer's badges. The demand group belongs to the model, so only the
 * product hero passes it; store rows show no group (SPEC round 8).
 */
function verdictOf(o: Offer, cluster: DemandCluster | null = null) {
  return resolveVerdict({ inStock: o.inStock, recommendation: o.recommendation, cluster });
}

/**
 * One store's offer: identity, price, price-vs-fair meter, verdict. The
 * cheapest in-stock offer gets the 5 px border. A sold-out offer keeps its
 * row (sunken grey, marked หมด; no opacity, which would drop text below
 * 4.5:1) but shows its stale last price small and no Deal Score, meter or
 * recommendation.
 */
/**
 * The reason printed for an offer. An uncertain fair price always reads
 * `uncertainReason` built from the offer's own gap ("ราคาจริงแพงกว่าราคา
 * ยุติธรรม 42% …"), whichever model version stored the row.
 */
function reasonOf(o: Offer): string | null {
  return o.fairUncertain ? uncertainReason(o.pctVsFair) : o.recommendationReason;
}

function OfferRow({ offer: o, best }: { offer: Offer; best: boolean }) {
  const verdict = verdictOf(o);
  const sales = salesText(o.merchant, o.salesPerDay);
  return (
    <li
      className={`card grid items-center gap-x-6 gap-y-3 p-4 md:grid-cols-[minmax(0,1fr)_8.5rem_minmax(200px,16rem)_7.5rem] ${
        best ? "card-heavy" : ""
      } ${o.inStock ? "" : "bg-surface-muted"}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="display text-lg">{o.merchantName}</span>
          {best && <span className="chip text-good">ถูกที่สุด</span>}
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
          className="link inline-flex max-w-full items-start gap-1 text-xs"
        >
          <span className="line-clamp-2">{o.title}</span>
          <span aria-hidden className="shrink-0">
            ↗
          </span>
        </a>
        {(o.viewCount !== null || o.soldCount !== null || sales !== null) && (
          <div className="flex flex-wrap gap-x-3 text-xs text-subtle">
            {o.viewCount !== null && <span>คนดู {o.viewCount.toLocaleString("th-TH")} ครั้ง</span>}
            {o.soldCount !== null && <span>ขายแล้ว {o.soldCount.toLocaleString("th-TH")} ชิ้น</span>}
            {sales !== null && <span>{sales}</span>}
          </div>
        )}
      </div>

      {o.inStock ? (
        <>
          <div className="tabular text-2xl font-bold md:text-right">{formatTHB(o.price)}</div>
          <DealMeter
            price={o.price}
            fair={o.fairPrice}
            pct={o.pctVsFair}
            errorPct={o.fairErrorPct}
            uncertain={o.fairUncertain}
          />
          <div className="flex flex-col items-start gap-1.5 md:items-end" title={reasonOf(o) ?? undefined}>
            <DealScore score={o.dealScore} />
            <VerdictBadges verdict={verdict} align="end" showNote={false} />
          </div>
          {verdict.note && (
            // Full row width: the verdict column is too narrow for a sentence.
            <p className="text-xs leading-snug text-muted md:col-span-4 md:text-right">
              <NoteText text={verdict.note} />
            </p>
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
  const [product, history, demandPayload] = await Promise.all([getProduct(id), getPriceHistory(id), getDemandPayload()]);
  if (!product) notFound();
  const reference = demandReference(demandPayload);

  // Offers arrive in-stock first, then by price. Sold-out offers carry stale
  // last prices, so the headline price, the price range and the savings are
  // computed from in-stock offers only.
  const inStock = product.offers.filter((o) => o.inStock);
  const cheapest = inStock[0] ?? null;
  const cheapestReason = cheapest ? reasonOf(cheapest) : null;
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
      <Link href="/" className="link inline-flex items-center gap-1 py-2 text-sm">
        ← กลับไปหน้ารวม
      </Link>

      {/* Hero: the answer first: cheapest price, where, and how it compares. */}
      <section className="card card-heavy grid gap-6 p-5 sm:p-6 md:grid-cols-[260px_1fr]">
        <ProductImage
          src={image}
          alt={product.model}
          category={product.category}
          size={260}
          priority
          className="mx-auto aspect-square w-full max-w-[220px] border-[3px] border-border md:max-w-none"
        />
        <div className="flex flex-col gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted">
              {CATEGORY_LABELS[product.category]} · {product.manufacturer}
            </p>
            <h1 className="display text-3xl break-words sm:text-4xl">{product.model}</h1>
          </div>

          {cheapest ? (
            <>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div>
                  <div className="text-xs font-medium text-muted">ราคาต่ำสุดตอนนี้</div>
                  <div className="tabular text-4xl font-bold sm:text-5xl">{formatTHB(cheapest.price)}</div>
                </div>
                <div className="flex items-center gap-1.5 pb-1.5 text-sm">
                  ที่ <span className="font-semibold">{cheapest.merchantName}</span>
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
              <VerdictBadges verdict={verdictOf(cheapest, product.demandCluster)} className="max-w-xl" />
              {cheapestReason && <p className="text-sm text-muted">{cheapestReason}</p>}
              <DemandBlock product={product} reference={reference} inStock />

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
              <div className="flex flex-wrap gap-1.5">
                <SoldOutTag label="หมดทุกร้าน" />
                {product.demandCluster && <ClusterBadge value={product.demandCluster} />}
              </div>
              <p className="tabular text-sm text-muted">
                ราคาล่าสุด <span className="font-semibold">{formatTHB(lastKnown.price)}</span> ที่ {lastKnown.merchantName} ·
                ไม่มีราคาต่ำสุดหรือส่วนลดให้เทียบ จนกว่าจะมีของเข้า
              </p>
              <DemandBlock product={product} reference={reference} inStock={false} />
            </div>
          ) : (
            <p className="text-sm text-muted">ตอนนี้ไม่มีร้านไหนขายรุ่นนี้</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="display text-2xl">เทียบราคาแต่ละร้าน</h2>
          <span className="text-xs text-muted">เรียงจากมีของและราคาต่ำสุด</span>
        </div>
        <ul className="space-y-3">
          {product.offers.slice(0, VISIBLE_OFFERS).map((o) => (
            <OfferRow key={o.listingId} offer={o} best={o === cheapest && inStock.length > 1} />
          ))}
        </ul>
        {product.offers.length > VISIBLE_OFFERS && (
          <details className="group">
            <summary className="btn btn-secondary w-full gap-3 text-sm">
              ดูอีก {product.offers.length - VISIBLE_OFFERS} รายการ
              <span aria-hidden className="disclosure" />
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
          <h2 className="display text-2xl">ประวัติราคา</h2>
          <p className="text-xs text-muted">ชี้หรือแตะบนกราฟเพื่อดูราคาของทุกร้านในวันนั้น</p>
        </div>
        <PriceChart points={history} names={names} />
      </section>

      {specs.length > 0 && (
        <section className="card space-y-4 p-5 sm:p-6">
          <h2 className="display text-2xl">สเปกระดับรุ่น</h2>
          <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b-2 border-border py-2 text-sm">
                <dt className="text-muted">{SPEC_LABELS[k]}</dt>
                <dd className="tabular font-medium">{formatSpecValue(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-subtle">รวมจากทุกร้าน: ตัวเลขใช้ค่ามัธยฐาน ข้อความใช้ค่าที่พบบ่อยที่สุด</p>
        </section>
      )}
    </div>
  );
}
