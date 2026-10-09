-- (K)Need: clear stored IP addresses after 30 days.          Run any time; independent of everything else.
--
-- Why: the privacy policy says the IP recorded with a bakery submission or newsletter
-- signup is "kept only as long as needed for spam prevention". The spam checks
-- (src/pages/api/submit-bakery.ts, newsletter-signup.ts) only look back one hour, but
-- nothing ever deleted the IPs, so in practice they were kept forever. This makes the
-- policy true, and lets it state a fixed period if you want it to.
--
-- What: a nightly database job (pg_cron, built into Supabase) blanks ip_address on
-- submissions and newsletter subscribers older than 30 days. Nothing else in those rows
-- changes. It also runs once now: as of 2026-10-09 that clears 3 subscriber IPs (the
-- oldest from 2026-08-09); submissions have none.
--
-- Safe to run twice (the job is replaced by name, not duplicated).
-- Undo: SELECT cron.unschedule('kneed-clear-old-ips');

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.clear_old_ip_addresses() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $fn$
  UPDATE public.submissions
     SET ip_address = NULL
   WHERE ip_address IS NOT NULL AND created_at < now() - interval '30 days';
  UPDATE public.email_subscribers
     SET ip_address = NULL
   WHERE ip_address IS NOT NULL AND created_at < now() - interval '30 days';
$fn$;
REVOKE ALL ON FUNCTION public.clear_old_ip_addresses() FROM PUBLIC, anon, authenticated;

-- 03:17 UTC daily (early afternoon Melbourne), off the top of the hour.
SELECT cron.schedule('kneed-clear-old-ips', '17 3 * * *', 'SELECT public.clear_old_ip_addresses()');

-- Clear the backlog now rather than waiting for tonight.
SELECT public.clear_old_ip_addresses();

-- Check afterwards (read-only):
--   select jobname, schedule, command, active from cron.job where jobname = 'kneed-clear-old-ips';
--   select count(*) from public.email_subscribers where ip_address is not null and created_at < now() - interval '30 days';  -- expect 0
--   After the first night: select status, start_time from cron.job_run_details order by start_time desc limit 3;
