import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';
import { SITE_URL } from '../../lib/structuredData';
import { renderCampaignEmail, markdownToEmailHtml, tiptapToEmailHtml } from '../../emails/campaign';
// Reuse the episode broadcast's sender identity — no new email dependency.
import { EPISODE_FROM, EPISODE_REPLY_TO } from '../../emails/episode-alert';

export const prerender = false;

type Body = { id?: string; mode?: 'test' | 'live' | 'count' | 'preview' };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100;

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    let body: Body;
    try { body = await request.json() as Body; } catch { return json(400, { error: 'Invalid JSON' }); }

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const mode = body.mode;
    if (mode !== 'test' && mode !== 'live' && mode !== 'count' && mode !== 'preview') {
      return json(400, { error: "mode must be 'test', 'live', 'count', or 'preview'" });
    }
    if ((mode === 'test' || mode === 'live' || mode === 'preview') && !id) return json(400, { error: 'Missing campaign id' });

    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const resendKey   = env.RESEND_API_KEY;
    if (!serviceKey || !supabaseUrl || !resendKey) {
      console.error('[admin-campaign-send] missing config (service key / supabase url / resend key)');
      return json(500, { error: 'Server configuration error' });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    // Fire-and-log Resend POST helper (single or batch); never throws.
    async function resendPost(url: string, payload: unknown): Promise<boolean> {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[admin-campaign-send] Resend error', res.status, errText);
          return false;
        }
        return true;
      } catch (e) {
        console.error('[admin-campaign-send] Resend threw:', e instanceof Error ? e.message : String(e));
        return false;
      }
    }

    // ── COUNT: subscriber count only (no campaign load, no send) ──
    if (mode === 'count') {
      const { count } = await svc
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'subscribed');
      return json(200, { ok: true, mode: 'count', subscriberCount: count ?? 0 });
    }

    // ── Load the campaign ──
    const { data: campaign, error: cErr } = await svc
      .from('campaigns')
      .select('id, subject, preheader, body_markdown, body_json, status')
      .eq('id', id)
      .single();
    if (cErr || !campaign) {
      console.error('[admin-campaign-send] campaign lookup failed:', cErr?.message);
      return json(404, { error: 'Campaign not found' });
    }

    // Subscriber-facing links are ALWAYS built on the canonical origin, never the
    // request origin — the workers.dev origin stays alive after the domain cutover,
    // and a send triggered from it must not put workers.dev links in real inboxes.
    const origin = SITE_URL;
    const subject = campaign.subject as string;
    // Serialize from the TipTap JSON document; fall back to the legacy markdown body
    // only when body_json is null (the one pre-existing draft).
    const bodyHtml = campaign.body_json != null
      ? tiptapToEmailHtml(campaign.body_json)
      : markdownToEmailHtml(campaign.body_markdown ?? '');
    const preheader = (campaign.preheader as string) ?? '';
    const tags = [{ name: 'type', value: 'campaign' }, { name: 'campaign_id', value: id }];

    // ── PREVIEW: return rendered HTML only; sends nothing, touches nothing ──
    if (mode === 'preview') {
      return json(200, {
        ok: true,
        mode: 'preview',
        html: renderCampaignEmail({ subject, preheader, bodyHtml, unsubscribeUrl: `${origin}/unsubscribe?token=preview` }),
      });
    }

    // ── Guard: don't actually send an empty body. Preview/count are already handled
    //    above and stay permitted; only test/live reach here. ──
    if (bodyHtml.trim() === '') {
      return json(400, { ok: false, error: 'Campaign body is empty — add content before sending.' });
    }

    // ── TEST: one email to the acting admin ──
    if (mode === 'test') {
      const to = auth.user.email;
      if (!to) return json(400, { ok: false, error: 'Your admin account has no email address for a test send' });
      const html = renderCampaignEmail({ subject, preheader, bodyHtml, unsubscribeUrl: `${origin}/unsubscribe?token=preview` });
      const sent = await resendPost(RESEND_ENDPOINT, {
        from:     EPISODE_FROM,
        to,
        reply_to: EPISODE_REPLY_TO,
        subject,
        html,
        tags,
      });
      if (!sent) return json(502, { ok: false, mode: 'test', error: 'Test send failed' });
      return json(200, { ok: true, mode: 'test', sentTo: to });
    }

    // ── LIVE: broadcast to all subscribed subscribers ──
    // Double-send guard: never re-send an already-sent campaign.
    if (campaign.status === 'sent') {
      return json(200, { ok: false, alreadySent: true, error: 'This campaign has already been sent.' });
    }

    const { data: subs, error: subsErr } = await svc
      .from('email_subscribers')
      .select('email, unsubscribe_token')
      .eq('status', 'subscribed');

    if (subsErr) {
      console.error('[admin-campaign-send] subscriber load failed:', subsErr.message);
      return json(500, { ok: false, error: 'Failed to load subscribers' });
    }

    const recipients = (subs ?? []) as { email: string; unsubscribe_token: string }[];

    const emailObjects = recipients.map((sub) => {
      // Visible in-email link → confirm page. One-click header → API endpoint (RFC 8058).
      const unsubscribeUrl = `${origin}/unsubscribe?token=${sub.unsubscribe_token}`;
      const oneClickUrl = `${origin}/api/unsubscribe?token=${sub.unsubscribe_token}`;
      return {
        from:     EPISODE_FROM,
        to:       sub.email,
        reply_to: EPISODE_REPLY_TO,
        subject,
        html:     renderCampaignEmail({ subject, preheader, bodyHtml, unsubscribeUrl }),
        headers: {
          'List-Unsubscribe':      `<${oneClickUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags,
      };
    });

    let chunks = 0;
    let failedChunks = 0;
    for (let i = 0; i < emailObjects.length; i += BATCH_SIZE) {
      const chunk = emailObjects.slice(i, i + BATCH_SIZE);
      chunks += 1;
      const ok = await resendPost(RESEND_BATCH_ENDPOINT, chunk);
      if (!ok) failedChunks += 1;
    }

    // Mark sent regardless of individual chunk outcomes so we don't re-blast.
    const { error: updErr } = await svc
      .from('campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: recipients.length })
      .eq('id', id);
    if (updErr) console.error('[admin-campaign-send] status update failed:', updErr.message);

    return json(200, {
      ok: true,
      mode: 'live',
      recipientCount: recipients.length,
      chunks,
      failedChunks,
    });
  } catch (err) {
    console.error('[admin-campaign-send] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
