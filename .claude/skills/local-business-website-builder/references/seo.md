# Technical & Local SEO

Astro sites render every page to static HTML at build time, so crawlers get complete content without running JavaScript. `Seo.astro` emits the per-page tags; your job is real, specific copy and a sound URL/link structure.

## Every indexable page

| Element | Standard |
|---|---|
| `<title>` | Unique, ~30–60 chars, primary topic first, brand last: `Roof Repair in Boise, ID \| Acme Roofing` |
| Meta description | Unique, ~70–160 chars, honest summary + reason to click |
| Canonical | Absolute, self-referencing, matches the served URL exactly (https, host, trailing slash) |
| H1 | Exactly one, describes the page; H2/H3 follow structure. H4–H6 only for genuinely deeper content. Never pick levels for styling. |
| URL | Lowercase, hyphenated, stable, trailing slash (directory style) |
| Open Graph | `og:title`, `og:description`, `og:url`, `og:type`, `og:image` (1200×630, absolute), `twitter:card=summary_large_image` |
| Internal links | Descriptive anchors ("roof repair services", not "click here"); every page reachable within ~3 clicks; crawlable `<a href>` |
| Language | `<html lang="en">` (or client language) |

## Site-level

- `robots.txt`: allow all, `Sitemap: https://domain/sitemap.xml` (generated into `dist/` by the hosting-files integration unless `public/robots.txt` exists). Never `Disallow: /`, never a site-wide `noindex` — `main` is what production builds. Staging is noindexed only by the host-scoped `X-Robots-Tag` in `_headers` (`*.pages.dev`).
- `sitemap.xml`: generated on every build from the built pages — indexable only (excludes `noindex`, 404, pages whose canonical points elsewhere); blog pagination pages included (unique items). `lastmod` only where a real date exists (posts' `updated`/`date`). `validate.mjs` cross-checks sitemap ↔ pages.
- HTTPS + one host (www or apex) enforced by 301; HTTP and alternate host redirect in one hop.
- Status codes: real 404 for missing pages, 301 for moved, 410 for deliberately removed if useful. No soft 404s.
- Trailing slash: directory URLs (`/about/`); Apache `DirectorySlash` 301s `/about` → `/about/`. Internal links always use the final form.
- Duplicate content: no duplicate pages under two URLs, no indexable `?utm` variants (canonical handles), no near-identical city pages.
- Pagination: `/blog/page/2/` self-canonical, linked with plain `<a>` prev/next; don't canonical everything to page 1; don't noindex pagination unless thin.
- Breadcrumbs on nested pages (visible + `BreadcrumbList` JSON-LD) — the `Breadcrumbs` component renders both from one list.
- `noindex` a page only deliberately (thank-you pages, internal tools): `<BaseLayout noindex>` — it also leaves the sitemap automatically.

## Structured data (JSON-LD)

`src/lib/schema.ts` builds JSON-LD from `site.config.json` and content front matter; render with `<JsonLd slot="head" data={…} />`. `localBusiness()` emits LocalBusiness (or the subtype in `business.type`, e.g. `RoofingContractor`, `Dentist`, `Restaurant`, `Plumber`, `LegalService`) — empty fields are omitted, never fabricated. Put it on the homepage (and contact page), not every page. Service, BreadcrumbList, BlogPosting and FAQPage are emitted by the service/location/post layouts, `Breadcrumbs` and `FaqList`. (Legacy static repos: `<!-- @include schema:localbusiness --><!-- @endinclude -->`.)

Other types when they truly apply:

| Page | Type |
|---|---|
| Service page | `Service` with `provider` → the business `@id`, `areaServed` |
| Location page (real office) | separate LocalBusiness with its own address |
| Blog post | `BlogPosting` (auto) |
| FAQ section | `FAQPage` only if Q&A is visible on the page; note Google shows FAQ rich results mainly for authoritative gov/health sites — still fine as markup |
| Breadcrumbs | `BreadcrumbList` |
| Reviews | Only first-party reviews actually collected on the site, displayed visibly, and eligible. Never self-serving aggregateRating from Google/Yelp reviews on LocalBusiness. Never invented. |

Validate with Google's Rich Results Test / Schema.org validator (manual, needs public URL) — `validate.mjs` only checks JSON parses and required keys.

## Local SEO content

- NAP identical on site, schema and Google Business Profile (ask for GBP details; don't guess).
- One strong page per core service (`services` collection). A service-area page (`locations` collection, dynamic route) only when there's unique, useful content for that area: projects there, specific regulations, team, testimonials from there. Dynamic routes are for maintainability, not for mass-producing city × service pages: the schema requires ≥ 3 local details and `validate.mjs` fails pages that differ only by the town name.
- Contact page: full address (or service-area statement if no storefront), embedded map optional (lazy, click-to-load), hours, phone, form.
- Footer: NAP, hours, primary links, licence numbers if provided.
- Real photos, project galleries, FAQs answering real customer questions.

## Redirects

One list in `site.config.json`; the build writes it to `dist/_redirects` (Cloudflare) and into `dist/.htaccess` (Apache/Hostinger). WP Engine ignores `.htaccess` — add the same list in its User Portal (`deploy-settings.mjs --host wpengine` prints it).

```json
"redirects": [
  { "from": "/roof-repair-boise/", "to": "/services/roof-repair/", "status": 301 },
  { "from": "/category/news/*", "to": "/blog/", "status": 301 },
  { "from": "/old-blog/*", "to": "/blog/*", "status": 301 }
]
```

`*` at the end of `from` matches everything below; `*` at the end of `to` carries the rest of the path along. One hop, to the closest equivalent page, never blanket to the homepage. The build **fails** on chains, self-redirects, missing targets, or a redirect from a URL that still has a page. `migration-check.mjs` verifies every old URL resolves (page or redirect). Legacy static repos: rules go directly in `.htaccess` (and `_redirects` when staging is on).
