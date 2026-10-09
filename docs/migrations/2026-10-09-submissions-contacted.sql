-- (K)Need: remember when a bakery suggestion was contacted.   Run any time.
-- The Submissions screen stamps this when you click Contact and shows "Contacted <date>".
-- Until this runs, the screen works as before and simply doesn't record it.
-- Nullable; null = not contacted. Safe to run twice.
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS contacted_at timestamptz;
NOTIFY pgrst, 'reload schema';
