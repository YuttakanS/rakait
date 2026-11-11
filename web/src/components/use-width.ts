"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Width of an element in CSS pixels, tracked with a ResizeObserver.
 *
 * Charts draw in a viewBox equal to their real width, so SVG text sizes are
 * true pixels on every screen. With a fixed 760-unit viewBox, 12-unit tick
 * labels shrank to ~5 px on a 340 px phone (ui-ux-pro-max readable-font-size).
 *
 * @param fallback Width used for the server render and the first paint.
 */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
