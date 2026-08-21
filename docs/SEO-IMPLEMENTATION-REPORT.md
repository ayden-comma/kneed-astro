# SEO implementation report, 21 Aug 2026

Batch implemented by Cowork from docs/SEO-GROWTH-PLAN.md. Verified with `npx astro check` (0 errors, 0 warnings) and a full `npx astro build` before commit. Everything below is inert on production until the coming-soon gate opens; nothing changes what visitors or crawlers see today.

Status per plan item:

1. JSON-LD structured data: DONE.
   - New `src/lib/structuredData.ts`: builders for Organization, WebSite, Bakery, VideoObject, Article, BreadcrumbList, plus `toIsoDate` / `toIsoDuration` guards so an unparseable CMS date or duration is omitted rather than emitted wrong.
   - `BaseLayout.astro` now emits Organization + WebSite on every page and accepts a `jsonLd` prop for page blocks. Serialisation escapes `<` so CMS text can never break out of the script tag.
   - `bakeries/[slug].astro`: one Bakery block per location row (falls back to the CMS row's own address/lat/lng when no location rows exist), VideoObject when the episode exists (required because the click-to-load YouTube facade hides the video from crawlers), BreadcrumbList.
   - `kneed-to-know/[slug].astro`: Article block, VideoObject when present, BreadcrumbList.

2. Sitemap and robots.txt: DONE.
   - New `src/pages/sitemap.xml.ts`: server-rendered, queries published bakeries_cms and articles_cms at request time, respects HIDE_ARTICLES and HIDE_MAP so it can never list a URL that redirects, Cache-Control one hour. The @astrojs/sitemap integration was deliberately NOT used: it only sees prerendered routes and this site is SSR.
   - New `public/robots.txt`: allows all, disallows /admin, /api/, /auth/, /profile, /unsubscribe, points at https://kneed.tv/sitemap.xml.

3. Robots meta as a prop: DONE.
   - `BaseLayout.astro` takes `robots` (default `index, follow`).
   - `noindex, follow` passed from: all six auth pages, profile, profile/edit, unsubscribe, recipe-book, 404.
   - Bakery and article pages pass `noindex, nofollow` when `?preview=true`, so admin preview URLs can never be indexed.

4. Title and og:type polish: DONE.
   - Bakery pages: title is now "Name, Suburb" (BaseLayout appends the site suffix); og:type `video.other` when an episode exists.
   - Article pages: og:type `article`.
   - Bug fixed along the way: article pages were passing a title that already contained " | (K)NEED", and BaseLayout appends it again, so every article rendered a doubled suffix in the tab, search results and social cards. The page now passes the bare title.

Not done, needs Ayden or a later session:

5. Google Search Console property for kneed.tv: needs Ayden's Google account. Create it now; submit /sitemap.xml at launch.
6. Signup block under the episode player and at article ends: a design decision, left for the dev workstream.
7. Partner kit and YouTube packaging: ops, not code, per the plan.
8. Verify structured data on the live site after launch with Google's Rich Results Test on one bakery page; code inspection alone cannot confirm what Google receives (same principle as the CLAUDE.md rule about database state).

Files touched (17): src/layouts/BaseLayout.astro, src/pages/bakeries/[slug].astro, src/pages/kneed-to-know/[slug].astro, src/lib/structuredData.ts (new), src/pages/sitemap.xml.ts (new), public/robots.txt (new), src/pages/auth/{callback,logout,signup,reset-password,forgot-password,login}.astro, src/pages/profile.astro, src/pages/profile/edit.astro, src/pages/unsubscribe.astro, src/pages/recipe-book.astro, src/pages/404.astro.

Housekeeping: `_stage-src.tgz` in the repo root was a transfer artifact from this session; it has been moved to `_to_delete/` for Ayden to remove.
