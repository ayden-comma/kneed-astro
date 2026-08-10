import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

type Body = { action?: 'status' | 'subscribe' | 'unsubscribe' };

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    // ── Auth: derive the acting user from the bearer token (self-service, no admin) ──
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return json(401, { error: 'Unauthorized' });

    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const anonKey     = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;

    const anonClient = createClient(supabaseUrl as string, anonKey as string);
    const { data: { user } } = await anonClient.auth.getUser(token);
    if (!user) return json(401, { error: 'Unauthorized' });

    const uid = user.id;
    const email = (user.email ?? '').toLowerCase();
    if (!email) return json(400, { error: 'No email on account' });

    if (!serviceKey) {
      console.error('[newsletter-preference] SUPABASE_SERVICE_ROLE_KEY not configured');
      return json(500, { error: 'Server configuration error' });
    }
    const svc = createClient(supabaseUrl, serviceKey);

    let body: Body;
    try {
      body = await request.json() as Body;
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }
    const action = body.action;
    if (action !== 'status' && action !== 'subscribe' && action !== 'unsubscribe') {
      return json(400, { error: 'Invalid action' });
    }

    const nowIso = new Date().toISOString();

    // ── STATUS: is this account currently subscribed? ──────────────
    if (action === 'status') {
      const { data, error } = await svc
        .from('email_subscribers')
        .select('status')
        .eq('email', email)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('[newsletter-preference] status read failed:', error.message);
        return json(500, { error: 'Failed to read preference' });
      }
      return json(200, { ok: true, subscribed: !!data && data.status === 'subscribed' });
    }

    // ── SUBSCRIBE: insert, or resurrect an unsubscribed row ────────
    if (action === 'subscribe') {
      const { error: insErr } = await svc
        .from('email_subscribers')
        .insert({ email, status: 'subscribed', consent_source: 'profile_toggle', consent_at: nowIso, user_id: uid })
        .select('id')
        .single();

      if (!insErr) return json(200, { ok: true, subscribed: true });

      if (insErr.code === '23505') {
        // Already on the list. Resurrect only if unsubscribed; otherwise no-op.
        const { data: existing, error: selErr } = await svc
          .from('email_subscribers')
          .select('id, status, user_id')
          .eq('email', email)
          .maybeSingle();
        if (selErr || !existing) {
          console.error('[newsletter-preference] conflict but no row found:', selErr?.message);
          return json(500, { error: 'Failed to update preference' });
        }
        if (existing.status === 'unsubscribed') {
          const update: Record<string, unknown> = { status: 'subscribed', unsubscribed_at: null, consent_at: nowIso };
          if (!existing.user_id) update.user_id = uid;
          const { error: updErr } = await svc.from('email_subscribers').update(update).eq('id', existing.id);
          if (updErr) {
            console.error('[newsletter-preference] resurrect failed:', updErr.message);
            return json(500, { error: 'Failed to update preference' });
          }
        }
        // else already subscribed → no-op
        return json(200, { ok: true, subscribed: true });
      }

      console.error('[newsletter-preference] subscribe insert failed:', insErr.message);
      return json(500, { error: 'Failed to subscribe' });
    }

    // ── UNSUBSCRIBE: set status, only for rows not already unsubscribed ──
    const { error: updErr } = await svc
      .from('email_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: nowIso })
      .eq('email', email)
      .neq('status', 'unsubscribed');
    if (updErr) {
      console.error('[newsletter-preference] unsubscribe failed:', updErr.message);
      return json(500, { error: 'Failed to unsubscribe' });
    }
    return json(200, { ok: true, subscribed: false });
  } catch (err) {
    console.error('[newsletter-preference] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
