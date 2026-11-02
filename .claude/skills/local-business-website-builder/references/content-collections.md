# Content Collections (blog, services, locations, testimonials)

Repeated content is data, not copied pages: one Markdown/JSON entry per item in `src/content/<collection>/`, one
layout + route per collection. Schemas in `src/content.config.ts` validate every entry at build time — an incomplete
or thin entry fails `npm run build` instead of shipping.

## Collections in the starter

| Collection | Files | Route (default) | Layout | Schema highlights |
|---|---|---|---|---|
| `blog` | `src/content/blog/<slug>.md` | `/blog/<slug>/`, archive `/blog/`, `/blog/2/` … | `PostLayout` | title, description 70–160, date, optional `seoTitle` ≤ 60, `image` + `imageAlt`, category, tags, `draft`, `noindex`, `permalink` |
| `services` | `src/content/services/<slug>.md` | `/services/<slug>/` | `ServiceLayout` | title, description, summary (card), order, image + alt, visible `faqs`, `permalink` |
| `locations` | `src/content/locations/<slug>.md` | `/service-areas/<slug>/` | `LocationLayout` | name, title, description, **≥ 3 `localDetails` (30+ chars each)**, services offered, faqs, `permalink` |
| `testimonials` | `src/content/testimonials/testimonials.json` | (rendered by `Testimonials`) | — | quote, author, `source`, optional `sourceUrl`/date, **`permission: true`** |

Routes generate pages statically with `getStaticPaths` (no server): `src/pages/services/[slug].astro`,
`src/pages/service-areas/[slug].astro`, `src/pages/blog/[slug].astro`, paginated `src/pages/blog/[...page].astro`.
`src/lib/content.ts` holds `entryUrl()` so links, routes, breadcrumbs and the sitemap always agree on one URL.

## Keeping old URLs (`permalink`)

Any blog/service/location entry can set `permalink: /old-path/` — `src/pages/[...permalink].astro` builds it there and
the default route skips it, so the URL exists exactly once. Use it to keep WordPress root-level posts
(`/%postname%/`) and old service URLs. Duplicate permalinks fail the build. Anything not preserved gets a redirect in
`site.config.json` (the build fails if a redirect points at a missing page, chains, or loops).

## Writing an entry (Claude's checklist)

1. Create the file with complete front matter; clean supplied copy (no pasted styles); headings start at `##` (the layout renders the H1).
2. Images: look at each one → `optimize-images.mjs` (master in `src/assets/images/`) → front matter `image: ../../assets/images/<name>.jpg` + real `imageAlt`.
3. 2–4 contextual internal links to related services/areas/posts; link back from a relevant page where natural.
4. FAQs only if they answer real customer questions and are visible on the page (FAQPage JSON-LD is emitted from the same data).
5. `npm run build` → `validate.mjs` → fix errors → commit (`Publish blog post: <title>`). Report the URL.

## Service-area (location) pages — rules

Dynamic routes make it trivially easy to stamp out "City × Service" pages. Don't:

- Publish an area page only when there is genuinely local, useful content: projects there, local permits/codes, HOA rules, terrain/climate issues, travel time, team based there, testimonials from there.
- The schema requires three specific `localDetails`; `validate.mjs` fails pages that are ≥ 80% identical after masking the swapped place name (and warns at ≥ 60%), and warns on thin pages (< 150 words of main content).
- Fewer strong pages beat many thin ones. If the client wants a page per town but there is nothing local to say, recommend a single "Service areas" page listing the towns instead.
- Never invent local facts (projects, permits, reviews) to make a page look unique.
- Migrations only: when the owner explicitly approves keeping existing near-duplicate pages verbatim (to protect rankings while the client writes local copy), list their URL paths in `site.config.json → seo.approvedDuplicates`. `validate.mjs` then reports those pairs as warnings marked "owner-approved exception" instead of blocking. Record who approved it and when in `CLAUDE.md`; remove entries as pages get rewritten.

## Other collection types

Add them the same way (schema in `content.config.ts`, a layout, a route): **projects/portfolio** (real photos only, service category), **case studies** (no invented numbers), **team** (names/roles as the client provides), **resources** (PDFs in `public/docs/`). Keep the `permalink` field if old URLs must survive.

Filtering/search: under ~50 items, category pages suffice. Beyond that, generate a JSON index at build time and add a small client-side filter (progressive enhancement; the crawlable lists remain). Never make search results indexable.

---

## Legacy static repos (v1 `build.mjs` collections)

Legacy sites keep `_content/<collection>/*.md` + `_templates/*.html`, rendered by `build.mjs`.

### Config (`site.config.json`)

```json
"collections": [
  {
    "name": "blog",
    "label": "Blog",
    "source": "_content/blog",
    "output": "blog",
    "itemTemplate": "_templates/article.html",
    "archiveTemplate": "_templates/archive.html",
    "perPage": 9,
    "categories": true,
    "schemaType": "BlogPosting",
    "archiveTitle": "Roofing Tips & News",
    "archiveDescription": "Advice on roof repair, replacement and maintenance from Acme Roofing."
  }
]
```

Outputs: `/blog/<slug>/index.html`, `/blog/index.html`, `/blog/page/<n>/index.html`, `/blog/category/<category-slug>/index.html` (+ its pages). Categories with fewer than `minCategoryItems` (default 2) items get no archive page (avoids thin pages). Set `"archive": false` for collections that shouldn't have a listing (e.g. testimonials consumed elsewhere).

### Item file

`_content/blog/how-to-spot-hail-damage.md`

```markdown
---
title: How to Spot Hail Damage on Your Roof
description: Five signs of hail damage homeowners can check safely from the ground, and when to call a roofer.
date: 2026-10-01
updated: 2026-10-10
author: Jane Doe
image: /assets/images/hail-damaged-shingles-960.webp
imageAlt: Close-up of shingles with circular hail impact marks
imageWidth: 960
imageHeight: 640
category: Roof Repair
tags: [hail, inspections]
draft: false
---

Intro paragraph…

## First sign
…
```

Required: `title`, `description`, `date`. Optional `seoTitle` overrides the `<title>` when the headline is too long (keep ≤ 60 chars). Slug = filename (date prefix like `2026-10-01-` stripped) unless `slug:` is set. `draft: true` → not built. `noindex: true` → built, excluded from sitemap. `redirectFrom: [/old/path/]` → noted in build output so you add the 301.

Body: Markdown (headings start at `##` — the template supplies the H1), or raw HTML blocks. If `marked` is installed it's used; otherwise the built-in converter (headings, lists, links, images, emphasis, code, blockquotes, tables, raw HTML).

### Publishing a post (Claude's checklist)

1. Create the `.md` file with complete front matter; clean the supplied copy (no pasted styles), headings from H2.
2. Images: inspect → rename → `optimize-images.mjs` → reference with width/height + alt.
3. Add 2–4 contextual internal links to relevant service pages and posts; add a link from a relevant existing page back to the post if natural.
4. `node $S/build.mjs` — generates the page, archives, pagination, category pages, related posts, sitemap; removes stale generated pages.
5. `node $S/validate.mjs` — fix errors.
6. Commit: `Publish blog post: <title>`. Report the URL.

### Templates

Template variables (Handlebars-like: `{{x}}` escaped, `{{{x}}}` raw, `{{#each}}`, `{{#if}}`, `{{else}}`, `{{#unless}}`):

- Item: `site`, `collection`, `item` (`title, seoTitle, description, url, canonical, date, dateDisplay, updated, updatedDisplay, author, image, imageAlt, imageWidth, imageHeight, category, categoryUrl, tags, readingMinutes, html`), `related[]`, `breadcrumbs[]`, `{{{schema}}}`.
- Archive: `site`, `collection`, `archive` (`title, description, canonical, h1, pageNumber, totalPages, isFirst`), `items[]`, `pagination` (`prev, next, pages[{number,url,current}]`), `categories[]`, `breadcrumbs[]`, `{{{schema}}}`.

Templates also contain include markers (header/footer), so they share the site chrome. Customize templates per client; keep variables.

### Other collection types

| Collection | Notes |
|---|---|
| Projects / portfolio | `itemTemplate` with gallery; categories = service type; real project photos only |
| Case studies | Problem/solution/result; don't invent numbers |
| Locations | Only real offices or genuinely unique service-area content; `archive` = directory |
| Resources | Downloadable guides; PDFs in `assets/docs/` |
| Testimonials | Real, attributable, with permission; usually `"archive": false` and rendered into pages manually |

Filtering/search: for < ~50 items, category archives suffice. Beyond that, add client-side filtering over a generated JSON index (progressive enhancement; the crawlable archives remain). Avoid search result pages being indexable.

### Migrations

Preserve old post URLs with the collection's `permalink` pattern (tokens `{slug}`, `{yyyy}`, `{mm}`, `{dd}`, `{category}`):

| Old platform URL | Setting |
|---|---|
| WordPress `/%postname%/` | `"permalink": "/{slug}/"` (archives still live under `output`, e.g. `/blog/`) |
| WordPress `/%year%/%monthnum%/%postname%/` | `"permalink": "/{yyyy}/{mm}/{slug}/"` |
| Squarespace `/blog/post-slug` | default (`/blog/{slug}/`) — Apache adds the trailing slash via 301 |
| Wix `/post/post-slug` | `"permalink": "/post/{slug}/"` |

Set per-item `slug:` to match the old slug exactly. Anything that can't be preserved gets a 301.
