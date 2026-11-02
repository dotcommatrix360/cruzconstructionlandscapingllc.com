// Content collections: repeated content lives here as Markdown/JSON, rendered by one route each.
// The schemas enforce the SEO minimums at build time (titles, descriptions, alt text, unique location copy),
// so a thin or incomplete entry fails `npm run build` instead of shipping.
import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

const description = z.string().min(70, 'Meta description: 70–160 characters').max(160, 'Meta description: 70–160 characters');
const seoTitle = z.string().max(60, 'seoTitle: ≤ 60 characters').optional();
/** Root-relative URL to keep an old (e.g. WordPress) address exactly: "/old-post-slug/". */
const permalink = z.string().regex(/^\/[a-z0-9/-]*\/$/, 'permalink must look like /some-path/').optional();
const faq = z.object({ question: z.string().min(5), answer: z.string().min(20) });

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,mdx}', base: './src/content/blog' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    seoTitle,
    description,
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.string().optional(),
    image: image().optional(),
    imageAlt: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    permalink,
    draft: z.boolean().default(false),
    noindex: z.boolean().default(false),
  }).refine((d) => !d.image || (d.imageAlt !== undefined), { message: 'image needs imageAlt ("" only if purely decorative)' }),
});

const services = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/services' }),
  schema: ({ image }) => z.object({
    title: z.string(),
    seoTitle,
    description,
    summary: z.string().min(20),
    order: z.number().default(100),
    image: image().optional(),
    imageAlt: z.string().optional(),
    faqs: z.array(faq).default([]),
    permalink,
    draft: z.boolean().default(false),
  }),
});

// Service-area pages are only worth publishing with genuinely local content (projects there, local codes,
// terrain/climate, permits, team). `localDetails` forces at least three specific points per area; the
// duplicate-content check in validate.mjs catches pages that are the same text with the town swapped.
const locations = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: './src/content/locations' }),
  schema: ({ image }) => z.object({
    name: z.string(),
    title: z.string(),
    seoTitle,
    description,
    region: z.string().optional(),
    localDetails: z.array(z.string().min(30)).min(3, 'Add at least 3 location-specific details — no thin or duplicated area pages'),
    services: z.array(z.string()).default([]),
    image: image().optional(),
    imageAlt: z.string().optional(),
    faqs: z.array(faq).default([]),
    permalink,
    draft: z.boolean().default(false),
  }),
});

// Real, attributable reviews only — with where they came from and permission to publish. Never invented.
const testimonials = defineCollection({
  loader: file('./src/content/testimonials/testimonials.json'),
  schema: z.object({
    id: z.string(),
    quote: z.string().min(10),
    author: z.string(),
    location: z.string().optional(),
    source: z.enum(['google', 'facebook', 'yelp', 'houzz', 'email', 'survey', 'other']),
    sourceUrl: z.url().optional(),
    date: z.coerce.date().optional(),
    permission: z.literal(true, { message: 'Only publish testimonials the client has permission to use' }),
  }),
});

export const collections = { blog, services, locations, testimonials };
