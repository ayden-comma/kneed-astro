import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';
import { handleCmsAction, HttpError } from '../../lib/cmsDraft';
import { signPreview } from '../../lib/previewToken';

export const prerender = false;

// Actions: insert | save | publish | unpublish | discard | revisions | revert | get | pending | delete | preview_link
// See src/lib/cmsDraft.ts for the draft/publish rules.
export const POST: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: auth.status });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return new Response(JSON.stringify({ error: 'Service key not configured' }), { status: 500 });

    const db = createClient(supabaseUrl, serviceKey);
    const body = await request.json() as any;
    if (body?.action === 'preview_link') {
      if (typeof body.id !== 'string' || !body.id) throw new HttpError(400, 'Missing id');
      const token = await signPreview(serviceKey, 'bakeries_cms', body.id);
      return new Response(JSON.stringify({ ok: true, token }), { status: 200 });
    }
    const result = await handleCmsAction({ db, table: 'bakeries_cms', userEmail: auth.user.email }, body);
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 });
  } catch (err) {
    if (err instanceof HttpError) return new Response(JSON.stringify({ error: err.message }), { status: err.status });
    console.error('[admin-bakeries-cms] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'internal' }), { status: 500 });
  }
};
