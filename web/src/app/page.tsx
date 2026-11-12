import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { DealTag } from "@/components/badges";
import { ProductCard, shownFair } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { CATEGORY_LABELS, CLUSTER_LABELS, MERCHANTS, formatBand, formatTHB, merchantList, wholePct } from "@/lib/format";
import { SEEN_WINDOW_DAYS, listProducts } from "@/lib/queries";
import type { Category, DemandCluster, ProductSummary, SortKey } from "@/lib/types";

export const revalidate = 900;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const CLUSTERS = Object.keys(CLUSTER_LABELS) as DemandCluster[];
const SORTS: { value: SortKey; label: string }[] = [
  { value: "deal", label: "ดีลดีที่สุด" },
  { value: "price", label: "ราคาต่ำสุด" },
  { value: "stores", label: "มีขายหลายร้าน" },
];

type Search = { category?: string; cluster?: string; q?: string; sort?: string };

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.find((v) => v === value);
}

function hrefWith(current: Search, patch: Partial<Search>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...current, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/?${qs}` : "/";
}

/**
 * How far a hero's fair price may sit above the highest price the market
 * itself set for the model (`maxSeenPrice`, 120 days, every store). Beyond
 * that the "deal" is the model overestimating, not a cheap listing: on
 * 2026-11-13 the RX 9070 XT's fair ฿48,647 was 32% above its ฿36,990 high.
 */
const HERO_MAX_FAIR_OVER_SEEN = 0.1;

/** Whether the fair price is within `HERO_MAX_FAIR_OVER_SEEN` of the model's observed high. */
function fairWithinSeen(p: ProductSummary): boolean {
  return (
    p.fairPrice !== null && p.maxSeenPrice !== null && p.fairPrice <= p.maxSeenPrice * (1 + HERO_MAX_FAIR_OVER_SEEN)
  );
}

/**
 * The hero's deal: the best Deal Score in stock at two or more stores, so the
 * banner always leads to an actual comparison (stores that are sold out do
 * not count), whose fair price the market's own prices back up
 * (`fairWithinSeen`). None qualifying means no hero. O(n) over the
 * already-sorted list.
 */
function heroDeal(products: ProductSummary[]): ProductSummary | null {
  return products.find((p) => p.inStockStores >= 2 && (p.bestDeal ?? 0) >= 60 && fairWithinSeen(p)) ?? null;
}

/** Promo tiles under the hero: what the site does, each a real link. */
const PROMOS = [
  {
    href: "/?sort=stores",
    title: `เทียบ ${MERCHANTS.length} ร้านในหน้าเดียว`,
    body: "รุ่นเดียวกันจากทุกร้าน เรียงจากถูกไปแพง",
  },
  {
    href: "/insights#drivers",
    title: "รู้ราคายุติธรรมก่อนซื้อ",
    body: "ประเมินจากสเปกด้วย Machine Learning",
  },
  {
    href: "/insights#advice",
    title: "ซื้อเลยหรือรอก่อน?",
    body: "ดูจากราคาย้อนหลังและสต็อกของแต่ละร้าน",
  },
] as const;

/**
 * Deal of the week: the one inverted, 5 px block on the page (RawBlock
 * "elevated" = heavier border, never a shadow). The product photo stays on
 * a white tile in both themes. The caption states the selection rule
 * (`heroDeal`) as it is, next to the DEAL number it ranked on and the
 * model's observed high (`maxSeenPrice`) that vets the fair price.
 */
function Hero({ p }: { p: ProductSummary }) {
  const fair = shownFair(p);
  return (
    <Link
      href={`/product/${p.id}`}
      prefetch={false}
      className="inverted card card-heavy group grid border-background md:grid-cols-[1.4fr_1fr]"
    >
      <div className="flex flex-col justify-center gap-3 p-5 sm:p-8 lg:px-12 lg:py-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="caps tabular w-fit bg-foreground px-2 py-0.5 text-xs font-bold text-background">
            Deal of the week
          </span>
          <DealTag score={p.bestDeal} />
        </div>
        <h2 className="display text-3xl break-words sm:text-4xl lg:text-5xl">{p.model}</h2>
        <div className="space-y-0.5 text-sm text-muted">
          <p>
            {CATEGORY_LABELS[p.category]} · {p.manufacturer}
          </p>
          <p>
            Deal Score สูงสุดในรุ่นที่มีขายหลายร้าน และราคายุติธรรมไม่สูงกว่าราคาสูงสุดที่ร้านเคยตั้งเกิน{" "}
            {wholePct(HERO_MAX_FAIR_OVER_SEEN)}%
          </p>
        </div>
        <div className="tabular flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="text-4xl font-bold sm:text-5xl">{formatTHB(p.minPrice)}</span>
          {fair !== null && p.bestPctVsFair !== null && (
            <span className="pb-1 text-sm text-muted">
              ราคายุติธรรม {formatTHB(fair)} {formatBand(p.fairErrorPct)} ·{" "}
              <span className="whitespace-nowrap">ถูกกว่า {wholePct(-p.bestPctVsFair)}%</span>
            </span>
          )}
        </div>
        {p.maxSeenPrice !== null && (
          <p className="tabular text-sm text-muted">
            สูงสุดที่เคยเห็นใน {SEEN_WINDOW_DAYS} วัน {formatTHB(p.maxSeenPrice)}
          </p>
        )}
        <span className="btn btn-primary mt-2 w-fit text-sm">ดูราคา {p.inStockStores} ร้าน <span aria-hidden>→</span></span>
      </div>
      <div className="flex items-center justify-center p-5 pt-0 md:py-8 md:pr-10 md:pl-0">
        <ProductImage
          src={p.imageUrl}
          alt={p.model}
          category={p.category}
          size={320}
          priority
          className="aspect-square w-full max-w-[150px] border-[3px] border-border sm:max-w-[240px]"
        />
      </div>
    </Link>
  );
}

function Promos() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      {PROMOS.map((x) => (
        <li key={x.href}>
          <Link href={x.href} className="card invert-hover flex h-full items-center gap-3 px-4 py-3 sm:p-5">
            <span className="min-w-0 flex-1">
              <span className="display block text-base sm:text-lg">{x.title}</span>
              <span className="hidden text-xs text-muted sm:block">{x.body}</span>
            </span>
            <span aria-hidden className="tabular flex-none text-lg font-bold">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const category = pick(params.category, CATEGORIES);
  const cluster = pick(params.cluster, CLUSTERS);
  const sort = pick(params.sort, ["deal", "price", "stores"] as const) ?? "deal";
  const query = params.q?.trim().slice(0, 80) || undefined;
  const { products, total } = await listProducts({ category, cluster, query, sort });
  const landing = !category && !cluster && !query && !params.sort;
  const hero = landing ? heroDeal(products) : null;
  const heading = query
    ? `ผลการค้นหา “${query}”`
    : category
      ? CATEGORY_LABELS[category]
      : cluster
        ? CLUSTER_LABELS[cluster].label
        : landing
          ? "ดีลแนะนำวันนี้"
          : "สินค้าทั้งหมด";
  // The group's name goes on the count line unless the heading already is it.
  const headingIsCluster = cluster !== undefined && !query && !category;

  return (
    <div className="space-y-8">
      <h1 className="sr-only">
        RakaIT เทียบราคาอุปกรณ์คอม {MERCHANTS.length} ร้าน: {merchantList()}
      </h1>

      {landing && (
        <section aria-label="โปรโมชัน" className="space-y-4">
          {hero && <Hero p={hero} />}
          <Promos />
        </section>
      )}

      <section aria-labelledby="products-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="products-title" className="display text-3xl sm:text-4xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-muted">
              พบ <span className="tabular font-semibold text-foreground">{total.toLocaleString("th-TH")}</span> รุ่น
              {cluster && !headingIsCluster && (
                <>
                  {" "}ในกลุ่ม <span className="whitespace-nowrap">“{CLUSTER_LABELS[cluster].label}”</span>
                </>
              )}
              {total > products.length && ` (แสดง ${products.length} อันดับแรก)`} · Deal เกิน 50
              แปลว่าถูกกว่าราคายุติธรรม
            </p>
            {cluster && <p className="mt-1 max-w-2xl text-sm text-muted">{CLUSTER_LABELS[cluster].hint}</p>}
          </div>
          <form action="/" className="flex w-full flex-wrap gap-2 sm:w-auto">
            {cluster && <input type="hidden" name="cluster" value={cluster} />}
            {query && <input type="hidden" name="q" value={query} />}
            <AutoSubmitSelect
              name="category"
              label="หมวดหมู่สินค้า"
              value={category ?? ""}
              options={[{ value: "", label: "ทุกหมวดหมู่" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]}
            />
            <AutoSubmitSelect
              name="sort"
              label="เรียงตาม"
              value={sort}
              options={SORTS.map((s) => ({ value: s.value, label: `เรียง: ${s.label}` }))}
            />
            <noscript>
              <button className="btn btn-primary text-sm">
                ใช้ตัวกรอง
              </button>
            </noscript>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* "(i)" opens by tap, click or keyboard (SPEC round 11): a native
              <details>, not a title tooltip. Closed it is one item of the chip
              row; open it takes the full row (open:basis-full), so the panel
              sits above the chips. */}
          <details className="group mr-1 open:basis-full">
            <summary className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-muted underline decoration-dotted underline-offset-4 hover:text-foreground">
              กลุ่มความต้องการ <span className="tabular">(i)</span>
            </summary>
            <div className="mb-1 max-w-3xl border-2 border-border bg-surface-muted p-3 text-sm">
              <p className="text-xs text-muted">
                จัดกลุ่มรุ่นสินค้าจากจำนวนคนเข้าดู ยอดขายเทียบกับสินค้าอื่นในร้านเดียวกัน และราคาเทียบกับรุ่นเดียวกัน
              </p>
              <dl className="mt-2 space-y-2">
                {CLUSTERS.map((c) => (
                  <div key={c}>
                    <dt className="font-semibold">{CLUSTER_LABELS[c].label}</dt>
                    <dd className="text-xs text-muted">{CLUSTER_LABELS[c].hint}</dd>
                  </div>
                ))}
              </dl>
              <Link href="/insights#demand" className="link mt-2 inline-block py-1 text-xs">
                ดูวิธีจัดกลุ่มและตัวเลขของแต่ละกลุ่ม <span aria-hidden>→</span>
              </Link>
            </div>
          </details>
          {CLUSTERS.map((c) => {
            const active = cluster === c;
            return (
              <Link
                key={c}
                href={hrefWith(params, { cluster: active ? undefined : c })}
                aria-pressed={active}
                className={`inline-flex min-h-11 items-center border-2 border-border px-3.5 text-sm font-medium ${
                  active ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-foreground hover:text-background"
                }`}
              >
                {CLUSTER_LABELS[c].label}
              </Link>
            );
          })}
          {(cluster || query || category) && (
            <Link href="/" className="link ml-1 py-2 text-xs">
              ล้างทั้งหมด
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <p className="card p-10 text-center text-sm text-muted">ไม่พบสินค้าที่ตรงกับเงื่อนไข ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p, index) => (
              <li key={p.id}>
                <ProductCard p={p} priority={index < 4} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
