import Link from "next/link";
import type { ReactNode } from "react";
import { ClusterBadge, DealTag, DemandEvidenceLine, FairGapTag, UncertainTag, VerdictBadges } from "@/components/badges";
import { ProductImage } from "@/components/product-image";
import { cardReason } from "@/lib/card-reason";
import { NO_REFERENCE, type DemandReference } from "@/lib/demand";
import { CATEGORY_LABELS, formatBand, formatTHB, noFairPriceNote, uncertainNote } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { resolveVerdict } from "@/lib/verdict";

/**
 * Fair price worth printing: the headline offer's, while it is in stock and
 * trusted. An uncertain fair price (over 40% from the market, or above a
 * better-spec sibling's) is left off the card, where "฿X" next to a far lower
 * price would read as a half-price deal; the product page still shows it with
 * its explanation (a sibling reason quotes both fair prices in its sentence).
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
 *
 * A model with a demand group prints the numbers behind it under the badges
 * (`DemandEvidenceLine`), also when the model is sold out: the group is the
 * model's. When a conflict rule withholds the badge, the card prints one
 * line with the group's name and numbers in place of the badge and the note.
 * A model whose numbers do not support its K-Means group's name (SPEC round
 * 17) has `modelCluster` null: no badge, only the numbers line.
 */
export function ProductCard({
  p,
  priority = false,
  reference = NO_REFERENCE,
}: {
  p: ProductSummary;
  priority?: boolean;
  /** Yardsticks from the K-Means payload, for the "numbers contradict the name" line. */
  reference?: DemandReference;
}) {
  const inStock = p.inStockOffers > 0;
  const fair = shownFair(p);
  // The cluster is the model's group, the one `?cluster=` filters on.
  const verdict = resolveVerdict({ inStock, recommendation: p.cheapestRecommendation, cluster: p.modelCluster });
  // Numbers under the badge, and also for a model K-Means grouped but whose
  // numbers do not support the group's name (labelFits false, decided by the
  // pipeline): that card has no badge and no group text, only the numbers.
  const showEvidence = p.modelCluster !== null || p.demand.labelFits === false;
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
                <UncertainTag pct={p.bestPctVsFair} reason={p.cheapestReason} />
                {/* Visible, not a tooltip: phones cannot hover. A sibling
                    inversion names the sibling and both fair prices. */}
                <p className="text-xs leading-snug text-muted">{uncertainNote(p.bestPctVsFair, p.cheapestReason)}</p>
              </>
            ) : p.fairPrice === null ? (
              // Visible in place of the gap tag, so the card never just goes blank.
              // A workstation CPU (2026.11-v19) says so instead of "specs missing".
              <p className="text-xs leading-snug text-muted">{noFairPriceNote(p.cheapestReason)}</p>
            ) : (
              <FairGapTag pct={p.bestPctVsFair} />
            )}
            {/* A withheld group badge (verdict.note) collapses to one line
                naming the group with its numbers, instead of the long note. */}
            <VerdictBadges verdict={verdict} reason={reasonLine(p)} showNote={false} />
            {showEvidence && (
              <DemandEvidenceLine
                cluster={p.modelCluster}
                evidence={p.demand}
                reference={reference}
                withheld={verdict.note !== null}
              />
            )}
          </div>
        )}
        {/* Sold out everywhere: no price verdict, but the demand group is the
            model's, not a stale price's, so it still shows. */}
        {!inStock && showEvidence && (
          <div className="space-y-1.5">
            {p.modelCluster && (
              <div className="flex flex-wrap gap-1.5">
                <ClusterBadge value={p.modelCluster} />
              </div>
            )}
            <DemandEvidenceLine cluster={p.modelCluster} evidence={p.demand} reference={reference} />
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
