import { Glyph } from "@/components/icons";
import { CLUSTER_LABELS, RECOMMENDATION_LABELS } from "@/lib/format";
import type { DemandCluster, Recommendation } from "@/lib/types";
import type { Verdict } from "@/lib/verdict";

const pill = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

function dealTone(score: number): string {
  return score >= 70
    ? "bg-good-bg text-good"
    : score <= 30
      ? "bg-bad-bg text-bad"
      : "bg-neutral-bg text-foreground";
}

/** Deal Score pill. `prominent` is the card-corner variant. */
export function DealScore({ score, prominent = false }: { score: number | null; prominent?: boolean }) {
  if (score === null) return prominent ? null : <span className="text-xs text-muted">–</span>;
  const size = prominent ? "px-2.5 py-1 text-sm font-bold shadow-sm" : "";
  return (
    <span className={`${pill} ${dealTone(score)} ${size} tabular`} title="Deal Score 0–100 (50 = ราคายุติธรรม)">
      Deal {score}
    </span>
  );
}

export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (value === null) return null;
  const tone =
    value === "buy_now" ? "bg-good-bg text-good" : value === "wait" ? "bg-warn-bg text-warn" : "bg-neutral-bg text-foreground";
  return (
    <span className={`${pill} ${tone}`}>
      <Glyph name={value} />
      {RECOMMENDATION_LABELS[value]}
    </span>
  );
}

export function ClusterBadge({ value }: { value: DemandCluster }) {
  const { label, hint } = CLUSTER_LABELS[value];
  return (
    <span className={`${pill} border border-border bg-surface text-muted`} title={hint}>
      <Glyph name={value} />
      {label}
    </span>
  );
}

/** "ถูกกว่าราคายุติธรรม 12%" / "แพงกว่า 8%", coloured by direction, never colour-only. */
export function FairDelta({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null || Math.abs(pct) < 0.005) {
    return pct === null ? null : <span className={`text-xs text-muted ${className}`}>ใกล้เคียงราคายุติธรรม</span>;
  }
  const below = pct < 0;
  const value = `${Math.round(Math.abs(pct) * 100)}%`;
  return (
    <span className={`text-xs font-medium ${below ? "text-good" : "text-muted"} ${className}`}>
      {below ? `▼ ถูกกว่าราคายุติธรรม ${value}` : `▲ แพงกว่าราคายุติธรรม ${value}`}
    </span>
  );
}

/**
 * Card-corner tags: a solid Deal tag and a "ถูกกว่า x%" ribbon, the
 * storefront's discount-tag shape. Solid fills carry white text (>= 5:1);
 * Deal 31–69 is a white tag with a border, so only strong deals shout.
 */
export function DealTag({ score }: { score: number | null }) {
  if (score === null) return null;
  const tone =
    score >= 70
      ? "bg-good-solid text-white"
      : score <= 30
        ? "bg-bad-solid text-white"
        : "border border-border bg-surface text-foreground";
  return (
    <span
      className={`tabular inline-flex items-center rounded-[6px] px-2 py-1 text-xs font-bold tracking-wide shadow-sm ${tone}`}
      title="Deal Score 0–100 (50 = ราคายุติธรรม)"
    >
      DEAL {score}
    </span>
  );
}

/** "ถูกกว่าราคายุติธรรม 12%" as a tag; nothing when not meaningfully below fair. */
export function BelowFairTag({ pct }: { pct: number | null }) {
  if (pct === null || pct > -0.005) return null;
  return (
    <span className="tabular inline-flex items-center gap-1 rounded-[6px] bg-good-bg px-2 py-1 text-xs font-semibold text-good">
      ▼ ถูกกว่าราคายุติธรรม {Math.round(-pct * 100)}%
    </span>
  );
}

/**
 * Fair price too far from the market to trust (|price / fair - 1| > 40%).
 * Words plus an icon-free amber pill; the reason is printed next to it.
 */
export function UncertainTag() {
  return (
    <span
      className="inline-flex items-center rounded-[6px] bg-warn-bg px-2 py-1 text-xs font-semibold text-warn"
      title="ราคายุติธรรมต่างจากราคาจริงเกิน 40% จึงไม่ใช้จัดอันดับดีล"
    >
      ประเมินไม่แน่นอน
    </span>
  );
}

/** Sold-out marker: words plus a hollow dot, so the state never rests on dimming alone. */
export function SoldOutTag({ label = "หมด" }: { label?: string }) {
  return (
    <span className={`${pill} border border-border bg-surface-muted font-semibold text-muted`}>
      <span aria-hidden>○</span>
      {label}
    </span>
  );
}

/**
 * One offer's status badges after `resolveVerdict`: "หมด" when sold out,
 * otherwise the recommendation and the demand cluster that survived the
 * conflict rules, with the reason for any withheld badge printed underneath
 * (visible text, not a hover-only tooltip).
 */
export function VerdictBadges({
  verdict,
  className = "",
  align = "start",
  showNote = true,
}: {
  verdict: Verdict;
  className?: string;
  align?: "start" | "end";
  /** False when the caller prints `verdict.note` itself (a narrow column). */
  showNote?: boolean;
}) {
  if (!verdict.inStock) {
    return (
      <div className={className}>
        <SoldOutTag />
      </div>
    );
  }
  if (!verdict.recommendation && !verdict.cluster) return null;
  const end = align === "end";
  return (
    <div className={`space-y-1 ${end ? "md:text-right" : ""} ${className}`}>
      <div className={`flex flex-wrap gap-1.5 ${end ? "md:justify-end" : ""}`}>
        <RecommendationBadge value={verdict.recommendation} />
        {verdict.cluster && <ClusterBadge value={verdict.cluster} />}
      </div>
      {showNote && verdict.note && <p className="text-xs leading-snug text-muted">{verdict.note}</p>}
    </div>
  );
}
