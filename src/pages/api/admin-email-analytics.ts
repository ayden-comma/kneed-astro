import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

type EventRow = {
  event_type: string;
  recipient: string | null;
  bakery_id: string | null;
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

    // Only attributable events (bakery_id present) feed per-broadcast aggregates.
    const { data: events, error: evErr } = await svc
      .from('email_events')
      .select('event_type, recipient, bakery_id, clicked_url')
      .not('bakery_id', 'is', null);
    if (evErr) {
      console.error('[admin-email-analytics] events load failed:', evErr.message);
      return json(500, { error: 'Failed to load events' });
    }

    const rows = (events ?? []) as EventRow[];

    // ── Aggregate in JS, grouped by bakery_id ──────────────────────
    type Agg = {
      bakery_id: string;
      sent: number;
      delivered: number;
      bounced: number;
      clicked_total: number;
      clickedRecipients: Set<string>;
      linkCounts: Map<string, number>;
    };
    const byBakery = new Map<string, Agg>();

    for (const r of rows) {
      const id = r.bakery_id as string;
      let a = byBakery.get(id);
      if (!a) {
        a = { bakery_id: id, sent: 0, delivered: 0, bounced: 0, clicked_total: 0, clickedRecipients: new Set(), linkCounts: new Map() };
        byBakery.set(id, a);
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

    // ── Join to bakeries_cms for name + episode_number ─────────────
    const bakeryIds = [...byBakery.keys()];
    let metaMap = new Map<string, { name: string | null; episode_number: number | null }>();
    if (bakeryIds.length > 0) {
      const { data: bakeries, error: bErr } = await svc
        .from('bakeries_cms')
        .select('id, name, episode_number')
        .in('id', bakeryIds);
      if (bErr) {
        console.error('[admin-email-analytics] bakery meta load failed:', bErr.message);
        return json(500, { error: 'Failed to load bakery metadata' });
      }
      metaMap = new Map((bakeries ?? []).map((b: any) => [b.id as string, { name: b.name ?? null, episode_number: b.episode_number ?? null }]));
    }

    const broadcasts = [...byBakery.values()].map((a) => {
      const meta = metaMap.get(a.bakery_id) ?? { name: null, episode_number: null };
      const clicked_unique = a.clickedRecipients.size;
      const topLinks = [...a.linkCounts.entries()]
        .map(([url, count]) => ({ url, count }))
        .sort((x, y) => y.count - x.count);
      return {
        bakery_id:          a.bakery_id,
        name:               meta.name,
        episode_number:     meta.episode_number,
        sent:               a.sent,
        delivered:          a.delivered,
        bounced:            a.bounced,
        clicked_unique,
        clicked_total:      a.clicked_total,
        click_through_rate: a.delivered > 0 ? clicked_unique / a.delivered : 0,
        topLinks,
      };
    });

    return json(200, { broadcasts });
  } catch (err) {
    console.error('[admin-email-analytics] threw:', err instanceof Error ? err.message : String(err));
    return json(500, { error: 'Internal server error' });
  }
};
