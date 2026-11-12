"use client";

import { useMemo, useRef, useState } from "react";
import { useTooltipLeft } from "@/components/use-tooltip-left";
import { useWidth } from "@/components/use-width";
import { MERCHANTS, formatTHB } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

const PAD = { top: 16, right: 16, bottom: 32, left: 84 };

/**
 * Store identity without colour (RawBlock charts are black on white): every
 * line is the foreground colour and stores differ by dash pattern and marker
 * shape, in the fixed `MERCHANTS` order. Text legend and tooltip name them.
 */
type Marker = "square" | "triangle" | "diamond" | "cross";
const STORE_STYLES: readonly { dash: string; marker: Marker }[] = [
  { dash: "", marker: "square" },
  { dash: "9 4", marker: "triangle" },
  { dash: "2 3", marker: "diamond" },
  { dash: "12 4 3 4", marker: "cross" },
];

function storeStyle(slug: string): { dash: string; marker: Marker } {
  const i = MERCHANTS.findIndex((m) => m.slug === slug);
  return STORE_STYLES[(i < 0 ? MERCHANTS.length : i) % STORE_STYLES.length];
}

/** One marker centred on (x, y) with half-size r; filled shapes use `fill`. */
function MarkerShape({ shape, x, y, r, fill }: { shape: Marker; x: number; y: number; r: number; fill: string }) {
  const common = { fill, stroke: "currentColor", strokeWidth: 2 };
  if (shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} {...common} />;
  if (shape === "triangle") {
    return <path d={`M${x},${y - r * 1.2}L${x + r * 1.15},${y + r}L${x - r * 1.15},${y + r}Z`} {...common} />;
  }
  if (shape === "diamond") {
    return <path d={`M${x},${y - r * 1.3}L${x + r * 1.3},${y}L${x},${y + r * 1.3}L${x - r * 1.3},${y}Z`} {...common} />;
  }
  return (
    <path
      d={`M${x - r},${y - r}L${x + r},${y + r}M${x + r},${y - r}L${x - r},${y + r}`}
      stroke="currentColor"
      strokeWidth={2.5}
      fill="none"
    />
  );
}

/** Legend / tooltip key: a short run of the store's dash with its marker. */
function StoreKey({ slug }: { slug: string }) {
  const { dash, marker } = storeStyle(slug);
  return (
    <svg viewBox="0 0 28 12" className="h-3 w-7 shrink-0" aria-hidden>
      <line x1={0} x2={28} y1={6} y2={6} stroke="currentColor" strokeWidth={2.5} strokeDasharray={dash || undefined} />
      <MarkerShape shape={marker} x={14} y={6} r={3.5} fill="currentColor" />
    </svg>
  );
}

type XY = { x: number; y: number };

/**
 * Monotone cubic path (Fritsch–Carlson). Smooth like a spline but never
 * overshoots between observations, so the curve cannot show a price lower or
 * higher than any recorded one. O(n).
 */
function monotonePath(p: XY[]): string {
  const n = p.length;
  if (n === 0) return "";
  if (n === 1) return `M${p[0].x},${p[0].y}`;
  const dx = p.slice(1).map((q, i) => q.x - p[i].x);
  const slope = p.slice(1).map((q, i) => (q.y - p[i].y) / (dx[i] || 1));
  const m = new Array<number>(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d +=
      ` C${(p[i].x + h).toFixed(1)},${(p[i].y + m[i] * h).toFixed(1)}` +
      ` ${(p[i + 1].x - h).toFixed(1)},${(p[i + 1].y - m[i + 1] * h).toFixed(1)}` +
      ` ${p[i + 1].x.toFixed(1)},${p[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/** 4-6 round tick values (1/2/5 × 10^k) spanning [lo, hi]. */
function niceTicks(lo: number, hi: number): number[] {
  const span = Math.max(hi - lo, 1);
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * pow).find((s) => span / s <= 5) ?? 10 * pow;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 0.5; v += step) ticks.push(v);
  return ticks;
}

const fmtDay = (t: number, long = false) =>
  new Date(t).toLocaleDateString("th-TH", {
    day: long ? "numeric" : undefined,
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  });

/**
 * Daily lowest price per store: smooth black lines told apart by dash and
 * marker (STORE_STYLES), a grey wash under the store that is cheapest today,
 * hairline grid, and a crosshair tooltip listing every store at the hovered
 * day.
 */
export function PriceChart({ points, names }: { points: PricePoint[]; names: Record<string, string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxRef, measured] = useWidth<HTMLDivElement>(760);
  // Drawn at its real width: text and strokes are true pixels on any screen.
  const W = Math.max(280, measured);
  const H = W < 520 ? 240 : 280;
  const IW = W - PAD.left - PAD.right;
  const IH = H - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    const byMerchant = new Map<string, { t: number; v: number }[]>();
    for (const p of points) {
      const list = byMerchant.get(p.merchant) ?? [];
      list.push({ t: Date.parse(p.day), v: p.minPrice });
      byMerchant.set(p.merchant, list);
    }
    // Fixed store order = fixed colour order (never by rank).
    const order = MERCHANTS.map((m) => m.slug).filter((s) => byMerchant.has(s));
    for (const s of byMerchant.keys()) if (!order.includes(s)) order.push(s);
    const times = points.map((p) => Date.parse(p.day));
    const prices = points.map((p) => p.minPrice);
    const [t0, t1] = [Math.min(...times), Math.max(...times)];
    const ticks = niceTicks(Math.min(...prices) * 0.97, Math.max(...prices) * 1.03);
    const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
    const x = (t: number) => PAD.left + ((t - t0) / Math.max(t1 - t0, 1)) * IW;
    const y = (v: number) => PAD.top + (1 - (v - lo) / Math.max(hi - lo, 1)) * IH;
    const days = [...new Set(times)].sort((a, b) => a - b);
    const latest = order
      .map((s) => ({ s, last: byMerchant.get(s)!.at(-1)! }))
      .filter(({ last }) => last.t === t1);
    const cheapest = latest.sort((a, b) => a.last.v - b.last.v)[0]?.s ?? order[0];
    const nx = W < 520 ? 3 : 5; // fewer date labels where they would collide
    const xTicks = Array.from({ length: nx }, (_, i) => t0 + ((t1 - t0) * i) / (nx - 1));
    return { byMerchant, order, ticks, x, y, days, cheapest, xTicks, t0, t1 };
  }, [points, W, IW, IH]);

  // The SVG is drawn W units wide but shown at the container's CSS width.
  const hoverCss = hover === null ? null : (model.x(hover) * measured) / W;
  const [tipRef, tipX] = useTooltipLeft(hoverCss, measured);

  if (points.length < 2) {
    return <p className="text-sm text-muted">ประวัติราคายังน้อยเกินไปสำหรับวาดกราฟ</p>;
  }
  const { byMerchant, order, ticks, x, y, days, cheapest, xTicks, t0, t1 } = model;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const t = t0 + ((px - PAD.left) / IW) * (t1 - t0);
    let best = days[0];
    for (const d of days) if (Math.abs(d - t) < Math.abs(best - t)) best = d;
    setHover(best);
  }

  const readout =
    hover === null
      ? []
      : order
          .map((s) => ({ s, v: byMerchant.get(s)!.find((p) => p.t === hover)?.v }))
          .filter((r): r is { s: string; v: number } => r.v !== undefined)
          .sort((a, b) => a.v - b.v);
  const hoverX = hover === null ? 0 : x(hover);

  return (
    <figure className="space-y-3">
      <div className="relative" ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-pan-y select-none"
          role="img"
          aria-label="กราฟประวัติราคาต่ำสุดรายวันของแต่ละร้าน"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="wash-cheapest" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity={0} />
            </linearGradient>
          </defs>

          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.left - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)" className="tabular">
                {formatTHB(v)}
              </text>
            </g>
          ))}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + IH}
            y2={PAD.top + IH}
            stroke="var(--foreground)"
            strokeWidth={2}
          />
          {xTicks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={H - 8}
              fontSize="12"
              fill="var(--muted)"
              className="tabular"
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            >
              {fmtDay(t)}
            </text>
          ))}

          {order.map((s) => {
            const series = byMerchant.get(s)!;
            const xy = series.map((p) => ({ x: x(p.t), y: y(p.v) }));
            const line = monotonePath(xy);
            const { dash, marker } = storeStyle(s);
            const last = xy.at(-1)!;
            return (
              <g key={s} className="text-foreground">
                {s === cheapest && xy.length > 1 && (
                  <path
                    d={`${line} L${last.x.toFixed(1)},${PAD.top + IH} L${xy[0].x.toFixed(1)},${PAD.top + IH} Z`}
                    fill="url(#wash-cheapest)"
                  />
                )}
                <path d={line} fill="none" stroke="currentColor" strokeWidth={2.5} strokeDasharray={dash || undefined} />
                {/* Marker on the latest point names the line where it ends. */}
                <MarkerShape shape={marker} x={last.x} y={last.y} r={4} fill="var(--surface)" />
              </g>
            );
          })}

          {hover !== null && (
            <g pointerEvents="none" className="text-foreground">
              <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + IH} stroke="currentColor" strokeWidth={1} />
              {readout.map((r) => (
                <MarkerShape key={r.s} shape={storeStyle(r.s).marker} x={hoverX} y={y(r.v)} r={4.5} fill="currentColor" />
              ))}
            </g>
          )}
        </svg>

        {hover !== null && readout.length > 0 && (
          <div
            ref={tipRef}
            className="tooltip pointer-events-none absolute top-2 z-10 min-w-[190px] px-3 py-2 text-xs"
            // Clamped inside the chart box (flips left of the crosshair near the right edge).
            style={{ left: tipX }}
          >
            <div className="mb-1 font-medium">{fmtDay(hover, true)}</div>
            {readout.map((r) => (
              <div key={r.s} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <StoreKey slug={r.s} />
                  {names[r.s] ?? r.s}
                </span>
                <span className="font-bold">{formatTHB(r.v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {order.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <StoreKey slug={s} />
            {names[s] ?? s}
          </span>
        ))}
        <span>ราคาต่ำสุดต่อวัน · พื้นที่สีเทา = ร้านที่ถูกที่สุดวันนี้ · ข้อมูลย้อนหลังจาก archive.org</span>
      </figcaption>
    </figure>
  );
}
