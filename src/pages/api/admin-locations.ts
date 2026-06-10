import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type LocationInput = {
  label?: string;
  address?: string;
  lat?: number;
  lng?: number;
  hours?: string;
  place_id?: string;
};
type Body = { bakery_slug?: string; article_slug?: string; locations?: LocationInput[] };

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: auth.status });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return new Response(JSON.stringify({ error: 'Service key not configured' }), { status: 500 });

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { bakery_slug, article_slug, locations } = await request.json() as Body;

    if (!bakery_slug && !article_slug) {
      return new Response(JSON.stringify({ error: 'Missing bakery_slug or article_slug' }), { status: 400 });
    }

    const slugKey = bakery_slug ? 'bakery_slug' : 'article_slug';
    const slugVal = bakery_slug || article_slug;

    const { error: delErr } = await adminSupabase.from('locations').delete().eq(slugKey, slugVal);
    if (delErr) return new Response(JSON.stringify({ error: delErr.message }), { status: 500 });

    if (locations && locations.length > 0) {
      const rows = locations.map((loc: any, i: number) => ({
        [slugKey]:  slugVal,
        label:      loc.label || null,
        address:    loc.address || null,
        lat:        loc.lat || null,
        lng:        loc.lng || null,
        hours:      loc.hours || null,
        place_id:   loc.place_id || null,
        sort_order: i,
      }));
      const { error: insErr } = await adminSupabase.from('locations').insert(rows);
      if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[admin-locations] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
