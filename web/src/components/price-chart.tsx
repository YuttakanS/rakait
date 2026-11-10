import { MERCHANT_COLORS, formatTHB } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

const W = 720;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 64 };

/**
 * Server-rendered SVG line chart: one line per merchant of its daily lowest
 * price. O(n) in points; no client JavaScript.
 */
export function PriceChart({ points, names }: { points: PricePoint[]; names: Record<string, string> }) {
  if (points.length < 2) {
    return <p className="text-sm text-muted">ประวัติราคายังน้อยเกินไปสำหรับวาดกราฟ</p>;
  }
  const times = points.map((p) => Date.parse(p.day));
  const prices = points.map((p) => p.minPrice);
  const [t0, t1] = [Math.min(...times), Math.max(...times)];
  const [lo, hi] = [Math.min(...prices) * 0.97, Math.max(...prices) * 1.03];
  const x = (t: number) => PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / Math.max(hi - lo, 1)) * (H - PAD.top - PAD.bottom);

  const byMerchant = new Map<string, PricePoint[]>();
  for (const p of points) {
    byMerchant.set(p.merchant, [...(byMerchant.get(p.merchant) ?? []), p]);
  }
  const ticks = [lo, (lo + hi) / 2, hi];
  const fmtDay = (t: number) =>
    new Date(t).toLocaleDateString("th-TH", { month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="กราฟประวัติราคา">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {formatTHB(Math.round(v))}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize="11" fill="var(--muted)">
          {fmtDay(t0)}
        </text>
        <text x={W - PAD.right} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="end">
          {fmtDay(t1)}
        </text>
        {[...byMerchant.entries()].map(([merchant, series]) => {
          const color = MERCHANT_COLORS[merchant] ?? "var(--accent)";
          const d = series
            .map((p, i) => `${i ? "L" : "M"}${x(Date.parse(p.day)).toFixed(1)},${y(p.minPrice).toFixed(1)}`)
            .join(" ");
          return (
            <g key={merchant}>
              <path d={d} fill="none" stroke={color} strokeWidth={2} />
              {series.map((p) => (
                <circle key={p.day} cx={x(Date.parse(p.day))} cy={y(p.minPrice)} r={2.5} fill={color}>
                  <title>{`${names[merchant] ?? merchant} ${p.day.slice(0, 10)}: ${formatTHB(p.minPrice)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted">
        {[...byMerchant.keys()].map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded" style={{ background: MERCHANT_COLORS[m] }} />
            {names[m] ?? m}
          </span>
        ))}
        <span>ราคาต่ำสุดต่อวันของแต่ละร้าน (รวมข้อมูลย้อนหลังจาก archive.org)</span>
      </figcaption>
    </figure>
  );
}
