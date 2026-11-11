import { FEATURE_LABELS } from "@/lib/format";

export type Effect = { feature: string; pct_effect_per_sd: number };

/**
 * Diverging horizontal bars of each MLR feature's effect on price (percent
 * per one standard deviation): red to the right raises price, blue to the
 * left lowers it, grey midline at zero. Every bar prints its value, so the
 * chart needs no tooltip and no legend beyond the axis caption.
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
            title={`${FEATURE_LABELS[e.feature] ?? e.feature}: ราคา ${label} ต่อ 1 SD`}
          >
            <span className="truncate text-muted">{FEATURE_LABELS[e.feature] ?? e.feature}</span>
            <div className="relative h-3">
              <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--div-mid)]" />
              <div
                className="absolute inset-y-0.5 rounded-[3px]"
                style={{
                  left: v >= 0 ? "50%" : `${50 - w}%`,
                  width: `max(${w}%, 2px)`,
                  background: v >= 0 ? "var(--div-pos)" : "var(--div-neg)",
                }}
              />
            </div>
            <span className="tabular text-right font-medium">{label}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] gap-2 text-[11px] text-subtle">
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
