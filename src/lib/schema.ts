// JSON-LD builders. Only real values from site.config.json / content front matter are emitted;
// empty fields are dropped, never invented. Reviews/aggregateRating are deliberately not supported here
// (self-serving review markup from Google/Yelp reviews is not allowed — see references/seo.md).
import { business, site, SITE_URL, absoluteUrl } from './site';

type Json = Record<string, unknown>;
const BUSINESS_ID = `${SITE_URL}/#business`;

/** Remove empty strings, empty arrays and empty objects recursively. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean).filter((v) => !isEmpty(v)) as T;
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) { const c = clean(v); if (!isEmpty(c)) out[k] = c; }
    return out as T;
  }
  return value;
}
const isEmpty = (v: unknown) => v === '' || v === undefined || v === null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Array.isArray(v) && !Object.keys(v).length);

export function localBusiness(): Json {
  const a = business.address;
  return clean({
    '@context': 'https://schema.org',
    '@type': business.type || 'LocalBusiness',
    '@id': BUSINESS_ID,
    name: business.name,
    legalName: business.legalName,
    description: business.description,
    url: SITE_URL + '/',
    telephone: business.phone,
    email: business.email,
    logo: business.logo ? absoluteUrl(business.logo) : '',
    image: site.defaultOgImage ? absoluteUrl(site.defaultOgImage) : '',
    priceRange: business.priceRange,
    address: business.hideAddress ? undefined : { '@type': 'PostalAddress', streetAddress: a.street, addressLocality: a.city, addressRegion: a.region, postalCode: a.postalCode, addressCountry: a.country },
    geo: business.geo?.lat && business.geo?.lng ? { '@type': 'GeoCoordinates', latitude: business.geo.lat, longitude: business.geo.lng } : undefined,
    areaServed: areaServed(business.areaServed || []),
    knowsAbout: SERVICES,
    hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Remodeling services', itemListElement: SERVICES.map((name) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name } })) },
    foundingDate: '2025',
    hasCredential: (business.licenses || []).map((name) => ({ '@type': 'EducationalOccupationalCredential', credentialCategory: 'license', name, recognizedBy: { '@type': 'State', name: 'Michigan' } })),
    openingHoursSpecification: (business.hours || []).filter((h) => h.opens && h.closes).map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes })),
    sameAs: business.sameAs,
  });
}

/** Services from the client's intake (Fillout CSV). */
const SERVICES = ['Kitchen remodeling', 'Bathroom remodeling', 'Basement finishing', 'Insulation', 'Drywall hanging and finishing', 'Painting', 'Tile and LVP flooring', 'Custom tile showers', 'Kitchen backsplash', 'Carpentry and trim work', 'Door replacement', 'Cabinet installation', 'Drop ceiling installation'];

/** "Holland, MI" → City in Michigan; anything else → AdministrativeArea. */
function areaServed(names: string[]): Json[] {
  return names.map((name) => {
    const m = name.match(/^(.+),\s*MI$/);
    return m ? { '@type': 'City', name: m[1], containedInPlace: { '@type': 'State', name: 'Michigan' } } : { '@type': 'AdministrativeArea', name };
  });
}

export function service(opts: { name: string; description: string; url: string; areaServed?: string[] }): Json {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.url),
    provider: { '@id': BUSINESS_ID },
    serviceType: opts.name,
    areaServed: areaServed(opts.areaServed || business.areaServed || []),
  });
}

export function breadcrumbs(items: { name: string; url: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.url) })),
  };
}

export function blogPosting(opts: { title: string; description: string; url: string; date: Date; updated?: Date; author?: string; image?: string }): Json {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: opts.title,
    description: opts.description,
    mainEntityOfPage: absoluteUrl(opts.url),
    datePublished: opts.date.toISOString().slice(0, 10),
    dateModified: (opts.updated || opts.date).toISOString().slice(0, 10),
    author: opts.author ? { '@type': 'Person', name: opts.author } : { '@type': 'Organization', name: business.name },
    publisher: { '@id': BUSINESS_ID },
    image: opts.image ? absoluteUrl(opts.image) : '',
  });
}

/** Only for FAQs that are visible on the same page. */
export function faqPage(faqs: { question: string; answer: string }[]): Json | null {
  if (!faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
  };
}

/** VideoObject for a self-hosted project video. uploadDate = the day it was published on this site. */
export function videoObject(opts: { name: string; description: string; contentUrl: string; thumbnailUrl: string; duration: string; uploadDate: string }): Json {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: opts.name,
    description: opts.description,
    contentUrl: absoluteUrl(opts.contentUrl),
    thumbnailUrl: absoluteUrl(opts.thumbnailUrl),
    duration: opts.duration,
    uploadDate: opts.uploadDate,
    publisher: { '@id': BUSINESS_ID },
  });
}
