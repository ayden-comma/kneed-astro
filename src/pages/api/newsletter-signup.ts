import type { APIRoute } from 'astro';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

const ALLOWED_FIELDS = new Set(['email', 'consent_source']);
const MAX_EMAIL = 254;
const CONSENT_SOURCES = new Set(['homepage_form', 'signup_checkbox']);

function isEmailish(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

type UpsertResult =
  | { status: 'inserted' | 'resurrected' | 'already' }
  | { status: 'error'; message: string };

// Insert-then-resurrect against the lower(email) unique index. email must already
// be lowercased by the caller so the collision lookup (.eq) matches the stored row.
async function upsertSubscriber(
  svc: SupabaseClient,
  opts: { email: string; consentSource: string; ip: string | null; userId: string | null },
): Promise<UpsertResult> {
  const nowIso = new Date().toISOString();
  const base = {
    email:          opts.email,
    status:         'subscribed',
    consent_source: opts.consentSource,
    consent_at:     nowIso,
    ip_address:     opts.ip,
    user_id:        null as string | null,
  };

  let { error: insErr } = await svc
    .from('email_subscribers')
    .insert({ ...base, user_id: opts.userId });

  // Profile row may not exist yet (e.g. unconfirmed signup) → FK violation.
  // Retry without user_id so consent is still recorded; link can be backfilled later.
  if (insErr && insErr.code === '23503' && opts.userId) {
    console.warn('[newsletter-signup] user_id FK violation — retrying without it');
    ({ error: insErr } = await svc.from('email_subscribers').insert(base));
  }

  if (!insErr) return { status: 'inserted' };

  if (insErr.code === '23505') {
    // Already on the list. Resurrect only if unsubscribed; otherwise leave untouched.
    const { data: existing, error: selErr } = await svc
      .from('email_subscribers')
      .select('id, status')
      .eq('email', opts.email)
      .maybeSingle();

    if (selErr || !existing) {
      console.error('[newsletter-signup] conflict but no row found:', selErr?.message);
      return { status: 'error', message: selErr?.message ?? 'Row not found after conflict' };
    }

    if (existing.status === 'unsubscribed') {
      const { error: updErr } = await svc
        .from('email_subscribers')
        .update({ status: 'subscribed', unsubscribed_at: null, consent_at: nowIso })
        .eq('id', existing.id);
      if (updErr) {
        console.error('[newsletter-signup] resurrect update failed:', updErr.message);
        return { status: 'error', message: updErr.message };
      }
      return { status: 'resurrected' };
    }

    return { status: 'already' };
  }

  console.error('[newsletter-signup] insert failed:', insErr.message);
  return { status: 'error', message: insErr.message };
}

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }

    // Reject unexpected fields
    const unexpected = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k));
    if (unexpected.length) {
      return json(400, { error: `Unexpected fields: ${unexpected.join(', ')}` });
    }

    const email = str(body.email).toLowerCase();
    const consentSource = str(body.consent_source) || 'homepage_form';

    if (!email) return json(400, { error: 'email is required' });
    if (email.length > MAX_EMAIL) return json(400, { error: `email must be ${MAX_EMAIL} characters or fewer` });
    if (!isEmailish(email)) return json(400, { error: 'Invalid email address' });
    if (!CONSENT_SOURCES.has(consentSource)) {
      return json(400, { error: 'Invalid consent_source' });
    }

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) {
      console.error('[newsletter-signup] SUPABASE_SERVICE_ROLE_KEY not configured');
      return json(500, { error: 'Server configuration error' });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceKey);

    // Optional bearer token → server-derived user_id. Never trust a browser-supplied
    // id. At email-confirmation signup there is no session yet, so this is often null;
    // the subscription is still recorded by email and the link backfilled later.
    let userId: string | null = null;
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const anonClient = createClient(
        import.meta.env.PUBLIC_SUPABASE_URL as string,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string,
      );
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (user) userId = user.id;
    }

    // Rate limit: max 3 per IP per hour for anonymous requests, counted against
    // email_subscribers.ip_address. Skipped for authenticated (token-verified) opt-ins.
    // Fail open if the column/table is missing (countError non-null).
    if (!userId && ip !== 'unknown') {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await serviceSupabase
        .from('email_subscribers')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', oneHourAgo);

      if (!countError && count !== null && count >= 3) {
        return json(429, { error: 'Too many signups. Please try again in an hour.' });
      }
    }

    const result = await upsertSubscriber(serviceSupabase, {
      email,
      consentSource,
      ip: ip !== 'unknown' ? ip : null,
      userId,
    });

    if (result.status === 'error') {
      return json(500, { error: 'Failed to save signup. Please try again.' });
    }

    return json(200, { ok: true, already: result.status === 'already', resurrected: result.status === 'resurrected' });
  } catch (err) {
    console.error('[newsletter-signup] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
