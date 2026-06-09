import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';
import { requireAdmin } from '../../lib/requireAdmin';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await requireAdmin(request);
  if (!auth.ok) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: auth.status });

  try {
    const serviceClient = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL as string,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const [
      { count: membersCount },
      { count: pendingCount },
      { data: recentMembers },
    ] = await Promise.all([
      serviceClient.from('profiles').select('*', { count: 'exact', head: true }),
      serviceClient.from('submissions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      serviceClient.from('profiles').select('id, display_name, created_at').order('created_at', { ascending: false }).limit(5),
    ]);

    return new Response(
      JSON.stringify({ membersCount, pendingCount, recentMembers }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[admin-dashboard] threw:', err instanceof Error ? err.message : String(err), err instanceof Error ? err.stack : '');
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 });
  }
};
