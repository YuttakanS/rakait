import Link from "next/link";
import type { ReactNode } from "react";
import { ClusterBadge, DealTag, FairGapTag, UncertainTag, VerdictBadges } from "@/components/badges";
import { ProductImage } from "@/components/product-image";
import { cardReason } from "@/lib/card-reason";
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

/** The card reason with its number kept on one line (`cardReason`). */
function reasonLine(p: ProductSummary): ReactNode {
  const reason = cardReason(p);
  if (reason === null) return null;
  return reason.tail === null ? (
    reason.text
  ) : (
    <>
      {reason.text} <span className="whitespace-nowrap">{reason.tail}</span>
    </>
  );
}

/**
 * Storefront product card. The whole card is one link (no nested controls);
 * the CTA at the bottom is its visual call to action, styled as a button.
 * No viewport prefetch: a grid of cards would render a dozen uncached product
 * pages (one database connection each) at once.
 */
export function ProductCard({ p, priority = false }: { p: ProductSummary; priority?: boolean }) {
  const inStock = p.inStockOffers > 0;
  const fair = shownFair(p);
  // The cluster is the model's group, the one `?cluster=` filters on.
  const verdict = resolveVerdict({ inStock, recommendation: p.cheapestRecommendation, cluster: p.modelCluster });
  return (
    <Link
      href={`/product/${p.id}`}
      prefetch={false}
      className="group card card-interactive flex h-full flex-col"
    >
      <div className="relative border-b-[3px] border-border bg-white">
        <ProductImage
          src={p.imageUrl}
          alt={p.model}
          category={p.category}
          size={220}
          priority={priority}
          className="aspect-[4/3]"
        />
        <div className="absolute top-2 left-2">
          <DealTag score={inStock ? p.bestDeal : null} />
        </div>
        {!inStock && (
          <span className="absolute top-2 right-2 border-2 border-black bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
            หมดทุกร้าน
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <span className="text-xs text-muted">
          {CATEGORY_LABELS[p.category]} · {p.manufacturer}
        </span>
        <h3 className="line-clamp-2 min-h-[2.75rem] text-[15px] leading-snug font-semibold underline-offset-2 group-hover:underline">
          {p.model}
        </h3>

        <div className="tabular mt-1">
          {inStock ? (
            <p className="text-[22px] leading-none font-bold sm:text-[26px]">{formatTHB(p.minPrice)}</p>
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
            ) : p.fairPrice === null ? (
              // Visible in place of the gap tag, so the card never just goes blank.
              <p className="text-xs leading-snug text-muted">ยังประเมินราคายุติธรรมไม่ได้ (สเปกในชื่อสินค้าไม่ครบ)</p>
            ) : (
              <FairGapTag pct={p.bestPctVsFair} />
            )}
            <VerdictBadges verdict={verdict} reason={reasonLine(p)} />
          </div>
        )}
        {/* Sold out everywhere: no price verdict, but the demand group is the
            model's, not a stale price's, so it still shows. */}
        {!inStock && p.modelCluster && (
          <div className="flex flex-wrap gap-1.5">
            <ClusterBadge value={p.modelCluster} />
          </div>
        )}

        {/* Visual CTA only (the card is the link): primary when in stock,
            secondary when sold out. Inverts with the card's hover. */}
        <span
          className={`btn mt-auto px-2 text-sm ${inStock ? "btn-primary" : "btn-secondary"}`}
          aria-hidden
        >
          {inStock ? (p.inStockStores > 1 ? `ดูราคา ${p.inStockStores} ร้าน` : "ดูราคาที่ร้าน") : "ดูราคาล่าสุด"} →
        </span>
      </div>
    </Link>
  );
}
