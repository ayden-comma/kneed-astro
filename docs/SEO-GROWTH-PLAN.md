# SEO and growth plan, (K)Need

Written 20 Aug 2026 after an audit of this repo (BaseLayout.astro, bakeries/[slug].astro, middleware.ts, astro.config.mjs). Goal: the website converts YouTube and bakery-referred attention into mailing list signups and durable search visibility for each featured bakery. Views live on YouTube; the site's job is capture and permanence.

What is already right: canonicals forced to kneed.tv, OG and Twitter cards with per-page image, geo.region meta, coming-soon gate returning 503 plus noindex, admin pages noindexed, click-to-load YouTube facade (good for performance), NewsletterPrompt in the layout, bakery pages carrying address, lat/lng, hours, episode credits and dates in the CMS.

The gaps are structured data, sitemap, and robots handling. All the data needed already exists in bakeries_cms; nothing below requires new content.

## 1. JSON-LD structured data (biggest code lever, data already in hand)

There is currently no schema.org markup anywhere on the public site. The bakery pages are exactly the content type structured data was built for.

Per bakery page, emit three blocks from the frontmatter:

Bakery (a LocalBusiness subtype). This is what lets a bakery page rank for the bakery's own name and appear connected to its map entity:

```json
{
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": data.name,
  "address": { "@type": "PostalAddress", "streetAddress": data.address, "addressLocality": data.suburb, "addressRegion": "VIC", "addressCountry": "AU" },
  "geo": { "@type": "GeoCoordinates", "latitude": data.lat, "longitude": data.lng },
  "url": data.website,
  "sameAs": [instagram URL, data.mapLink],
  "openingHours": data.hours,
  "image": data.thumbnail
}
```

Multi-location bakeries: one block per location row, or a parent Organization with department entries. Simplest correct form: emit one Bakery block per entry in locationRows using its own address, lat, lng and hours.

VideoObject for the episode. Because the YouTube embed is a click-to-load facade, crawlers never see a video element; this block is the only way Google knows an episode exists on the page:

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": episode title,
  "description": data.description or the episode standfirst,
  "thumbnailUrl": "https://i.ytimg.com/vi/" + data.videoId + "/hqdefault.jpg",
  "embedUrl": "https://www.youtube.com/embed/" + data.videoId,
  "uploadDate": data.date,
  "duration": data.duration in ISO 8601 (PT9M30S),
  "publisher": { "@id": "https://kneed.tv/#organization" }
}
```

BreadcrumbList: Home, Bakeries, [name].

Site-wide, from BaseLayout: Organization (name (K)Need, url, logo, sameAs with YouTube channel, Instagram, TikTok, Facebook) and WebSite. Articles under /kneed-to-know get an Article block with headline, datePublished, author (K)Need.

## 2. Sitemap and robots.txt (SSR site, needs an endpoint, not the integration)

@astrojs/sitemap only sees prerendered routes; this site is server-rendered on Cloudflare, so bakery and article slugs come from Supabase at request time. Add:

- src/pages/sitemap.xml.ts: queries bakeries_cms where published, articles_cms where published, plus the static routes (/, /bakeries, /map, /kneed-to-know, /about, /submit, /contact, /recipe-book). lastmod from each row's updated_at if present. Cache-Control of an hour is fine
- public/robots.txt: allow all, disallow /admin and /api and /auth and /profile, Sitemap: https://kneed.tv/sitemap.xml
- The coming-soon middleware already 503s and noindexes everything pre-launch, so both can ship now and simply start working at launch

## 3. Robots meta should be a prop, not a constant

BaseLayout hardcodes index,follow on every page. Auth pages, /profile, /profile/edit and /unsubscribe should not be in Google. Make it a prop defaulting to index,follow and pass noindex,follow from those pages. Keep /submit indexable: "get your bakery featured" is a query with real intent.

## 4. Titles and OG polish on bakery pages

- Title is currently just the bakery name. Proposal: data.name plus suburb, so the tab and result read "[Name], [Suburb] | (K)NEED". The suburb is the disambiguator people search with
- og:type on bakery pages: video.other (episode is the hero asset); articles: article
- GSC: create the kneed.tv property now, submit the sitemap at launch, request indexing on each new bakery page the day its episode drops

## 5. The bakery flywheel (ops, not code; this is the growth engine)

Each episode ships with a partner kit for the bakery. The exchange: they received a professional documentary for free; the ask is distribution. Per bakery:

1. Their kneed.tv page URL, with a request to link it from their site ("As featured on (K)Need") and their Instagram bio or story highlight
2. A Google Business Profile post drafted for them (photo, two lines, link to their page). GBP posts take two minutes and most bakeries never post; drafting it for them removes the friction
3. A cut-down vertical clip (30 to 60s) for their socials, watermarked, ending on the (K)Need page URL
4. A counter QR card (A6, linking to their page) for the register
5. One line for their email newsletter if they have one

Every one of these is a backlink, a referral stream, and their regulars joining the (K)Need list. Track per-bakery referral traffic with a ?ref= parameter or per-bakery short link.

## 6. YouTube packaging (where the views actually are)

- Titles written for search and curiosity, not episode numbering: the bakery name, the suburb, and the hook ("The 3am shift at [Bakery], [Suburb]") beats "(K)Need Ep. 4". Episode numbers live in the thumbnail corner if wanted
- Description first line: the hook plus link to the bakery's kneed.tv page and the mailing list. Chapters for every episode
- End screen: next episode plus the bakery page link. Pinned comment: bakery page plus list
- Playlist per city as the series grows; "Melbourne" is the first
- The channel banner and about link to kneed.tv, and the channel is in the site's Organization sameAs so the entities connect

## 7. One CTA everywhere: the list

Already in good shape (NewsletterPrompt in layout, campaigns and analytics built). Two additions: a signup block inside the bakery page template directly under the episode (the moment of highest intent), and the same block at the end of every article. The list is the audience (K)Need owns; it is the TV pitch evidence and the future store's launch channel. Hold e-commerce until the list can carry a first production run; a store before an audience is inventory and distraction.

## 8. Cross-pollination with Comma Films

- Production credit in each episode and in the site footer: "A Comma Films production" linking to commafilms.com.au
- (K)Need becomes a case study page on the Comma site once that redesign ships: a self-initiated series with a public audience is stronger proof of storytelling than any client TVC
- Both directions are honest links between related entities, which is exactly what sameAs and backlinks are for

## Sequence

1. JSON-LD blocks on bakery pages, articles, and layout (one PR, data already in the CMS)
2. sitemap.xml.ts endpoint plus robots.txt (small PR, inert until launch)
3. Robots prop and noindex on auth, profile, unsubscribe (small PR)
4. Title and og:type polish on bakery and article pages (small PR)
5. GSC property now, sitemap submitted at launch
6. Partner kit assembled as a repeatable checklist, first three bakeries retrofitted
7. YouTube packaging applied to existing uploads, then standard for every episode
