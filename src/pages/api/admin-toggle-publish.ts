import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: auth.status });

  try {
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;

    if (!serviceKey) {
      return new Response(JSON.stringify({ error: 'Service key not configured' }), { status: 500 });
    }

    const adminSupabase = createClient(supabaseUrl, serviceKey);

    let body: { table?: string; slug?: string; published?: boolean };
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    const { table, slug, published } = body;

    if (!table || !slug || published === undefined) {
      return new Response(JSON.stringify({ error: 'Missing required fields: table, slug, published' }), { status: 400 });
    }

    if (table !== 'bakeries_cms' && table !== 'articles_cms') {
      return new Response(JSON.stringify({ error: 'Invalid table' }), { status: 400 });
    }

    // Read current row to check published_at
    const { data: current, error: readError } = await adminSupabase
      .from(table)
      .select('published_at')
      .eq('slug', slug)
      .single();

    if (readError || !current) {
      return new Response(JSON.stringify({ error: readError?.message ?? 'Row not found' }), { status: 404 });
    }

    const updatePayload: Record<string, unknown> = { published };

    // Only set published_at on first publish
    if (published === true && !current.published_at) {
      updatePayload.published_at = new Date().toISOString();
    }

    const { data: updated, error: updateError } = await adminSupabase
      .from(table)
      .update(updatePayload)
      .eq('slug', slug)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ data: updated }), { status: 200 });
  } catch (err) {
    console.error('[admin-toggle-publish] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
