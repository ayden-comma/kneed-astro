import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';
import { SITE_URL } from '../../lib/structuredData';

export const prerender = false;

type Body = { id?: string };

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
    if (!id) return json(400, { error: 'Missing id' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const anonKey     = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: authData, error: getErr } = await svc.auth.admin.getUserById(id);
    if (getErr) { console.error('[admin-send-reset] getUserById failed:', getErr.message); return json(500, { error: 'Failed to look up member' }); }
    const email = authData?.user?.email;
    if (!email) return json(400, { error: 'Member has no email address' });

    // resetPasswordForEmail is a public method — use the anon client. The reset link is
    // built on the canonical origin (not the request origin) so a reset triggered from the
    // workers.dev admin never emails a member a workers.dev link. Requires kneed.tv in the
    // Supabase redirect allow-list — part of the domain cutover checklist.
    const origin = SITE_URL;
    const anon = createClient(supabaseUrl as string, anonKey as string);
    const { error: resetErr } = await anon.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    });
    if (resetErr) {
      console.error('[admin-send-reset] resetPasswordForEmail failed:', resetErr.message);
      return json(500, { error: 'Failed to send reset email' });
    }

    return json(200, { ok: true, email });
  } catch (err) {
    console.error('[admin-send-reset] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
