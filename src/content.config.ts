import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

const sharedSchema = z.object({
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
  videoId: z.string().optional(),
  duration: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
  quote: z.string().optional(),
  director: z.string().optional(),
  camera: z.string().optional(),
  sound: z.string().optional(),
  edit: z.string().optional(),
  images: z.array(z.object({
    src: z.string(),
    caption: z.string().optional(),
  })).optional(),
  locations: z.array(z.object({
    addr: z.string(),
    lat: z.number(),
    lng: z.number(),
  })).optional(),
});

const bakeries = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/bakeries' }),
  schema: sharedSchema,
});

const kneedToKnow = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/kneed-to-know' }),
  schema: sharedSchema,
});

export const collections = { bakeries, kneedToKnow };