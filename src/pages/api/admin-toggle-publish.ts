import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';
import { publishCms, unpublishCms, type CmsTable } from '../../lib/cmsDraft';

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

    // Look up the id, then go through the same publish path as the editor so a
    // pending draft is applied and a revision is recorded.
    const { data: current, error: readError } = await adminSupabase
      .from(table).select('id').eq('slug', slug).single();
    if (readError || !current) {
      return new Response(JSON.stringify({ error: readError?.message ?? 'Row not found' }), { status: 404 });
    }
    const ctx = { db: adminSupabase, table: table as CmsTable, userEmail: auth.user.email };
    if (published) await publishCms(ctx, (current as any).id);
    else await unpublishCms(ctx, (current as any).id);

    const { data: updated } = await adminSupabase.from(table).select('*').eq('id', (current as any).id).single();
    return new Response(JSON.stringify({ data: updated }), { status: 200 });
  } catch (err) {
    console.error('[admin-toggle-publish] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
