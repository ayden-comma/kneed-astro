import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;

  if (!serviceKey) {
    return new Response(JSON.stringify({ error: 'Service key not configured' }), { status: 500 });
  }

  const adminSupabase = createClient(supabaseUrl, serviceKey);
  const body = await request.json();
  const { action } = body;

  if (!action) {
    return new Response(JSON.stringify({ error: 'Missing action' }), { status: 400 });
  }

  if (action === 'add') {
    const { bakery_slug, article_slug, content_type = 'bakery', sort_order } = body;

    if (content_type === 'article') {
      if (!article_slug) return new Response(JSON.stringify({ error: 'Missing article_slug' }), { status: 400 });
      const { data: existing } = await adminSupabase
        .from('hero_features')
        .select('id')
        .eq('article_slug', article_slug)
        .maybeSingle();
      if (existing) {
        const { error } = await adminSupabase
          .from('hero_features')
          .update({ active: true, sort_order, content_type: 'article' })
          .eq('id', (existing as any).id);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      } else {
        const { error } = await adminSupabase
          .from('hero_features')
          .insert({ article_slug, content_type: 'article', active: true, sort_order });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }
    } else {
      if (!bakery_slug) return new Response(JSON.stringify({ error: 'Missing bakery_slug' }), { status: 400 });
      const { error } = await adminSupabase
        .from('hero_features')
        .upsert({ bakery_slug, content_type: 'bakery', active: true, sort_order }, { onConflict: 'bakery_slug' });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (action === 'remove') {
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
    const { error } = await adminSupabase
      .from('hero_features')
      .update({ active: false })
      .eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  if (action === 'reorder') {
    const { id, sort_order } = body;
    const { error } = await adminSupabase
      .from('hero_features')
      .update({ sort_order })
      .eq('id', id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
};
