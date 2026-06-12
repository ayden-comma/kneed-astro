# CLAUDE.md — Standing rules for this project

## Canonical typecheck is `npx astro check`

Always typecheck with `npx astro check`. It covers `.astro` files (component frontmatter and templates) in addition to `.ts`. `npx tsc --noEmit` alone **misses `.astro` files** and under-reported the error count this session. There is no `typecheck` npm script — use `npx astro check` directly.

## Report every numbered instruction explicitly

When a prompt contains a multi-item or numbered list of instructions, the final report **must** give an explicit done / not-done status for every single item. Do not silently drop a requested change — if an item was skipped, could not be done, or was intentionally left out, say so and why. (Silent omissions of requested changes have occurred; this rule exists to prevent them.)

## Env var sources (Astro + Cloudflare Workers)

Runtime secrets **MUST** be read via `import { env } from 'cloudflare:workers'`:
- `env.SUPABASE_SERVICE_ROLE_KEY`
- `env.GA_CLIENT_SECRET`, `env.GA_REFRESH_TOKEN`, `env.GA_CLIENT_ID`, `env.GA_PROPERTY_ID`

`import.meta.env` is build-time only (Vite-inlined). It works locally but returns `undefined` for secrets at Workers runtime, producing silent 500s. Only `PUBLIC_*` vars that are already baked in at build time belong on `import.meta.env`:
- `import.meta.env.PUBLIC_SUPABASE_URL`
- `import.meta.env.PUBLIC_SUPABASE_ANON_KEY`

Never mix these sources.

## One env binding undefined while its siblings resolve → fault is in the store, not the code

When a single env value reads `undefined` at runtime while sibling values read the exact same way (same `env` import, same scope) resolve fine, stop debugging the code — the reads are identical, so the code cannot be the cause. The fault is in the binding itself: **delete and re-create that secret, typing the name by hand** (do not paste). A malformed name — stray whitespace, a homoglyph, a zero-width or non-breaking character — survives re-pasting and even type conversion, and binds as `undefined` while looking correct in the dashboard. (Real case: `CLOUDINARY_CLOUD_NAME` bound as undefined for this reason; api_key/api_secret read identically and worked. Hand-retyping the name fixed it.)

## RLS policy changes

Before any DROP or ALTER on a policy:

1. Run `SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = '...'` — **always include the `roles` column**. Policy names in memory are unreliable; the output is ground truth. (This caught two undocumented live write policies on bakeries_cms/articles_cms that would have been left active.)
2. Wrap every migration in `BEGIN; ... COMMIT;`. One migration per SQL editor query.
3. After running, re-run the pg_policies query to verify the end state. A migration that was never executed looks identical to one that succeeded until you check.

## Admin page security model

Admin pages (`src/pages/admin/*.astro`) are **client-fetched shells**. They have a `// SECURITY: keep this a client-fetched shell` comment for a reason — session lives in `localStorage`, not cookies, so there is no server-side auth gate. All data is loaded client-side after `adminCheck.ts` verifies admin role. API routes enforce auth via `requireAdmin`.

**Never add server-side data fetching to admin pages.** Server-rendering data there would expose it to unauthenticated visitors.

## Auth gates: test the failure path

A clean build and passing type-check prove nothing about auth correctness. After deploying any gated route, test both:
- Logged-in admin → expect 200
- Logged-out / no token → expect 401

If only the success path is tested, a missing or broken auth gate is indistinguishable from a working one.

## Grants and RLS are two separate permission layers

A request must hold the table **GRANT** before RLS policies are evaluated at all. `42501 "permission denied"` means a missing grant, not an RLS denial. Any permissions audit or migration must inspect **both**:
- `SELECT ... FROM information_schema.role_table_grants WHERE grantee IN ('anon', 'authenticated')` — table privileges
- `SELECT ... FROM pg_policies WHERE tablename = '...'` — row-level policies

Always check both for the `anon` **and** `authenticated` roles.

## service_role bypasses RLS but NOT table grants

A service-role client skips RLS policies, but it still needs the table **GRANT**. `42501 "permission denied"` from a service-role client means a missing grant, exactly as for any other role — it is **not** an RLS problem.

This database's `DEFAULT PRIVILEGES` had been altered so new tables were born with **no DML grants for any role** (only TRUNCATE/REFERENCES/TRIGGER) — the same event as the week's earlier mass revoke, now root-caused. Fixed 2026-06-12: `ALTER DEFAULT PRIVILEGES` now grants ALL on new tables to `service_role`. So every `CREATE TABLE` going forward auto-grants `service_role`, but **`anon`/`authenticated` remain deny-by-default on new tables** and still need explicit grants whenever public access is intended.

After any `CREATE TABLE`, **reload the PostgREST schema cache** before testing routes against it:

```sql
NOTIFY pgrst, 'reload schema';
```

A freshly created table is invisible to PostgREST (and thus to the supabase-js client) until the cache reloads — inserts/selects fail until then, which looks identical to a grant or schema bug.

## Test as a logged-out visitor after any permissions or schema change

A past grants revoke silently broke public comments, ratings, and the public submit form for an unknown period because only logged-in paths were tested. After any permissions or schema change, verify the logged-out path explicitly — not just a logged-in admin session.

## Public profile data goes through public_profiles view only

`public_profiles` is a definer-rights view exposing `id` and `display_name` only. It exists so display names are readable without a public SELECT policy on `profiles`.

- **Never** re-add a public SELECT policy on `profiles`.
- **Never** widen `public_profiles`'s column list without a privacy review.

All six comment/submission query sites use a separate `public_profiles` fetch + client-side merge (PostgREST cannot join views via FK — no FK constraints on views).

## Codebase-only audits cannot verify database state

RLS policies, grants, and schema claims must be confirmed against the live database — code inspection alone is not sufficient. Two audit findings this session (profiles exposure, consent flow status) appeared correct from code but were wrong until tested against the live DB.
