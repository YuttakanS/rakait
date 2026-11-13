"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Which sides of the box hide part of the tree. */
type Hidden = { left: boolean; right: boolean };

/** Box border (2 px each side): the box shows `container width − BORDER` of the tree. */
const BORDER = 4;

/**
 * Sideways-scrolling box of a tree diagram. A wide tree's root sits at the
 * midpoint of its leaves, off-screen on a phone, so the box scrolls to put
 * the root in view the first time it has a width. A tree in a hidden tab has
 * width 0 until its tab opens, so a ResizeObserver waits for that moment
 * (later the reader's own scrolling is left alone). Keyboard-focusable so
 * arrow keys scroll it.
 *
 * When the tree is wider than the box (SPEC round 18: GPU 1,448 px and CPU
 * 1,700 px in a 1,198 px box), a visible cue says so on every screen: a line
 * with two 44 px buttons that scroll by most of a box width, and a dashed
 * box edge on each side that still hides boxes (a border style, so it covers
 * no box text and shifts no layout; the ◀ ▶ tabs it replaces sat on text). A desktop mouse has no sideways
 * wheel, so the buttons matter there as much as the swipe does on a phone.
 *
 * - The cue row is in the server HTML and hidden by a container query once
 *   the box is at least as wide as the tree (`contentWidth`), so it never
 *   appears or vanishes after mount (no layout shift).
 * - At an end a button is `aria-disabled` with a no-op click, not
 *   `disabled`, so keyboard focus does not fall back to the page.
 * - Scrolling is smooth unless the reader prefers reduced motion.
 *
 * O(1) per scroll event.
 */
export function TreeScroll({
  rootX,
  contentWidth,
  label,
  children,
}: {
  rootX: number;
  /** Width of the drawn tree in CSS px. */
  contentWidth: number;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cueId = useId();
  const [hidden, setHidden] = useState<Hidden>({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setHidden({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
    };
    let centred = false;
    const centre = () => {
      if (el.clientWidth === 0) return;
      if (!centred) {
        el.scrollLeft = Math.max(0, rootX - el.clientWidth / 2);
        centred = true;
      }
      measure();
    };
    centre();
    const observer = new ResizeObserver(centre);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [rootX]);

  const scrollBy = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el || !(direction < 0 ? hidden.left : hidden.right)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.6, behavior: reduced ? "auto" : "smooth" });
  };
  const buttonClass =
    "btn btn-secondary min-h-11 px-3 text-sm aria-disabled:cursor-not-allowed aria-disabled:border-[var(--disabled-border)] aria-disabled:bg-surface-muted aria-disabled:text-subtle";

  return (
    <div className="space-y-1.5" style={{ containerType: "inline-size" }}>
      {/* Hide the cue where the whole tree fits: decided by CSS, before any script runs. */}
      <style>{`@container (min-width: ${Math.ceil(contentWidth) + BORDER}px) { [data-tree-cue="${cueId}"] { display: none; } }`}</style>
      <div data-tree-cue={cueId} className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>ต้นไม้นี้กว้างกว่ากรอบ เลื่อนซ้ายขวาได้ (ปุ่ม ลาก ปัดนิ้ว หรือปุ่มลูกศร) · ขอบเส้นประ = ยังมีต่อด้านนั้น</span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-disabled={!hidden.left}
            aria-label="เลื่อนต้นไม้ไปทางซ้าย"
            className={buttonClass}
          >
            ← ซ้าย
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-disabled={!hidden.right}
            aria-label="เลื่อนต้นไม้ไปทางขวา"
            className={buttonClass}
          >
            ขวา →
          </button>
        </span>
      </div>
      <div
        ref={ref}
        className="overflow-x-auto border-2 border-border bg-surface"
        style={{ borderLeftStyle: hidden.left ? "dashed" : "solid", borderRightStyle: hidden.right ? "dashed" : "solid" }}
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}
