// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Static-first site; pages with `export const prerender = false` are server-rendered
// at request time via the node adapter.
export default defineConfig({
  adapter: node({ mode: 'standalone' }),
});
