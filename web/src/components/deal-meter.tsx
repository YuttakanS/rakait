import { formatBand, formatTHB } from "@/lib/format";

const RANGE = 0.4; // ±40% fills half the track; beyond that the bar is clamped.

/**
 * Diverging bar for price vs. fair price: a neutral midpoint tick at the fair
 * price, green to the left when cheaper, red to the right when pricier. The
 * percentage is always printed, so the colour is never the only signal.
 */
export function DealMeter({
  price,
  fair,
  pct,
  errorPct = null,
  uncertain = false,
}: {
  price: number;
  fair: number | null;
  pct: number | null;
  errorPct?: number | null;
  uncertain?: boolean;
}) {
  if (fair === null || pct === null) {
    return <span className="text-xs text-muted">ยังไม่มีราคายุติธรรม</span>;
  }
  if (uncertain) {
    // No bar: a green arm would read as a deal the model cannot back.
    return (
      <div className="w-full min-w-[140px] space-y-0.5 text-xs">
        <span className="font-semibold text-warn">ประเมินไม่แน่นอน</span>
        <p className="tabular text-muted">
          ยุติธรรม {formatTHB(fair)} {formatBand(errorPct)} · ต่างจากราคาจริงเกิน 40%
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
        <span className={`font-semibold ${below ? "text-good" : "text-muted"}`}>{label}</span>
        <span className="tabular text-muted">
          ยุติธรรม {formatTHB(fair)} {formatBand(errorPct)}
        </span>
      </div>
      <div
        className="relative h-2 w-full rounded-full bg-neutral-bg"
        role="img"
        aria-label={`ราคา ${formatTHB(price)} ${label} จากราคายุติธรรม ${formatTHB(fair)}`}
      >
        <div
          className="absolute top-0 h-2 rounded-full"
          style={{
            left: below ? `${50 - half}%` : "50%",
            width: `${half}%`,
            background: below ? "var(--good-strong)" : "var(--bad-strong)",
          }}
        />
        <div className="absolute top-[-3px] left-1/2 h-[14px] w-[2px] -translate-x-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}
