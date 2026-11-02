// Typed access to site.config.json — the single source of truth for business facts.
// Never hard-code NAP, hours or IDs in components; read them from here so they change in one place.
import raw from '../../site.config.json';

export interface Hours { days: string[]; opens: string; closes: string }
export interface NavItem { label: string; url: string; children?: NavItem[] }
export interface Redirect { from: string; to: string; status?: number }

export interface SiteConfig {
  site: { url: string; name: string; language: string; locale: string; titleSuffix?: string; defaultOgImage?: string };
  business: {
    type: string; name: string; legalName?: string; description?: string;
    phone?: string; phoneDisplay?: string; email?: string; logo?: string; priceRange?: string;
    address: { street?: string; city?: string; region?: string; postalCode?: string; country?: string };
    hideAddress?: boolean; geo?: { lat?: string; lng?: string };
    areaServed?: string[]; hours?: Hours[]; sameAs?: string[]; licenses?: string[]; googleMapsUrl?: string;
  };
  nav: NavItem[];
  cta: { label: string; url: string };
  blog: { title: string; description: string; perPage: number };
  integrations: {
    gtmId?: string; ga4Id?: string; clarityId?: string; googleSiteVerification?: string;
    form?: { provider: 'ghl' | 'formspree' | 'custom' | 'none'; embedUrl?: string; action?: string; height?: number };
  };
  redirects?: Redirect[];
  deploy?: Record<string, unknown>;
}

export const config = raw as unknown as SiteConfig;
export const site = config.site;
export const business = config.business;
export const SITE_URL = site.url.replace(/\/+$/, '');

/** Absolute https URL for a root-relative path (canonical, og:url, schema). */
export const absoluteUrl = (p = '/') => (/^https?:\/\//.test(p) ? p : SITE_URL + (p.startsWith('/') ? p : '/' + p));

/** Hostname that loads tracking. Staging (*.pages.dev) and local previews never load it. */
export const productionHost = new URL(SITE_URL).hostname.replace(/^www\./, '');

const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function daysLabel(days: string[]): string {
  const idx = days.map((d) => DAY_ORDER.indexOf(d)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!idx.length) return '';
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const short = (i: number) => DAY_ORDER[i].slice(0, 3);
  return idx.length > 2 && contiguous ? `${short(idx[0])}–${short(idx[idx.length - 1])}` : idx.map(short).join(', ');
}

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

export const formatDate = (d: Date, locale = site.locale.replace('_', '-')) =>
  d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
