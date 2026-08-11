import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body = { id?: string; unsubscribe?: boolean };

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
    const unsubscribe = body.unsubscribe === true;
    if (!id) return json(400, { error: 'Missing id' });
    if (id === auth.user.id) return json(400, { error: "You can't delete your own account." });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    const errors: string[] = [];
    const nowIso = new Date().toISOString();

    // Look up the auth email first (needed for the email-keyed unsubscribe, and it's gone
    // after the auth user is deleted below).
    let email: string | null = null;
    const { data: authData, error: getErr } = await svc.auth.admin.getUserById(id);
    if (getErr) console.warn('[admin-delete-member] getUserById failed:', getErr.message);
    else email = authData.user?.email ?? null;

    // ── 1. Anonymize the profile IN PLACE (never delete it — that would cascade-wipe
    //        the user's comments/forum posts, which we keep as "Bread enthusiast"). ──
    const { error: anonErr } = await svc
      .from('profiles')
      .update({
        display_name:            'Bread enthusiast',
        username:                null,
        bio:                     null,
        date_of_birth:           null,
        gender:                  null,
        location:                null,
        demographics_consent:    false,
        demographics_consent_at: null,
        role:                    'member',
        deleted_at:              nowIso,
      })
      .eq('id', id);
    if (anonErr) errors.push(`anonymize: ${anonErr.message}`);

    // ── 3. Hard-delete private data. The profile survives, so FK cascades won't fire —
    //        delete these explicitly. (comments/forum kept and de-identified via the profile.) ──
    for (const table of ['ratings', 'saves', 'comment_votes'] as const) {
      const { error } = await svc.from(table).delete().eq('user_id', id);
      if (error) errors.push(`${table}: ${error.message}`);
    }

    // ── 5. Newsletter: only if requested, unsubscribe by email (subscriptions are email-keyed). ──
    if (unsubscribe && email) {
      const { error: unsubErr } = await svc
        .from('email_subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: nowIso, unsubscribe_reason: 'account_deleted' })
        .eq('email', email.toLowerCase())
        .neq('status', 'unsubscribed');
      if (unsubErr) errors.push(`unsubscribe: ${unsubErr.message}`);
    }

    // ── 2. Delete the Supabase Auth user LAST (removes login + email). ──
    const { error: authDelErr } = await svc.auth.admin.deleteUser(id);
    if (authDelErr) errors.push(`auth delete: ${authDelErr.message}`);

    if (errors.length) {
      console.error('[admin-delete-member] partial failure:', errors.join(' | '));
      return json(500, { ok: false, errors });
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error('[admin-delete-member] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
