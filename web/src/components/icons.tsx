/** Inline stroke icons (no icon font, no extra request). Decorative: aria-hidden. */

type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function SearchIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function InfoIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function ChevronIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/** Placeholder glyph per category when a listing has no thumbnail. */
export function CategoryGlyph({ category, className = "h-10 w-10" }: { category: string } & IconProps) {
  const paths: Record<string, React.ReactNode> = {
    gpu: (
      <>
        <rect x="2" y="7" width="20" height="10" rx="2" />
        <circle cx="8" cy="12" r="2.5" />
        <circle cx="16" cy="12" r="2.5" />
        <path d="M5 17v2M9 17v2" />
      </>
    ),
    cpu: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="1.5" />
        <rect x="9.5" y="9.5" width="5" height="5" />
        <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
      </>
    ),
    ram: (
      <>
        <rect x="2" y="7" width="20" height="9" rx="1" />
        <path d="M6 10v3M10 10v3M14 10v3M18 10v3M5 16v2M19 16v2" />
      </>
    ),
    ssd: (
      <>
        <rect x="3" y="8" width="18" height="8" rx="1.5" />
        <path d="M7 12h6M17 12h.01" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className={className} {...base} strokeWidth={1.5}>
      {paths[category] ?? paths.gpu}
    </svg>
  );
}

/**
 * Demand-segment and recommendation glyphs. Stroke icons in the same visual
 * language as the rest of the set (24-unit box, 2px round strokes), replacing
 * emoji: emoji render differently per OS and cannot follow colour tokens.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  // Demand segments
  hidden_gem: (
    <>
      <path d="M6 3h12l4 6-10 12L2 9Z" />
      <path d="M2 9h20M12 21 8 9l4-6 4 6-4 12" />
    </>
  ),
  community_favorite: (
    <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z" />
  ),
  overpriced_hype: (
    <path d="M12 21a7 7 0 0 0 7-7c0-4-3-6-4-10-1.5 2-2 3.5-2 5-1.5-1-2.5-2.5-2.5-4.5C7 7 5 10 5 14a7 7 0 0 0 7 7Z" />
  ),
  niche: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  // Recommendations
  buy_now: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  wait: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  fair_price: <path d="M5 9h14M5 15h14" />,
};

export function Glyph({ name, className = "h-3.5 w-3.5" }: { name: string } & IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} {...base}>
      {GLYPHS[name]}
    </svg>
  );
}

/** Storefront chrome icons (header actions, nav, promo tiles). */
const UI: Record<string, React.ReactNode> = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  store: (
    <>
      <path d="M3 9 5 4h14l2 5" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12v8h14v-8M10 20v-5h4v5" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M7 21h10M5 7h14" />
      <path d="m5 7-3 7a3 3 0 0 0 6 0Zm14 0-3 7a3 3 0 0 0 6 0Z" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
};

export function UiIcon({ name, className = "h-5 w-5" }: { name: keyof typeof UI | string } & IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} {...base}>
      {UI[name]}
    </svg>
  );
}
