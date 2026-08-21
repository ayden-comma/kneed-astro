import type { APIRoute } from 'astro';
import { supabase } from '../lib/supabase';
import { SITE_URL } from '../lib/structuredData';
import { HIDE_ARTICLES, HIDE_MAP } from '../config/features';

export const prerender = false;

// Dynamic sitemap. The site is server-rendered on Cloudflare, so the
// @astrojs/sitemap integration (build-time, prerendered routes only) cannot
// see the bakery and article slugs that live in Supabase. This endpoint
// queries them at request time instead.
//
// Launch behaviour needs no extra wiring: the coming-soon middleware 503s
// this route while the gate is on, and the HIDE_ARTICLES / HIDE_MAP flags
// below are the same ones that gate the routes themselves, so the sitemap
// can never list a URL that redirects.

const STATIC_ROUTES = [
  '/',
  '/bakeries',
  '/kneed-to-know',
  '/map',
  '/about',
  '/submit',
  '/contact',
];

function urlTag(path: string, lastmod?: string | null): string {
  const loc = new URL(path, SITE_URL).href;
  const mod = lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : '';
  return `<url><loc>${loc}</loc>${mod}</url>`;
}

export const GET: APIRoute = async () => {
  const staticRoutes = STATIC_ROUTES.filter((p) => {
    if (HIDE_ARTICLES && p === '/kneed-to-know') return false;
    if (HIDE_MAP && p === '/map') return false;
    return true;
  });

  // Published bakeries. slug only: selecting columns that may not exist
  // would fail the whole query, and lastmod is optional in the protocol.
  const { data: bakeries } = await supabase
    .from('bakeries_cms')
    .select('slug')
    .eq('published', true)
    .order('name');

  // Published articles, which do carry updated_at.
  const { data: articles } = HIDE_ARTICLES
    ? { data: [] as { slug: string; updated_at: string | null }[] }
    : await supabase
        .from('articles_cms')
        .select('slug, updated_at')
        .eq('published', true)
        .order('updated_at', { ascending: false });

  const entries = [
    ...staticRoutes.map((p) => urlTag(p)),
    ...(bakeries ?? []).map((b: { slug: string }) => urlTag(`/bakeries/${b.slug}`)),
    ...(articles ?? []).map((a: { slug: string; updated_at: string | null }) =>
      urlTag(`/kneed-to-know/${a.slug}`, a.updated_at)
    ),
  ];

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries.join('') +
    '</urlset>';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Regenerated at most hourly; bakery launches do not need to be
      // reflected within minutes.
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
