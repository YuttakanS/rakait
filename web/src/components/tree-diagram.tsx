import { RECOMMENDATION_LABELS, formatTHB } from "@/lib/format";
import { EDGE_WORDS, questionBoxWidth, splitText, yesNoChildren, type ClassValue, type TreeNode } from "@/lib/ml";
import type { Recommendation } from "@/lib/types";
import { TreeScroll } from "./tree-scroll";

/* Fixed geometry in CSS px: the SVG is drawn at its real size (12 px text
   stays 12 px) and scrolls sideways inside its own box when wider than it. */
const LEAF_W = 112; // leaf: a price or a class name, n and a share
const NODE_H = 66;
const GAP = 14; // minimum space between two boxes on one row
const LEVEL = NODE_H + 54; // room for the edge labels between rows
const PAD = 8;
const LINE = 17;

type Placed = { node: TreeNode; x: number; y: number; depth: number };

/**
 * A laid-out subtree: centre x of every node relative to its root, and per
 * row the left edge of its leftmost box and the right edge of its rightmost.
 */
type Subtree = { xs: Map<number, number>; left: number[]; right: number[] };

const isLeaf = (n: TreeNode): boolean => n.left === null || n.right === null;
/** A question box fits its own text (`questionBoxWidth`, at least 172 px); a leaf is LEAF_W. */
const boxWidth = (n: TreeNode): number =>
  isLeaf(n) || n.feature === null || n.threshold === null ? LEAF_W : questionBoxWidth(n.feature, n.threshold, n.n);

/**
 * Fill of a price leaf's strip at `t` in [0, 1] (cheapest -> dearest): the
 * foreground mixed into the surface, so it is darker in light mode and
 * lighter in dark mode. The legend draws the same fills, so it reads right
 * in both themes.
 */
const stripFill = (t: number): string => `color-mix(in srgb, var(--foreground) ${Math.round(15 + 85 * t)}%, var(--surface))`;

/**
 * Compact tidy layout (Reingold–Tilford contour packing). Each subtree is
 * laid out on its own; the right sibling is then pushed right only as far
 * as needed for every shared row to keep `GAP` between the left subtree's
 * right contour (box edges) and the right subtree's left contour, and the
 * parent sits midway between its two children. Leaves are narrower than
 * question boxes, so a full depth-4 tree packs pairs of leaves under each
 * question instead of one wide slot per leaf; any two boxes on a row stay at
 * least `GAP` apart (no overlap). O(nodes x depth) for the contour merges
 * (depth <= 4 here).
 */
function pack(nodes: TreeNode[], id: number): Subtree {
  const node = nodes[id];
  const hw = boxWidth(node) / 2;
  const children = yesNoChildren(node);
  if (children === null) return { xs: new Map([[id, 0]]), left: [-hw], right: [hw] };
  // "ใช่" child on the left (a), "ไม่ใช่" on the right (b), for every question.
  const a = pack(nodes, children[0]);
  const b = pack(nodes, children[1]);
  let shift = 0;
  for (let d = 0; d < Math.min(a.right.length, b.left.length); d++) shift = Math.max(shift, a.right[d] - b.left[d] + GAP);
  const half = shift / 2;
  const xs = new Map<number, number>([[id, 0]]);
  a.xs.forEach((x, k) => xs.set(k, x - half));
  b.xs.forEach((x, k) => xs.set(k, x + half));
  const left = [-hw];
  const right = [hw];
  for (let d = 0; d < Math.max(a.left.length, b.left.length); d++) {
    const ls = [d < a.left.length ? a.left[d] - half : Infinity, d < b.left.length ? b.left[d] + half : Infinity];
    const rs = [d < a.right.length ? a.right[d] - half : -Infinity, d < b.right.length ? b.right[d] + half : -Infinity];
    left.push(Math.min(...ls));
    right.push(Math.max(...rs));
  }
  return { xs, left, right };
}

function layout(nodes: TreeNode[]): { placed: Placed[]; width: number; height: number } {
  const { xs, left, right } = pack(nodes, 0);
  const minX = Math.min(...left);
  const maxX = Math.max(...right);
  const placed: Placed[] = new Array(nodes.length);
  const visit = (id: number, depth: number) => {
    const node = nodes[id];
    placed[id] = { node, x: PAD + (xs.get(id) ?? 0) - minX, y: PAD + depth * LEVEL, depth };
    for (const child of yesNoChildren(node) ?? []) visit(child, depth + 1);
  };
  visit(0, 0);
  return { placed, width: PAD * 2 + (maxX - minX), height: PAD * 2 + (left.length - 1) * LEVEL + NODE_H };
}

const TONE: Record<Recommendation, string> = {
  buy_now: "var(--good)",
  wait: "var(--warn)",
  fair_price: "var(--foreground)",
};

const isClass = (v: TreeNode["value"]): v is ClassValue => typeof v === "object" && v !== null && "winner" in v;

/**
 * A fitted decision / regression tree as a node-link diagram (SPEC round 15).
 *
 * Inner nodes print the split in Thai with its unit and the rows reaching
 * them; the "ใช่" edge always goes left and "ไม่ใช่" right, for "≤ t"
 * questions and yes/no specs alike (`yesNoChildren`, SPEC round 18). Price
 * leaves print the typical price and carry a top strip whose fill moves from
 * the surface colour (cheap) toward the text colour (dear) on a log scale,
 * with a ถูก -> แพง legend drawn in the same fills, so it holds in light and
 * dark mode; class leaves print the recommendation in the colour of its
 * badge, framed in that colour. Colour is never the only signal: the price
 * or the class name is always printed. Server component.
 */
export function TreeDiagram({
  nodes,
  label,
  outline,
}: {
  nodes: TreeNode[];
  /** Accessible name of the whole chart. */
  label: string;
  /** The same tree as indented text, shown in a `<details>`. */
  outline: string;
}) {
  const { placed, width, height } = layout(nodes);
  const prices = placed.filter((p) => p.node.left === null && typeof p.node.value === "number").map((p) => p.node.value as number);
  const lo = Math.log(Math.max(Math.min(...prices), 1));
  const hi = Math.log(Math.max(...prices, 1));
  const shade = (v: number) => (hi > lo ? (Math.log(Math.max(v, 1)) - lo) / (hi - lo) : 1);

  return (
    <div className="space-y-2">
      <TreeScroll rootX={placed[0].x} contentWidth={width} label={`${label} (เลื่อนซ้ายขวาได้)`}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block max-w-none">
          {placed.map(({ node, x, y }) => {
            const children = yesNoChildren(node);
            if (children === null) return null;
            return children.map((child, i) => {
              const c = placed[child];
              const x1 = x;
              const y1 = y + NODE_H;
              const x2 = c.x;
              const y2 = c.y;
              // Label 45% down the edge, on a surface block so the line never runs through the text.
              const lx = x1 + (x2 - x1) * 0.45;
              const ly = y1 + (y2 - y1) * 0.45;
              const word = EDGE_WORDS[i];
              const w = word === "ใช่" ? 26 : 40;
              return (
                <g key={`${node.id}-${child}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--foreground)" strokeWidth={2} />
                  <rect x={lx - w / 2} y={ly - 10} width={w} height={20} fill="var(--surface)" />
                  <text x={lx} y={ly + 4} textAnchor="middle" fontSize="12" fontWeight={600} fill="var(--foreground)">
                    {word}
                  </text>
                </g>
              );
            });
          })}
          {placed.map(({ node, x, y }) => {
            const left = x - boxWidth(node) / 2;
            const LW = LEAF_W;
            const n = `n = ${node.n.toLocaleString("th-TH")}`;
            if (node.left !== null && node.feature !== null && node.threshold !== null) {
              const [feature, test] = splitText(node.feature, node.threshold);
              return (
                <g key={node.id}>
                  <rect x={left} y={y} width={boxWidth(node)} height={NODE_H} fill="var(--surface-muted)" stroke="var(--foreground)" strokeWidth={2} />
                  {/* A yes/no question has one line: centre it in the space of two. */}
                  <text x={x} y={y + (test ? LINE : LINE * 1.5)} textAnchor="middle" fontSize="12" fontWeight={600} fill="var(--foreground)">
                    {feature}
                    {test ? "" : "?"}
                  </text>
                  {test && (
                    <text x={x} y={y + 2 * LINE} textAnchor="middle" fontSize="12" fill="var(--foreground)" className="tabular">
                      {test}?
                    </text>
                  )}
                  <text x={x} y={y + 3 * LINE + 2} textAnchor="middle" fontSize="12" fill="var(--muted)" className="tabular">
                    {n}
                  </text>
                </g>
              );
            }
            if (isClass(node.value)) {
              const winner = node.value.winner as Recommendation;
              const tone = TONE[winner] ?? "var(--foreground)";
              const total = Object.values(node.value.counts).reduce((a, b) => a + b, 0);
              const share = total ? Math.round(((node.value.counts[winner] ?? 0) / total) * 100) : 0;
              const detail = Object.entries(node.value.counts)
                .map(([k, v]) => `${RECOMMENDATION_LABELS[k as Recommendation] ?? k} ${v}`)
                .join(" · ");
              return (
                <g key={node.id}>
                  <title>{detail}</title>
                  <rect x={left + 1.5} y={y + 1.5} width={LW - 3} height={NODE_H - 3} fill="var(--surface)" stroke={tone} strokeWidth={3} />
                  <text x={x} y={y + LINE + 1} textAnchor="middle" fontSize="13" fontWeight={700} fill={tone}>
                    {RECOMMENDATION_LABELS[winner] ?? winner}
                  </text>
                  <text x={x} y={y + 2 * LINE + 2} textAnchor="middle" fontSize="12" fill="var(--foreground)" className="tabular">
                    {n}
                  </text>
                  <text x={x} y={y + 3 * LINE + 2} textAnchor="middle" fontSize="12" fill="var(--muted)" className="tabular">
                    {share}% ของกลุ่มนี้
                  </text>
                </g>
              );
            }
            const price = typeof node.value === "number" ? node.value : Number.NaN;
            const t = Number.isFinite(price) ? shade(price) : 0;
            return (
              <g key={node.id}>
                <rect x={left + 1.5} y={y + 1.5} width={LW - 3} height={NODE_H - 3} fill="var(--surface)" stroke="var(--foreground)" strokeWidth={3} />
                {/* Decorative price strip: no text sits on it, so it needs no contrast pair. */}
                <rect
                  x={left + 3}
                  y={y + 3}
                  width={LW - 6}
                  height={9}
                  style={{ fill: stripFill(t) }}
                />
                <text x={x} y={y + 2 * LINE} textAnchor="middle" fontSize="15" fontWeight={700} fill="var(--foreground)" className="tabular">
                  {formatTHB(price)}
                </text>
                <text x={x} y={y + 3 * LINE + 2} textAnchor="middle" fontSize="12" fill="var(--muted)" className="tabular">
                  {n}
                </text>
              </g>
            );
          })}
        </svg>
      </TreeScroll>
      {prices.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          แถบบนกล่องใบ:
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            ถูก
            <span aria-hidden className="inline-flex border-2 border-border">
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <span key={t} className="h-2.5 w-5" style={{ background: stripFill(t) }} />
              ))}
            </span>
            แพง
          </span>
          <span className="tabular whitespace-nowrap">
            ({formatTHB(Math.min(...prices))} → {formatTHB(Math.max(...prices))})
          </span>
        </p>
      )}
      <details className="group">
        <summary className="flex min-h-11 items-center gap-2 text-sm font-medium">
          ดูต้นไม้นี้เป็นข้อความ
          <span aria-hidden className="disclosure" />
        </summary>
        <pre className="mt-1 overflow-x-auto border-2 border-border bg-surface-muted p-3 text-xs leading-relaxed text-muted">
          {outline}
        </pre>
      </details>
    </div>
  );
}
