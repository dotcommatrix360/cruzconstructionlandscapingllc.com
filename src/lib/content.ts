// Shared helpers for collection URLs, so every route, link and sitemap entry agrees on one address.
import { getCollection, type CollectionEntry } from 'astro:content';

export type Routable = CollectionEntry<'blog'> | CollectionEntry<'services'> | CollectionEntry<'locations'>;

const BASE: Record<Routable['collection'], string> = { blog: '/blog/', services: '/services/', locations: '/service-areas/' };

/** Public URL of an entry: its `permalink` (kept from an old site) or the collection's default route. */
export const entryUrl = (e: Routable) => e.data.permalink || `${BASE[e.collection]}${e.id}/`;

export const isLive = (e: Routable) => !e.data.draft;

export async function published<C extends Routable['collection']>(name: C) {
  const all = (await getCollection(name)) as Extract<Routable, { collection: C }>[];
  return all.filter(isLive);
}

/** Blog posts newest first. */
export async function posts() {
  return (await published('blog')).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export async function services() {
  return (await published('services')).sort((a, b) => a.data.order - b.data.order || a.data.title.localeCompare(b.data.title));
}

export async function locations() {
  return (await published('locations')).sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export const readingMinutes = (text = '') => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 220));
