import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

export const prerender = false;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request }) => {
  // Always redirect the same way — never reveal whether the email was subscribed.
  const redirectDone = () =>
    new Response(null, { status: 303, headers: { Location: '/unsubscribe?done=1' } });

  try {
    let email = '';
    const contentType = request.headers.get('Content-Type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const body = await request.json() as Record<string, unknown>;
        email = str(body.email).toLowerCase();
      } catch { /* malformed JSON → treat as empty; still redirect to done */ }
    } else {
      const form = await request.formData();
      email = str(form.get('email')).toLowerCase();
    }

    if (email) {
      const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
      if (serviceKey) {
        const serviceSupabase = createClient(supabaseUrl, serviceKey);
        // Never deletes; only sets status. No-op if already unsubscribed or no match.
        const { error } = await serviceSupabase
          .from('email_subscribers')
          .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
          .eq('email', email)
          .neq('status', 'unsubscribed');
        if (error) console.error('[unsubscribe] update failed:', error.message);
      } else {
        console.error('[unsubscribe] SUPABASE_SERVICE_ROLE_KEY not configured');
      }
    }

    return redirectDone();
  } catch (err) {
    console.error('[unsubscribe] threw:', err instanceof Error ? err.message : String(err));
    return redirectDone();
  }
};
