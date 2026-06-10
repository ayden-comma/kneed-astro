import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body =
  | { action: 'delete'; id: string }
  | { action: 'update'; id: string; payload: Record<string, unknown> }
  | { action: 'insert'; payload: Record<string, unknown> };

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: auth.status });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return new Response(JSON.stringify({ error: 'Service key not configured' }), { status: 500 });

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const body = await request.json() as Body;

    if (body.action === 'delete') {
      if (!body.id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
      const { error } = await adminSupabase.from('bakeries_cms').delete().eq('id', body.id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (body.action === 'update') {
      if (!body.id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
      const { error } = await adminSupabase.from('bakeries_cms').update(body.payload).eq('id', body.id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (body.action === 'insert') {
      const { error } = await adminSupabase.from('bakeries_cms').insert(body.payload);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (err) {
    console.error('[admin-bakeries-cms] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
