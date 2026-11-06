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
5. **Production (manual, owner-approved):** Actions → "Deploy production" → Run workflow (type the domain). Uploads only `dist/`. Target: cloudflare-pages (pushes to `main` deploy live; the Hostinger workflow is not used).
   Claude never runs it, and never changes DNS, domains, hosting panels or production settings, without the owner's explicit approval in the conversation.

## Hosting
- Production host: Cloudflare Pages, same project as staging (`cruzconstructionlandscapingllc`) → https://cruzconstructionlandscapingllc.com (bare domain primary; www 301 → bare). Owner approved go-live and DNS change 2026-11-02. **Every push to `main` now deploys live.** Previous DNS: apex A 54.149.79.189 and 34.216.117.25 (old site), no www.
- Staging: Cloudflare Pages project `cruzconstructionlandscapingllc` → https://cruzconstructionlandscapingllc.pages.dev (GitHub `main`, `npm run build` → `dist`)
- GitHub environment `production` with required reviewer: TODO (yes/no)

## Integrations
- GTM / GA4 / Clarity / forms / booking: TODO (IDs in `site.config.json` → `integrations`; tracking loads on the production hostname only)

## Deviations from the standard
- `@fontsource/barlow-condensed` and `@fontsource/ibm-plex-sans` added (self-hosted fonts, no Google Fonts request).
- Starter blog and permalink routes removed: no blog yet, no WordPress URLs to keep.
- **SMS compliance (A2P 10DLC), 2026-11-06:** the LeadConnector chat widget (`ChatWidget.astro`, `integrations.chatWidget`, loads on every page) is the ONLY thing on the site that collects phone numbers. No other form may have a phone field. `EstimateForm.astro` is now a panel with no form that opens the chat; every `#estimate` link opens the chat. The feedback form asks for name + email only. Privacy policy and terms carry the carrier SMS language (no sharing of mobile opt-in data, STOP/HELP, frequency, rates).
- Facts source: the client's Fillout CSV only. The concept presentation (dotcommatrix360.com/cruz/) is for layout/sections; its phone, services and owner name are placeholders.
- Headings: on every page the H1 is the small keyword line ("Kitchen Remodeling in Holland, MI"); the big display title is a conversion headline (`headline:` in service front matter). Owner's rule.
- No /services/ overview page (owner's choice): header Services dropdown lists each service page; /services/ 301 → /. Every service and area page has the estimate panel (opens the chat) in the hero (`FormHero.astro`). Sticky Call / Free estimate bar on all screen sizes.
- Service-area page: Holland, MI only (`src/content/locations/holland-mi.md`). Add more towns only when the client confirms them.

## Reviews
- Two Facebook recommendations (Denise L., Madeline L.) in `src/content/testimonials/testimonials.json`, provided by the owner 2026-11-02; shown as section 2 on home and after the hero on every service page. Facebook shows recommendations, not stars: never claim a star rating. A third (Tony N.) was left out because it says he had not seen the work yet. "Satisfaction guaranteed" only if the client confirms the guarantee and its terms.

## Business cards
- Print files in /home/user/cruz-business-cards (outside the repo). Their reviews QR points straight at https://cruzconstructionlandscapingllc.com/feedback/ ("How did we do?" feedback page, noindex; 4-5 stars go to the review site, 1-3 stars to a private form with no public review link, owner's choice 2026-11-02, a Google review-gating risk). Its buttons come from `site.config.json` → business.reviewLinks: add the Google review link once the Business Profile is verified and the Google button appears; printed cards keep working.
- The "10% off your remodel" QR points at /offer (302 → /#estimate for now). Point it at the GHL offer page once it exists. The 10% offer comes from the agency presentation: the client must confirm it before printing. No review incentives (Google/Facebook/FTC rules).

## Open TODOs from client
- Real project photos (none supplied; per owner instruction 2026-11-02 the site uses stock photos for now, unlabelled at the owner's request — sources in `src/assets/images/CREDITS.md`, replace when real photos arrive) · business address · license number · owner name · working days · confirm service area · form destination (GHL/Formspree) · GA4/GTM IDs · production domain/host
