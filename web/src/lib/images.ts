/**
 * Merchant image URLs, rewritten to the smallest variant each merchant's own
 * CDN serves for the size we display. No image proxy: the merchants' CDNs
 * already resize (IT City via Cloudinary transforms, BaNANA via `-thumbnail`
 * WebP), so going through Vercel Image Optimization would add a cold
 * transform hop and per-image quota cost for no byte saving.
 *
 * Measured thumbnails (Nov 2026): JIB 280 px JPEG 11 KB, BaNANA 160 px WebP
 * 3 KB, IHAVECPU 400 px JPEG 37 KB, IT City 200 px, AVIF 1.5 KB with f_auto.
 */

/** Origins the browser should open a connection to early (see layout.tsx). */
export const IMAGE_ORIGINS = [
  "https://www.jib.co.th",
  "https://media-cdn.bnn.in.th",
  "https://ihcupload-bkk.s3.ap-southeast-7.amazonaws.com",
  "https://res.cloudinary.com",
] as const;

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:[a-z]_[^/]*\/)?(v\d+\/.*)$/;

/**
 * URL of the variant to load for an image drawn at `cssPx` CSS pixels
 * (2x for high-density screens is applied here).
 *
 * @param url Image URL as scraped.
 * @param cssPx Displayed width in CSS pixels.
 */
export function imageUrl(url: string, cssPx: number): string {
  const px = Math.round(cssPx * 2);
  const cloud = CLOUDINARY_UPLOAD.exec(url);
  if (cloud) {
    // f_auto: AVIF/WebP by Accept header; q_auto: perceptual quality;
    // c_limit: never upscale past the source.
    return `${cloud[1]}c_limit,w_${px},f_auto,q_auto/${cloud[2]}`;
  }
  if (url.startsWith("https://media-cdn.bnn.in.th/") && px > 480) {
    // The listing thumbnail (160 px WebP, ~3 KB) serves the cards; the full
    // image (1000 px, ~45 KB, 15x heavier) only the large product hero.
    return url.replace(/-thumbnail(\.\w+)$/, "$1");
  }
  return url;
}
