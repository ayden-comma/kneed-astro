// Draft / publish / revision logic shared by the bakeries and articles CMS routes.
//
// The rule: once a row is published, its live columns only change on Publish.
// Edits in between are stored whole in the private `cms_drafts` table
// (including the locations list as `_locations`), which only the service role
// can read, so pending edits never leak through the public API. Rows that have
// never been published have no live page to protect, so their edits are
// written straight to the row.
//
// Every publish appends a full snapshot to `cms_revisions` (also service role
// only), which is what "History → Restore" loads back into the draft. Publish
// runs as one database function (`cms_publish`), so it can't half-finish.

import type { SupabaseClient } from '@supabase/supabase-js';

export type CmsTable = 'bakeries_cms' | 'articles_cms';

export type LocationInput = {
  label?: string | null; address?: string | null; lat?: number | null; lng?: number | null;
  hours?: string | null; place_id?: string | null;
};

type Draft = { payload: Record<string, any>; updated_at: string; updated_by: string | null };

// Columns that are never content: system, status and draft bookkeeping.
const NON_CONTENT = new Set([
  'id', 'created_at', 'updated_at', 'published', 'published_at', 'announced_at', '_locations',
  // Legacy names from the first version of this feature; ignored if a client still sends them.
  'draft_payload', 'draft_updated_at',
]);

function contentOnly(obj: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (!NON_CONTENT.has(k)) out[k] = v;
  return out;
}

function slugKey(table: CmsTable) {
  return table === 'bakeries_cms' ? 'bakery_slug' : 'article_slug';
}

export async function readLocations(db: SupabaseClient, table: CmsTable, slug: string) {
  const { data } = await db.from('locations')
    .select('label, address, lat, lng, hours, place_id')
    .eq(slugKey(table), slug).order('sort_order');
  return (data ?? []) as LocationInput[];
}

async function writeLocations(db: SupabaseClient, table: CmsTable, slug: string, locations: LocationInput[], oldSlug?: string) {
  const key = slugKey(table);
  const slugs = oldSlug && oldSlug !== slug ? [slug, oldSlug] : [slug];
  const { error: delErr } = await db.from('locations').delete().in(key, slugs);
  if (delErr) throw new HttpError(500, delErr.message);
  if (!locations.length) return;
  const rows = locations.map((l, i) => ({
    [key]: slug, label: l.label || null, address: l.address || null,
    lat: l.lat || null, lng: l.lng || null, hours: l.hours || null,
    place_id: l.place_id || null, sort_order: i,
  }));
  const { error } = await db.from('locations').insert(rows);
  if (error) throw new HttpError(500, error.message);
}

async function getRow(db: SupabaseClient, table: CmsTable, id: string) {
  const { data, error } = await db.from(table).select('*').eq('id', id).single();
  if (error || !data) throw new HttpError(404, error?.message ?? 'Not found');
  return data as Record<string, any>;
}

export async function getDraft(db: SupabaseClient, table: CmsTable, id: string): Promise<Draft | null> {
  const { data, error } = await db.from('cms_drafts')
    .select('payload, updated_at, updated_by')
    .eq('table_name', table).eq('record_id', id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return (data as Draft | null) ?? null;
}

async function putDraft(db: SupabaseClient, table: CmsTable, id: string, payload: Record<string, unknown>, by?: string) {
  const { error } = await db.from('cms_drafts').upsert({
    table_name: table, record_id: id, payload,
    updated_at: new Date().toISOString(), updated_by: by ?? null,
  }, { onConflict: 'table_name,record_id' });
  if (error) throw new HttpError(500, error.message);
}

async function dropDraft(db: SupabaseClient, table: CmsTable, id: string) {
  const { error } = await db.from('cms_drafts').delete().eq('table_name', table).eq('record_id', id);
  if (error) throw new HttpError(500, error.message);
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Ctx = { db: SupabaseClient; table: CmsTable; userEmail?: string };

/** Save from the editor. Published rows → draft only. Unpublished rows → written directly. */
export async function saveCms({ db, table, userEmail }: Ctx, id: string, payload: Record<string, unknown>, locations?: LocationInput[]) {
  const row = await getRow(db, table, id);
  const content = contentOnly(payload);

  if (row.published) {
    const existing = locations ? null : await getDraft(db, table, id);
    const locs = locations ?? existing?.payload?._locations ?? await readLocations(db, table, row.slug);
    await putDraft(db, table, id, { ...content, _locations: locs }, userEmail);
    return { mode: 'draft' as const };
  }

  const { error } = await db.from(table).update(content).eq('id', id);
  if (error) throw new HttpError(500, error.message);
  // Clear any draft left over from when the row was live, so it can't shadow this save.
  await dropDraft(db, table, id);
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
  const draft = (await getDraft(db, table, id))?.payload ?? null;

  const content = payload ? contentOnly(payload) : draft ? contentOnly(draft) : contentOnly(row);
  const locs: LocationInput[] = locations
    ?? (payload ? undefined : draft?._locations)
    ?? await readLocations(db, table, row.slug);

  // One database call, one transaction: row, map pins, draft clear and history entry
  // all land together or not at all (public.cms_publish in the drafts migration).
  const { data: newSlug, error } = await db.rpc('cms_publish', {
    p_table: table, p_id: id, p_content: content, p_locations: locs,
    p_by: userEmail ?? null, p_note: note ?? null,
  });
  if (error) throw new HttpError(500, error.message);
  return { slug: String(newSlug ?? content.slug ?? row.slug) };
}

/** Take the page offline. Any pending draft is kept. */
export async function unpublishCms({ db, table }: Ctx, id: string) {
  const { error } = await db.from(table).update({ published: false }).eq('id', id);
  if (error) throw new HttpError(500, error.message);
}

export async function discardDraftCms({ db, table }: Ctx, id: string) {
  await dropDraft(db, table, id);
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

/** Everything the editor needs to open one item: live row, its draft (if any), and the locations to show. */
export async function getForEditor({ db, table }: Ctx, id: string) {
  const row = await getRow(db, table, id);
  const draft = await getDraft(db, table, id);
  const locations = (draft?.payload?._locations as LocationInput[] | undefined) ?? await readLocations(db, table, row.slug);
  return {
    row,
    draft: draft ? { payload: draft.payload, updated_at: draft.updated_at, updated_by: draft.updated_by } : null,
    locations,
  };
}

/** Ids of rows with a pending draft, for the "Changes pending" tag in the list. */
export async function pendingIds({ db, table }: Ctx) {
  const { data, error } = await db.from('cms_drafts').select('record_id, updated_at').eq('table_name', table);
  if (error) throw new HttpError(500, error.message);
  return (data ?? []) as { record_id: string; updated_at: string }[];
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
    case 'get':       return getForEditor(ctx, req(body.id));
    case 'pending':   return { pending: await pendingIds(ctx) };
    case 'delete': {
      const id = req(body.id);
      const { error } = await db.from(table).delete().eq('id', id);
      if (error) throw new HttpError(500, error.message);
      await dropDraft(db, table, id);   // revisions are kept: they're the audit trail
      return { ok: true };
    }
    default: throw new HttpError(400, 'Invalid action');
  }
}

function req(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new HttpError(400, 'Missing id');
  return v;
}

/** Overlay a draft payload on a row's live content. Used by preview and the editor. */
export function withDraft<T extends Record<string, any>>(row: T, draftPayload?: Record<string, any> | null): T {
  if (!draftPayload) return row;
  const { _locations, ...rest } = draftPayload;
  return { ...row, ...rest };
}
