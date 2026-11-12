import { featureLabel } from "@/lib/format";

export type Effect = { feature: string; pct_effect_per_sd: number };

/**
 * Diverging horizontal bars of each MLR feature's effect on price (percent
 * per one standard deviation): a solid black bar to the right raises price,
 * an outlined bar to the left lowers it, a solid midline at zero. Fill style
 * and side carry the sign (no colour), every bar prints its signed value, so
 * the chart needs no tooltip and no legend beyond the axis caption.
 */
export function EffectBars({ effects }: { effects: Effect[] }) {
  const sorted = [...effects].sort((a, b) => Math.abs(b.pct_effect_per_sd) - Math.abs(a.pct_effect_per_sd));
  const max = Math.max(...sorted.map((e) => Math.abs(e.pct_effect_per_sd)), 0.01);
  return (
    <div className="space-y-1.5">
      {sorted.map((e) => {
        const v = e.pct_effect_per_sd;
        const w = (Math.abs(v) / max) * 50;
        const label = `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)}%`;
        return (
          <div
            key={e.feature}
            className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-2 text-xs"
            title={`${featureLabel(e.feature)}: ราคา ${label} ต่อ 1 SD`}
          >
            <span className="truncate text-muted">{featureLabel(e.feature)}</span>
            <div className="relative h-3">
              <div
                className={`absolute inset-y-0 ${v >= 0 ? "bg-foreground" : "border-2 border-foreground bg-surface"}`}
                style={{
                  left: v >= 0 ? "50%" : `${50 - w}%`,
                  width: `max(${w}%, 3px)`,
                }}
              />
              <div className="absolute -inset-y-0.5 left-1/2 w-0.5 -translate-x-1/2 bg-foreground" />
            </div>
            <span className="tabular text-right font-bold">{label}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] gap-2 text-xs text-subtle">
        <span />
        <div className="flex justify-between">
          <span>← ทำให้ถูกลง</span>
          <span>ทำให้แพงขึ้น →</span>
        </div>
        <span />
      </div>
    </div>
  );
}
