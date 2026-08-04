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

### Launch-day mechanical batch

Ship all of these in the **same deploy that flips `GATE_ENABLED = false`** (`src/middleware.ts`).

> **Do now (precaution, not launch-day):** `kneed.tv` is currently attached to the **old Cloudflare Pages project**, which is still connected to GitHub. Disconnect the old Pages project's **GitHub build integration** today so a push can't redeploy the old site over the live domain. Keep the old Pages project itself — it's the rollback until cutover is verified (see below).

| Item | Notes |
|------|-------|
| Flip the coming-soon gate | Set `GATE_ENABLED = false` in `src/middleware.ts`. Until then the gate returns 503 + `X-Robots-Tag: noindex` + meta-noindex to all cookie-less visitors (crawlers), so nothing indexes pre-launch |
| Domain cutover — **migration, not addition** | `kneed.tv` is attached to the OLD Cloudflare Pages project, not unassigned. Cloudflare won't allow the same hostname on two projects, so this is a move: (1) **remove** the custom domain from the old Pages project, then (2) **add** it to `kneed-astro-worker`. There is a brief DNS/resolution gap between the two steps — do it deliberately, not in a rush. (3) Verify the Worker serves `kneed.tv` correctly. (4) **Only after verification, delete the old Pages project** — keep it until then as the rollback. (GitHub build integration on the old project should already be disconnected per the do-now precaution above.) |
| Add sitemap + robots.txt | Install `@astrojs/sitemap` (add the integration to `astro.config.mjs`) and add `public/robots.txt` pointing at `https://kneed.tv/sitemap-index.xml`. `Astro.site` is already set to `https://kneed.tv`, so the sitemap will emit kneed.tv URLs automatically. Ship in the gate-flip deploy so crawlers find the sitemap the moment indexing is allowed |

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
| Newsletter welcome email + unsubscribe | **Actionable now — Resend domain verified 2026-06-13 (no longer gated).** `/api/newsletter-signup` stores subscribers in `email_subscribers` but there is no sending and no unsubscribe path yet. Scope: (1) welcome email on signup, sent from `mail.kneed.tv`, with a tokenized unsubscribe link (uses `email_subscribers.unsubscribe_token`) at the bottom; (2) an unsubscribe route + page reachable **without** the email (standalone URL, e.g. enter your address), so deletion isn't gated on receiving mail — sets `status='unsubscribed'` + `unsubscribed_at`. **Required before any newsletter sending goes out.** Privacy reviewer will ask about the interim — see the `email_subscribers` retention/erasure question in `PRIVACY-REVIEW-NOTES.md` |
| Resend audience sync + backfill user_id | **Actionable now (unblocked by domain verification).** Sync `email_subscribers` to a Resend audience for sending, and backfill `user_id` on rows that were recorded by email only (homepage-form rows that later created an account). Post-signup-prompt opt-ins already carry `user_id` (session token present at prompt time — see "Post-signup email opt-in prompt" Resolved), so backfill mainly covers homepage-form subscribers who later signed up. |
| Comment rate limiting | `/api/submit-bakery` has per-IP throttling; comments (authenticated) have none. Low-priority but include in hardening pass |
| Bot / abuse hardening (Turnstile) | Auth signup has **no app-level rate limiting** — only Supabase's built-in defaults. Submit-bakery and newsletter have per-IP throttling; comments and signup do not. If spam appears post-launch on any form, add **Cloudflare Turnstile** (NOT Google reCAPTCHA — heavier privacy footprint, and we're already on CF) to the affected forms: one client widget + server-side token verification in the existing route(s). **Privacy:** adding Turnstile requires a disclosure line in `privacy.astro` (and likely a "Who We Share Data With" / Cloudflare mention) — flag for the privacy reviewer at that point |
| Privacy policy — Variant A live | Policy rewritten 2026-06-10 to match verified behavior. Variant A (autoConfig enabled, full interaction data) is live. `PRIVACY-REVIEW-NOTES.md` at repo root contains both variants for both pixel locations, all removed `[REVIEWER]` notes, and the data retention deferred decision |

### Resolved

| Item | Resolution |
|------|------------|
| **Post-signup email opt-in prompt** (replaced pre-signup checkbox) | Done 2026-08-04 (code) — **needs a manual migration + live verification, see below.** The pre-signup opt-in checkbox never appeared on the Google path (confirmed live: Google signup created a profile but no subscriber row) and the localStorage intent-replay (15-min TTL, provider-specific) was fragile. **Replaced** with a provider-agnostic post-signup prompt that keys off the session that exists after any signup. **Removed:** `#signup-optin` checkbox (`auth/signup.astro`), `kneed_optin_intent` stash + `/auth/callback` replay, `subscribeOnSignup`, the orphaned `.auth-optin` CSS. `/api/newsletter-signup` unchanged (still the write path; Yes sends `consent_source:'signup_prompt'` + bearer token so `user_id` links). The `email_subscribers.consent_source` CHECK was updated `signup_checkbox`→`signup_prompt` at the same time (test data only; see migration). **New:** `src/components/NewsletterPrompt.astro`, included once in `BaseLayout` — a dismissible bottom-right card ("Want updates?" / "Keep me updated on things (K)Need." / "Yes, keep me updated" · "No thanks"), self-gating on pathname (skips `/auth`, `/admin`), session, and eligibility. **"Already asked" tracking = `profiles.newsletter_prompted_at` (new column).** Yes/No both stamp it (never shows again, any device); dismiss caps at 2 re-asks/device (localStorage `kneed_nl_dismiss`) then stamps it; a terminal localStorage flag `kneed_nl_seen` avoids re-querying. **Entry points covered** (every new-account surface): `auth/signup.astro` (email+Google), homepage modal (email+Google), `auth/login.astro` (Google = new account if none). Privacy disclosure updated (checkbox → prompt wording). **Migration to run manually (adds column + excludes pre-existing accounts + reloads PostgREST):** `BEGIN; ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS newsletter_prompted_at timestamptz; UPDATE public.profiles SET newsletter_prompted_at = now() WHERE newsletter_prompted_at IS NULL; NOTIFY pgrst, 'reload schema'; COMMIT;` — existing `authenticated` own-row SELECT/UPDATE grants cover the new column; no new grant needed. Until this runs the client select errors and the prompt fails safe (never shows). |
| **Resend sending domain verified** | Done 2026-06-13 — **`mail.kneed.tv`** verified as a Resend sending domain (leaves the `onboarding@resend.dev` sandbox and its verified-recipients-only restriction). **Deliberately disabled at setup:** click tracking, open tracking, receiving, and custom return-path — enabling any of them would add tracking that requires privacy-policy disclosure; revisit only as a deliberate, documented decision. Unblocks the welcome-email + unsubscribe feature and the audience sync (both moved to actionable in the queue above). Submission-notification from-address updated to `hello@mail.kneed.tv` (see below). |
|------|------------|
| **Hero bounce (entrance animation re-fire)** | Done & verified live 2026-08-03 (cold throttled load + SPA away-and-back) — separate from the font-swap jump below. **Root cause:** `initHomePage()` fired twice on first load — the module script's immediate `tryInitHome()` call **and** the `astro:page-load` listener (which also fires on the initial load, not just after ClientRouter swaps). The second run re-entered `initHero()`, which strips `.zooming` (Ken Burns `@keyframes heroZoom`) and `.hero-content-inner.visible` mid-animation and re-adds them 100ms later — snapping the background `scale()` back to 1.0 and replaying the reveal transition = the visible "bounce". Not a layout shift or image load. **Fix:** a `window._heroInited` idempotency guard — set after the not-on-homepage check in `initHomePage()`, early-returns on the redundant second fire, and is **cleared in `destroyHomePage()`** (`astro:before-swap`) so a genuine SPA nav away-and-back still re-inits. Kept the immediate call (didn't rely solely on `astro:page-load`, which could race/not fire). Mirrors the `_navArmed` teardown pattern in `consent.ts`. Guarding at the top of `initHomePage()` also stopped the redundant second `startAutoplay()` / `applySlide(0)`. **Bonus fix:** the hero touch/wheel listeners (added via `addEventListener`, not overwrite-style `onclick`) were **double-binding** on the second fire — the guard prevents that too. `src/pages/index.astro` only |
| **Hero load-jump (font-swap reflow)** | Done 2026-06-13 — root-caused the first-load hero jump. The genuine layout shift was **font-swap reflow** on the headline/eyebrow: `--font-display` (Josefin Sans) and `--font-cond` (Archivo Narrow) load via Google Fonts `display=swap`, and the old `Arial Narrow` fallback was a poor metric match. Fixed with **metric-matched `@font-face` fallbacks** (`'Josefin Sans Fallback'` size-adjust 109%, `'Archivo Narrow Fallback'` size-adjust 82%, both with ascent/descent overrides) in `public/global.css`, inserted into the font stacks — swap is now reflow-free while the real faces still always show. Metrics are derived (not capsize-exact); refine with fontaine if pixel-exactness is wanted. The other perceived movement — **hero image late-fade — is NOT a layout reflow**: it's an absolute `background-image` on a fixed-height section (already space-reserved); the late pop is placeholder loading speed and resolves when launch assets replace the slow hotlinked placeholders. **Barlow (`--font-body`) deliberately not treated** — close system-ui metric match and largely JS-injected/below-fold usage. **Known, deliberately unfixed:** the film-rail carousel does a one-frame horizontal scroll-settle on JS init (clone + `scrollLeft`) — below the fold, no CLS, doesn't move other content; candidate for the carousel a11y session |
| **Newsletter form made real** | Done & verified live end-to-end 2026-06-12 — the "Get updates" form was pure theater (showed "YOU'RE ON THE LIST!" with zero network activity, nothing stored). Now: `newsletter_signups` table (RLS-enabled, deny-by-default, `service_role`-only grants, unique index on `lower(email)`, `ip_address` column for rate limiting); `/api/newsletter-signup` route (email validation, 3/IP/hr DB-backed rate limit mirroring submit-bakery, duplicate-signup returns 200 as success); form rewired to call the route with in-flight button disable (fixes prior double-submit), inline validation/rate-limit errors, and the modal's account prompt now skipped for already-signed-in users; privacy disclosure restored in `privacy.astro` + retention question added to `PRIVACY-REVIEW-NOTES.md`. The "Create a free account" link reveals the in-modal signup form (email pre-filled) — left as-is intentionally. Curl tests passed all five paths (200 new, 200 duplicate, 400 invalid, 400 unexpected-field, 429 rate limit). **Debugging root-caused the week's grant mystery:** initial inserts 500'd because altered `DEFAULT PRIVILEGES` left new tables with no DML grants for any role — `service_role` included; fixed via `ALTER DEFAULT PRIVILEGES` (see CLAUDE.md "service_role bypasses RLS but NOT table grants"). Follow-up still open: welcome email + unsubscribe (queued, now actionable — Resend domain verified 2026-06-13) |
| **Cloudinary image uploads broken** | Done & verified live 2026-06-10 — uploads (`/api/upload`, server-side; powers bakery/article/hero images) had been dead since the Workers migration. **Two stacked causes:** (a) the route read its Cloudinary secrets via `import.meta.env` (build-time only → `undefined` at Workers runtime — the third env-source casualty; symptom `Invalid api_key undefined`). Fixed by reading via `import { env } from 'cloudflare:workers'`. (b) After (a), `cloud_name` still resolved `undefined` (symptom `Invalid cloud_name undefined`) while the identically-read api_key/api_secret worked — the `CLOUDINARY_CLOUD_NAME` **dashboard secret had a malformed name that bound as `undefined`**. Fixed by deleting and re-creating the secret with a hand-typed name. Cleanup: `src/lib/cloudinary.ts` deleted (dead code, carried a duplicate of the same `import.meta.env` bug); `src/env.d.ts` now types all three `CLOUDINARY_*` keys on `Cloudflare.Env` |
| **Typecheck cleanup** | Done 2026-06-10 — `npx astro check` clean (44 → 0 errors). Fixed: ~13 `.ts` `request.json()` items (typed `Body` + assertion), 4 `.astro` `display_name` null-type items (widened `CommentRow`/`formatName` types), and ~27 `admin/*.astro` items (`unknown` JSON casts + `HTMLSelectElement` casts) — all type-only, no runtime changes. 4 cosmetic hints deliberately left: `frameborder` deprecation in `bakeries/[slug].astro:410` and `kneed-to-know/[slug].astro:274`, unused `fullText` in `profile/edit.astro:108`, and the `is:inline` script hint in `index.astro:295` |
| **Email notifications on submissions** | Done & verified live — `/api/submit-bakery` sends a Resend notification (to `ayden@commafilms.com.au`) after each insert; email failure is logged to Worker console but never blocks the response. `RESEND_API_KEY` set in Cloudflare dashboard. From-address updated 2026-06-13 to **`hello@mail.kneed.tv`** (verified domain; was `onboarding@resend.dev` sandbox). |
| **Rate limiting on submissions** | Done & verified live including the 429 path and post-revoke operation — DB-backed, per-IP, max 3 per hour via the `ip_address` column (`CF-Connecting-IP`). Limitation: IP can be proxied/VPN'd; per-IP is a deterrent, not hard enforcement. **Tuning note:** the limiter counts per-IP regardless of auth — consider per-user counting for authenticated submitters if shared-IP complaints arise. Comment spam still unaddressed |
| Duplicate `baker-bleu-v2` slug | Was a layout-dev working copy; already deleted in normal workflow |
| Admin bakeries preview button | Verified working |
| Newsletter connection | Resolved by discovery: the "Get updates" form is an account-signup pre-fill, not a mailing list — no newsletter exists |
| Granting admin without SQL | Covered by `/api/admin-set-role` |
| `src/content/` legacy directory | Already deleted; no `astro:content` / `getCollection` usage anywhere in the codebase |
| Google Places API key restriction | Referrer and API restrictions verified confirmed in Google Cloud Console |
