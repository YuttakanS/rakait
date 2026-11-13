"use client";

import { useMemo, useRef, useState } from "react";
import { useTooltipLeft } from "@/components/use-tooltip-left";
import { useWidth } from "@/components/use-width";
import { formatTHB } from "@/lib/format";
import type { CurvePoint, Dendrogram, DemandPoint, FitPoint, ResidualBins } from "@/lib/ml";
import type { DemandCluster } from "@/lib/types";

/*
 * Charts of /ml (SPEC round 15). Hand-written SVG like SpecScatter and
 * PriceChart (design.md §3 Charts): black and white, series told apart by
 * line style and marker, `--grid` hairlines, 12 px mono tick text in
 * `--muted`. Each chart measures its box (useWidth) and draws a viewBox of
 * that width, so text stays 12 px on a phone and nothing overflows the page.
 * Rendering is O(points); hover search is O(points) per pointer move.
 */

const TICK = { fontSize: 12, fill: "var(--muted)" } as const;

/**
 * Pixel coordinates rounded to 0.01 px. Math.log10 / Math.log1p may differ
 * in the last bits between Node (server render) and the browser, which made
 * React report a hydration mismatch on every point.
 */
const px = (v: number): number => Math.round(v * 100) / 100;

/** 1, 2, 5 × 10^k values inside [lo, hi] (for log axes). */
function logTicks(lo: number, hi: number, max = 6): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** e;
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  if (out.length <= max) return out;
  return out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
}

/** A count on a log axis: 10, 1k, 100k, 1M (never "1000k"). */
function shortCount(v: number): string {
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toFixed(1))}M`;
  if (v >= 1_000) return `${Number((v / 1_000).toFixed(1))}k`;
  return String(v);
}

/** "฿12k" style short THB for tight log axes. */
function shortTHB(v: number): string {
  if (v >= 1_000_000) return `฿${Number((v / 1_000_000).toFixed(1))}M`;
  if (v >= 1_000) return `฿${Number((v / 1_000).toFixed(1))}k`;
  return formatTHB(v);
}

// ------------------------------------------------------------ MLR fit scatter

const FIT_PAD = { top: 10, right: 12, bottom: 40, left: 58 };

/**
 * Listed price (y) vs fair price (x) on matching log axes, with y = x
 * (price equals fair price) and dashed lines at ± the payload's
 * `uncertain_gap` (beyond them a fair price is flagged "ประเมินไม่แน่นอน";
 * not drawn when the payload has no gap). Points under y = x are cheaper
 * than fair.
 */
export function FitScatter({ points, label, gap }: { points: FitPoint[]; label: string; gap: number | null }) {
  const svg = useRef<SVGSVGElement>(null);
  const [box, measured] = useWidth<HTMLDivElement>(480);
  const W = Math.max(260, measured);
  const H = Math.round(Math.min(380, Math.max(240, W * 0.72)));
  const P = FIT_PAD;
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const all = points.flatMap((p) => [p[0], p[1]]);
    const lo = Math.min(...all) * 0.9;
    const hi = Math.max(...all) * 1.1;
    const a = Math.log10(lo);
    const b = Math.log10(hi);
    const sx = (v: number) => px(P.left + ((Math.log10(v) - a) / (b - a)) * (W - P.left - P.right));
    const sy = (v: number) => px(P.top + (1 - (Math.log10(v) - a) / (b - a)) * (H - P.top - P.bottom));
    return { lo, hi, sx, sy, xy: points.map((p) => ({ px: sx(p[1]), py: sy(p[0]) })) };
  }, [points, W, H, P]);
  const hx = hover === null ? null : geo.xy[hover]?.px ?? null;
  const [tipRef, tipX] = useTooltipLeft(hx === null ? null : (hx * measured) / W, measured);

  if (points.length === 0) return null;
  const { lo, hi, sx, sy, xy } = geo;
  const ticks = logTicks(lo, hi, W < 420 ? 4 : 7);
  const ratio = (k: number) => {
    // y = k x clipped to the plotted square.
    const x0 = Math.max(lo, lo / k);
    const x1 = Math.min(hi, hi / k);
    return x1 > x0 ? { x1: sx(x0), y1: sy(k * x0), x2: sx(x1), y2: sy(k * x1) } : null;
  };
  const band = gap === null ? [] : [ratio(1 + gap), ratio(1 - gap)];
  const diag = ratio(1);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const pointerX = ((e.clientX - r.left) / r.width) * W;
    const pointerY = ((e.clientY - r.top) / r.height) * H;
    let best = -1;
    let bestD = 24 * 24;
    for (let i = 0; i < xy.length; i++) {
      const d = (xy[i].px - pointerX) ** 2 + (xy[i].py - pointerY) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best >= 0 ? best : null);
  }

  const h = hover === null ? null : { p: points[hover], ...xy[hover] };
  return (
    <div className="relative" ref={box}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.left} x2={W - P.right} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <line x1={sx(v)} x2={sx(v)} y1={P.top} y2={H - P.bottom} stroke="var(--grid)" />
            <text x={P.left - 6} y={sy(v) + 4} textAnchor="end" className="tabular" {...TICK}>
              {shortTHB(v)}
            </text>
            <text x={sx(v)} y={H - P.bottom + 16} textAnchor="middle" className="tabular" {...TICK}>
              {shortTHB(v)}
            </text>
          </g>
        ))}
        <text x={W - P.right} y={H - 3} textAnchor="end" {...TICK}>
          ราคายุติธรรม (แกน log) →
        </text>
        <text x={P.left} y={P.top + 12} {...TICK}>
          ↑ ราคาจริง
        </text>
        {band.map(
          (l, i) =>
            l && <line key={i} {...l} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 5" />,
        )}
        {/* Shared style on the group: each point is only x / y (a few hundred points per chart). */}
        <g fill="none" stroke="var(--foreground)" strokeOpacity={0.55}>
          {xy.map((p, i) => (
            <rect key={i} x={px(p.px - 2.5)} y={px(p.py - 2.5)} width={5} height={5} />
          ))}
        </g>
        {diag && <line {...diag} stroke="var(--foreground)" strokeWidth={3} />}
        {h && <rect x={h.px - 5} y={h.py - 5} width={10} height={10} fill="var(--foreground)" stroke="var(--surface)" strokeWidth={2} />}
      </svg>
      {h && (
        <div
          ref={tipRef}
          className="tooltip pointer-events-none absolute z-10 px-3 py-2 text-xs"
          style={{ left: tipX, top: `${Math.max((h.py / H) * 100 - 30, 0)}%` }}
        >
          <div className="font-medium">{h.p[2]}</div>
          <div>
            ราคาจริง <span className="font-bold">{formatTHB(h.p[0])}</span> · ยุติธรรม {formatTHB(h.p[1])}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- residual histogram

/**
 * Count of listings per bin of (price / fair − 1), with 0 marked and, when
 * the payload has one, dashed lines at ± `uncertain_gap`.
 */
export function ResidualHistogram({ bins, label, gap }: { bins: ResidualBins; label: string; gap: number | null }) {
  const [box, measured] = useWidth<HTMLDivElement>(480);
  const W = Math.max(260, measured);
  const H = 220;
  const P = { top: 12, right: 12, bottom: 40, left: 40 };
  const lo = bins.edges[0];
  const hi = bins.edges[bins.edges.length - 1];
  const max = Math.max(...bins.counts, 1);
  const sx = (v: number) => px(P.left + ((v - lo) / (hi - lo)) * (W - P.left - P.right));
  const sy = (v: number) => px(P.top + (1 - v / max) * (H - P.top - P.bottom));
  const step = W < 420 ? 0.3 : 0.2;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(2)));
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={P.left} x2={W - P.right} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <text x={P.left - 6} y={sy(v) + 4} textAnchor="end" className="tabular" {...TICK}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        {bins.counts.map((c, i) => {
          const x0 = sx(bins.edges[i]);
          const x1 = sx(bins.edges[i + 1]);
          return c > 0 ? (
            <rect key={i} x={x0 + 1} y={sy(c)} width={Math.max(x1 - x0 - 2, 1)} height={sy(0) - sy(c)} fill="var(--foreground)">
              <title>{`${Math.round(bins.edges[i] * 100)}% ถึง ${Math.round(bins.edges[i + 1] * 100)}%: ${c} รายการ`}</title>
            </rect>
          ) : null;
        })}
        <line x1={P.left} x2={W - P.right} y1={sy(0)} y2={sy(0)} stroke="var(--foreground)" strokeWidth={2} />
        {(gap === null ? [] : [-gap, gap]).filter((v) => v > lo && v < hi).map((v) => (
          <line key={v} x1={sx(v)} x2={sx(v)} y1={P.top} y2={sy(0)} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 5" />
        ))}
        <line x1={sx(0)} x2={sx(0)} y1={P.top} y2={sy(0)} stroke="var(--foreground)" strokeWidth={2} />
        {ticks.map((v, i) => (
          <text
            key={v}
            x={sx(v)}
            y={H - P.bottom + 16}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            className="tabular"
            {...TICK}
          >
            {v > 0 ? "+" : ""}
            {Math.round(v * 100)}%
          </text>
        ))}
        <text x={W - P.right} y={H - 3} textAnchor="end" {...TICK}>
          ราคาจริงเทียบราคายุติธรรม →
        </text>
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ K-Means scatter

/** Marker per listing label: shape + fill, never colour (design.md §3). */
/**
 * Geometry only; stroke, width and the hollow default fill come from the
 * enclosing `<g {...MARKER_STYLE}>`, so each of up to several hundred
 * points costs a few bytes of HTML.
 */
function Marker({ label, x: cx, y: cy, solid = "var(--foreground)" }: { label: string; x: number; y: number; solid?: string }) {
  const x = px(cx);
  const y = px(cy);
  switch (label as DemandCluster) {
    case "hidden_gem":
      return <rect x={px(x - 3)} y={px(y - 3)} width={6} height={6} fill={solid} stroke="none" />;
    case "community_favorite":
      return <rect x={px(x - 3)} y={px(y - 3)} width={6} height={6} />;
    case "overpriced_hype":
      return <path d={`M${x} ${px(y - 4)}L${px(x + 4)} ${px(y + 3)}L${px(x - 4)} ${px(y + 3)}Z`} />;
    default:
      return <path d={`M${px(x - 3)} ${px(y - 3)}l6 6m-6 0l6-6`} />;
  }
}

const MARKER_STYLE = { fill: "none", stroke: "var(--foreground)", strokeWidth: 1.5 } as const;
/**
 * Models K-Means grouped but the web does not badge (SPEC round 18): the
 * same shape in `--subtle` grey with a thinner stroke, drawn under the
 * badged ones. `--subtle` keeps >= 3:1 against the chart surface in both
 * themes (5.7:1 light, 7.8:1 dark; `--disabled-border` was under 3:1) while
 * reading clearly fainter than the black / white badged points. The shape
 * still names the K-Means group; the legend draws the same style.
 */
const FADED = "var(--subtle)";
const FADED_STYLE = { ...MARKER_STYLE, stroke: FADED, strokeWidth: 1 } as const;

/** Legend swatch for one demand label (also used by the page's text legend); `faded` = unbadged. */
export function MarkerSwatch({ label, faded = false }: { label: string; faded?: boolean }) {
  return (
    <svg width={14} height={14} viewBox="-7 -7 14 14" aria-hidden className="inline-block align-middle">
      <g {...(faded ? FADED_STYLE : MARKER_STYLE)}>
        <Marker label={label} x={0} y={0} solid={faded ? FADED : undefined} />
      </g>
    </svg>
  );
}

export interface CentroidXY {
  x: number;
  y: number;
  /** Cluster number shown in the diamond (1-based). */
  index: number;
}

/**
 * Models on log(views + 1) vs within-store sales percentile, one marker
 * shape per demand label, numbered black diamonds at the K-Means centroids,
 * and a dashed line at the views split of the best sellers.
 */
export function DemandScatter({
  points,
  centroids,
  splitLogViews,
  label,
}: {
  points: DemandPoint[];
  centroids: CentroidXY[];
  splitLogViews: number | null;
  label: string;
}) {
  const [box, measured] = useWidth<HTMLDivElement>(480);
  const W = Math.max(260, measured);
  const H = Math.round(Math.min(380, Math.max(260, W * 0.62)));
  const P = { top: 12, right: 14, bottom: 40, left: 44 };
  const xMax = Math.max(...points.map((p) => p[0]), ...centroids.map((c) => c.x), 1) * 1.04;
  const sx = (v: number) => px(P.left + (v / xMax) * (W - P.left - P.right));
  const sy = (v: number) => px(P.top + (1 - v) * (H - P.top - P.bottom));
  const viewTicks = [0, 10, 100, 1_000, 10_000, 100_000, 1_000_000].filter((v) => Math.log1p(v) <= xMax);
  const shownTicks = W < 420 ? viewTicks.filter((_, i) => i % 2 === 0) : viewTicks;
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={P.left} x2={W - P.right} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <text x={P.left - 6} y={sy(v) + 4} textAnchor="end" className="tabular" {...TICK}>
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {shownTicks.map((v) => (
          <text key={v} x={sx(Math.log1p(v))} y={H - P.bottom + 16} textAnchor="middle" className="tabular" {...TICK}>
            {shortCount(v)}
          </text>
        ))}
        <text x={W - P.right} y={H - 3} textAnchor="end" {...TICK}>
          ยอดเข้าชม (แกน log) →
        </text>
        {splitLogViews !== null && (
          <line x1={sx(splitLogViews)} x2={sx(splitLogViews)} y1={P.top} y2={sy(0)} stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="6 5" />
        )}
        {/* Unbadged models (4th value false, 2026.11-v16+) first, in grey, so badged ones sit on top. */}
        <g {...FADED_STYLE}>
          {points.map((p, i) =>
            p[3] === false ? <Marker key={i} label={p[2]} x={sx(p[0])} y={sy(p[1])} solid={FADED} /> : null,
          )}
        </g>
        <g {...MARKER_STYLE}>
          {points.map((p, i) => (p[3] === false ? null : <Marker key={i} label={p[2]} x={sx(p[0])} y={sy(p[1])} />))}
        </g>
        {centroids.map((c) => (
          <g key={c.index}>
            <path
              d={`M${sx(c.x)} ${sy(c.y) - 11}L${sx(c.x) + 11} ${sy(c.y)}L${sx(c.x)} ${sy(c.y) + 11}L${sx(c.x) - 11} ${sy(c.y)}Z`}
              fill="var(--foreground)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text x={sx(c.x)} y={sy(c.y) + 4} textAnchor="middle" fontSize="12" fontWeight={700} fill="var(--background)" className="tabular">
              {c.index}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------ Ward dendrogram

/** Minimum distance (px) between two group-number squares on the cut line. */
const MIN_LABEL_GAP = 20;

/**
 * Index of the last group before `i` whose number is drawn, walking the same
 * greedy left-to-right rule as the chart. O(i) per call, k <= 6.
 */
function shownBefore(groups: { x: number }[], i: number, sx: (v: number) => number): number {
  let last = 0;
  for (let j = 1; j < i; j++) if (sx(groups[j].x) - sx(groups[last].x) >= MIN_LABEL_GAP) last = j;
  return last;
}

/** Minimum on-screen gap (px) between the merges just below and above the cut. */
const CUT_GAP_PX = 36;

/**
 * Height -> y. Linear, except that when the two merges around the cut
 * (`lowMerge`, `highMerge`) would sit closer than `CUT_GAP_PX`, the band
 * between them is stretched to that height and the parts below and above
 * share the rest in proportion to their heights. Returns whether it
 * stretched (the chart then says so). O(1) per call.
 */
function dendroScale(
  top: number,
  lowMerge: number | null,
  highMerge: number | null,
  y0: number,
  y1: number,
): { sy: (v: number) => number; stretched: boolean } {
  const span = y1 - y0;
  const linear = (v: number) => px(y1 - (v / top) * span);
  // lowMerge > 0: the band below the cut must have a height to scale (no 0 / 0).
  if (lowMerge === null || highMerge === null || lowMerge <= 0 || highMerge <= lowMerge) return { sy: linear, stretched: false };
  if (((highMerge - lowMerge) / top) * span >= CUT_GAP_PX) return { sy: linear, stretched: false };
  const rest = span - CUT_GAP_PX;
  const below = lowMerge;
  const above = top - highMerge;
  const pxBelow = (rest * below) / (below + above);
  const pxAbove = rest - pxBelow;
  const sy = (v: number) => {
    if (v <= lowMerge) return px(y1 - (v / lowMerge) * pxBelow);
    if (v <= highMerge) return px(y1 - pxBelow - ((v - lowMerge) / (highMerge - lowMerge)) * CUT_GAP_PX);
    return px(y1 - pxBelow - CUT_GAP_PX - ((v - highMerge) / (above || 1)) * pxAbove);
  };
  return { sy, stretched: true };
}

/**
 * Leaf span (in dendrogram x units) of every cluster the cut line crosses,
 * left to right. A vertical leg ending at height h > 0 at x leads to the link whose
 * apex is (x, h); at height 0 it is a leaf. O(links) with a hash map.
 */
function cutGroups(d: Dendrogram, cut: number): { x: number; lo: number; hi: number }[] {
  // Apex heights are exact copies of the parent's leg heights; x values were
  // rounded to 0.01 in the payload, so x is matched within 0.05.
  const byHeight = new Map<string, { mid: number; i: number }[]>();
  d.icoord.forEach((xs, i) => {
    const k = d.dcoord[i][1].toFixed(4);
    byHeight.set(k, [...(byHeight.get(k) ?? []), { mid: (xs[1] + xs[2]) / 2, i }]);
  });
  const span = (x: number, h: number): [number, number] => {
    const i = h > 0 ? byHeight.get(h.toFixed(4))?.find((c) => Math.abs(c.mid - x) < 0.05)?.i : undefined;
    if (i === undefined) return [x, x];
    const [l0, l1] = span(d.icoord[i][0], d.dcoord[i][0]);
    const [r0, r1] = span(d.icoord[i][3], d.dcoord[i][3]);
    return [Math.min(l0, r0), Math.max(l1, r1)];
  };
  const groups: { x: number; lo: number; hi: number }[] = [];
  d.icoord.forEach((xs, i) => {
    const h = d.dcoord[i];
    // Left leg (x0: h0 -> h1) and right leg (x3: h3 -> h2) crossing the cut.
    if (h[0] < cut && cut < h[1]) {
      const [lo, hi] = span(xs[0], h[0]);
      groups.push({ x: xs[0], lo, hi });
    }
    if (h[3] < cut && cut < h[2]) {
      const [lo, hi] = span(xs[3], h[3]);
      groups.push({ x: xs[3], lo, hi });
    }
  });
  return groups.sort((a, b) => a.x - b.x);
}

/**
 * The top of the Ward tree as "∩" links, with the dashed cut at k clusters.
 * The cut sits midway between the merges that leave k and k − 1 clusters;
 * the y axis is stretched around it when that gap would be under
 * `CUT_GAP_PX`. Each branch the cut crosses gets a numbered square on the
 * line, and its subtree below the cut sits on an alternating sunken band.
 */
export function DendrogramChart({ data, k, label }: { data: Dendrogram; k: number; label: string }) {
  const [box, measured] = useWidth<HTMLDivElement>(480);
  const W = Math.max(260, measured);
  const H = 280;
  const P = { top: 14, right: 12, bottom: 30, left: 44 };
  const leaves = data.leaf_sizes.length;
  const apexes = data.dcoord.map((h) => h[1]).sort((a, b) => b - a);
  const top = Math.max(...apexes, data.cut_height ?? 0) * 1.05 || 1;
  // Merge k − 1 (the lowest one above the cut) and merge k (the highest below it).
  const highMerge = k >= 2 && apexes.length >= k - 1 ? apexes[k - 2] : null;
  const lowMerge = k >= 2 && apexes.length >= k ? apexes[k - 1] : null;
  const cut = lowMerge !== null && highMerge !== null ? (lowMerge + highMerge) / 2 : data.cut_height;
  const { sy, stretched } = dendroScale(top, lowMerge, highMerge, P.top, H - P.bottom);
  const sx = (v: number) => px(P.left + (v / (10 * leaves)) * (W - P.left - P.right));
  const leafPx = (W - P.left - P.right) / leaves;
  const groups = cut === null ? [] : cutGroups(data, cut);
  // The cut height gets its own labelled tick on the y axis (SPEC round 18);
  // a plain tick closer than one text line to it is dropped so labels never
  // overlap. The label is the payload's cut_height, the number /ml quotes.
  const cutLabel = cut === null ? null : (data.cut_height ?? cut).toFixed(2);
  const ticks = (stretched ? [0, top] : [0, top / 2, top]).filter((v) => cut === null || Math.abs(sy(v) - sy(cut)) >= 16);
  return (
    <div ref={box} className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {cut !== null &&
          groups.map((g, i) => (
            <rect
              key={`band${i}`}
              x={sx(g.lo - 5)}
              y={sy(cut)}
              width={px(sx(g.hi + 5) - sx(g.lo - 5))}
              height={px(sy(0) - sy(cut))}
              fill={i % 2 === 0 ? "var(--surface-muted)" : "none"}
            />
          ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.left} x2={W - P.right} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <text x={P.left - 6} y={sy(v) + 4} textAnchor="end" className="tabular" {...TICK}>
              {v.toFixed(v >= 10 ? 0 : 1)}
            </text>
          </g>
        ))}
        {data.icoord.map((xs, i) => (
          <path
            key={i}
            d={xs.map((x, j) => `${j ? "L" : "M"}${sx(x)} ${sy(data.dcoord[i][j])}`).join("")}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth={2}
          />
        ))}
        {leafPx >= 24 &&
          data.leaf_sizes.map((s, i) => (
            <text key={i} x={sx(10 * i + 5)} y={H - P.bottom + 16} textAnchor="middle" className="tabular" {...TICK}>
              {s}
            </text>
          ))}
        {cut !== null && (
          <g>
            <line x1={P.left - 5} x2={P.left} y1={sy(cut)} y2={sy(cut)} stroke="var(--foreground)" strokeWidth={2} />
            <text x={P.left - 7} y={px(sy(cut) + 4)} textAnchor="end" fontSize="12" fontWeight={700} fill="var(--foreground)" className="tabular">
              {cutLabel}
            </text>
            <line x1={P.left} x2={W - P.right} y1={sy(cut)} y2={sy(cut)} stroke="var(--foreground)" strokeWidth={2} strokeDasharray="8 5" />
            {groups.map((g, i) => {
              // On a narrow screen neighbouring branches can sit closer than a
              // number square: draw a number only when it is at least
              // MIN_LABEL_GAP from the last one drawn (the bands still mark every group).
              if (i > 0 && sx(g.x) - sx(groups[shownBefore(groups, i, sx)].x) < MIN_LABEL_GAP) return null;
              return (
              <g key={`n${i}`}>
                <rect x={px(sx(g.x) - 9)} y={px(sy(cut) - 9)} width={18} height={18} fill="var(--foreground)" />
                <text x={sx(g.x)} y={px(sy(cut) + 4)} textAnchor="middle" fontSize="12" fontWeight={700} fill="var(--background)" className="tabular">
                  {i + 1}
                </text>
              </g>
              );
            })}
            <rect x={W - P.right - 108} y={px(sy(cut) - 30)} width={108} height={18} fill="var(--surface)" />
            <text x={W - P.right - 2} y={px(sy(cut) - 16)} textAnchor="end" fontSize="12" fontWeight={700} fill="var(--foreground)">
              เส้นตัด k = {k}
            </text>
          </g>
        )}
      </svg>
      {stretched && (
        <p className="text-xs text-muted">
          แกนตั้งถูกยืดเฉพาะช่วงรอบเส้นตัด เพื่อให้เห็นช่องว่างระหว่างการรวมครั้งที่ทำให้เหลือ {k} กลุ่ม กับครั้งที่ทำให้เหลือ {k - 1}{" "}
          กลุ่ม
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------- record-linkage threshold curve

/**
 * Precision (solid, squares) and coverage (dotted, triangles) against the
 * cosine threshold, with the chosen threshold as a long-dashed vertical line.
 */
export function LinkageCurve({ curve, threshold, label }: { curve: CurvePoint[]; threshold: number | null; label: string }) {
  const [box, measured] = useWidth<HTMLDivElement>(480);
  const W = Math.max(260, measured);
  const H = 230;
  const P = { top: 12, right: 14, bottom: 40, left: 44 };
  const xs = curve.map((c) => c.threshold);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const sx = (v: number) => px(P.left + ((v - lo) / (hi - lo || 1)) * (W - P.left - P.right));
  const sy = (v: number) => px(P.top + (1 - v) * (H - P.top - P.bottom));
  const precision = curve.filter((c) => c.precision !== null);
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x)} ${sy(p.y)}`).join("");
  const step = Math.max(1, Math.ceil(curve.length / (W < 420 ? 4 : 7)));
  return (
    <div ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={P.left} x2={W - P.right} y1={sy(v)} y2={sy(v)} stroke="var(--grid)" />
            <text x={P.left - 6} y={sy(v) + 4} textAnchor="end" className="tabular" {...TICK}>
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {curve
          .filter((_, i) => i % step === 0)
          .map((c) => (
            <text
              key={c.threshold}
              x={sx(c.threshold)}
              y={H - P.bottom + 16}
              textAnchor={c.threshold === hi ? "end" : c.threshold === lo ? "start" : "middle"}
              className="tabular"
              {...TICK}
            >
              {c.threshold.toFixed(2)}
            </text>
          ))}
        <text x={W - P.right} y={H - 3} textAnchor="end" {...TICK}>
          threshold (cosine) →
        </text>
        {threshold !== null && (
          <line x1={sx(threshold)} x2={sx(threshold)} y1={P.top} y2={sy(0)} stroke="var(--foreground)" strokeWidth={2} strokeDasharray="14 6" />
        )}
        <path d={path(precision.map((c) => ({ x: c.threshold, y: c.precision as number })))} fill="none" stroke="var(--foreground)" strokeWidth={2.5} />
        <path d={path(curve.map((c) => ({ x: c.threshold, y: c.coverage })))} fill="none" stroke="var(--foreground)" strokeWidth={2.5} strokeDasharray="2 4" />
        {precision.map((c) => (
          <rect key={`p${c.threshold}`} x={sx(c.threshold) - 3} y={sy(c.precision as number) - 3} width={6} height={6} fill="var(--foreground)" />
        ))}
        {curve.map((c) => (
          <path
            key={`c${c.threshold}`}
            d={`M${sx(c.threshold)} ${sy(c.coverage) - 4}L${sx(c.threshold) + 4} ${sy(c.coverage) + 3}L${sx(c.threshold) - 4} ${sy(c.coverage) + 3}Z`}
            fill="var(--surface)"
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
    </div>
  );
}

/** Text legend entries with the same marks the charts draw. */
export function LineKey({ dash, marker }: { dash?: string; marker: "square" | "triangle" | "none" }) {
  return (
    <svg width={30} height={12} viewBox="0 0 30 12" aria-hidden className="inline-block align-middle">
      <line x1={0} x2={30} y1={6} y2={6} stroke="var(--foreground)" strokeWidth={2.5} strokeDasharray={dash} />
      {marker === "square" && <rect x={12} y={3} width={6} height={6} fill="var(--foreground)" />}
      {marker === "triangle" && <path d="M15 2L19 9L11 9Z" fill="var(--surface)" stroke="var(--foreground)" strokeWidth={1.5} />}
    </svg>
  );
}
