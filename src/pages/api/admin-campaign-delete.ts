import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body = { id?: string };

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
    if (!id) return json(400, { error: 'Missing id' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    // Only drafts are deletable. Sent campaigns are send history and their analytics
    // (email_events.campaign_id) depend on the row surviving.
    const { data: existing, error: getErr } = await svc
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (getErr) { console.error('[admin-campaign-delete] lookup failed:', getErr.message); return json(500, { error: 'Failed to load campaign' }); }
    if (!existing) return json(404, { error: 'Campaign not found' });
    if (existing.status === 'sent') {
      return json(400, { error: "Sent campaigns can't be deleted — they're your send history and their analytics depend on them." });
    }

    const { error: delErr } = await svc.from('campaigns').delete().eq('id', id);
    if (delErr) { console.error('[admin-campaign-delete] delete failed:', delErr.message); return json(500, { error: 'Failed to delete campaign' }); }

    return json(200, { ok: true });
  } catch (err) {
    console.error('[admin-campaign-delete] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
