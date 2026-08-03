import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

const ALLOWED_FIELDS = new Set([
  'type', 'bakery_name', 'submitted_name', 'email', 'phone',
  'address', 'website', 'instagram', 'notes',
]);

const MAX_LENGTHS: Record<string, number> = {
  bakery_name:    200,
  submitted_name: 200,
  email:          254,
  phone:          50,
  address:        500,
  website:        500,
  instagram:      200,
  notes:          3000,
};

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

    const type = body.type;
    if (type !== 'bakery' && type !== 'suggestion') {
      return json(400, { error: 'type must be "bakery" or "suggestion"' });
    }

    const fields = {
      bakery_name:    str(body.bakery_name),
      submitted_name: str(body.submitted_name),
      email:          str(body.email),
      phone:          str(body.phone),
      address:        str(body.address),
      website:        str(body.website),
      instagram:      str(body.instagram),
      notes:          str(body.notes),
    };

    if (!fields.bakery_name) return json(400, { error: 'bakery_name is required' });

    if (type === 'suggestion' && !fields.address) {
      return json(400, { error: 'address is required' });
    }

    if (fields.email && !isEmailish(fields.email)) {
      return json(400, { error: 'Invalid email address' });
    }

    for (const [field, max] of Object.entries(MAX_LENGTHS)) {
      const v = fields[field as keyof typeof fields];
      if (v && v.length > max) {
        return json(400, { error: `${field} must be ${max} characters or fewer` });
      }
    }

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) {
      console.error('[submit-bakery] SUPABASE_SERVICE_ROLE_KEY not configured');
      return json(500, { error: 'Server configuration error' });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceKey);

    // Rate limit: max 3 submissions per IP per hour, backed by the submissions table.
    // Requires ip_address column to exist (see migration SQL). If the column is missing,
    // countError will be non-null and the check is skipped (fail open).
    if (ip !== 'unknown') {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count, error: countError } = await serviceSupabase
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', oneHourAgo);

      if (!countError && count !== null && count >= 3) {
        return json(429, { error: 'Too many submissions. Please try again in an hour.' });
      }
    }

    // Optional submitted_by from bearer token — never required.
    let submittedBy: string | null = null;
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (token) {
      const anonClient = createClient(
        import.meta.env.PUBLIC_SUPABASE_URL as string,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string,
      );
      const { data: { user } } = await anonClient.auth.getUser(token);
      if (user) submittedBy = user.id;
    }

    const insertPayload = {
      bakery_name:    fields.bakery_name    || null,
      submitted_name: fields.submitted_name || null,
      email:          fields.email          || null,
      phone:          fields.phone          || null,
      address:        fields.address        || null,
      suburb:         null,
      website:        fields.website        || null,
      instagram:      fields.instagram      || null,
      notes:          fields.notes          || null,
      status:         'pending',
      ip_address:     ip !== 'unknown' ? ip : null,
      ...(submittedBy ? { submitted_by: submittedBy } : {}),
    };

    let { error: insertError } = await serviceSupabase.from('submissions').insert(insertPayload);

    if (insertError && insertError.code === '23503' && submittedBy) {
      console.warn('[submit-bakery] submitted_by FK violation for user', submittedBy, '— retrying without it:', insertError.message);
      ({ error: insertError } = await serviceSupabase.from('submissions').insert({
        ...insertPayload,
        submitted_by: null,
      }));
    }

    if (insertError) {
      console.error('[submit-bakery] insert failed:', insertError.message);
      return json(500, { error: 'Failed to save submission. Please try again.' });
    }

    // Email notification via Resend. Email failure never blocks the response.
    const resendKey = env.RESEND_API_KEY;
    if (resendKey) {
      const submitterLine = submittedBy
        ? `Logged-in user (id: ${submittedBy})`
        : 'Anonymous visitor';

      const lines = [
        `Type:           ${type === 'bakery' ? 'Own bakery submission' : 'Bakery recommendation'}`,
        `Bakery name:    ${fields.bakery_name}`,
        fields.submitted_name ? `Submitter name: ${fields.submitted_name}` : null,
        fields.email          ? `Email:          ${fields.email}`          : null,
        fields.phone          ? `Phone:          ${fields.phone}`          : null,
        fields.address        ? `Address:        ${fields.address}`        : null,
        fields.website        ? `Website:        ${fields.website}`        : null,
        fields.instagram      ? `Instagram:      ${fields.instagram}`      : null,
        fields.notes          ? `\nNotes:\n${fields.notes}`               : null,
        ``,
        `Submitter:      ${submitterLine}`,
        `IP:             ${ip}`,
      ].filter(Boolean).join('\n');

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:    'hello@mail.kneed.tv',
            to:      'ayden@commafilms.com.au',
            subject: `New bakery submission: ${fields.bakery_name}`,
            text:    lines,
          }),
        });
        if (!emailRes.ok) {
          const errText = await emailRes.text();
          console.error('[submit-bakery] Resend error', emailRes.status, errText);
        }
      } catch (emailErr) {
        console.error('[submit-bakery] Resend threw:', emailErr instanceof Error ? emailErr.message : String(emailErr));
      }
    } else {
      console.warn('[submit-bakery] RESEND_API_KEY not set — email notification skipped');
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('[submit-bakery] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
