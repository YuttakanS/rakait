"use client";

import { useState } from "react";
import { CategoryGlyph } from "@/components/icons";
import { imageUrl } from "@/lib/images";

/**
 * Merchant thumbnail, hot-linked from the merchant's CDN at the right size
 * (lib/images.ts). Loading strategy:
 *
 * - `priority` images (the first row of cards, the product hero) load eagerly
 *   with fetchpriority="high" so they compete with nothing below the fold;
 * - the rest are native lazy-loaded, decoded off the main thread;
 * - width/height reserve the box, so nothing shifts when an image arrives;
 * - a merchant that blocks or drops an image falls back to the category glyph
 *   instead of a broken-image icon.
 */
export function ProductImage({
  src,
  alt,
  category,
  size,
  priority = false,
  className = "",
}: {
  src: string | null;
  alt: string;
  category: string;
  /** Displayed width in CSS pixels, used to pick the CDN variant. */
  size: number;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = src !== null && !failed;
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-[var(--radius-control)] ${
        show ? "bg-white" : "bg-surface-muted"
      } ${className}`}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- see lib/images.ts: no optimizer hop
        <img
          src={imageUrl(src, size)}
          alt={alt}
          width={size}
          height={size}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <span className="text-subtle">
          <CategoryGlyph category={category} />
        </span>
      )}
    </div>
  );
}
