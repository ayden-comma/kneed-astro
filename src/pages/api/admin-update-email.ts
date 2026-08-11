import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body = { id?: string; email?: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function isEmailish(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
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
    const email = str(body.email).toLowerCase();
    if (!id) return json(400, { error: 'Missing id' });
    if (!email) return json(400, { error: 'Email is required' });
    if (email.length > 254 || !isEmailish(email)) return json(400, { error: 'Invalid email address' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    // Old email (for the newsletter follow-through).
    let oldEmail: string | null = null;
    const { data: current } = await svc.auth.admin.getUserById(id);
    oldEmail = current?.user?.email?.toLowerCase() ?? null;

    // Update the auth user's login email (confirmed, no verification round-trip).
    const { error: updErr } = await svc.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (updErr) {
      const msg = (updErr.message ?? '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || (updErr as { status?: number }).status === 422) {
        return json(409, { error: 'That email is already in use by another account.' });
      }
      console.error('[admin-update-email] updateUserById failed:', updErr.message);
      return json(500, { error: 'Failed to update email' });
    }

    // Newsletter follows the member: move their subscriber row to the new email, unless the
    // new email already has one (then skip to avoid a unique-index collision).
    let subscriberSync: 'moved' | 'skipped' | 'none' = 'none';
    if (oldEmail && oldEmail !== email) {
      const { data: oldRow } = await svc.from('email_subscribers').select('id').eq('email', oldEmail).maybeSingle();
      if (oldRow) {
        const { data: newRow } = await svc.from('email_subscribers').select('id').eq('email', email).maybeSingle();
        if (newRow) {
          subscriberSync = 'skipped';
        } else {
          const { error: syncErr } = await svc.from('email_subscribers').update({ email }).eq('id', oldRow.id);
          if (syncErr) { console.error('[admin-update-email] subscriber sync failed:', syncErr.message); subscriberSync = 'skipped'; }
          else subscriberSync = 'moved';
        }
      }
    }

    return json(200, { ok: true, subscriberSync });
  } catch (err) {
    console.error('[admin-update-email] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
