"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Sideways-scrolling box of a tree diagram. A wide tree's root sits at the
 * midpoint of its leaves, off-screen on a phone, so the box scrolls to put
 * the root in view the first time it has a width. A tree in a hidden tab has
 * width 0 until its tab opens, so a ResizeObserver waits for that moment
 * (once; later the reader's own scrolling is left alone). Keyboard-focusable
 * so arrow keys scroll it.
 */
export function TreeScroll({ rootX, label, children }: { rootX: number; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const centre = () => {
      if (el.clientWidth === 0) return false;
      el.scrollLeft = Math.max(0, rootX - el.clientWidth / 2);
      return true;
    };
    if (centre()) return;
    const observer = new ResizeObserver(() => {
      if (centre()) observer.disconnect();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootX]);
  return (
    <div ref={ref} className="overflow-x-auto border-2 border-border bg-surface" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}
