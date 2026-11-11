import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

// Newsletter subscribers (email_subscribers) for the admin Subscribers page.
// Deliberately NOT returned: unsubscribe_token (whoever holds it can unsubscribe
// that person) and ip_address (cleared nightly by pg_cron on purpose).
const PAGE = 1000; // Supabase caps a single select at 1000 rows; page past it.

export const GET: APIRoute = async ({ request }) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    type Row = { email: string; status: string | null; consent_source: string | null; created_at: string | null; unsubscribed_at: string | null };
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await svc
        .from('email_subscribers')
        .select('email, status, consent_source, created_at, unsubscribed_at')
        .order('created_at', { ascending: false })
        .order('email', { ascending: true }) // stable order so pages don't overlap
        .range(from, from + PAGE - 1);
      if (error) {
        console.error('[admin-subscribers] load failed:', error.message);
        return json(500, { error: 'Failed to load subscribers' });
      }
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < PAGE) break;
    }

    const subscribed = rows.filter(r => r.status === 'subscribed').length;
    return json(200, { subscribers: rows, total: rows.length, subscribed, unsubscribed: rows.length - subscribed });
  } catch (err) {
    console.error('[admin-subscribers] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
