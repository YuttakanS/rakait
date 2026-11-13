/**
 * Typed readers for the chart data /ml draws from `market_insights` payloads
 * (model 2026.11-v13+), and the plain-Thai wording of tree split conditions.
 *
 * The web deploys before the next training run, so every reader returns
 * null (or an empty list) for a payload without the new keys and the page
 * falls back to text. Pure functions, O(size of the payload field).
 */
import { RECOMMENDATION_LABELS, featureLabel, formatTHB } from "./format";
import type { Recommendation } from "./types";

/** Class leaf value: raw training rows per class and the predicted class. */
export interface ClassValue {
  counts: Record<string, number>;
  winner: string;
}

/**
 * One node of a fitted sklearn tree (`models.tree_nodes`). Leaves have
 * `feature`, `threshold`, `left` and `right` null; `left` holds the rows with
 * `feature <= threshold`. `value` is THB (regression) or a ClassValue.
 */
export interface TreeNode {
  id: number;
  feature: string | null;
  threshold: number | null;
  left: number | null;
  right: number | null;
  n: number;
  value: number | ClassValue;
  impurity: number;
}

/** `[listed price, fair price, name]` per sampled listing. */
export type FitPoint = [number, number, string];

export interface ResidualBins {
  edges: number[];
  counts: number[];
  below: number;
  above: number;
  n: number;
}

/** `[log1p(views), sales_rank_pct, listing label]` per sampled model. */
export type DemandPoint = [number, number, string];

export interface Dendrogram {
  icoord: number[][];
  dcoord: number[][];
  leaf_sizes: number[];
  cut_height: number | null;
}

export interface CurvePoint {
  threshold: number;
  coverage: number;
  precision: number | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A node value is THB (regression) or `{counts: {class: rows}, winner}` (classifier). */
function isNodeValue(v: unknown): v is TreeNode["value"] {
  if (isNum(v)) return true;
  if (typeof v !== "object" || v === null) return false;
  const { counts, winner } = v as Partial<ClassValue>;
  return (
    typeof winner === "string" &&
    typeof counts === "object" &&
    counts !== null &&
    Object.values(counts).every(isNum)
  );
}

/**
 * Tree nodes of a `tier_tree` / `timing_tree` payload, or null when the
 * payload predates 2026.11-v13 or any node is malformed: ids must equal
 * positions, children must exist below their parent (so the layout can never
 * loop), inner nodes need a feature and threshold, and every value must be a
 * number or `{counts, winner}`. One bad node drops the whole tree (a tree
 * with a node removed would be wrong), and the page shows the text rules.
 */
export function treeNodes(payload: Record<string, unknown> | undefined): TreeNode[] | null {
  const tree = payload?.tree as { nodes?: unknown } | undefined;
  const nodes = tree?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const ok = (nodes as TreeNode[]).every(
    (n, i) =>
      typeof n === "object" &&
      n !== null &&
      n.id === i &&
      isNum(n.n) &&
      isNodeValue(n.value) &&
      (n.left === null
        ? n.right === null
        : isNum(n.left) &&
          isNum(n.right) &&
          n.left > i &&
          n.right > i &&
          n.left < nodes.length &&
          n.right < nodes.length &&
          typeof n.feature === "string" &&
          isNum(n.threshold)),
  );
  if (!ok) return null;
  // All nodes of one tree share one value kind.
  const kinds = new Set((nodes as TreeNode[]).map((n) => typeof n.value));
  if (kinds.size !== 1) return null;
  return nodes as TreeNode[];
}

export function fitPoints(payload: Record<string, unknown> | undefined): FitPoint[] {
  const v = payload?.fit_points;
  return Array.isArray(v) ? (v as FitPoint[]).filter((p) => isNum(p[0]) && isNum(p[1]) && p[0] > 0 && p[1] > 0) : [];
}

export function residualBins(payload: Record<string, unknown> | undefined): ResidualBins | null {
  const v = payload?.residual_bins as ResidualBins | undefined;
  return v && Array.isArray(v.edges) && Array.isArray(v.counts) && v.edges.length === v.counts.length + 1 ? v : null;
}

export function demandPoints(payload: Record<string, unknown> | undefined): DemandPoint[] {
  const v = payload?.points;
  return Array.isArray(v) ? (v as DemandPoint[]).filter((p) => isNum(p[0]) && isNum(p[1])) : [];
}

export function dendrogram(payload: Record<string, unknown> | undefined): Dendrogram | null {
  const v = payload?.dendrogram as Dendrogram | undefined;
  return v && Array.isArray(v.icoord) && Array.isArray(v.dcoord) && v.icoord.length > 0 ? v : null;
}

/** Silhouette per k tried (JSON object keys are strings), sorted by k. */
export function silhouetteByK(payload: Record<string, unknown> | undefined): { k: number; score: number }[] {
  const v = payload?.silhouette_by_k as Record<string, unknown> | undefined;
  if (!v) return [];
  return Object.entries(v)
    .map(([k, s]) => ({ k: Number(k), score: s as number }))
    .filter((r) => Number.isFinite(r.k) && isNum(r.score))
    .sort((a, b) => a.k - b.k);
}

/**
 * Release years enter the models as years since 2020 (`train._YEAR0`), so a
 * split at 3.5 means "launched in 2023 or earlier".
 */
const YEAR0 = 2020;

/**
 * Yes/no specs (0/1). The tree splits them at 0.5, so the left (≤) branch is
 * the "no" side. The node asks the positive question ("เป็น AMD?") and its
 * edges read ไม่ใช่ (left) / ใช่ (right): see `edgeWords`.
 */
const FLAGS = new Set(["is_amd", "x3d", "unlocked", "ddr5", "nvme"]);

/** Whether a split is a yes/no question asked positively. */
export const isFlag = (feature: string | null): boolean => feature !== null && FLAGS.has(feature);

/**
 * Words on the [left, right] edges under a split: ใช่ / ไม่ใช่ for "≤ t",
 * swapped for a yes/no spec, whose left side (≤ 0.5) is "no". O(1).
 */
export const edgeWords = (feature: string | null): [string, string] =>
  isFlag(feature) ? ["ไม่ใช่", "ใช่"] : ["ใช่", "ไม่ใช่"];

/** Thai labels for the timing tree's inputs (`models.TIMING_FEATURES`). */
const TIMING_LABELS: Record<string, string> = {
  pct_vs_model_median: "ราคาเทียบค่ากลางของรุ่น",
  price_percentile_own: "ราคาเทียบอดีตของร้านนี้",
  pct_change_prev: "ราคาเปลี่ยนจากครั้งก่อน",
  sales_per_day: "ยอดขายต่อวัน",
  days_listed: "วางขายมาแล้ว",
};

const trim = (v: number, digits = 2): string => String(Number(v.toFixed(digits)));

/**
 * GPU class suffixes as `train.gpu_class` scores them: NVIDIA Super and
 * AMD GRE are +0.3, Ti and XT +0.5, Ti Super +0.7, XTX +0.8.
 */
const GPU_SUFFIX: [number, string][] = [
  [0.8, " XTX"],
  [0.7, " Ti Super"],
  [0.5, " Ti / XT"],
  [0.3, " Super / GRE"],
  [0, ""],
];

/**
 * A `perf_class` split as the highest chip on its "ใช่" side: 6.25 is
 * "xx60" (RTX 5060, RX 9060), 6.6 is "xx60 Ti" (an RTX 5060 Ti, 6.5,
 * passes; a 6.7 Ti Super does not). O(1).
 */
function gpuClass(t: number): string {
  const base = Math.floor(t + 1e-9);
  const suffix = GPU_SUFFIX.find(([f]) => f <= t - base + 1e-9)?.[1] ?? "";
  return `xx${base}0${suffix}`;
}
const count = (v: number): string => Math.floor(v + 1e-9).toLocaleString("th-TH");
const signedPct = (v: number): string => `${v > 0 ? "+" : ""}${trim(v * 100, 1)}%`;

/**
 * A split as two short lines: the feature in Thai (`featureLabel`) and the
 * test with a readable unit, e.g. ["ขนาด VRAM", "≤ 10 GB"]. Integer specs
 * show the largest whole value on the "ใช่" side (≤ 6.9 cores is ≤ 6 cores);
 * log2 core counts are shown as cores; GPU classes as "≤ xx60 Ti / XT";
 * yes/no features become one positive question ("เป็น AMD") with no second
 * line, whose edges `edgeWords` swaps (left = ไม่ใช่). O(1).
 */
export function splitText(feature: string, threshold: number): [string, string] {
  if (isFlag(feature)) return [featureLabel(feature), ""];
  const label = TIMING_LABELS[feature] ?? featureLabel(feature);
  const t = threshold;
  switch (feature) {
    case "vram_gb":
    case "capacity_gb":
      return [label, `≤ ${count(t)} GB`];
    case "log2_cores":
      return [label, `≤ ${count(2 ** t)} คอร์`];
    case "log2_threads":
      return [label, `≤ ${count(2 ** t)} เธรด`];
    case "shader_cores":
      return [label, `≤ ${count(t)} คอร์`];
    case "base_clock_ghz":
      return [label, `≤ ${trim(t)} GHz`];
    case "boost_clock_mhz":
    case "speed_mhz":
      return [label, `≤ ${count(t)} MHz`];
    case "read_mbps":
      return [label, `≤ ${count(t)} MB/s`];
    case "bus_width_bit":
      return [label, `≤ ${count(t)} บิต`];
    case "modules":
      return [label, `≤ ${count(t)} แถว`];
    case "release_year":
      return [label, `ปี ${Math.floor(t + YEAR0 + 1e-9)} หรือก่อนนั้น`];
    case "perf_class":
      return ["ระดับชิป (เลขท้ายรุ่น)", `≤ ${gpuClass(t)}`];
    case "tier": {
      // Tiers are 1 (Pentium), 3-9 (Ryzen / Core i / Ultra) and 11
      // (Threadripper): a split at 10 still means "Ryzen 9 / i9 or lower".
      const top = Math.min(Math.floor(t + 1e-9), 9);
      // Tier 1 is Pentium / Celeron; nothing sits at 2.
      if (top < 3) return ["ระดับรุ่น (Ryzen / Core)", "Pentium / Celeron"];
      return ["ระดับรุ่น (Ryzen / Core)", `≤ ${top} (เช่น R${top}, i${top})`];
    }
    case "pcie_gen":
      return [label, `≤ PCIe ${count(t)}`];
    case "pct_vs_model_median":
    case "pct_change_prev":
      return [label, `≤ ${signedPct(t)}`];
    case "price_percentile_own":
      return [label, `≤ ${trim(t * 100, 0)}%`];
    case "sales_per_day":
      return [label, `≤ ${trim(t)} ชิ้น/วัน`];
    case "days_listed":
      return [label, `≤ ${count(t)} วัน`];
    default:
      return [label, `≤ ${trim(t)}`];
  }
}

/** One line, "ขนาด VRAM ≤ 10 GB", for sentences and screen-reader text. */
export function splitSentence(feature: string, threshold: number): string {
  const [label, test] = splitText(feature, threshold);
  return test ? `${label} ${test}` : label;
}

/**
 * The tree as indented text (the `<details>` alternative for screen readers
 * and the fallback layout check): one line per node, "ใช่" / "ไม่ใช่" before
 * each child. O(nodes).
 */
export function treeOutline(nodes: TreeNode[], leafText: (n: TreeNode) => string): string {
  const lines: string[] = [];
  const walk = (id: number, depth: number, edge: string) => {
    const n = nodes[id];
    const pad = "  ".repeat(depth);
    const head = edge ? `${edge}: ` : "";
    if (n.left === null || n.right === null || n.feature === null || n.threshold === null) {
      lines.push(`${pad}${head}${leafText(n)} (n = ${n.n.toLocaleString("th-TH")})`);
      return;
    }
    lines.push(`${pad}${head}${splitSentence(n.feature, n.threshold)}? (n = ${n.n.toLocaleString("th-TH")})`);
    const [yesLeft, noRight] = edgeWords(n.feature);
    walk(n.left, depth + 1, yesLeft);
    walk(n.right, depth + 1, noRight);
  };
  walk(0, 0, "");
  return lines.join("\n");
}

/** Leaf text of a price tree. */
export const priceLeafText = (n: TreeNode): string =>
  typeof n.value === "number" ? `ราคาทั่วไป ${formatTHB(n.value)}` : "–";

/**
 * Path from the root to `target`, each step the question in quotes and the
 * answer taken (“ขนาด VRAM ≤ 10 GB” ใช่), for the worked example under a
 * tree. O(depth).
 */
export function pathTo(nodes: TreeNode[], target: number): string[] {
  const steps: string[] = [];
  let id = 0;
  while (id !== target) {
    const n = nodes[id];
    if (n.left === null || n.right === null || n.feature === null || n.threshold === null) break;
    const goLeft = inSubtree(nodes, n.left, target);
    const sentence = splitSentence(n.feature, n.threshold);
    const [leftWord, rightWord] = edgeWords(n.feature);
    steps.push(`“${sentence}” ${goLeft ? leftWord : rightWord}`);
    id = goLeft ? n.left : n.right;
  }
  return steps;
}

function inSubtree(nodes: TreeNode[], root: number, target: number): boolean {
  if (root === target) return true;
  const n = nodes[root];
  return n.left !== null && n.right !== null && (inSubtree(nodes, n.left, target) || inSubtree(nodes, n.right, target));
}

/** Leaves of a tree, in node order. */
export const leaves = (nodes: TreeNode[]): TreeNode[] => nodes.filter((n) => n.left === null);

/**
 * sklearn `export_text` rules (payloads before 2026.11-v13) with Thai
 * feature names (`featureLabel`), "≤" and Thai class names, keeping the
 * "|---" indentation. One pass per line: O(length).
 */
export function translateRules(rules: string): string {
  return rules
    .split("\n")
    .map((line) =>
      line
        // A yes/no spec split at 0.5 reads as the answer: "≤ 0.50" is ไม่ใช่, "> 0.50" ใช่.
        .replace(/([a-z][a-z0-9_]*) (<=|>)\s+0\.50*\b/, (m: string, f: string, op: string) =>
          isFlag(f) ? `${featureLabel(f)}: ${op === "<=" ? "ไม่ใช่" : "ใช่"}` : m,
        )
        .replace(/([a-z][a-z0-9_]*) (<=|>)\s+/, (_, f: string, op: string) => `${TIMING_LABELS[f] ?? featureLabel(f)} ${op === "<=" ? "≤" : ">"} `)
        .replace(/class: ([a-z_]+)/, (_, c: string) => `แนะนำ: ${RECOMMENDATION_LABELS[c as Recommendation] ?? c}`)
        .replace(/price ≈ /, "ราคาทั่วไป ≈ "),
    )
    .join("\n");
}
