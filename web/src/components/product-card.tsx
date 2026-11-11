import Link from "next/link";
import { BelowFairTag, DealTag, UncertainTag, VerdictBadges } from "@/components/badges";
import { UiIcon } from "@/components/icons";
import { ProductImage } from "@/components/product-image";
import { CATEGORY_LABELS, formatBand, formatTHB } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { resolveVerdict } from "@/lib/verdict";

/**
 * Fair price worth printing: the headline offer's, while it is in stock and
 * trusted. An uncertain fair price (over 40% from the market) is left off the
 * card, where "฿X" next to a far lower price would read as a half-price deal;
 * the product page still shows it with its explanation.
 */
export function shownFair(p: ProductSummary): number | null {
  return p.inStockOffers > 0 && !p.fairUncertain ? p.fairPrice : null;
}

/**
 * Storefront product card. The whole card is one link (no nested controls);
 * the CTA at the bottom is its visual call to action, styled as a button.
 */
export function ProductCard({ p, priority = false }: { p: ProductSummary; priority?: boolean }) {
  const inStock = p.inStockOffers > 0;
  const fair = shownFair(p);
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
              // Always with its error band: a 25% "deal" inside a ±30% band
              // is not evidence of one.
              <>
                ราคายุติธรรม {formatTHB(fair)} <span className="whitespace-nowrap">{formatBand(p.fairErrorPct)}</span>
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
            {p.fairUncertain ? (
              <>
                <UncertainTag />
                {/* Visible, not a tooltip: phones cannot hover. */}
                <p className="text-xs leading-snug text-muted">ราคายุติธรรมของรุ่นนี้อาจผิด จึงไม่นับเป็นดีล</p>
              </>
            ) : (
              <BelowFairTag pct={p.bestPctVsFair} />
            )}
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
