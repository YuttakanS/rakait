import { Fragment, type ReactNode } from "react";
import {
  NO_REFERENCE,
  cardConflict,
  evidenceParts,
  evidenceSides,
  withheldLine,
  type DemandReference,
} from "@/lib/demand";
import { CLUSTER_LABELS, RECOMMENDATION_LABELS, uncertainNote, wholePct } from "@/lib/format";
import type { DemandCluster, DemandEvidence, Recommendation } from "@/lib/types";
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

/**
 * Demand-group chip. The label may wrap on a narrow card, but only at the
 * space between its words ("ขายดี แต่คนดูน้อย"): each word is a nowrap span,
 * since the browser's Thai dictionary would otherwise break inside one. The
 * text sits in one inner span so the flex chip keeps the spaces. O(words).
 */
export function ClusterBadge({ value }: { value: DemandCluster }) {
  const { label, hint } = CLUSTER_LABELS[value];
  const words = label.split(" ");
  return (
    <span className="chip max-w-full font-medium whitespace-normal text-muted" title={hint}>
      <span>
        {words.map((word, i) => (
          <span key={i}>
            <span className="whitespace-nowrap">{word}</span>
            {i < words.length - 1 && " "}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Text that wraps only at its spaces and at "|" marks, never inside a run of
 * Thai: each run is a nowrap span (the browser's Thai dictionary would
 * otherwise break mid-word on a 140 px card), and "|" becomes a `<wbr>`.
 * O(length).
 */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text.split(/( |\|)/).map((part, i) =>
        part === " " ? (
          " "
        ) : part === "|" ? (
          <wbr key={i} />
        ) : part ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : null,
      )}
    </>
  );
}

/**
 * The numbers behind a demand-group badge (SPEC round 16): "คนดู 35,120 ครั้ง ·
 * ขายดีกว่า 12% ของสินค้าในร้าน" ("ขายดีกว่าแค่ 12% …" when that is under the
 * all-model median), straight from the training run (`DemandEvidence`). A
 * missing number is named as missing, never printed as 0. When a number
 * contradicts the group's name, one more short line says so in a shopper's
 * words (`cardConflict`). Visible text, not a tooltip.
 *
 * `withheld`: a conflict rule hides the group badge on this card. The whole
 * thing is then one line, "กลุ่ม: คนดูเยอะ แต่ขายน้อย (คนดู 3,120 ครั้ง ·
 * ขายดีกว่าแค่ 12%)" (`withheldLine`), which still admits a contradiction
 * with a short suffix ("… · อยู่กลุ่มนี้เพราะราคา"), so the card is no taller
 * than its neighbours; the product page has the detail.
 */
export function DemandEvidenceLine({
  cluster,
  evidence,
  reference = NO_REFERENCE,
  withheld = false,
}: {
  cluster: DemandCluster;
  evidence: DemandEvidence;
  reference?: DemandReference;
  withheld?: boolean;
}) {
  if (withheld) {
    return (
      <p className="text-xs leading-snug text-muted">
        <Words text={withheldLine(cluster, evidence, reference)} />
      </p>
    );
  }
  const conflict = cardConflict(cluster, evidence, reference);
  const salesBelow = evidenceSides(cluster, evidence, reference).sales === "below";
  return (
    <div className="space-y-1 text-xs leading-snug text-muted">
      <p>
        {evidenceParts(evidence, false, salesBelow).map((part, i) => (
          <Fragment key={i}>
            {i > 0 && " · "}
            <Words text={part} />
          </Fragment>
        ))}
      </p>
      {conflict && (
        <p>
          <Words text={conflict} />
        </p>
      )}
    </div>
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
 * Words in an orange chip; the reason, with this listing's own gap
 * (`uncertainNote(pct)`), is the tooltip and is also printed next to it.
 */
export function UncertainTag({ pct }: { pct: number | null }) {
  return (
    <span className="chip text-warn" title={uncertainNote(pct)}>
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
