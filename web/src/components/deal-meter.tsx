import { formatBand, formatTHB, noFairMeterText, wholePct } from "@/lib/format";

const RANGE = 0.4; // ±40% fills half the track; beyond that the bar is clamped.

/**
 * Diverging bar for price vs. fair price: a bordered track with a solid
 * midpoint tick at the fair price, a green block to the left when cheaper,
 * a red block to the right when pricier. The percentage and direction are
 * always printed, so the colour is never the only signal.
 */
export function DealMeter({
  price,
  fair,
  pct,
  errorPct = null,
  uncertain = false,
  reason = null,
}: {
  price: number;
  fair: number | null;
  pct: number | null;
  errorPct?: number | null;
  uncertain?: boolean;
  /** The offer's stored reason; a workstation CPU's reads "ไม่ประเมิน…" (2026.11-v19). */
  reason?: string | null;
}) {
  if (fair === null || pct === null) {
    return <span className="text-xs text-muted">{noFairMeterText(reason)}</span>;
  }
  if (uncertain) {
    // No bar: a green arm would read as a deal the model cannot back.
    return (
      <div className="w-full min-w-[140px] space-y-0.5 text-xs">
        <span className="font-semibold text-warn">ประเมินไม่แน่นอน</span>
        <p className="tabular text-muted">
          ยุติธรรม {formatTHB(fair)} {formatBand(errorPct)} ·{" "}
          <span className="whitespace-nowrap">
            ราคาจริง{pct > 0 ? "แพงกว่า" : "ถูกกว่า"} {wholePct(Math.abs(pct))}%
          </span>
        </p>
      </div>
    );
  }
  const clamped = Math.max(-RANGE, Math.min(RANGE, pct));
  const half = (Math.abs(clamped) / RANGE) * 50;
  const below = pct < 0;
  const label =
    Math.abs(pct) < 0.005
      ? "เท่าราคายุติธรรม"
      : `${below ? "ถูกกว่า" : "แพงกว่า"} ${Math.round(Math.abs(pct) * 100)}%`;
  return (
    <div className="w-full min-w-[140px] space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`tabular font-semibold ${below ? "text-good" : "text-muted"}`}>{label}</span>
        <span className="tabular text-muted">
          ยุติธรรม {formatTHB(fair)} {formatBand(errorPct)}
        </span>
      </div>
      <div
        className="relative h-3.5 w-full border-2 border-border bg-surface"
        role="img"
        aria-label={`ราคา ${formatTHB(price)} ${label} จากราคายุติธรรม ${formatTHB(fair)}`}
      >
        <div
          className="absolute inset-y-0"
          style={{
            left: below ? `${50 - half}%` : "50%",
            width: `${half}%`,
            background: below ? "var(--good)" : "var(--bad)",
          }}
        />
        <div className="absolute -top-1.5 left-1/2 h-5 w-[3px] -translate-x-1/2 bg-foreground" />
      </div>
    </div>
  );
}
