# Client site notes

Use the `local-business-website-builder` skill for all work in this repo. Agency standard: **Astro, static output.**

## Business (fill in; facts live in `site.config.json`, client-confirmed only)
- Name / industry / service area: TODO
- Primary conversion: TODO (call, quote form, booking)
- Brand source (Figma / brand guide / existing site): TODO · Fonts: TODO

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
3. **Staging (automatic):** Cloudflare Pages builds `main` (framework Astro, `npm run build`, output `dist`, Node from `.node-version`). TODO: https://<project>.pages.dev — noindexed by `public/_headers`.
   Claude may manage this staging project with `cloudflare-pages.mjs` (detect/create/configure/status/logs/retry/verify).
4. Claude reports "Ready for production approval" with test evidence.
5. **Production (manual, owner-approved):** Actions → "Deploy production" → Run workflow (type the domain). Uploads only `dist/`. Target: TODO (hostinger | wpengine | cloudflare-pages).
   Claude never runs it, and never changes DNS, domains, hosting panels or production settings, without the owner's explicit approval in the conversation.

## Hosting
- Production host: TODO · path/project: TODO
- Staging: TODO
- GitHub environment `production` with required reviewer: TODO (yes/no)

## Integrations
- GTM / GA4 / Clarity / forms / booking: TODO (IDs in `site.config.json` → `integrations`; tracking loads on the production hostname only)

## Deviations from the standard
- None yet.

## Open TODOs from client
- TODO
