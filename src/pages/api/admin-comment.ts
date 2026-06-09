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
    const { action, id } = await request.json();

    if (!action || !id) {
      return new Response(JSON.stringify({ error: 'Missing action or id' }), { status: 400 });
    }

    if (action === 'soft-delete') {
      const { error } = await adminSupabase
        .from('comments')
        .update({ content: '[deleted]' })
        .eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    if (action === 'hard-delete') {
      const { error } = await adminSupabase
        .from('comments')
        .delete()
        .eq('id', id);
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
  } catch (err) {
    console.error('[admin-comment] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
