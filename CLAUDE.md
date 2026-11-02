# Client site notes

Use the `local-business-website-builder` skill for all work in this repo. Agency standard: **Astro, static output.**

## Business (fill in; facts live in `site.config.json`, client-confirmed only)
- Name / industry / service area: Cruz Construction & Landscaping LLC · kitchen, bathroom, basement remodeling and finish trades · Holland, MI & West Michigan (area carried over from the client's Canva site; confirm)
- Primary conversion: call 616-502-1874 or the estimate form → support@cruzconstructionlandscapingllc.com (owner forwards to the client; set up the mailbox/forward before launch). No form endpoint yet.
- Brand source: client logo (white/grey on black) + the approved dark concept (concept 1) · Fonts: Barlow Condensed + IBM Plex Sans (self-hosted via @fontsource)

## How this site is built
- Astro (`output: 'static'`) → plain HTML/CSS/JS in `dist/`. No server, no adapter, no React/Vue unless a feature genuinely needs it (record why below).
- Pages: `src/pages/`. Shared UI: `src/components/`. Page templates: `src/layouts/`. Tokens: `src/styles/tokens.css` (the only place colors/type/spacing are defined).
- Repeated content = content collections in `src/content/` (blog, services, locations, testimonials), schemas in `src/content.config.ts`. One route renders each collection; `permalink:` keeps an old URL exactly.
- Business facts, nav, CTA, integrations, redirects, hosting: `site.config.json` (single source of truth).
- Images: originals in `src/assets/images/`, rendered with `<ResponsiveImage>` (AVIF/WebP, width/height, lazy; `priority` only for the hero). Real client photos only — never present AI-generated or stock images as the client's work.
- `integrations/hosting-files.mjs` writes `sitemap.xml`, `robots.txt`, `_redirects` and the `.htaccess` redirects into `dist/` on every build.
- Never commit `dist/`, `node_modules/`, `.astro/`, `.env*` or credentials. Always commit `package-lock.json` (CI and the deploy workflow use `npm ci`; staging and production must install identical versions).

## Workflow (one repo, one branch: `main`)
1. Edit sources → `npm run build` → `npm run validate` → `npm run check:protection` (zero errors) → `npm run check:browser`.
2. Commit directly to `main` and push. No other branches.
3. **Staging (automatic):** Cloudflare Pages builds `main` (framework Astro, `npm run build`, output `dist`, Node from `.node-version`). https://cruzconstructionlandscapingllc.pages.dev (project `cruzconstructionlandscapingllc`, `NODE_VERSION=22.22.0`, preview deployments off) — noindexed by `public/_headers`.
   Claude may manage this staging project with `cloudflare-pages.mjs` (detect/create/configure/status/logs/retry/verify).
4. Claude reports "Ready for production approval" with test evidence.
5. **Production (manual, owner-approved):** Actions → "Deploy production" → Run workflow (type the domain). Uploads only `dist/`. Target: TODO (hostinger | wpengine | cloudflare-pages).
   Claude never runs it, and never changes DNS, domains, hosting panels or production settings, without the owner's explicit approval in the conversation.

## Hosting
- Production host: TODO · path/project: TODO
- Staging: Cloudflare Pages project `cruzconstructionlandscapingllc` → https://cruzconstructionlandscapingllc.pages.dev (GitHub `main`, `npm run build` → `dist`)
- GitHub environment `production` with required reviewer: TODO (yes/no)

## Integrations
- GTM / GA4 / Clarity / forms / booking: TODO (IDs in `site.config.json` → `integrations`; tracking loads on the production hostname only)

## Deviations from the standard
- `@fontsource/barlow-condensed` and `@fontsource/ibm-plex-sans` added (self-hosted fonts, no Google Fonts request).
- Starter blog and permalink routes removed: no blog yet, no WordPress URLs to keep.
- Estimate form (concept 1, three fields) on home + contact. Until the client picks a destination (GHL/Formspree) it opens the visitor's email app pre-filled to the business email (`EstimateForm.astro`); set `integrations.form` to switch it to the real endpoint.
- Facts source: the client's Fillout CSV only. The concept presentation (dotcommatrix360.com/cruz/) is for layout/sections; its phone, services and owner name are placeholders.
- Headings: on every page the H1 is the small keyword line ("Kitchen Remodeling in Holland, MI"); the big display title is a conversion headline (`headline:` in service front matter). Owner's rule.
- No /services/ overview page (owner's choice): header Services dropdown lists each service page; /services/ 301 → /. Every service and area page has the estimate form in the hero (`FormHero.astro`). Sticky Call / Free estimate bar on all screen sizes.
- Service-area page: Holland, MI only (`src/content/locations/holland-mi.md`). Add more towns only when the client confirms them.

## Open TODOs from client
- Real project photos (none supplied; per owner instruction 2026-11-02 the site uses labelled stock photos for now — sources in `src/assets/images/CREDITS.md`, replace when real photos arrive) · reviews with permission · business address · license number · owner name · working days · confirm service area · form destination (GHL/Formspree) · GA4/GTM IDs · production domain/host
