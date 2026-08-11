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
    const nowIso = new Date().toISOString();

    // ── Step 1: hard-delete private data FIRST. If any fails, STOP and return — do NOT
    //           anonymize or delete the auth user (keeps the operation retryable). ──
    const step1Errors: string[] = [];
    for (const table of ['ratings', 'saves', 'comment_votes'] as const) {
      const { error } = await svc.from(table).delete().eq('user_id', id);
      if (error) step1Errors.push(`${table}: ${error.message}`);
    }
    if (step1Errors.length) {
      console.error('[admin-delete-member] step 1 (private data) failed:', step1Errors.join(' | '));
      return json(500, { ok: false, errors: step1Errors });
    }

    // Auth email — needed for the email-keyed unsubscribe, and gone after the auth delete.
    let email: string | null = null;
    const { data: authData, error: getErr } = await svc.auth.admin.getUserById(id);
    if (getErr) console.warn('[admin-delete-member] getUserById failed:', getErr.message);
    else email = authData.user?.email ?? null;

    // ── Step 2: anonymize the profile IN PLACE (never delete it — that would cascade-wipe
    //           the user's comments/forum posts, which we keep as "Bread enthusiast"). ──
    const { error: anonErr } = await svc
      .from('profiles')
      .update({
        display_name:            'Bread enthusiast',
        // username is NOT NULL — use a unique, non-null tombstone. The id is a UUID, so
        // `deleted_<id>` satisfies both NOT NULL and the lower(username) unique index.
        username:                `deleted_${id}`,
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
    if (anonErr) {
      console.error('[admin-delete-member] step 2 (anonymize) failed:', anonErr.message);
      return json(500, { ok: false, errors: [`anonymize: ${anonErr.message}`] });
    }

    // ── Step 3: newsletter — only if requested, unsubscribe by email (email-keyed). ──
    if (unsubscribe && email) {
      const { error: unsubErr } = await svc
        .from('email_subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: nowIso, unsubscribe_reason: 'account_deleted' })
        .eq('email', email.toLowerCase())
        .neq('status', 'unsubscribed');
      if (unsubErr) {
        console.error('[admin-delete-member] step 3 (unsubscribe) failed:', unsubErr.message);
        return json(500, { ok: false, errors: [`unsubscribe: ${unsubErr.message}`] });
      }
    }

    // ── Step 4: delete the Supabase Auth user LAST. "User not found" = already gone = OK;
    //           only a genuine network/permission failure is an error. ──
    const { error: authDelErr } = await svc.auth.admin.deleteUser(id);
    if (authDelErr) {
      const e = authDelErr as { status?: number; code?: string; message?: string };
      const alreadyGone = e.status === 404 || e.code === 'user_not_found' || /not\s*found/i.test(e.message ?? '');
      if (!alreadyGone) {
        console.error('[admin-delete-member] step 4 (auth delete) failed:', authDelErr.message);
        return json(500, { ok: false, errors: [`auth delete: ${authDelErr.message}`] });
      }
      console.warn('[admin-delete-member] auth user already gone — treated as success');
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('[admin-delete-member] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
