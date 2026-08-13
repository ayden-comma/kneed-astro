import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    // ?id=<uuid> → the full single campaign (for the editor); otherwise the list.
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const { data, error } = await svc
        .from('campaigns')
        .select('id, subject, preheader, body_markdown, status, recipient_count, sent_at, created_at')
        .eq('id', id)
        .maybeSingle();
      if (error) { console.error('[admin-campaigns] detail load failed:', error.message); return json(500, { error: 'Failed to load campaign' }); }
      if (!data) return json(404, { error: 'Campaign not found' });
      return json(200, { campaign: data });
    }

    const { data, error } = await svc
      .from('campaigns')
      .select('id, subject, status, recipient_count, sent_at, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[admin-campaigns] load failed:', error.message);
      return json(500, { error: 'Failed to load campaigns' });
    }

    return json(200, { campaigns: data ?? [] });
  } catch (err) {
    console.error('[admin-campaigns] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
