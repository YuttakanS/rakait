import Link from "next/link";
import { ClusterBadge, DealScore, RecommendationBadge } from "@/components/badges";
import { CATEGORY_LABELS, CLUSTER_LABELS, formatTHB } from "@/lib/format";
import { listProducts } from "@/lib/queries";
import type { Category, DemandCluster, SortKey } from "@/lib/types";

export const revalidate = 900;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const CLUSTERS = Object.keys(CLUSTER_LABELS) as DemandCluster[];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "deal", label: "ดีลดีที่สุด" },
  { key: "price", label: "ราคาต่ำสุด" },
  { key: "stores", label: "มีขายหลายร้าน" },
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

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? "border-accent bg-accent text-white" : "border-border bg-surface hover:border-accent"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const category = pick(params.category, CATEGORIES);
  const cluster = pick(params.cluster, CLUSTERS);
  const sort = pick(params.sort, ["deal", "price", "stores"] as const) ?? "deal";
  const query = params.q?.trim().slice(0, 80) || undefined;
  const products = await listProducts({ category, cluster, query, sort });

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold">เทียบราคาอุปกรณ์คอม 3 ร้าน</h1>
        <p className="mt-1 text-sm text-muted">
          จับคู่สินค้ารุ่นเดียวกันจาก JIB, IHAVECPU และ BaNANA แล้วประเมิน “ราคายุติธรรม” จากสเปกด้วย Multiple
          Linear Regression · Deal Score มากกว่า 50 คือถูกกว่าราคายุติธรรม
        </p>
      </section>

      <form action="/" className="flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        {cluster && <input type="hidden" name="cluster" value={cluster} />}
        <input
          name="q"
          defaultValue={query}
          placeholder="ค้นหารุ่น เช่น RTX 5060, 7800X3D, DDR5 32GB"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">ค้นหา</button>
      </form>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Chip href={hrefWith(params, { category: undefined })} active={!category}>
            ทั้งหมด
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} href={hrefWith(params, { category: c })} active={category === c}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">กลุ่มความต้องการ (K-Means):</span>
          {CLUSTERS.map((c) => (
            <Chip
              key={c}
              href={hrefWith(params, { cluster: cluster === c ? undefined : c })}
              active={cluster === c}
            >
              {CLUSTER_LABELS[c].label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">เรียงตาม:</span>
          {SORTS.map((s) => (
            <Chip key={s.key} href={hrefWith(params, { sort: s.key })} active={sort === s.key}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted">
          ไม่พบสินค้าที่ตรงกับเงื่อนไข
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/product/${p.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 hover:border-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-muted">
                    {CATEGORY_LABELS[p.category]} · {p.manufacturer}
                  </span>
                  <DealScore score={p.bestDeal} />
                </div>
                <h2 className="font-semibold leading-snug">{p.model}</h2>
                <div className="tabular">
                  <span className="text-xl font-bold">{formatTHB(p.minPrice)}</span>
                  {p.maxPrice > p.minPrice && (
                    <span className="text-sm text-muted"> – {formatTHB(p.maxPrice)}</span>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">
                    {p.offers} รายการ · {p.stores} ร้าน
                  </span>
                  <RecommendationBadge value={p.cheapestRecommendation} />
                  {p.clusters.map((c) => (
                    <ClusterBadge key={c} value={c} />
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
