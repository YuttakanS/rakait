import Link from "next/link";
import { BelowFairTag, DealTag, VerdictBadges } from "@/components/badges";
import { UiIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { CATEGORY_LABELS, formatTHB } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { resolveVerdict } from "@/lib/verdict";

/**
 * Fair price implied by the cheapest offer's delta: price = fair × (1 + pct).
 * Only meaningful when that offer is in stock and below fair.
 */
export function impliedFair(p: ProductSummary): number | null {
  if (p.inStockOffers === 0 || p.bestPctVsFair === null || p.bestPctVsFair > -0.005) return null;
  return p.minPrice / (1 + p.bestPctVsFair);
}

/**
 * Storefront product card. The whole card is one link (no nested controls);
 * the CTA at the bottom is its visual call to action, styled as a button.
 */
export function ProductCard({ p, priority = false }: { p: ProductSummary; priority?: boolean }) {
  const inStock = p.inStockOffers > 0;
  const fair = impliedFair(p);
  const verdict = resolveVerdict({ inStock, recommendation: p.cheapestRecommendation, cluster: p.cheapestCluster });
  return (
    <Link
      href={`/product/${p.id}`}
      className="group card card-interactive flex h-full flex-col overflow-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
    >
      <div className="relative border-b border-border bg-white">
        <ProductImage
          src={p.imageUrl}
          alt={p.model}
          category={p.category}
          size={220}
          priority={priority}
          className="aspect-[4/3] rounded-none"
        />
        <div className="absolute top-3 left-3">
          <DealTag score={inStock ? p.bestDeal : null} />
        </div>
        {!inStock && (
          <span className="absolute top-3 right-3 rounded-[6px] bg-foreground/80 px-2 py-1 text-xs font-semibold text-background">
            หมดทุกร้าน
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xs text-muted">
          {CATEGORY_LABELS[p.category]} · {p.manufacturer}
        </span>
        <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] leading-snug font-semibold group-hover:text-accent">
          {p.model}
        </h3>

        <div className="tabular mt-1">
          {inStock ? (
            <p className="text-[26px] leading-none font-extrabold tracking-tight">{formatTHB(p.minPrice)}</p>
          ) : (
            // A sold-out model's price is a stale last-known one: not a headline.
            <p className="flex min-h-[26px] items-end text-sm text-muted">
              ราคาล่าสุด&nbsp;<span className="font-semibold">{formatTHB(p.minPrice)}</span>
            </p>
          )}
          <p className="mt-1.5 min-h-5 text-xs text-muted">
            {fair !== null ? (
              <>
                ราคายุติธรรม <s className="text-subtle">{formatTHB(fair)}</s>
              </>
            ) : inStock && p.maxPrice > p.minPrice ? (
              <>สูงสุด {formatTHB(p.maxPrice)}</>
            ) : (
              <>&nbsp;</>
            )}
          </p>
        </div>

        {inStock && (
          <div className="space-y-1.5">
            <BelowFairTag pct={p.bestPctVsFair} />
            <VerdictBadges verdict={verdict} />
          </div>
        )}

        <span
          className={`mt-auto flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-control)] text-sm font-semibold transition-colors ${
            inStock
              ? "bg-accent text-on-accent group-hover:bg-accent-hover"
              : "border border-border bg-surface-muted text-muted"
          }`}
          aria-hidden
        >
          {inStock ? (p.inStockStores > 1 ? `ดูราคา ${p.inStockStores} ร้าน` : "ดูราคาที่ร้าน") : "ดูราคาล่าสุด"}
          <UiIcon name="arrow" className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
