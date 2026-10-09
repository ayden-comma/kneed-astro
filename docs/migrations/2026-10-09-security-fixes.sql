-- (K)Need: security fixes from the 2026-10-09 access audit.
-- Independent of the CMS migrations: run any time, before or after deploying.
-- Safe to run twice. Rollback block at the bottom.
--
-- 1. CRITICAL: any signed-in member could make themselves admin.
--    The "Users can update their own profile" policy checks only that the row is
--    yours, and `authenticated` held UPDATE on every column of profiles, including
--    `role`. One line in the browser console (public key + your own session) set
--    role = 'admin', and every /api/admin-* route trusts profiles.role. Sign-up is
--    reachable while the gate is on (/auth/ bypasses it).
--    Checked 2026-10-09 (read-only): not exploited. 1 admin (created 2026-06-08),
--    1 member, 2 auth users in total.
--    Fix: members may update only the columns the profile page actually edits, and
--    a trigger refuses changes to role / deleted_at / id / created_at from member
--    sessions even if someone widens the grants again later (the Supabase table
--    editor can do that). The admin API uses the service role and is unaffected.
--
-- 2. Comments had no size cap and no rate limit: one account could post
--    megabytes, or thousands of comments, through the public API. Adds a
--    2,000-character cap and 10 comments (including replies) per rolling hour.
--    Applies to new comments only (there are 0 today), so it can't fail on old rows.
--
-- 3. Housekeeping: TRUNCATE ignores row-level security entirely. It isn't
--    reachable through the website's API, but the public roles had it on almost
--    every table. Removed.

BEGIN;

-- ── 1. Profiles ──────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, username, bio, avatar_url,
              demographics_consent, demographics_consent_at,
              date_of_birth, gender, location, newsletter_prompted_at)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  -- current_user is the API role for the request: 'anon' / 'authenticated' for
  -- browser sessions, 'service_role' for the admin API, 'postgres' in the SQL editor.
  IF current_user IN ('anon', 'authenticated') AND (
       NEW.role       IS DISTINCT FROM OLD.role
    OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    OR NEW.id         IS DISTINCT FROM OLD.id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'not allowed to change this profile field'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS profiles_guard_privileged ON public.profiles;
CREATE TRIGGER profiles_guard_privileged BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged();

-- ── 2. Comments ──────────────────────────────────────────────────────────────
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_length;
ALTER TABLE public.comments ADD CONSTRAINT comments_content_length
  CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;
-- NOT VALID: enforced for every new or edited comment, without re-checking existing
-- rows, so a long comment posted before this runs can't make the migration fail.

CREATE INDEX IF NOT EXISTS comments_user_recent_idx ON public.comments (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.comments_rate_limit() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    SELECT count(*) FROM public.comments
     WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour'
  ) >= 10 THEN
    -- The site matches on 'rate_limited' to show a friendly message.
    RAISE EXCEPTION 'rate_limited: too many comments in the last hour'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS comments_rate_limit ON public.comments;
CREATE TRIGGER comments_rate_limit BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_rate_limit();

-- ── 3. TRUNCATE off for the public roles everywhere ──────────────────────────
DO $do$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON public.%I FROM anon, authenticated', t.relname);
  END LOOP;
END
$do$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Check afterwards (read-only):
--   select column_name from information_schema.column_privileges
--    where table_name = 'profiles' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by 1;
--     → the 10 columns above, and NOT role / deleted_at / id / created_at
--   select tgname from pg_trigger where tgrelid in ('public.profiles'::regclass, 'public.comments'::regclass) and not tgisinternal;
--     → profiles_guard_privileged, comments_rate_limit
--   Then: edit your own profile on /profile/edit (should save), post a comment (should post).
--
-- ROLLBACK:
--   BEGIN;
--   DROP TRIGGER IF EXISTS profiles_guard_privileged ON public.profiles;
--   DROP FUNCTION IF EXISTS public.profiles_guard_privileged();
--   GRANT UPDATE ON public.profiles TO authenticated;   -- NB: restores the hole in item 1
--   DROP TRIGGER IF EXISTS comments_rate_limit ON public.comments;
--   DROP FUNCTION IF EXISTS public.comments_rate_limit();
--   ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_length;
--   COMMIT;
