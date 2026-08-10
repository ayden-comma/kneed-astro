import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';
import {
  renderEpisodeEmail,
  EPISODE_FROM,
  EPISODE_REPLY_TO,
  type EpisodeEmailData,
} from '../../emails/episode-alert';

export const prerender = false;

type Body = { bakeryId?: string; mode?: 'test' | 'live' | 'count' | 'preview'; force?: boolean };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100;

// Optimise a Cloudinary delivery URL for email: always impose a 16:9 smart crop, stripping
// any existing leading transform (but preserving a v123 version segment and the public ID).
function emailImage(url: string): string {
  if (!url) return '';
  const TX = 'c_fill,g_auto,w_1200,h_675,q_auto,f_jpg';
  const marker = '/image/upload/';
  const i = url.indexOf(marker);
  if (i !== -1) {
    let after = url.slice(i + marker.length);
    // If a transform segment is already present, strip it (but never strip a version segment like v123).
    const firstSlash = after.indexOf('/');
    if (firstSlash !== -1) {
      const firstSeg = after.slice(0, firstSlash);
      const looksLikeTransform = /(^|,)(c|w|h|g|q|f|t|e|ar|dpr|b|bo|r|o|a|fl|l|u|x|y|z|co|pg)_/.test(firstSeg);
      const isVersion = /^v\d+$/.test(firstSeg);
      if (looksLikeTransform && !isVersion) {
        after = after.slice(firstSlash + 1);
      }
    }
    return url.slice(0, i + marker.length) + TX + '/' + after;
  }
  // Non-Cloudinary URL (e.g. an Unsplash/Pexels placeholder hotlink).
  // Cloudinary fetch delivery is restricted on this account, so a fetch-wrapped
  // URL would 401 and render as a broken image. Return the URL as-is instead:
  // uncropped but visible. Real images are uploaded to Cloudinary and are cropped
  // by the /image/upload/ branch above.
  if (/^https?:\/\//.test(url)) {
    return url;
  }
  return url;
}

export const POST: APIRoute = async ({ request }) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    // ── Validate body ──────────────────────────────────────────────
    let body: Body;
    try {
      body = await request.json() as Body;
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }
    const bakeryId = typeof body.bakeryId === 'string' ? body.bakeryId.trim() : '';
    const mode = body.mode;
    const force = body.force === true;
    if (mode !== 'test' && mode !== 'live' && mode !== 'count' && mode !== 'preview') {
      return json(400, { error: "mode must be 'test', 'live', 'count', or 'preview'" });
    }
    if ((mode === 'test' || mode === 'live' || mode === 'preview') && !bakeryId) return json(400, { error: 'Missing bakeryId' });

    // ── Config ─────────────────────────────────────────────────────
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const resendKey   = env.RESEND_API_KEY;
    if (!serviceKey || !supabaseUrl || !resendKey) {
      console.error('[admin-send-announcement] missing config (service key / supabase url / resend key)');
      return json(500, { error: 'Server configuration error' });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    // ── Fire-and-log Resend POST helper (single or batch); never throws ──
    async function resendPost(url: string, payload: unknown): Promise<boolean> {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('[admin-send-announcement] Resend error', res.status, errText);
          return false;
        }
        return true;
      } catch (e) {
        console.error('[admin-send-announcement] Resend threw:', e instanceof Error ? e.message : String(e));
        return false;
      }
    }

    // ── COUNT: subscriber count only (no bakery, no send) ──────────
    if (mode === 'count') {
      const { count } = await svc
        .from('email_subscribers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'subscribed');
      return json(200, { ok: true, mode: 'count', subscriberCount: count ?? 0 });
    }

    // ── Load the bakery ────────────────────────────────────────────
    const { data: bakery, error: bakeryErr } = await svc
      .from('bakeries_cms')
      .select('name, slug, description, thumbnail, email_image_url, episode_number, published, announced_at')
      .eq('id', bakeryId)
      .single();

    if (bakeryErr) {
      console.error('[admin-send-announcement] bakery lookup failed:', bakeryErr.message);
      return json(404, { error: 'Episode not found' });
    }
    if (!bakery) return json(404, { error: 'Episode not found' });
    if (!bakery.published) return json(200, { ok: false, error: 'Episode is not published' });

    const origin = new URL(request.url).origin;
    const watchUrl = `${origin}/bakeries/${bakery.slug}`;
    const subject = `New episode: ${bakery.name}`;
    const baseData: Omit<EpisodeEmailData, 'unsubscribeUrl'> = {
      episodeNumber: bakery.episode_number ?? null,
      title:         bakery.name,
      blurb:         bakery.description ?? '',
      thumbnailUrl:  emailImage(bakery.email_image_url || bakery.thumbnail || ''),
      watchUrl,
    };

    // ── PREVIEW: return rendered HTML only; sends nothing, touches nothing ──
    if (mode === 'preview') {
      return json(200, {
        ok: true,
        mode: 'preview',
        html: renderEpisodeEmail({ ...baseData, unsubscribeUrl: `${origin}/unsubscribe?token=preview` }),
      });
    }

    // ── TEST: one email to the acting admin ────────────────────────
    if (mode === 'test') {
      const to = auth.user.email;
      if (!to) return json(400, { ok: false, error: 'Your admin account has no email address for a test send' });
      const html = renderEpisodeEmail({ ...baseData, unsubscribeUrl: `${origin}/unsubscribe?token=preview` });
      const sent = await resendPost(RESEND_ENDPOINT, {
        from:     EPISODE_FROM,
        to,
        reply_to: EPISODE_REPLY_TO,
        subject,
        html,
        tags: [{ name: 'type', value: 'episode' }, { name: 'bakery_id', value: bakeryId }],
      });
      if (!sent) return json(502, { ok: false, mode: 'test', error: 'Test send failed' });
      return json(200, { ok: true, mode: 'test', sentTo: to });
    }

    // ── LIVE: broadcast to all subscribed subscribers ──────────────
    if (bakery.announced_at && !force) {
      return json(200, { ok: false, alreadyAnnounced: true, announcedAt: bakery.announced_at });
    }

    const { data: subs, error: subsErr } = await svc
      .from('email_subscribers')
      .select('email, unsubscribe_token')
      .eq('status', 'subscribed');

    if (subsErr) {
      console.error('[admin-send-announcement] subscriber load failed:', subsErr.message);
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
        html:     renderEpisodeEmail({ ...baseData, unsubscribeUrl }),
        headers: {
          'List-Unsubscribe':      `<${oneClickUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        tags: [{ name: 'type', value: 'episode' }, { name: 'bakery_id', value: bakeryId }],
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

    // Mark announced regardless of individual chunk outcomes so we don't re-blast.
    const { error: updErr } = await svc
      .from('bakeries_cms')
      .update({ announced_at: new Date().toISOString() })
      .eq('id', bakeryId);
    if (updErr) console.error('[admin-send-announcement] announced_at update failed:', updErr.message);

    return json(200, {
      ok: true,
      mode: 'live',
      recipientCount: recipients.length,
      chunks,
      failedChunks,
    });
  } catch (err) {
    console.error('[admin-send-announcement] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
