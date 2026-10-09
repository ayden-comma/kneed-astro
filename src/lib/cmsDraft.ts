// Draft / publish / revision logic shared by the bakeries and articles CMS routes.
//
// The rule: once a row is published, the live columns only change on Publish.
// Edits in between are stored whole in `draft_payload` (including the locations
// list as `_locations`). Rows that have never been published have no live page
// to protect, so their edits are written straight to the row.
//
// Every publish appends a full snapshot to `cms_revisions`, which is what
// "History → Restore" loads back into the draft.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CmsTable = 'bakeries_cms' | 'articles_cms';

export type LocationInput = {
  label?: string | null; address?: string | null; lat?: number | null; lng?: number | null;
  hours?: string | null; place_id?: string | null;
};

// Columns that are never content: system, status and draft bookkeeping.
const NON_CONTENT = new Set([
  'id', 'created_at', 'updated_at', 'published', 'published_at', 'announced_at',
  'draft_payload', 'draft_updated_at', '_locations',
]);

function contentOnly(obj: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (!NON_CONTENT.has(k)) out[k] = v;
  return out;
}

function slugKey(table: CmsTable) {
  return table === 'bakeries_cms' ? 'bakery_slug' : 'article_slug';
}

async function readLocations(db: SupabaseClient, table: CmsTable, slug: string) {
  const { data } = await db.from('locations')
    .select('label, address, lat, lng, hours, place_id')
    .eq(slugKey(table), slug).order('sort_order');
  return (data ?? []) as LocationInput[];
}

async function writeLocations(db: SupabaseClient, table: CmsTable, slug: string, locations: LocationInput[], oldSlug?: string) {
  const key = slugKey(table);
  const slugs = oldSlug && oldSlug !== slug ? [slug, oldSlug] : [slug];
  const { error: delErr } = await db.from('locations').delete().in(key, slugs);
  if (delErr) throw new Error(delErr.message);
  if (!locations.length) return;
  const rows = locations.map((l, i) => ({
    [key]: slug, label: l.label || null, address: l.address || null,
    lat: l.lat || null, lng: l.lng || null, hours: l.hours || null,
    place_id: l.place_id || null, sort_order: i,
  }));
  const { error } = await db.from('locations').insert(rows);
  if (error) throw new Error(error.message);
}

async function getRow(db: SupabaseClient, table: CmsTable, id: string) {
  const { data, error } = await db.from(table).select('*').eq('id', id).single();
  if (error || !data) throw new HttpError(404, error?.message ?? 'Not found');
  return data as Record<string, any>;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Ctx = { db: SupabaseClient; table: CmsTable; userEmail?: string };

/** Save from the editor. Published rows → draft only. Unpublished rows → written directly. */
export async function saveCms({ db, table }: Ctx, id: string, payload: Record<string, unknown>, locations?: LocationInput[]) {
  const row = await getRow(db, table, id);
  const content = contentOnly(payload);

  if (row.published) {
    const draft = { ...content, _locations: locations ?? (row.draft_payload?._locations ?? await readLocations(db, table, row.slug)) };
    const { error } = await db.from(table)
      .update({ draft_payload: draft, draft_updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new HttpError(500, error.message);
    return { mode: 'draft' as const };
  }

  // Clear any draft left over from when the row was live, so it can't shadow this save.
  const { error } = await db.from(table).update({ ...content, draft_payload: null, draft_updated_at: null }).eq('id', id);
  if (error) throw new HttpError(500, error.message);
  if (locations) await writeLocations(db, table, String(content.slug ?? row.slug), locations, row.slug);
  return { mode: 'direct' as const };
}

/** New row. Always starts unpublished. */
export async function insertCms({ db, table }: Ctx, payload: Record<string, unknown>, locations?: LocationInput[]) {
  const content = contentOnly(payload);
  const { data, error } = await db.from(table).insert({ ...content, published: false }).select('id, slug').single();
  if (error || !data) throw new HttpError(500, error?.message ?? 'Insert failed');
  if (locations) await writeLocations(db, table, (data as any).slug, locations);
  return { id: (data as any).id as string };
}

/**
 * Publish. Content source, in order: the payload sent from the editor (what's on
 * screen), else the stored draft, else the current row (a plain re-publish).
 */
export async function publishCms({ db, table, userEmail }: Ctx, id: string, payload?: Record<string, unknown>, locations?: LocationInput[], note?: string) {
  const row = await getRow(db, table, id);
  const draft = row.draft_payload as Record<string, any> | null;

  const content = payload ? contentOnly(payload) : draft ? contentOnly(draft) : contentOnly(row);
  const locs: LocationInput[] = locations
    ?? (payload ? undefined : draft?._locations)
    ?? await readLocations(db, table, row.slug);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    ...content,
    published: true,
    draft_payload: null,
    draft_updated_at: null,
  };
  if (!row.published_at) update.published_at = now;

  const { error } = await db.from(table).update(update).eq('id', id);
  if (error) throw new HttpError(500, error.message);

  const newSlug = String(content.slug ?? row.slug);
  await writeLocations(db, table, newSlug, locs, row.slug);

  // Snapshot what is now live. Full row content, so a restore needs nothing else.
  const snapshot = { ...contentOnly({ ...row, ...content }), _locations: locs };
  const { error: revErr } = await db.from('cms_revisions').insert({
    table_name: table, record_id: id, slug: newSlug, payload: snapshot,
    published_by: userEmail ?? null, note: note ?? null,
  });
  if (revErr) console.error('[cmsDraft] revision insert failed:', revErr.message);

  return { slug: newSlug };
}

/** Take the page offline. Any pending draft is kept. */
export async function unpublishCms({ db, table }: Ctx, id: string) {
  const { error } = await db.from(table).update({ published: false }).eq('id', id);
  if (error) throw new HttpError(500, error.message);
}

export async function discardDraftCms({ db, table }: Ctx, id: string) {
  const { error } = await db.from(table).update({ draft_payload: null, draft_updated_at: null }).eq('id', id);
  if (error) throw new HttpError(500, error.message);
}

export async function listRevisionsCms({ db, table }: Ctx, id: string) {
  const { data, error } = await db.from('cms_revisions')
    .select('id, slug, published_at, published_by, note')
    .eq('table_name', table).eq('record_id', id)
    .order('published_at', { ascending: false }).limit(50);
  if (error) throw new HttpError(500, error.message);
  return data ?? [];
}

/**
 * Restore a revision into the draft (published rows) or the row itself
 * (unpublished rows). Nothing goes live until Publish.
 */
export async function revertCms(ctx: Ctx, id: string, revisionId: string) {
  const { db, table } = ctx;
  const { data: rev, error } = await db.from('cms_revisions')
    .select('payload, record_id, table_name').eq('id', revisionId).single();
  if (error || !rev) throw new HttpError(404, error?.message ?? 'Revision not found');
  if ((rev as any).record_id !== id || (rev as any).table_name !== table) throw new HttpError(400, 'Revision does not belong to this item');
  const payload = (rev as any).payload as Record<string, any>;
  return saveCms(ctx, id, payload, (payload._locations ?? []) as LocationInput[]);
}

/** Shared POST dispatcher for both CMS routes. */
export async function handleCmsAction(ctx: Ctx, body: any) {
  const { db, table } = ctx;
  switch (body?.action) {
    case 'insert':    return insertCms(ctx, body.payload ?? {}, body.locations);
    case 'save':      return saveCms(ctx, req(body.id), body.payload ?? {}, body.locations);
    case 'publish':   return publishCms(ctx, req(body.id), body.payload, body.locations, body.note);
    case 'unpublish': await unpublishCms(ctx, req(body.id)); return { ok: true };
    case 'discard':   await discardDraftCms(ctx, req(body.id)); return { ok: true };
    case 'revisions': return { revisions: await listRevisionsCms(ctx, req(body.id)) };
    case 'revert':    return revertCms(ctx, req(body.id), req(body.revision_id));
    case 'delete': {
      const { error } = await db.from(table).delete().eq('id', req(body.id));
      if (error) throw new HttpError(500, error.message);
      return { ok: true };
    }
    default: throw new HttpError(400, 'Invalid action');
  }
}

function req(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new HttpError(400, 'Missing id');
  return v;
}

/** Overlay a row's draft on its live content. Used by ?preview=true and the editor. */
export function withDraft<T extends Record<string, any>>(row: T): T {
  if (!row?.draft_payload) return row;
  const { _locations, ...rest } = row.draft_payload as Record<string, any>;
  return { ...row, ...rest };
}
