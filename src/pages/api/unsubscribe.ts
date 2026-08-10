import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

const ALLOWED_REASONS = new Set(['too_many', 'not_relevant', 'never_signed_up', 'not_expected', 'other']);
const MAX_COMMENT = 1000;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request }) => {
  const url = new URL(request.url);

  // Token / list-unsubscribe can arrive via query string (one-click endpoint) or body.
  let token     = str(url.searchParams.get('token'));
  let email     = '';
  let reasonRaw = '';
  let comment   = '';
  let listUnsub = str(url.searchParams.get('List-Unsubscribe'));

  // Parse body — form-encoded or JSON. Never throw.
  try {
    const ct = request.headers.get('Content-Type') ?? '';
    if (ct.includes('application/json')) {
      const b = await request.json() as Record<string, unknown>;
      token     = str(b.token) || token;
      email     = str(b.email).toLowerCase();
      reasonRaw = str(b.reason);
      comment   = str(b.comment);
      listUnsub = str(b['List-Unsubscribe']) || listUnsub;
    } else {
      const f = await request.formData();
      token     = str(f.get('token')) || token;
      email     = str(f.get('email')).toLowerCase();
      reasonRaw = str(f.get('reason'));
      comment   = str(f.get('comment'));
      listUnsub = str(f.get('List-Unsubscribe')) || listUnsub;
    }
  } catch { /* malformed body → treat as empty; still respond normally */ }

  // RFC 8058 one-click: mail client POSTs body `List-Unsubscribe=One-Click`.
  const oneClick = listUnsub === 'One-Click';

  // Optional reason (validated to the allowed set) and comment (trimmed, capped).
  const reason = ALLOWED_REASONS.has(reasonRaw) ? reasonRaw : null;
  const commentCapped = comment.slice(0, MAX_COMMENT);
  const commentFinal = commentCapped.length ? commentCapped : null;

  // Always the same responses — never reveal whether a token/email exists.
  const respond = () => oneClick
    ? new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    : new Response(null, { status: 303, headers: { Location: '/unsubscribe?done=1' } });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) {
      console.error('[unsubscribe] SUPABASE_SERVICE_ROLE_KEY not configured');
      return respond();
    }

    if (token || email) {
      const svc = createClient(supabaseUrl, serviceKey);
      // Never deletes; only sets status. No-op if already unsubscribed or no match.
      const update = {
        status:              'unsubscribed',
        unsubscribed_at:     new Date().toISOString(),
        unsubscribe_reason:  reason,
        unsubscribe_comment: commentFinal,
      };
      const base = svc.from('email_subscribers').update(update).neq('status', 'unsubscribed');
      const { error } = token
        ? await base.eq('unsubscribe_token', token)
        : await base.eq('email', email);
      if (error) console.error('[unsubscribe] update failed:', error.message);
    }
  } catch (err) {
    console.error('[unsubscribe] threw:', err instanceof Error ? err.message : String(err));
  }

  return respond();
};
