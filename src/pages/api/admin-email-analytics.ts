import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type EventRow = {
  event_type: string;
  recipient: string | null;
  bakery_id: string | null;
  campaign_id: string | null;
  clicked_url: string | null;
};

export const GET: APIRoute = async ({ request }) => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const auth = await requireAdmin(request);
  if (!auth.ok) return json(auth.status, { error: 'Unauthorized' });

  try {
    const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    if (!serviceKey) return json(500, { error: 'Server configuration error' });
    const svc = createClient(supabaseUrl, serviceKey);

    // Attributable events carry either a bakery_id (episode) or a campaign_id (campaign).
    const { data: events, error: evErr } = await svc
      .from('email_events')
      .select('event_type, recipient, bakery_id, campaign_id, clicked_url')
      .or('bakery_id.not.is.null,campaign_id.not.is.null');
    if (evErr) {
      console.error('[admin-email-analytics] events load failed:', evErr.message);
      return json(500, { error: 'Failed to load events' });
    }

    const rows = (events ?? []) as EventRow[];

    // ── Aggregate in JS. Each broadcast is keyed by kind+id so episodes and campaigns
    //    never collide even in the unlikely event of a shared UUID. ──────────────────
    type Agg = {
      kind: 'episode' | 'campaign';
      id: string;
      sent: number;
      delivered: number;
      bounced: number;
      clicked_total: number;
      clickedRecipients: Set<string>;
      linkCounts: Map<string, number>;
    };
    const byBroadcast = new Map<string, Agg>();

    for (const r of rows) {
      const kind: 'episode' | 'campaign' = r.bakery_id ? 'episode' : 'campaign';
      const id = (r.bakery_id ?? r.campaign_id) as string | null;
      if (!id) continue;
      const key = `${kind}:${id}`;
      let a = byBroadcast.get(key);
      if (!a) {
        a = { kind, id, sent: 0, delivered: 0, bounced: 0, clicked_total: 0, clickedRecipients: new Set(), linkCounts: new Map() };
        byBroadcast.set(key, a);
      }
      switch (r.event_type) {
        case 'sent':      a.sent++; break;
        case 'delivered': a.delivered++; break;
        case 'bounced':   a.bounced++; break;
        case 'clicked':
          a.clicked_total++;
          if (r.recipient) a.clickedRecipients.add(r.recipient);
          if (r.clicked_url) a.linkCounts.set(r.clicked_url, (a.linkCounts.get(r.clicked_url) ?? 0) + 1);
          break;
      }
    }

    // ── Join to bakeries_cms (episode name + number) and campaigns (subject) ──
    const aggs = [...byBroadcast.values()];
    const bakeryIds   = aggs.filter(a => a.kind === 'episode').map(a => a.id);
    const campaignIds = aggs.filter(a => a.kind === 'campaign').map(a => a.id);

    const bakeryMeta = new Map<string, { name: string | null; episode_number: number | null }>();
    if (bakeryIds.length > 0) {
      const { data: bakeries, error: bErr } = await svc
        .from('bakeries_cms')
        .select('id, name, episode_number')
        .in('id', bakeryIds);
      if (bErr) {
        console.error('[admin-email-analytics] bakery meta load failed:', bErr.message);
        return json(500, { error: 'Failed to load bakery metadata' });
      }
      for (const b of (bakeries ?? []) as any[]) bakeryMeta.set(b.id as string, { name: b.name ?? null, episode_number: b.episode_number ?? null });
    }

    const campaignMeta = new Map<string, { subject: string | null }>();
    if (campaignIds.length > 0) {
      const { data: camps, error: cErr } = await svc
        .from('campaigns')
        .select('id, subject')
        .in('id', campaignIds);
      if (cErr) {
        console.error('[admin-email-analytics] campaign meta load failed:', cErr.message);
        return json(500, { error: 'Failed to load campaign metadata' });
      }
      for (const c of (camps ?? []) as any[]) campaignMeta.set(c.id as string, { subject: c.subject ?? null });
    }

    const broadcasts = aggs.map((a) => {
      const clicked_unique = a.clickedRecipients.size;
      const links = [...a.linkCounts.entries()]
        .map(([url, count]) => ({ url, count }))
        .sort((x, y) => y.count - x.count);
      const name = a.kind === 'episode'
        ? (bakeryMeta.get(a.id)?.name ?? null)
        : (campaignMeta.get(a.id)?.subject ?? null);
      const episode_number = a.kind === 'episode' ? (bakeryMeta.get(a.id)?.episode_number ?? null) : null;
      return {
        kind:               a.kind,
        id:                 a.id,
        name,
        episode_number,
        sent:               a.sent,
        delivered:          a.delivered,
        bounced:            a.bounced,
        clicked_unique,
        clicked_total:      a.clicked_total,
        click_through_rate: a.delivered > 0 ? clicked_unique / a.delivered : 0,
        links,
      };
    });

    return json(200, { broadcasts });
  } catch (err) {
    console.error('[admin-email-analytics] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
