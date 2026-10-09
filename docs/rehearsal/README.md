# CMS rehearsal

A throwaway copy of the live CMS schema for testing database changes before they
touch production. Used 2026-10-09 for the drafts, history and lockdown migrations.

- `replica.sql`: the live schema as read from production (columns, RLS policies,
  grants including Supabase's defaults, `is_admin()`, the old `updated_at` trigger)
  plus seed data: 8 bakeries (4 published), 1 article, map pins, one admin and one
  member profile. Includes a tiny `auth.uid()` stand-in.
- `cms-rehearsal.mts`: runs the real `src/lib/cmsDraft.ts` and `previewToken.ts`
  through real supabase-js against it. 54 checks.

To run it again: Postgres 16 + PostgREST 12, load `replica.sql`, apply the
migrations in `docs/migrations/` in date order, point PostgREST at it with a JWT
secret, then `npx tsx docs/rehearsal/cms-rehearsal.mts` (adjust the secret path at
the top of the script).

## Browser checks (sign-in/sign-out hardening)

`browser-hardening.mjs` drives Chromium against a local build of the site
(built with PUBLIC_SUPABASE_URL pointed at the rehearsal PostgREST, served with
`wrangler dev`). 16 checks: first click on Save/stars works and returns you to
the page after sign-in; a failed save puts the button back and says so; a stale
session sends you to sign in; /auth/logout asks instead of signing out on load;
menu Sign out works on click; the admin can't be framed by another site.
