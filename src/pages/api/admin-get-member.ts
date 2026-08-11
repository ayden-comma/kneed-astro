import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    if (!id) return json(400, { error: 'Missing id' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: profile, error } = await svc
      .from('profiles')
      .select('id, display_name, username, bio, role, created_at, date_of_birth, gender, location, demographics_consent, deleted_at')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.error('[admin-get-member] profile load failed:', error.message);
      return json(500, { error: 'Failed to load member' });
    }
    if (!profile) return json(404, { error: 'Member not found' });

    // Auth email (login) — separate from profiles; may be gone if the auth user was deleted.
    let email: string | null = null;
    const { data: authData, error: authErr } = await svc.auth.admin.getUserById(id);
    if (authErr) console.warn('[admin-get-member] getUserById failed:', authErr.message);
    else email = authData.user?.email ?? null;

    // Newsletter subscription status, keyed by the auth email (subscriptions are email-keyed).
    let subscriberStatus: string | null = null;
    if (email) {
      const { data: sub } = await svc
        .from('email_subscribers')
        .select('status')
        .eq('email', email.toLowerCase())
        .limit(1)
        .maybeSingle();
      subscriberStatus = sub?.status ?? null; // null = not a subscriber
    }

    return json(200, { profile, email, subscriberStatus });
  } catch (err) {
    console.error('[admin-get-member] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
