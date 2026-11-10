import { CLUSTER_LABELS, RECOMMENDATION_LABELS } from "@/lib/format";
import type { DemandCluster, Recommendation } from "@/lib/types";

const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function DealScore({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-muted">–</span>;
  const tone =
    score >= 70
      ? "bg-[var(--good-bg)] text-[var(--good)]"
      : score <= 30
        ? "bg-[var(--bad-bg)] text-[var(--bad)]"
        : "bg-[var(--neutral-bg)] text-foreground";
  return (
    <span className={`${base} ${tone} tabular`} title="Deal Score 0–100 (50 = ราคายุติธรรม)">
      Deal {score}
    </span>
  );
}

export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (value === null) return null;
  const tone =
    value === "buy_now"
      ? "bg-[var(--good-bg)] text-[var(--good)]"
      : value === "wait"
        ? "bg-[var(--warn-bg)] text-[var(--warn)]"
        : "bg-[var(--neutral-bg)] text-foreground";
  return <span className={`${base} ${tone}`}>{RECOMMENDATION_LABELS[value]}</span>;
}

export function ClusterBadge({ value }: { value: DemandCluster }) {
  const { label, hint } = CLUSTER_LABELS[value];
  return (
    <span className={`${base} border border-border text-muted`} title={hint}>
      {label}
    </span>
  );
}
