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

    type Row = { email: string; status: string | null; consent_source: string | null; created_at: string | null; unsubscribed_at: string | null; user_id: string | null };
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await svc
        .from('email_subscribers')
        .select('email, status, consent_source, created_at, unsubscribed_at, user_id')
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

    // Link subscribers to member accounts. user_id is only set when the person
    // signed up from their account; someone who joined from the holding page and
    // made an account later is matched by email, the same way admin-get-member
    // looks up newsletter status (subscriptions are email-keyed).
    const memberIds = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await svc.from('profiles').select('id').range(from, from + PAGE - 1);
      if (error) { console.error('[admin-subscribers] profiles load failed:', error.message); break; }
      for (const p of data ?? []) memberIds.add((p as { id: string }).id);
      if (!data || data.length < PAGE) break;
    }
    const idByEmail = new Map<string, string>();
    for (let page = 1; ; page++) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: PAGE });
      if (error) { console.error('[admin-subscribers] listUsers failed:', error.message); break; }
      const users = data?.users ?? [];
      for (const u of users) if (u.email) idByEmail.set(u.email.toLowerCase(), u.id);
      if (users.length < PAGE) break;
    }
    const subscribers = rows.map(({ user_id, ...r }) => {
      const byId = user_id && memberIds.has(user_id) ? user_id : null;
      const byEmail = idByEmail.get(r.email.toLowerCase());
      const member_id = byId ?? (byEmail && memberIds.has(byEmail) ? byEmail : null);
      return { ...r, member_id };
    });

    const subscribed = rows.filter(r => r.status === 'subscribed').length;
    return json(200, { subscribers, total: rows.length, subscribed, unsubscribed: rows.length - subscribed });
  } catch (err) {
    console.error('[admin-subscribers] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
