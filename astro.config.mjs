// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // Canonical site origin. Single source of truth for canonicals, OG/Twitter URLs,
  // and any future sitemap — consumed via Astro.site / import.meta.env.SITE.
  // Set to the production domain even pre-launch; the coming-soon gate noindexes
  // crawlers out until kneed.tv is live.
  site: 'https://kneed.tv',
  adapter: cloudflare(),
});

