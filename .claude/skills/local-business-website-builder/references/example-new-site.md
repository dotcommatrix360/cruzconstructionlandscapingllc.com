# Worked Example: New Local Business Site (Astro)

`examples/astro-sample/` is the finished content for this walkthrough for a **fictional** roofer, "Summit Peak
Roofing" (Boise, ID). `node $S/selftest-astro.mjs --keep` builds it end to end and prints the folder.

## The request

> "New site for Summit Peak Roofing. Home, services (repair, replacement), Boise and Meridian area pages, contact,
> blog with the 3 posts attached — they had a WordPress site, keep the post URLs. One roof photo attached. Hostinger."

## 1. Inspect & scope

- Empty repo → new site → Astro starter. Read any client notes.
- Missing facts noticed: GA4/GTM IDs, form destination, licence number. → Don't invent; TODOs + report. Ask only if blocking.

## 2. Scaffold

```bash
node $S/init.mjs && npm install
```

Fill `site.config.json`: real `site.url`, `business` (type `RoofingContractor`, E.164 phone + display, address,
areaServed, hours), `nav`, `cta`, `blog`, `integrations.form` (Formspree endpoint the client created), `deploy`.

## 3. Migration inventory first (old WordPress site)

```bash
node $S/migration-check.mjs https://old-site.com/sitemap_index.xml --save _migration/old-urls.txt
```

Decide the URL map now: posts lived at the root (`/how-to-spot-hail-damage/`) → `permalink:` on those entries;
`/roof-repair-boise/` → redirect to `/services/roof-repair/`; `/category/*` → `/blog/`.

## 4. Design

Tokens from the logo/brand → `src/styles/tokens.css` (navy + amber, contrast-checked). Restyle `Hero`, cards, CTA band;
give the homepage its own section rhythm. Load the `frontend-design` skill for direction if no design was supplied.

## 5. Images

1. Read `IMG_2041.jpg` → a dark shingle roof at sunset.
2. `{"IMG_2041.jpg": "asphalt-shingle-roof-at-sunset"}` → `optimize-images.mjs IMG_2041.jpg --rename map.json` → `src/assets/images/asphalt-shingle-roof-at-sunset.jpg` (2400 px master).
3. `import roof from '../assets/images/asphalt-shingle-roof-at-sunset.jpg'` → `<Hero image={roof} imageAlt="Dark asphalt shingle roof against an orange sunset sky" …>` (priority hero; AVIF/WebP sizes generated at build).

## 6. Content

- `src/content/services/roof-repair.md`, `roof-replacement.md` — real copy, FAQs the client actually answers.
- `src/content/locations/boise-id.md`, `meridian-id.md` — each with genuinely local details (permits, HOA rules, housing age). No third town until there's something real to say.
- `src/content/blog/*.md` — the three posts with original dates; `permalink:` for the two that lived at the root.
- Pages: `src/pages/index.astro`, `services/index.astro`, `service-areas/index.astro`, `contact.astro` — TODO-free.

## 7. Build & QA

```bash
npm run build                       # 13 pages + sitemap, robots, _redirects, .htaccess redirects
node $S/validate.mjs                # 0 errors, 0 warnings on the sample
node $S/check-protection.mjs        # dist/ public-only, /_astro/ served, staging noindex, deploy workflow manual
node $S/migration-check.mjs _migration/old-urls.txt   # every old URL kept or 301'd
node $S/browser-check.mjs           # 96 checks (12 pages × 8 widths) + axe
npm run check:types
```

## 8. Staging

```bash
node $S/cloudflare-pages.mjs detect && node $S/cloudflare-pages.mjs create && node $S/cloudflare-pages.mjs create --yes
git push && node $S/cloudflare-pages.mjs status --wait && node $S/cloudflare-pages.mjs verify
```

Submit the contact form once with "TEST" and confirm it arrives.

## 9. Production (owner)

`node $S/deploy-settings.mjs --host hostinger` lists what's needed: SSH enabled in hPanel, deploy key, the five
secrets + `HOSTINGER_PATH`, `production` environment with the owner as reviewer, Hostinger Git auto-deploy off.
After approving staging the owner runs **Actions → Deploy production**, types the domain, approves; the workflow
backs up `public_html`, uploads `dist/` only and probes the live site.

## 10. Report

Per the qa.md template: pages/posts built, images, tests with real numbers, not-run items (Rich Results Test,
real iOS Safari), client TODOs (GA4 ID, licence number), staging URL + verify result, "Ready for production approval".
