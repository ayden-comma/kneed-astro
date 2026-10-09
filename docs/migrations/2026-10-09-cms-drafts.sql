-- (K)Need: CMS drafts + publish history.             Run BEFORE deploying the draft/publish code.
-- Safe to run twice. Additive only: no existing column, policy or trigger is changed.

BEGIN;

-- 1. Drafts. Edits to a published page are stored here until Publish; the live row is untouched.
--    Private: RLS on with no policies and no grants for anon/authenticated, so only the
--    service role (the admin API) can read or write it. Pending edits never reach the public API.
CREATE TABLE IF NOT EXISTS public.cms_drafts (
  table_name  text NOT NULL CHECK (table_name IN ('bakeries_cms','articles_cms')),
  record_id   uuid NOT NULL,
  payload     jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text,
  PRIMARY KEY (table_name, record_id)
);
ALTER TABLE public.cms_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cms_drafts FROM anon, authenticated;
GRANT ALL ON public.cms_drafts TO service_role;

-- 2. Publish history. Append-only snapshot per publish; History → Restore reads from here.
CREATE TABLE IF NOT EXISTS public.cms_revisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name   text NOT NULL CHECK (table_name IN ('bakeries_cms','articles_cms')),
  record_id    uuid NOT NULL,
  slug         text,
  payload      jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text,
  note         text
);
CREATE INDEX IF NOT EXISTS cms_revisions_record_idx
  ON public.cms_revisions (table_name, record_id, published_at DESC);
ALTER TABLE public.cms_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cms_revisions FROM anon, authenticated;
GRANT ALL ON public.cms_revisions TO service_role;

-- 3. Baseline: one revision per currently published row, so there is always something to restore.
--    Skips rows that already have one, so running this file twice is harmless.
INSERT INTO public.cms_revisions (table_name, record_id, slug, payload, published_by, note)
SELECT 'bakeries_cms', b.id, b.slug,
  (to_jsonb(b) - 'id' - 'created_at' - 'updated_at' - 'published' - 'published_at' - 'announced_at')
  || jsonb_build_object('_locations', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('label',l.label,'address',l.address,'lat',l.lat,'lng',l.lng,'hours',l.hours,'place_id',l.place_id) ORDER BY l.sort_order)
       FROM public.locations l WHERE l.bakery_slug = b.slug), '[]'::jsonb)),
  'system', 'Baseline at migration'
FROM public.bakeries_cms b WHERE b.published
  AND NOT EXISTS (SELECT 1 FROM public.cms_revisions r WHERE r.record_id = b.id);

INSERT INTO public.cms_revisions (table_name, record_id, slug, payload, published_by, note)
SELECT 'articles_cms', a.id, a.slug,
  (to_jsonb(a) - 'id' - 'created_at' - 'updated_at' - 'published' - 'published_at')
  || jsonb_build_object('_locations', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('label',l.label,'address',l.address,'lat',l.lat,'lng',l.lng,'hours',l.hours,'place_id',l.place_id) ORDER BY l.sort_order)
       FROM public.locations l WHERE l.article_slug = a.slug), '[]'::jsonb)),
  'system', 'Baseline at migration'
FROM public.articles_cms a WHERE a.published
  AND NOT EXISTS (SELECT 1 FROM public.cms_revisions r WHERE r.record_id = a.id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Check afterwards (read-only):
--   select table_name, count(*) from public.cms_revisions group by 1;   -- expect bakeries_cms 4, articles_cms 1
--   select count(*) from public.cms_drafts;                              -- expect 0
