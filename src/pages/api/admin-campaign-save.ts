import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type Body = { id?: string; subject?: string; preheader?: string; body_markdown?: string; body_json?: unknown };

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
    const subject = str(body.subject);
    // Preheader/body may be intentionally empty — keep as-is (no length floor).
    const preheader = typeof body.preheader === 'string' ? body.preheader : '';
    const bodyMarkdown = typeof body.body_markdown === 'string' ? body.body_markdown : '';
    // body_json is the TipTap document (object) or null; only accept an object or null.
    const bodyJson = (body.body_json && typeof body.body_json === 'object') ? body.body_json : null;
    if (!subject) return json(400, { error: 'Subject is required' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    if (id) {
      // ── Update existing draft. Refuse to edit an already-sent campaign. ──
      const { data: existing, error: getErr } = await svc
        .from('campaigns')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();
      if (getErr) { console.error('[admin-campaign-save] lookup failed:', getErr.message); return json(500, { error: 'Failed to load campaign' }); }
      if (!existing) return json(404, { error: 'Campaign not found' });
      if (existing.status === 'sent') return json(400, { error: 'This campaign has already been sent and cannot be edited.' });

      // Only touch body_markdown if the caller actually sent one — the TipTap editor
      // sends body_json instead, and the legacy markdown must be preserved untouched.
      const updatePayload: Record<string, unknown> = { subject, preheader, body_json: bodyJson, updated_at: nowIso };
      if (typeof body.body_markdown === 'string') updatePayload.body_markdown = bodyMarkdown;

      const { data: updated, error: updErr } = await svc
        .from('campaigns')
        .update(updatePayload)
        .eq('id', id)
        .select('id, subject, preheader, body_markdown, body_json, status')
        .single();
      if (updErr) { console.error('[admin-campaign-save] update failed:', updErr.message); return json(500, { error: 'Failed to save campaign' }); }
      return json(200, { ok: true, campaign: updated });
    }

    // ── Create a new draft. ──
    const { data: created, error: insErr } = await svc
      .from('campaigns')
      .insert({ subject, preheader, body_markdown: bodyMarkdown, body_json: bodyJson, status: 'draft', recipient_count: 0, created_at: nowIso, updated_at: nowIso })
      .select('id, subject, preheader, body_markdown, body_json, status')
      .single();
    if (insErr) { console.error('[admin-campaign-save] insert failed:', insErr.message); return json(500, { error: 'Failed to create campaign' }); }
    return json(200, { ok: true, campaign: created });
  } catch (err) {
    console.error('[admin-campaign-save] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
