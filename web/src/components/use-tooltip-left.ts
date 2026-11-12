"use client";

import { useLayoutEffect, useRef, useState } from "react";

const GAP = 8; // CSS px between the hovered point and the tooltip

/**
 * Left offset (CSS px) for a chart tooltip that must stay inside its box:
 * right of the anchor when it fits, else left of it, else clamped to the box
 * edge. O(1). Exported for unit reasoning; `useTooltipLeft` measures `tip`.
 */
export function tooltipLeft(anchor: number, tip: number, box: number): number {
  if (anchor + GAP + tip <= box) return anchor + GAP;
  if (anchor - GAP - tip >= 0) return anchor - GAP - tip;
  return Math.max(0, box - tip);
}

/**
 * Measures the rendered tooltip (before paint, so it never flashes outside
 * the box) and returns its ref plus the clamped left offset.
 *
 * @param anchor Hovered point's x in CSS px from the box's left edge, or null.
 * @param box Width of the positioned container in CSS px.
 */
export function useTooltipLeft(anchor: number | null, box: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setTip(ref.current.offsetWidth);
  }, [anchor, box]);
  return [ref, anchor === null ? 0 : tooltipLeft(anchor, tip, box)] as const;
}
