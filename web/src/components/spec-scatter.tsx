"use client";

import { useMemo, useRef, useState } from "react";
import { formatTHB } from "@/lib/format";

const W = 360;
const H = 220;
const PAD = { top: 10, right: 12, bottom: 30, left: 56 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

export type ScatterPoint = { x: number; price: number; model: string };

function niceMax(v: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(v, 1)));
  return ([1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= v) ?? 10 * pow) as number;
}

/**
 * Price vs one spec, with the fitted simple-regression line Ŷ = β₀ + β₁X.
 * Dense scatter: the hover target is the nearest point to the pointer, not
 * the 6 px dot, and the tooltip names the model, spec value and price.
 */
export function SpecScatter({
  points,
  slope,
  intercept,
  xLabel,
  xUnit,
}: {
  points: ScatterPoint[];
  slope: number;
  intercept: number;
  xLabel: string;
  xUnit: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    // Axes end at the 97.5th percentile: a few workstation-class outliers
    // would otherwise squeeze every consumer part into one corner. The
    // hidden count is printed under the chart.
    const q = (vals: number[]) => [...vals].sort((a, b) => a - b)[Math.floor((vals.length - 1) * 0.975)];
    const xMax = niceMax(q(points.map((p) => p.x)) * 1.05);
    const yMax = niceMax(q(points.map((p) => p.price)) * 1.05);
    const shown = points.filter((p) => p.x <= xMax && p.price <= yMax);
    const sx = (v: number) => PAD.left + (v / xMax) * IW;
    const sy = (v: number) => PAD.top + (1 - v / yMax) * IH;
    const xy = shown.map((p) => ({ px: sx(p.x), py: sy(p.price) }));
    // Fitted line clipped to the plotted price range (the intercept can be < 0).
    const x0 = Math.max(0, -intercept / slope);
    const x1 = Math.min(xMax, (yMax - intercept) / slope);
    return { xMax, yMax, sx, sy, xy, x0, x1, shown, hidden: points.length - shown.length };
  }, [points, slope, intercept]);

  if (points.length === 0) return <p className="text-sm text-muted">ยังไม่มีข้อมูล</p>;
  const { xMax, yMax, sx, sy, xy, x0, x1, shown, hidden } = geo;
  const yTicks = [0, yMax / 2, yMax];
  const xTicks = [0, xMax / 2, xMax];

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best = -1;
    let bestD = 24 * 24; // only within ~24 px
    for (let i = 0; i < xy.length; i++) {
      const d = (xy[i].px - px) ** 2 + (xy[i].py - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best >= 0 ? best : null);
  }

  const h = hover === null ? null : { ...shown[hover], ...xy[hover] };

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={`ราคาเทียบกับ${xLabel}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} stroke="var(--border)" />
            <text x={PAD.left - 6} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {formatTHB(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v, i) => (
          <text
            key={v}
            x={sx(v)}
            y={H - 12}
            fontSize="11"
            fill="var(--muted)"
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
          >
            {Math.round(v).toLocaleString("th-TH")}
          </text>
        ))}
        <text x={W - PAD.right} y={H - 1} fontSize="10" fill="var(--muted)" textAnchor="end">
          {xLabel} ({xUnit})
        </text>
        {xy.map((p, i) => (
          <circle key={i} cx={p.px} cy={p.py} r={3} fill="var(--series-1)" fillOpacity={0.45} />
        ))}
        {x1 > x0 && (
          <line
            x1={sx(x0)}
            y1={sy(intercept + slope * x0)}
            x2={sx(x1)}
            y2={sy(intercept + slope * x1)}
            stroke="var(--foreground)"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )}
        {h && <circle cx={h.px} cy={h.py} r={5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
      </svg>
      {h && (
        <div
          className="card pointer-events-none absolute z-10 max-w-[220px] px-2.5 py-1.5 text-xs"
          style={{
            left: `${Math.min((h.px / W) * 100, 55)}%`,
            top: `${Math.max((h.py / H) * 100 - 30, 0)}%`,
          }}
        >
          <div className="font-medium">{h.model}</div>
          <div className="tabular text-muted">
            {h.x.toLocaleString("th-TH")} {xUnit} · <span className="font-semibold text-foreground">{formatTHB(h.price)}</span>
          </div>
        </div>
      )}
      {hidden > 0 && (
        <p className="mt-1 text-[11px] text-subtle">ไม่แสดง {hidden} รายการที่สเปกหรือราคาสูงผิดปกติ (เกิน percentile 97.5)</p>
      )}
    </div>
  );
}
