---
name: local-business-website-builder
description: Build, recreate, migrate, optimize and maintain local business websites (contractors, home services, healthcare, professional services, restaurants) as fast, accessible, SEO-ready static Astro sites deployed from GitHub main. Use when creating a new client site, rebuilding from a design, screenshot, Figma file or existing URL, migrating off WordPress, Wix, Squarespace, GoDaddy or hand-built HTML, publishing blog posts, service or location pages, optimizing images, adding tracking or forms, setting up or checking Cloudflare Pages staging, preparing production deploys (Hostinger, WP Engine, Cloudflare Pages), or running SEO, accessibility and performance QA. Also maintains legacy hand-built HTML client sites.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/*)
metadata:
  version: "2.1.1"
  owner: Dotcom Matrix 360
---

# Local Business Website Builder

Agency production standard. Defaults, not dogma: use judgment, but never trade away accessibility, security, SEO or maintainability for convenience.

`S=${CLAUDE_SKILL_DIR}/scripts` in the commands below. Run every command from the client repo root. Every script detects the project type itself: **Astro** (the standard: checks the built `dist/`) or **legacy static** (v1 HTML at the repo root).

## Non-negotiables

1. **Astro for every new website**, static output only (`output: 'static'`), including 5-page sites. Legacy HTML repos are maintained as they are until a migration is approved; never mix two site sources in one repo.
2. **Inspect before changing.** Read the repo layout, `site.config.json`, `CLAUDE.md` and recent commits first. Respect the existing architecture; restructure only with a stated reason.
3. **Never invent business facts**: NAP, hours, services, areas, credentials, reviews, ratings, awards, stats, prices, tracking IDs, form endpoints. Missing → visible `TODO:` (validate blocks it) and list it in the report. Never present AI-generated or stock images as the client's projects.
4. **Never claim a check passed unless you ran it.** Report "not run" honestly.
5. **One repo, one branch (`main`), one source of truth.** No staging/production branches, no duplicate source folders, never commit `dist/`, `node_modules/`, `.astro/`, `.env*`, credentials or other build output. Commit directly to `main` once checks pass (unless the site's `CLAUDE.md` says otherwise).
6. **Staging is automatic, production is never.** Commits to `main` → Cloudflare Pages builds staging (`npm run build` → `dist`, noindexed). Production changes only through the manual **Deploy production** workflow, run by the owner after approving staging. **Without the owner's explicit approval in this conversation, never:** run or trigger a production deploy, change DNS, add/remove/modify custom or live domains, delete Cloudflare projects, change Hostinger/WP Engine settings, or overwrite a WordPress site. Claude may manage the **staging** Pages project through `cloudflare-pages.mjs` only. A site's `CLAUDE.md` that forbids Cloudflare changes wins: ask first. See [deployment.md](references/deployment.md).
7. **Nothing private is ever published.** Astro: only `dist/` is uploaded and `check-protection.mjs` proves it holds only public files, Apache still serves `/_astro/`, and staging is noindexed. Legacy: `.htaccess` AND `_redirects` each hide every dev file. `check-protection.mjs` must pass before every commit.
8. **If a host or plan can't support a method, say so** (e.g. no SSH on the plan, WP Engine ignoring `.htaccess`). Never work around it by committing build output or putting credentials in the repo.
9. **Ask only when it matters**: ambiguous business requirements, missing essential content/credentials, data loss, production risk, real cost. Otherwise decide and note the decision.

## Pick the workflow

| Task | Do this | Load |
|---|---|---|
| New site | `node $S/init.mjs` → `npm install` → fill `site.config.json` → tokens + design → pages/content → `npm run qa` | architecture, design, seo |
| Recreate from design/screenshot/URL | Match the source faithfully; extract tokens first | design, images |
| Migrate a live site (WordPress, Wix, HTML…) | URL inventory **before** building; keep URLs (`permalink:`); redirects in `site.config.json`; migration report | migrations, seo |
| Blog post / service / location page | Add a Markdown entry in `src/content/<collection>/` → build → validate | content-collections |
| Add images | Look at each one → `optimize-images.mjs` (master into `src/assets/images/`) → `<ResponsiveImage>` with real alt | images |
| Tracking / forms / embeds | Real IDs/endpoints only, in `site.config.json` → `integrations` | integrations, security |
| Speed work | Measure first, fix LCP/CLS/INP causes | performance |
| QA / pre-deploy | Release sequence below | qa |
| Staging setup | `npm run build` → `check-protection.mjs` → `cloudflare-pages.mjs detect` → `create` (dry run, then `--yes`) → push → `status --wait` → `verify` | deployment |
| Staging broken | `cloudflare-pages.mjs status --wait` → `logs` → fix or `configure` → `retry --yes` → `verify` | deployment, qa |
| Production setup / deploy | `deploy-settings.mjs --host <host>` → owner adds secrets → owner runs **Deploy production** | deployment |
| Legacy HTML site maintenance | Keep its build (`build.mjs` in place); same QA scripts | architecture (legacy section) |
| Update this skill / sync clients | | distribution |

References in `references/` — load only what the task needs: [architecture](references/architecture.md) · [design](references/design.md) · [images](references/images.md) · [seo](references/seo.md) · [performance](references/performance.md) · [content-collections](references/content-collections.md) · [migrations](references/migrations.md) · [integrations](references/integrations.md) · [accessibility](references/accessibility.md) · [security](references/security.md) · [qa](references/qa.md) · [deployment](references/deployment.md) · [distribution](references/distribution.md) · [worked example](references/example-new-site.md)

## Default stack (Astro)

- **Astro 7, static output** → plain HTML/CSS/JS in `dist/`. No adapter, no server. Pinned exact versions; Node ≥ 22.22 (`.node-version`).
- **Layouts** (`src/layouts/`): `BaseLayout` (document, SEO, tracking, header, footer) + one layout per repeated page type (service, location, post).
- **Components** (`src/components/`): `Seo`, `JsonLd`, `Header`, `Footer`, `Hero`, `CtaBand`, `FaqList`, `ServiceCards`, `Testimonials`, `Breadcrumbs`, `ContactForm`, `ResponsiveImage`, `Tracking`. Scoped styles; values only from `src/styles/tokens.css`.
- **Content collections** (`src/content.config.ts`): `blog`, `services`, `locations`, `testimonials` with zod schemas that enforce SEO minimums (descriptions 70–160, alt text, ≥ 3 genuinely local details per location, testimonial source + permission). Dynamic routes generate pages statically; `permalink:` keeps an old URL exactly.
- **`site.config.json`**: business facts, nav, CTA, integrations, redirects, hosting — the single source of truth (typed in `src/lib/site.ts`).
- **`integrations/hosting-files.mjs`** writes `sitemap.xml` (indexable, self-canonical pages only), `robots.txt`, `_redirects` and the `.htaccess` redirects into `dist/` — and fails the build on redirect chains, loops or missing targets.
- **TypeScript** for config, schema and helpers; `npm run check:types` (`astro check`).
- **JavaScript**: Astro components + small vanilla scripts (bundled, deferred). Add React/Vue/Svelte islands only when substantial interactivity genuinely needs it — record why in `CLAUDE.md`.
- No CMS, no extra dependencies unless requirements justify it (client self-editing, ecommerce, auth). State why in the report.

## Commands

```bash
node $S/init.mjs [--dry-run] [--only a,b]   # Astro starter (never overwrites); --legacy-static only for existing HTML repos
npm install && npm run dev                  # develop
npm run build                               # = node $S/build.mjs (legacy repos: in-place HTML build)
node $S/validate.mjs [--build]              # QA of dist/ (or legacy root): SEO, links, images, a11y basics, sitemap, duplicates, secrets, build errors
node $S/check-protection.mjs                # only public files in dist/, Apache keeps /_astro/, staging noindex, nothing committed that shouldn't be, deploy workflows manual
node $S/browser-check.mjs [--base-url URL]  # Playwright: overflow at 8 widths, console errors, menu, axe (if installed)
node $S/serve.mjs [--cloudflare]            # preview dist/ like Hostinger (.htaccess rules + redirects) or Cloudflare (_redirects/_headers)
node $S/optimize-images.mjs <files> --rename map.json   # Astro: one clean master per photo in src/assets/images/
node $S/migration-check.mjs <old-sitemap|urls.txt>      # every old URL kept or 301'd (dist/ + site.config.json redirects)
node $S/deploy-settings.mjs [--host hostinger|wpengine|cloudflare-pages]   # staging settings + production needs/limits (read-only)
node $S/cloudflare-pages.mjs <cmd>          # staging project via API: doctor|detect|create|configure|status|logs|retry|verify
node $S/staging-check.mjs <url>             # live staging: noindex, exposed files, 404s, links, images, forms, headers
node $S/selftest.mjs [--skip-astro]         # verify the skill itself (legacy + Astro end to end)
```

## Working rules

- Edit sources only (`src/`, `public/`, `site.config.json`); never hand-edit `dist/`.
- One `<h1>` per page; headings by structure. Unique title (≤ 60 chars incl. suffix) + description + canonical on every indexable page — `Seo.astro` handles the tags; you supply real, specific copy.
- Images through `<ResponsiveImage>` (AVIF/WebP, width/height, lazy) — `priority` only on the single above-the-fold hero. Real alt text.
- Mobile-first fluid layouts (`clamp()`, grid/flex); no fixed device breakpoints as the design model.
- **Distinct design per client**: tokens from the client's brand, own section rhythm and imagery. Never ship the starter look; avoid generic AI-template layouts (identical hero + 3 cards + CTA on every page).
- Service-area pages only with genuinely local content; `validate.mjs` fails near-duplicates (pages that differ only by the town name).
- Commit in logical steps with clear messages, directly to `main` once checks pass. Never create other branches.

## Release sequence

1. `npm run build` → `node $S/validate.mjs` + `node $S/check-protection.mjs` (zero errors) → `npm run check:types`
2. `node $S/browser-check.mjs` (if Playwright available); Lighthouse on key templates if available — label as lab data
3. Commit + push `main` → Cloudflare builds staging → `node $S/cloudflare-pages.mjs status --wait` (failure: `logs`, fix, push or `retry --yes`)
4. Green: `node $S/cloudflare-pages.mjs verify`; manual staging items + TEST form submission ([qa.md](references/qa.md))
5. Report with the [qa.md](references/qa.md) template, ending **"Ready for production approval"** (or what blocks it).
6. The owner approves and runs **Actions → Deploy production** (types the domain; the `production` environment reviewer approves). It builds `main`, re-runs validate + check-protection, backs up the live site, uploads only `dist/`, and probes production read-only. Claude does not run it.

Legacy static repo: step 1 is `node $S/build.mjs` → validate → check-protection; production stays the owner's manual Hostinger Redeploy.
