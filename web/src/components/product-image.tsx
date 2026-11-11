import { CategoryGlyph } from "@/components/icons";

/**
 * Merchant thumbnail, hot-linked as the merchant serves it (never proxied or
 * stored). A plain <img>: next/image would route every merchant image through
 * our server for no gain on a 150-300 px thumbnail. Falls back to a category
 * glyph when the listing has no image.
 */
export function ProductImage({
  src,
  alt,
  category,
  className = "",
}: {
  src: string | null;
  alt: string;
  category: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-white ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see component doc
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-muted text-subtle">
          <CategoryGlyph category={category} />
        </div>
      )}
    </div>
  );
}
