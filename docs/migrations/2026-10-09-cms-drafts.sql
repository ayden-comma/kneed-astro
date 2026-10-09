BEGIN;

-- 1. Draft columns. Edits to a published page land here; the live columns stay untouched until Publish.
ALTER TABLE public.bakeries_cms
  ADD COLUMN IF NOT EXISTS draft_payload jsonb,
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz;
ALTER TABLE public.articles_cms
  ADD COLUMN IF NOT EXISTS draft_payload jsonb,
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz;

-- 2. updated_at only moves when live content changes, so saving a draft does not reorder
--    the public article list (kneed-to-know orders by updated_at).
CREATE OR REPLACE FUNCTION public.cms_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF (to_jsonb(NEW) - 'draft_payload' - 'draft_updated_at' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'draft_payload' - 'draft_updated_at' - 'updated_at') THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_bakeries_updated_at ON public.bakeries_cms;
CREATE TRIGGER trg_bakeries_updated_at BEFORE UPDATE ON public.bakeries_cms
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();
DROP TRIGGER IF EXISTS trg_articles_updated_at ON public.articles_cms;
CREATE TRIGGER trg_articles_updated_at BEFORE UPDATE ON public.articles_cms
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

-- 3. Append-only publish history. Service role only (RLS on, no policies, no grants).
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

-- 4. Baseline: one revision per currently published row, so there is always something to revert to.
INSERT INTO public.cms_revisions (table_name, record_id, slug, payload, published_by, note)
SELECT 'bakeries_cms', b.id, b.slug,
  (to_jsonb(b) - 'id' - 'created_at' - 'updated_at' - 'published' - 'published_at'
               - 'announced_at' - 'draft_payload' - 'draft_updated_at')
  || jsonb_build_object('_locations', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('label',l.label,'address',l.address,'lat',l.lat,'lng',l.lng,'hours',l.hours,'place_id',l.place_id) ORDER BY l.sort_order)
       FROM public.locations l WHERE l.bakery_slug = b.slug), '[]'::jsonb)),
  'system', 'Baseline at migration'
FROM public.bakeries_cms b WHERE b.published;

INSERT INTO public.cms_revisions (table_name, record_id, slug, payload, published_by, note)
SELECT 'articles_cms', a.id, a.slug,
  (to_jsonb(a) - 'id' - 'created_at' - 'updated_at' - 'published' - 'published_at'
               - 'draft_payload' - 'draft_updated_at')
  || jsonb_build_object('_locations', COALESCE((
       SELECT jsonb_agg(jsonb_build_object('label',l.label,'address',l.address,'lat',l.lat,'lng',l.lng,'hours',l.hours,'place_id',l.place_id) ORDER BY l.sort_order)
       FROM public.locations l WHERE l.article_slug = a.slug), '[]'::jsonb)),
  'system', 'Baseline at migration'
FROM public.articles_cms a WHERE a.published;

COMMIT;

NOTIFY pgrst, 'reload schema';
