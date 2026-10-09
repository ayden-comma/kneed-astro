-- (K)Need: lock unpublished content away from the public API.   Run AFTER the draft/publish
-- code is deployed (the old ?preview=true page reads unpublished rows with the public key and
-- would 404 once this runs; the new signed-preview page reads with the service role instead).
--
-- Before: the public key could read EVERY bakery/article row, published or not, and every
-- location. After:
--   * public (anon + ordinary signed-in members): published rows only, and only the
--     locations that belong to a published bakery/article;
--   * admins (profiles.role = 'admin', via the existing public.is_admin()): everything, so
--     the admin screens keep working unchanged;
--   * nobody but the service role (the admin API) can write these tables. The write grants
--     the public roles held were already blocked by RLS; removing them is belt and braces.
--     TRUNCATE is not covered by RLS at all, so that grant mattered more.
--
-- Safe to run twice. Undo: see the ROLLBACK block at the bottom.

BEGIN;

-- Bakeries
DROP POLICY IF EXISTS "Public read"          ON public.bakeries_cms;
DROP POLICY IF EXISTS "Read published"       ON public.bakeries_cms;
DROP POLICY IF EXISTS "Admins read all"      ON public.bakeries_cms;
CREATE POLICY "Read published"  ON public.bakeries_cms FOR SELECT USING (published);
CREATE POLICY "Admins read all" ON public.bakeries_cms FOR SELECT TO authenticated USING (public.is_admin());

-- Articles
DROP POLICY IF EXISTS "Public read"          ON public.articles_cms;
DROP POLICY IF EXISTS "Read published"       ON public.articles_cms;
DROP POLICY IF EXISTS "Admins read all"      ON public.articles_cms;
CREATE POLICY "Read published"  ON public.articles_cms FOR SELECT USING (published);
CREATE POLICY "Admins read all" ON public.articles_cms FOR SELECT TO authenticated USING (public.is_admin());

-- Locations: visible when their bakery/article is visible.
DROP POLICY IF EXISTS "Public read"          ON public.locations;
DROP POLICY IF EXISTS "Read published"       ON public.locations;
DROP POLICY IF EXISTS "Admins read all"      ON public.locations;
-- "Authenticated write" let any signed-in member write locations. It was inert only because
-- authenticated has no INSERT/UPDATE/DELETE grant on the table; dropping it so it can't
-- become live if grants ever change. Writes go through the admin API (service role).
DROP POLICY IF EXISTS "Authenticated write"  ON public.locations;
CREATE POLICY "Read published" ON public.locations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.bakeries_cms b WHERE b.slug = locations.bakery_slug  AND b.published)
  OR EXISTS (SELECT 1 FROM public.articles_cms a WHERE a.slug = locations.article_slug AND a.published)
);
CREATE POLICY "Admins read all" ON public.locations FOR SELECT TO authenticated USING (public.is_admin());

-- Writes: service role only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bakeries_cms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.articles_cms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.locations    FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Check afterwards (read-only):
--   select tablename, policyname, roles, qual from pg_policies
--    where tablename in ('bakeries_cms','articles_cms','locations') order by 1, 2;
--   Then load kneed.tv/bakeries signed out: the 4 published bakeries, map pins present.
--   And /admin/bakeries signed in as admin: all 8 rows.
--
-- ROLLBACK (restores the previous open-read behaviour; grants come back as they were):
--   BEGIN;
--   DROP POLICY IF EXISTS "Read published"  ON public.bakeries_cms;
--   DROP POLICY IF EXISTS "Admins read all" ON public.bakeries_cms;
--   CREATE POLICY "Public read" ON public.bakeries_cms FOR SELECT USING (true);
--   DROP POLICY IF EXISTS "Read published"  ON public.articles_cms;
--   DROP POLICY IF EXISTS "Admins read all" ON public.articles_cms;
--   CREATE POLICY "Public read" ON public.articles_cms FOR SELECT USING (true);
--   DROP POLICY IF EXISTS "Read published"  ON public.locations;
--   DROP POLICY IF EXISTS "Admins read all" ON public.locations;
--   CREATE POLICY "Public read" ON public.locations FOR SELECT USING (true);
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.bakeries_cms, public.articles_cms TO anon, authenticated;
--   GRANT TRUNCATE ON public.locations TO anon, authenticated;
--   COMMIT;
