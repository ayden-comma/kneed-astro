import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

const ALLOWED_FIELDS = new Set(['email', 'source']);
const MAX_EMAIL  = 254;
const MAX_SOURCE = 100;

function isEmailish(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
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

    const email  = str(body.email);
    const source = str(body.source);

    if (!email) return json(400, { error: 'email is required' });
    if (email.length > MAX_EMAIL) return json(400, { error: `email must be ${MAX_EMAIL} characters or fewer` });
    if (!isEmailish(email)) return json(400, { error: 'Invalid email address' });
    if (source && source.length > MAX_SOURCE) {
      return json(400, { error: `source must be ${MAX_SOURCE} characters or fewer` });
    }

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) {
      console.error('[newsletter-signup] SUPABASE_SERVICE_ROLE_KEY not configured');
      return json(500, { error: 'Server configuration error' });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceKey);

    // Rate limit: max 3 signups per IP per hour, backed by newsletter_signups.ip_address.
    // Requires ip_address column to exist (see migration SQL). If the column is missing,
    // countError will be non-null and the check is skipped (fail open).
    if (ip !== 'unknown') {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await serviceSupabase
        .from('newsletter_signups')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', oneHourAgo);

      if (!countError && count !== null && count >= 3) {
        return json(429, { error: 'Too many signups. Please try again in an hour.' });
      }
    }

    const { error: insertError } = await serviceSupabase.from('newsletter_signups').insert({
      email,
      source:     source || null,
      ip_address: ip !== 'unknown' ? ip : null,
    });

    if (insertError) {
      // Unique violation on lower(email): already on the list. Re-signup is success, not error.
      if (insertError.code === '23505') {
        return json(200, { ok: true, already: true });
      }
      console.error('[newsletter-signup] insert failed:', insertError.message);
      return json(500, { error: 'Failed to save signup. Please try again.' });
    }

    return json(200, { ok: true, already: false });
  } catch (err) {
    console.error('[newsletter-signup] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
