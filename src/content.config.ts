import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const bakeries = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/bakeries' }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    suburb: z.string(),
    address: z.string(),
    category: z.string(),
    hours: z.string(),
    website: z.string().optional(),
    instagram: z.string().optional(),
    thumbnail: z.string(),
    mapLink: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
});

const stories = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/stories' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    bakery: z.string(),
    category: z.string(),
    duration: z.string(),
    thumbnail: z.string(),
    videoId: z.string(),
    description: z.string(),
    director: z.string().optional(),
    camera: z.string().optional(),
    sound: z.string().optional(),
    edit: z.string().optional(),
  }),
});

export const collections = { bakeries, stories };