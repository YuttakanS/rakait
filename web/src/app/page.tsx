import Link from "next/link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ClusterBadge, DealScore, FairDelta, RecommendationBadge } from "@/components/badges";
import { InfoIcon, SearchIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { CATEGORY_LABELS, CLUSTER_LABELS, MERCHANTS, formatTHB, merchantList } from "@/lib/format";
import { listProducts } from "@/lib/queries";
import type { Category, DemandCluster, SortKey } from "@/lib/types";

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

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const category = pick(params.category, CATEGORIES);
  const cluster = pick(params.cluster, CLUSTERS);
  const sort = pick(params.sort, ["deal", "price", "stores"] as const) ?? "deal";
  const query = params.q?.trim().slice(0, 80) || undefined;
  const products = await listProducts({ category, cluster, query, sort });

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">เทียบราคาอุปกรณ์คอม {MERCHANTS.length} ร้าน</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          รุ่นเดียวกันจาก {merchantList()} มารวมไว้ในที่เดียว พร้อม “ราคายุติธรรม” ที่ประเมินจากสเปก ·{" "}
          <span className="font-medium text-foreground">Deal Score เกิน 50</span> แปลว่าถูกกว่าราคายุติธรรม
        </p>
      </section>

      <section className="card space-y-4 p-4 sm:p-5" aria-label="ค้นหาและตัวกรอง">
        <form action="/" className="flex flex-wrap gap-2">
          {cluster && <input type="hidden" name="cluster" value={cluster} />}
          <label className="relative flex w-full items-center sm:w-auto sm:min-w-[240px] sm:flex-[2_1_280px]">
            <span className="sr-only">ค้นหารุ่น</span>
            <SearchIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />
            <input
              name="q"
              defaultValue={query}
              placeholder="ค้นหารุ่น เช่น RTX 5060, 7800X3D, DDR5 32GB"
              className="h-10 w-full rounded-[var(--radius-control)] border border-border bg-surface pr-3 pl-9 text-sm shadow-sm placeholder:text-subtle focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
            />
          </label>
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
          <button className="h-10 flex-none rounded-[var(--radius-control)] bg-accent px-5 text-sm font-semibold text-on-accent shadow-sm hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none">
            ค้นหา
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
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
                <span aria-hidden>{CLUSTER_LABELS[c].icon}</span>
                {CLUSTER_LABELS[c].label}
              </Link>
            );
          })}
          {cluster && (
            <Link href={hrefWith(params, { cluster: undefined })} className="ml-1 text-xs text-muted underline hover:text-accent">
              ล้างตัวกรอง
            </Link>
          )}
        </div>
      </section>

      {products.length === 0 ? (
        <p className="card p-10 text-center text-sm text-muted">ไม่พบสินค้าที่ตรงกับเงื่อนไข ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
      ) : (
        <section className="space-y-4">
          <p className="text-sm text-muted">
            พบ <span className="tabular font-semibold text-foreground">{products.length}</span> รุ่น
            {products.length === 60 && " (แสดง 60 อันดับแรก)"}
          </p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <Link href={`/product/${p.id}`} className="card card-interactive flex h-full flex-col overflow-hidden">
                  <div className="relative border-b border-border">
                    <ProductImage src={p.imageUrl} alt={p.model} category={p.category} className="aspect-[4/3] rounded-none" />
                    <div className="absolute top-3 right-3">
                      <DealScore score={p.bestDeal} prominent />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <span className="text-xs text-muted">
                      {CATEGORY_LABELS[p.category]} · {p.manufacturer}
                    </span>
                    <h2 className="line-clamp-2 text-base leading-snug font-semibold">{p.model}</h2>
                    <div className="tabular">
                      <span className="text-2xl font-bold tracking-tight">{formatTHB(p.minPrice)}</span>
                      {p.maxPrice > p.minPrice && (
                        <span className="ml-1 text-xs text-muted">ถึง {formatTHB(p.maxPrice)}</span>
                      )}
                    </div>
                    <FairDelta pct={p.bestPctVsFair} />
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                      <span className="mr-auto text-xs text-muted">{p.stores} ร้าน</span>
                      <RecommendationBadge value={p.cheapestRecommendation} />
                      {p.clusters.map((c) => (
                        <ClusterBadge key={c} value={c} />
                      ))}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
