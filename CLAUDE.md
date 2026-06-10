# CLAUDE.md — Standing rules for this project

## Env var sources (Astro + Cloudflare Workers)

Runtime secrets **MUST** be read via `import { env } from 'cloudflare:workers'`:
- `env.SUPABASE_SERVICE_ROLE_KEY`
- `env.GA_CLIENT_SECRET`, `env.GA_REFRESH_TOKEN`, `env.GA_CLIENT_ID`, `env.GA_PROPERTY_ID`

`import.meta.env` is build-time only (Vite-inlined). It works locally but returns `undefined` for secrets at Workers runtime, producing silent 500s. Only `PUBLIC_*` vars that are already baked in at build time belong on `import.meta.env`:
- `import.meta.env.PUBLIC_SUPABASE_URL`
- `import.meta.env.PUBLIC_SUPABASE_ANON_KEY`

Never mix these sources.

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
