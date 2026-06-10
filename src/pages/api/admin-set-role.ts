import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body = { action: 'set_role'; id: string; role: 'admin' | 'member' };

export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: auth.status });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return new Response(JSON.stringify({ error: 'Service key not configured' }), { status: 500 });

    const body = await request.json() as Body;

    if (body.action !== 'set_role') return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    if (body.role !== 'admin' && body.role !== 'member') return new Response(JSON.stringify({ error: 'Invalid role' }), { status: 400 });
    if (!body.id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
    if (body.id === auth.user.id) return new Response(JSON.stringify({ error: 'Cannot change your own role' }), { status: 403 });

    const adminSupabase = createClient(supabaseUrl, serviceKey);
    const { error } = await adminSupabase.from('profiles').update({ role: body.role }).eq('id', body.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[admin-set-role] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
