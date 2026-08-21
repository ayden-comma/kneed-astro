// JSON-LD builders for the public site.
//
// Each function returns a plain object. Pages pass an array of these to
// BaseLayout via the jsonLd prop; BaseLayout serialises them into
// <script type="application/ld+json"> blocks alongside the site-wide
// Organization and WebSite blocks it always emits.
//
// Rules:
// - Never fabricate a field. Every builder drops keys whose source value is
//   missing rather than guessing. Google ignores absent recommended fields
//   but can penalise wrong ones.
// - Dates must be ISO 8601. toIsoDate returns null for anything unparseable
//   and callers omit the field, so a display string like "Winter 2026" in the
//   CMS can never leak into structured data as a fake date.

export const SITE_URL: string = (import.meta.env.SITE as string | undefined) ?? 'https://kneed.tv';
export const SITE_NAME = '(K)Need';

/** Social profiles, taken from the hrefs already in the site footer. */
export const SAME_AS = [
  'https://www.youtube.com/@kneedtv',
  'https://www.instagram.com/kneedtv',
  'https://www.tiktok.com/@kneedtv',
  'https://www.facebook.com/kneedtv',
];

/** Absolute URL on the canonical origin. */
export function abs(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, SITE_URL).href;
}

/** ISO 8601 date (YYYY-MM-DD) or null when the input cannot be parsed. */
export function toIsoDate(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * ISO 8601 duration from a "M:SS" or "MM:SS" or "H:MM:SS" display string.
 * Returns null for anything else.
 */
export function toIsoDuration(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = input.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, h, min, sec] = m;
  const hours = h ? Number(h) : 0;
  const mins = Number(min);
  const secs = Number(sec);
  if (hours === 0 && mins === 0 && secs === 0) return null;
  let out = 'PT';
  if (hours) out += `${hours}H`;
  if (mins) out += `${mins}M`;
  if (secs) out += `${secs}S`;
  return out;
}

/** Strip empty-string, null and undefined values so blocks stay clean. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '')
  ) as T;
}

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: abs('/images/og-default.jpg'),
    sameAs: SAME_AS,
  };
}

export function webSiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'en-AU',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export interface BakeryLdInput {
  name: string;
  url: string;
  address?: string | null;
  suburb?: string | null;
  lat?: number | null;
  lng?: number | null;
  hours?: string | null;
  website?: string | null;
  instagram?: string | null;
  mapLink?: string | null;
  image?: string | null;
  /** Optional label distinguishing one location of a multi-location bakery. */
  locationLabel?: string | null;
}

/**
 * A Bakery (LocalBusiness subtype) block for a featured bakery.
 * For multi-location bakeries call once per location row.
 */
export function bakeryLd(b: BakeryLdInput) {
  const sameAs = [
    b.instagram ? `https://www.instagram.com/${b.instagram.replace(/^@/, '')}` : null,
    b.mapLink || null,
  ].filter(Boolean) as string[];

  const name = b.locationLabel ? `${b.name} (${b.locationLabel})` : b.name;

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Bakery',
    name,
    url: abs(b.url),
    image: b.image ? abs(b.image) : null,
    address: b.address || b.suburb
      ? compact({
          '@type': 'PostalAddress',
          streetAddress: b.address || null,
          addressLocality: b.suburb || null,
          addressRegion: 'VIC',
          addressCountry: 'AU',
        })
      : null,
    geo:
      typeof b.lat === 'number' && typeof b.lng === 'number'
        ? { '@type': 'GeoCoordinates', latitude: b.lat, longitude: b.lng }
        : null,
    openingHours: b.hours || null,
    sameAs: sameAs.length ? sameAs : null,
  });
}

export interface VideoLdInput {
  name: string;
  description: string;
  videoId: string;
  pageUrl: string;
  /** Raw CMS date string; omitted from the block when unparseable. */
  date?: string | null;
  /** Raw CMS duration display string; omitted when unparseable. */
  duration?: string | null;
}

/**
 * VideoObject for an episode. The page loads YouTube through a click-to-load
 * facade, so this block is the only signal to crawlers that a video exists.
 */
export function videoObjectLd(v: VideoLdInput) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: v.name,
    description: v.description,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${v.videoId}`,
    url: abs(v.pageUrl),
    uploadDate: toIsoDate(v.date),
    duration: toIsoDuration(v.duration),
    publisher: { '@id': `${SITE_URL}/#organization` },
  });
}

export interface ArticleLdInput {
  headline: string;
  description: string;
  url: string;
  image?: string | null;
  /** Raw CMS date string; omitted when unparseable. */
  date?: string | null;
}

export function articleLd(a: ArticleLdInput) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.headline,
    description: a.description,
    url: abs(a.url),
    image: a.image ? abs(a.image) : null,
    datePublished: toIsoDate(a.date),
    author: { '@id': `${SITE_URL}/#organization` },
    publisher: { '@id': `${SITE_URL}/#organization` },
  });
}

export function breadcrumbLd(crumbs: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: abs(c.path),
    })),
  };
}
