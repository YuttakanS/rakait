import type { ReactNode } from "react";
import { CLUSTER_LABELS, RECOMMENDATION_LABELS, UNCERTAIN_NOTE, wholePct } from "@/lib/format";
import type { DemandCluster, Recommendation } from "@/lib/types";
import type { Verdict } from "@/lib/verdict";

/*
 * Status chips (RawBlock): square, 2 px border in the status colour
 * (`.chip` borders use currentColor), words or ▲▼ always printed, so colour
 * is never the only signal.
 */
function dealTone(score: number): string {
  return score >= 70 ? "text-good" : score <= 30 ? "text-bad" : "text-foreground";
}

/** Deal Score chip. `prominent` is the card-corner variant. */
export function DealScore({ score, prominent = false }: { score: number | null; prominent?: boolean }) {
  if (score === null) return prominent ? null : <span className="text-xs text-muted">–</span>;
  const size = prominent ? "px-2.5 py-1 text-sm font-bold" : "";
  return (
    <span className={`chip tabular ${dealTone(score)} ${size}`} title="Deal Score 0–100 (50 = ราคายุติธรรม)">
      Deal {score}
    </span>
  );
}

export function RecommendationBadge({ value }: { value: Recommendation | null }) {
  if (value === null) return null;
  const tone = value === "buy_now" ? "text-good" : value === "wait" ? "text-warn" : "text-foreground";
  return <span className={`chip ${tone}`}>{RECOMMENDATION_LABELS[value]}</span>;
}

export function ClusterBadge({ value }: { value: DemandCluster }) {
  const { label, hint } = CLUSTER_LABELS[value];
  return (
    <span className="chip font-medium text-muted" title={hint}>
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
 * Card-corner DEAL tag. Deal >= 70 / <= 30 are solid blocks (white on
 * darkened green / red, >= 6:1) framed by the theme border; Deal 31–69 is a
 * plain chip, so only strong deals shout.
 */
export function DealTag({ score }: { score: number | null }) {
  if (score === null) return null;
  const tone =
    score >= 70
      ? "chip-solid bg-good-solid"
      : score <= 30
        ? "chip-solid bg-bad-solid"
        : "text-foreground";
  return (
    <span
      className={`chip tabular caps px-2 py-0.5 font-bold ${tone}`}
      title="Deal Score 0–100 (50 = ราคายุติธรรม)"
    >
      DEAL {score}
    </span>
  );
}

/**
 * The headline offer's gap from its fair price as a card tag (under the
 * fair-price line): "▼ ถูกกว่าราคายุติธรรม x%" as a green chip, or
 * "▲ แพงกว่าราคายุติธรรม x%" as a black chip (never green, so a pricey
 * card cannot read as a deal). Arrow plus words, never colour alone; nothing
 * under 0.5% either way.
 */
export function FairGapTag({ pct }: { pct: number | null }) {
  if (pct === null || Math.abs(pct) < 0.005) return null;
  const below = pct < 0;
  return (
    <span
      // A block, not flex: flex would split the words and the number into
      // separate columns when the tag wraps on a narrow card.
      className={`inline-block border-2 border-current bg-surface px-2 py-0.5 text-xs leading-snug font-semibold ${
        below ? "text-good" : "text-foreground"
      }`}
    >
      {below ? "▼ ถูกกว่า" : "▲ แพงกว่า"}ราคายุติธรรม{" "}
      <span className="tabular whitespace-nowrap">{wholePct(Math.abs(pct))}%</span>
    </span>
  );
}

/**
 * Fair price too far from the market to trust (|price / fair - 1| > 40%).
 * Words in an orange chip; the reason is printed next to it.
 */
export function UncertainTag() {
  return (
    <span className="chip text-warn" title={UNCERTAIN_NOTE}>
      ประเมินไม่แน่นอน
    </span>
  );
}

/** Sold-out marker: words plus a hollow dot, so the state never rests on dimming alone. */
export function SoldOutTag({ label = "หมด" }: { label?: string }) {
  return (
    <span className="chip text-foreground">
      <span aria-hidden>○</span>
      {label}
    </span>
  );
}

/**
 * A withheld-badge note with every quoted group name (“…”) kept on one line,
 * so a narrow card never splits a name between its words. O(length).
 */
export function NoteText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(“[^”]*”)/).map((part, i) =>
        part.startsWith("“") ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
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
  reason = null,
}: {
  verdict: Verdict;
  className?: string;
  align?: "start" | "end";
  /** False when the caller prints `verdict.note` itself (a narrow column). */
  showNote?: boolean;
  /** Short reason printed right under the recommendation (the card's). */
  reason?: ReactNode;
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
      {verdict.recommendation && reason && <p className="line-clamp-2 text-xs leading-snug text-muted">{reason}</p>}
      {showNote && verdict.note && (
        <p className="text-xs leading-snug text-muted">
          <NoteText text={verdict.note} />
        </p>
      )}
    </div>
  );
}
