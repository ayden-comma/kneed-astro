/*
 * Cloudinary delivery transforms.
 *
 * Every CMS image URL should pass through cld() at render time so visitors
 * get an auto-format (AVIF/WebP), auto-quality file resized for its slot,
 * instead of the raw uploaded master.
 *
 * - Non-Cloudinary URLs (Unsplash placeholders, /images/*, YouTube thumbs)
 *   pass through untouched.
 * - Already-transformed Cloudinary URLs pass through untouched, so calling
 *   cld() twice is safe.
 * - c_limit never upscales: if the master is smaller than the slot width,
 *   the master's own size is served.
 *
 * Slot widths (retina-aware: ~2x the largest CSS rendering width):
 *   HERO  2560  full-bleed hero backgrounds / video posters
 *   BODY  2000  article & bakery body/gallery images
 *   CARD   960  film/bakery/story cards
 *   OG    1200  Open Graph / Twitter share image
 *   THUMB  400  map popups & sidebar thumbnails
 */

export const W = { HERO: 2560, BODY: 2000, CARD: 960, OG: 1200, THUMB: 400 };

const MARKER = '/image/upload/';

/**
 * @template {string | null | undefined} T
 * @param {T} url
 * @param {number} width one of the W slot widths (or any pixel width)
 * @returns {T} transformed URL, or the input untouched
 */
export function cld(url, width) {
  if (!url || typeof url !== 'string') return url;
  if (url.indexOf('res.cloudinary.com') === -1) return url;
  const i = url.indexOf(MARKER);
  if (i === -1) return url;
  const rest = url.slice(i + MARKER.length);
  // Already carries a transform segment (e.g. "f_auto,..." or "c_fill,...")
  // — leave it alone. Version segments ("v12345/") are not transforms.
  const firstSeg = rest.split('/')[0];
  if (/^[a-z]+_/.test(firstSeg)) return url;
  return /** @type {T} */ (url.slice(0, i + MARKER.length) + 'f_auto,q_auto,c_limit,w_' + width + '/' + rest);
}
