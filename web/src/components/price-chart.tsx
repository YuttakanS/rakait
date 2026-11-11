"use client";

import { useMemo, useRef, useState } from "react";
import { MERCHANTS, MERCHANT_COLORS, formatTHB } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

const W = 760;
const H = 280;
const PAD = { top: 16, right: 16, bottom: 32, left: 72 };
const IW = W - PAD.left - PAD.right;
const IH = H - PAD.top - PAD.bottom;

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
 * Daily lowest price per store: smooth lines, a soft wash under the store that
 * is cheapest today, hairline grid, and a crosshair tooltip listing every
 * store at the hovered day.
 */
export function PriceChart({ points, names }: { points: PricePoint[]; names: Record<string, string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
    const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);
    return { byMerchant, order, ticks, x, y, days, cheapest, xTicks, t0, t1 };
  }, [points]);

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
  const tipLeft = hover !== null && hoverX > W * 0.6;

  return (
    <figure className="space-y-3">
      <div className="relative">
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
            {order.map((s) => (
              <linearGradient key={s} id={`wash-${s}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={MERCHANT_COLORS[s] ?? "var(--accent)"} stopOpacity={0.22} />
                <stop offset="100%" stopColor={MERCHANT_COLORS[s] ?? "var(--accent)"} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
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
            stroke="var(--subtle)"
            strokeWidth={1}
          />
          {xTicks.map((t, i) => (
            <text
              key={t}
              x={x(t)}
              y={H - 8}
              fontSize="12"
              fill="var(--muted)"
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            >
              {fmtDay(t)}
            </text>
          ))}

          {order.map((s) => {
            const series = byMerchant.get(s)!;
            const xy = series.map((p) => ({ x: x(p.t), y: y(p.v) }));
            const line = monotonePath(xy);
            const color = MERCHANT_COLORS[s] ?? "var(--accent)";
            return (
              <g key={s}>
                {s === cheapest && xy.length > 1 && (
                  <path
                    d={`${line} L${xy.at(-1)!.x.toFixed(1)},${PAD.top + IH} L${xy[0].x.toFixed(1)},${PAD.top + IH} Z`}
                    fill={`url(#wash-${s})`}
                  />
                )}
                <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
                {xy.length === 1 && <circle cx={xy[0].x} cy={xy[0].y} r={4} fill={color} />}
              </g>
            );
          })}

          {hover !== null && (
            <g pointerEvents="none">
              <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + IH} stroke="var(--muted)" strokeWidth={1} />
              {readout.map((r) => (
                <circle
                  key={r.s}
                  cx={hoverX}
                  cy={y(r.v)}
                  r={5}
                  fill={MERCHANT_COLORS[r.s] ?? "var(--accent)"}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>

        {hover !== null && readout.length > 0 && (
          <div
            className="card pointer-events-none absolute top-2 z-10 min-w-[170px] px-3 py-2 text-xs"
            style={
              tipLeft
                ? { right: `${((W - hoverX) / W) * 100 + 1.5}%` }
                : { left: `${(hoverX / W) * 100 + 1.5}%` }
            }
          >
            <div className="mb-1 font-medium">{fmtDay(hover, true)}</div>
            {readout.map((r) => (
              <div key={r.s} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: MERCHANT_COLORS[r.s] }} />
                  {names[r.s] ?? r.s}
                </span>
                <span className="tabular font-semibold">{formatTHB(r.v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {order.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-foreground">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: MERCHANT_COLORS[s] }} />
            {names[s] ?? s}
          </span>
        ))}
        <span>ราคาต่ำสุดต่อวัน · พื้นที่ไล่สี = ร้านที่ถูกที่สุดวันนี้ · ข้อมูลย้อนหลังจาก archive.org</span>
      </figcaption>
    </figure>
  );
}
