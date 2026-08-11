import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body = { id?: string; username?: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    let body: Body;
    try { body = await request.json() as Body; } catch { return json(400, { error: 'Invalid JSON' }); }

    const id = str(body.id);
    const username = str(body.username);
    if (!id) return json(400, { error: 'Missing id' });
    if (!username) return json(400, { error: 'Username is required' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    // Only the username is editable here.
    const { error } = await svc.from('profiles').update({ username }).eq('id', id);
    if (error) {
      if (error.code === '23505') return json(409, { error: 'That username is already taken.' });
      console.error('[admin-update-member] update failed:', error.message);
      return json(500, { error: 'Failed to update member' });
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('[admin-update-member] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
