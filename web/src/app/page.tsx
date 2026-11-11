import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { Glyph, InfoIcon, UiIcon } from "@/components/icons";
import { ProductCard, impliedFair } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { CATEGORY_LABELS, CLUSTER_LABELS, MERCHANTS, formatTHB, merchantList } from "@/lib/format";
import { listProducts } from "@/lib/queries";
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
 * The hero's deal: the best Deal Score in stock at two or more stores, so the
 * banner always leads to an actual comparison (stores that are sold out do
 * not count). O(n) over the already-sorted list.
 */
function heroDeal(products: ProductSummary[]): ProductSummary | null {
  return products.find((p) => p.inStockStores >= 2 && (p.bestDeal ?? 0) >= 60) ?? null;
}

/** Promo tiles under the hero: what the site does, each a real link. */
const PROMOS = [
  {
    href: "/?sort=stores",
    icon: "scale",
    title: `เทียบ ${MERCHANTS.length} ร้านในหน้าเดียว`,
    body: "รุ่นเดียวกันจากทุกร้าน เรียงจากถูกไปแพง",
  },
  {
    href: "/insights#drivers",
    icon: "spark",
    title: "รู้ราคายุติธรรมก่อนซื้อ",
    body: "ประเมินจากสเปกด้วย Machine Learning",
  },
  {
    href: "/insights#advice",
    icon: "clock",
    title: "ซื้อเลยหรือรอก่อน?",
    body: "ดูจากราคาย้อนหลังและสต็อกของแต่ละร้าน",
  },
] as const;

function Hero({ p }: { p: ProductSummary }) {
  const fair = impliedFair(p);
  return (
    <Link
      href={`/product/${p.id}`}
      className="hero-banner lift group grid overflow-hidden rounded-[var(--radius-card)] shadow-[var(--shadow-card)] md:grid-cols-[1.4fr_1fr] lg:aspect-[16/5]"
    >
      <div className="flex flex-col justify-center gap-3 p-6 sm:p-8 lg:px-12">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold tracking-widest uppercase">
          <UiIcon name="tag" className="h-3.5 w-3.5" />
          Deal of the week
        </span>
        <h2 className="text-2xl leading-tight font-bold sm:text-3xl lg:text-4xl">{p.model}</h2>
        <p className="text-sm text-on-hero-muted">
          {CATEGORY_LABELS[p.category]} · {p.manufacturer} · Deal Score สูงสุดตอนนี้ในรุ่นที่มีขายหลายร้าน
        </p>
        <div className="tabular flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="text-4xl font-extrabold tracking-tight sm:text-5xl">{formatTHB(p.minPrice)}</span>
          {fair !== null && p.bestPctVsFair !== null && (
            <span className="pb-1 text-sm text-on-hero-muted">
              ราคายุติธรรม <s>{formatTHB(fair)}</s> · ถูกกว่า {Math.round(-p.bestPctVsFair * 100)}%
            </span>
          )}
        </div>
        <span className="mt-2 inline-flex h-11 w-fit items-center gap-2 rounded-[var(--radius-control)] bg-white px-5 text-sm font-bold text-[var(--hero-from)] shadow-sm">
          ดูราคา {p.inStockStores} ร้าน
          <UiIcon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="flex items-center justify-center p-6 pt-0 md:py-6 md:pr-10 md:pl-0">
        <ProductImage
          src={p.imageUrl}
          alt={p.model}
          category={p.category}
          size={320}
          priority
          className="aspect-square w-full max-w-[150px] rounded-[var(--radius-card)] sm:max-w-[240px] shadow-lg ring-4 ring-white/20"
        />
      </div>
    </Link>
  );
}

function Promos() {
  return (
    <ul className="grid gap-2 sm:grid-cols-3 sm:gap-4">
      {PROMOS.map((x) => (
        <li key={x.href}>
          <Link href={x.href} className="card card-interactive flex h-full items-center gap-3 px-4 py-3 sm:gap-4 sm:p-5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-accent-soft text-accent sm:h-12 sm:w-12">
              <UiIcon name={x.icon} className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold sm:text-base">{x.title}</span>
              <span className="hidden text-xs text-muted sm:block">{x.body}</span>
            </span>
            <UiIcon name="arrow" className="h-4 w-4 flex-none text-muted" />
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
  const products = await listProducts({ category, cluster, query, sort });
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
            <h2 id="products-title" className="text-2xl font-bold tracking-tight">
              {heading}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              พบ <span className="tabular font-semibold text-foreground">{products.length}</span> รุ่น
              {products.length === 60 && " (แสดง 60 อันดับแรก)"} · Deal เกิน 50 แปลว่าถูกกว่าราคายุติธรรม
            </p>
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
              <button className="h-10 rounded-[var(--radius-control)] bg-accent px-4 text-sm font-semibold text-on-accent">
                ใช้ตัวกรอง
              </button>
            </noscript>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-muted"
            title="จัดกลุ่มด้วย K-Means จากยอดเข้าชม ยอดขายต่อวัน และราคาเทียบกับรุ่นเดียวกัน"
          >
            กลุ่มความต้องการ <InfoIcon />
          </span>
          {CLUSTERS.map((c) => {
            const active = cluster === c;
            return (
              <Link
                key={c}
                href={hrefWith(params, { cluster: active ? undefined : c })}
                aria-pressed={active}
                title={CLUSTER_LABELS[c].hint}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
                  active
                    ? "border-accent bg-accent text-on-accent shadow-sm"
                    : "border-border bg-surface text-foreground hover:border-accent hover:text-accent"
                }`}
              >
                <Glyph name={c} className="h-4 w-4" />
                {CLUSTER_LABELS[c].label}
              </Link>
            );
          })}
          {(cluster || query || category) && (
            <Link href="/" className="ml-1 py-2 text-xs text-muted underline hover:text-accent">
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
