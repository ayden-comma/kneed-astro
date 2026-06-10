# Project Handoff Notes

_Last updated: 2026-06-10_

---

## Database permissions — current state

Grants restored to least-privilege map after an earlier unintentional revoke:

| Role | Table | Privileges |
|------|-------|------------|
| anon | comments | SELECT |
| anon | comment_votes | SELECT |
| anon | ratings | SELECT |
| anon | public_profiles (view) | SELECT |
| anon | submissions | INSERT |
| authenticated | profiles | UPDATE (own-row via RLS) |
| authenticated | (inherits all anon grants) | |

`forum_posts` and `forum_replies` are dead tables — zero grants, zero code references. Candidates for DROP.

---

## New files / routes added

- **`src/lib/consent.ts`** — consent manager. Exports `initConsent()` (called once on page load from BaseLayout's bundled script) and `reopenConsent()` (wired to the "Privacy choices" footer button). localStorage key: `kneed-consent`, stored value: `{ value: 'granted' | 'denied', ts: ISO-string }`. Injection conditions: `initConsent` skips everything if `pathname === '/auth/callback'`; loads trackers only when stored value is `'granted'`; shows banner if no stored value. `loadTrackers()` injects GA4 (`G-G6ZQHC582Q`) and Meta Pixel (`3290406697805340`) dynamically, guarded by `window.__kneedTrackersLoaded` so they are only injected once. Trackers are **not** in BaseLayout's static HTML — neither fires before explicit opt-in. AdminLayout has never included these trackers. The middleware holding page has no trackers.
- **`src/lib/placesAutocomplete.ts`** — shared Google Places API v1 autocomplete helper. Signature: `bindPlacesAutocomplete(input, list, includedPrimaryTypes)`. Used by both tabs of `submit.astro`. `profile/edit.astro` still uses its own inline `<script is:inline>` implementation and has not yet been migrated.
- **`src/pages/api/admin-set-role.ts`** — gated role-toggle route. Uses `requireAdmin` + service-role client. Guards: 401 unauthenticated, 403 self-role-change, 400 invalid role/missing id.
- **`src/pages/api/admin-bakeries-cms.ts`** and **`admin-articles-cms.ts`** — all CMS writes (insert/update/delete) for bakeries_cms and articles_cms go through these gated routes. Direct anon-client writes removed.
- **`public_profiles` view** (database) — `CREATE VIEW public.public_profiles WITH (security_invoker = off) AS SELECT id, display_name FROM public.profiles`. Definer-rights so it bypasses profiles own-row RLS. Powers all display-name lookups for logged-out visitors.

---

## Bugs fixed this session

- **Comments/names for logged-out visitors** — `profiles(display_name)` FK join replaced with separate `public_profiles` fetch + client-side merge at 6 query sites: `bakeries/[slug].astro`, `kneed-to-know/[slug].astro`, `admin/comments.astro`, `admin/submissions.astro`.
- **Profile save PGRST204** — `updated_at` removed from payload (column does not exist). `demographics_consent_at` now stamped only when consent direction changes, not on every save.
- **Public submit form INSERT** — anon INSERT grant on submissions restored.
- **Consent gate** — GA4 and Meta Pixel removed from BaseLayout static HTML. Neither fires before explicit opt-in. `src/lib/consent.ts` manages banner, localStorage state, and dynamic injection. `/auth/callback` always excluded (OAuth code in URL). "Privacy choices" footer button re-opens the banner.
- **Recommend-tab autocomplete** — `sg-addr` input had no autocomplete binding. Fixed via shared helper; `sg-addr-suggestions` `<ul>` added to DOM.
- **Role toggle** — `admin/members.astro` was calling `supabase.from('profiles').update(...)` via browser client (own-row RLS blocks updates to other users). Rewired to `/api/admin-set-role`.

---

## Verified empirically

- Consent withdrawal nulls DOB / gender / location fields.
- `admin-set-role` returns 401 when called without a valid session token.
- Self-role-change blocked both at UI (button omitted for current user's row) and at server (403).
- `public_profiles` view serves display names to logged-out visitors without exposing other profile fields.

---

## Open items

| Item | Notes |
|------|-------|
| Role toggle happy-path untested | Needs a second account to verify the full toggle flow end-to-end |
| Google Places API key unrestricted | Key `AIzaSyB6Dv_E_XEjozZqi_Tenk4AepcpYWHNUas` has no HTTP referrer or IP restriction in Google Cloud Console — manual task, not a code change |
| `comment_votes` anon SELECT exposes `user_id` | Anon-facing fetch should select `comment_id + vote` only; a separate session-gated query should handle own-vote highlight. Queued code change — include in privacy review brief |
| "Admins can update any comment" RLS policy is dead | No UPDATE grant on comments, no edit feature exists. Drop in a future cleanup migration |
| Optional grant tightening | `ratings` DELETE and `comment_votes` UPDATE are granted but unused — candidates for removal |
| Submit-page rework | Brief exists: one form, owner checkbox reveals contact fields, contact PII only behind the toggle |
| `profile/edit.astro` Places migration | Still uses inline `<script is:inline>` for autocomplete; could be migrated to `src/lib/placesAutocomplete.ts` |
| `forum_posts` / `forum_replies` DROP | Dead tables with no grants and no code references |
| Privacy policy mismatches | Meta pixel absent from "Who We Share Data With"; session storage described as cookies; last-updated date stale (says June 2025) |
