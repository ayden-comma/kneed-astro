# Project Handoff Notes

_Last updated: 2026-06-10 (open items updated)_

---

## Database permissions — current state

Grants restored to least-privilege map after an earlier unintentional revoke:

| Role | Table | Privileges |
|------|-------|------------|
| anon | comments | SELECT |
| anon | comment_votes | SELECT |
| anon | ratings | SELECT |
| anon | public_profiles (view) | SELECT |
| authenticated | profiles | UPDATE (own-row via RLS) |
| authenticated | (inherits all anon grants) | |

`submissions` INSERT has been **revoked** for both `anon` and `authenticated` — all submissions now go through `/api/submit-bakery`, which uses the service-role key and bypasses table grants. (Revoked and verified live 2026-06-10; submissions continue to land post-revoke.)

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

## Pending SQL — run before deploying submit-bakery route

**Block 1 — schema addition (run first, before deploy):**

```sql
BEGIN;
-- ip_address stores the submitter's CF-Connecting-IP for rate limiting and admin visibility.
-- submitted_by already exists (uuid, references auth.users). No user_id column needed.
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS ip_address text;
COMMIT;
```

**Block 2 — grant revocation (✅ executed 2026-06-10; route confirmed live, submissions land post-revoke):**

```sql
BEGIN;
-- Both forms now go through /api/submit-bakery (service-role key, bypasses grants).
-- anon INSERT is no longer needed. authenticated INSERT was never needed —
-- logged-in submissions use the bearer token path but execute as service-role, not the user's DB role.
REVOKE INSERT ON public.submissions FROM anon;
REVOKE INSERT ON public.submissions FROM authenticated;
COMMIT;
```

> **Note:** `RESEND_API_KEY` must be set in Cloudflare dashboard → Workers & Pages → Settings → Variables and Secrets before deploying.

---

## Open items

### Pre-launch blockers

| Item | Notes |
|------|-------|
| **OG image** | `public/images/og-default.jpg` is still a copy of the map screenshot. Needs a real 1200×630 branded asset before launch. Blocked on design, not code |

### Post-launch / queued

| Item | Notes |
|------|-------|
| Role toggle happy-path untested | Needs a second account to verify the full toggle flow end-to-end |
| `comment_votes` anon SELECT exposes `user_id` | Anon-facing fetch should select `comment_id + vote` only; a separate session-gated query should handle own-vote highlight. Include in privacy review brief |
| "Admins can update any comment" RLS policy is dead | No UPDATE grant on comments, no edit feature exists. Drop in a future cleanup migration |
| Optional grant tightening | `ratings` DELETE and `comment_votes` UPDATE are granted but unused — candidates for removal |
| Submit-page rework | Brief exists: one form, owner checkbox reveals contact fields, contact PII only behind the toggle. Also: pre-fill email for logged-in users. Decide fate of the dead `suburb` column — never populated by any version of the form; either populate it from the Places result in the redesign, or drop the column |
| `profile/edit.astro` Places migration | Still uses inline `<script is:inline>` for autocomplete; could be migrated to `src/lib/placesAutocomplete.ts` |
| `forum_posts` / `forum_replies` DROP | Dead tables with no grants and no code references |
| Editor role / permission tiers | Floated in earlier session, never decided. `/api/admin-set-role` covers granting admin for now. Post-launch question |
| Resend sending domain | `onboarding@resend.dev` is Resend's sandbox sender — can only deliver to verified recipients. Verify `commafilms.com.au` or `kneed.tv` as a Resend sending domain, then update the `from` address in `submit-bakery.ts` to a domain address. Improves deliverability and removes recipient restriction |
| Comment rate limiting | `/api/submit-bakery` has per-IP throttling; comments (authenticated) have none. Low-priority but include in hardening pass |
| Privacy policy — Variant A live | Policy rewritten 2026-06-10 to match verified behavior. Variant A (autoConfig enabled, full interaction data) is live. `PRIVACY-REVIEW-NOTES.md` at repo root contains both variants for both pixel locations, all removed `[REVIEWER]` notes, and the data retention deferred decision |

### Resolved

| Item | Resolution |
|------|------------|
| **Typecheck cleanup** | Done 2026-06-10 — `npx astro check` clean (44 → 0 errors). Fixed: ~13 `.ts` `request.json()` items (typed `Body` + assertion), 4 `.astro` `display_name` null-type items (widened `CommentRow`/`formatName` types), and ~27 `admin/*.astro` items (`unknown` JSON casts + `HTMLSelectElement` casts) — all type-only, no runtime changes. 4 cosmetic hints deliberately left: `frameborder` deprecation in `bakeries/[slug].astro:410` and `kneed-to-know/[slug].astro:274`, unused `fullText` in `profile/edit.astro:108`, and the `is:inline` script hint in `index.astro:295` |
| **Email notifications on submissions** | Done & verified live — `/api/submit-bakery` sends a Resend notification (to `ayden@commafilms.com.au`, from `onboarding@resend.dev`) after each insert; email failure is logged to Worker console but never blocks the response. `RESEND_API_KEY` set in Cloudflare dashboard. From-address is `onboarding@resend.dev` (Resend sandbox — delivers only to verified recipients until a sending domain is verified; see post-launch item) |
| **Rate limiting on submissions** | Done & verified live including the 429 path and post-revoke operation — DB-backed, per-IP, max 3 per hour via the `ip_address` column (`CF-Connecting-IP`). Limitation: IP can be proxied/VPN'd; per-IP is a deterrent, not hard enforcement. **Tuning note:** the limiter counts per-IP regardless of auth — consider per-user counting for authenticated submitters if shared-IP complaints arise. Comment spam still unaddressed |
| Duplicate `baker-bleu-v2` slug | Was a layout-dev working copy; already deleted in normal workflow |
| Admin bakeries preview button | Verified working |
| Newsletter connection | Resolved by discovery: the "Get updates" form is an account-signup pre-fill, not a mailing list — no newsletter exists |
| Granting admin without SQL | Covered by `/api/admin-set-role` |
| `src/content/` legacy directory | Already deleted; no `astro:content` / `getCollection` usage anywhere in the codebase |
| Google Places API key restriction | Referrer and API restrictions verified confirmed in Google Cloud Console |
