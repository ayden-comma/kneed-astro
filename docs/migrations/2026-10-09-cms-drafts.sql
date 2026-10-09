-- (K)Need: CMS drafts, publish history, atomic publish.   Run BEFORE deploying the draft/publish code.
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

-- 3. Publish, all or nothing. The admin API calls this one function, so the live row,
--    its map pins, clearing the draft and the history entry either all happen or none do.
--    Only columns that exist on the table and are content are written; anything else in
--    p_content is ignored. Service role only.
CREATE OR REPLACE FUNCTION public.cms_publish(
  p_table text, p_id uuid, p_content jsonb, p_locations jsonb, p_by text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $fn$
DECLARE
  v_key      text;
  v_cols     text;
  v_old_slug text;
  v_new_slug text;
  v_snapshot jsonb;
BEGIN
  IF p_table NOT IN ('bakeries_cms', 'articles_cms') THEN
    RAISE EXCEPTION 'cms_publish: unknown table %', p_table USING ERRCODE = '22023';
  END IF;
  v_key := CASE p_table WHEN 'bakeries_cms' THEN 'bakery_slug' ELSE 'article_slug' END;

  EXECUTE format('SELECT slug FROM public.%I WHERE id = $1 FOR UPDATE', p_table) INTO v_old_slug USING p_id;
  IF v_old_slug IS NULL THEN
    RAISE EXCEPTION 'cms_publish: % not found', p_id USING ERRCODE = 'P0002';
  END IF;

  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = p_table
     AND p_content ? c.column_name
     AND c.column_name NOT IN ('id', 'created_at', 'updated_at', 'published', 'published_at', 'announced_at');
  IF v_cols IS NOT NULL THEN
    EXECUTE format('UPDATE public.%1$I t SET (%2$s) = (SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1)) WHERE t.id = $2',
                   p_table, v_cols) USING p_content, p_id;
  END IF;

  EXECUTE format('UPDATE public.%I SET published = true, published_at = COALESCE(published_at, now()) WHERE id = $1 RETURNING slug', p_table)
    INTO v_new_slug USING p_id;

  EXECUTE format('DELETE FROM public.locations WHERE %I = ANY ($1)', v_key) USING ARRAY[v_old_slug, v_new_slug];
  EXECUTE format(
    'INSERT INTO public.locations (%I, label, address, lat, lng, hours, place_id, sort_order)
     SELECT $1, NULLIF(l->>''label'', ''''), NULLIF(l->>''address'', ''''), NULLIF(l->>''lat'', '''')::numeric,
            NULLIF(l->>''lng'', '''')::numeric, NULLIF(l->>''hours'', ''''), NULLIF(l->>''place_id'', ''''), (n - 1)::int
       FROM jsonb_array_elements(COALESCE($2, ''[]''::jsonb)) WITH ORDINALITY AS x(l, n)', v_key)
    USING v_new_slug, p_locations;

  DELETE FROM public.cms_drafts WHERE table_name = p_table AND record_id = p_id;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', p_table) INTO v_snapshot USING p_id;
  v_snapshot := (v_snapshot - 'id' - 'created_at' - 'updated_at' - 'published' - 'published_at' - 'announced_at')
                || jsonb_build_object('_locations', COALESCE(p_locations, '[]'::jsonb));
  INSERT INTO public.cms_revisions (table_name, record_id, slug, payload, published_by, note)
  VALUES (p_table, p_id, v_new_slug, v_snapshot, p_by, p_note);

  RETURN v_new_slug;
END
$fn$;
REVOKE ALL ON FUNCTION public.cms_publish(text, uuid, jsonb, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_publish(text, uuid, jsonb, jsonb, text, text) TO service_role;

-- 4. Baseline: one revision per currently published row, so there is always something to restore.
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
