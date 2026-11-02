# Changelog

All notable changes to `local-business-website-builder`. SemVer: MAJOR = changes to the default stack or anything that needs client-repo migration.

## 2.1.1 — 2026-10-17

Fixes found while migrating the first real client (McSwain Builders) from hand-built HTML to Astro:
- `init.mjs`: when a repo already has a `.gitignore`, the essential rules (`dist/`, `.astro/`, `node_modules/`, `.env`, `.env.*`, `!.env.example`) are merged in instead of the file being skipped — otherwise the first build output gets committed.
- Astro starter `ResponsiveImage`: JPEG fallback for photos (PNG only for PNG/SVG sources). Astro's default PNG fallback for WebP masters produced files up to ~1 MB.
- The skills repo ignores `.claude/worktrees/`.

## 2.1.0 — 2026-10-17

- `site.config.json → seo.approvedDuplicates` (list of URL paths): owner-approved exception for keeping existing near-duplicate pages verbatim during a migration. Pairs where both pages are listed are reported as `duplicate-content` warnings marked "[owner-approved exception]" instead of blocking errors. Documented in content-collections.md (record the approval in the site's CLAUDE.md).

## 2.0.0 — 2026-10-17

**Astro is now the mandatory framework for every new website** (static output only, including small sites). The
principles stay the same: one repo per site, one branch (`main`), one source of truth, automatic noindexed staging,
production only with the owner's explicit approval. What changes is how the site is built and how production is
deployed. Legacy hand-built HTML repos keep working unchanged.

### Conflicts resolved from 1.2.x
- "Hand-written HTML default; escalate to a framework only when justified" → Astro for all new sites.
- "No `dist/`, no second build system, no deploy workflows; production = owner's Hostinger Redeploy" → `dist/` is built (never committed) by Cloudflare for staging and by a **manual, owner-approved GitHub Actions workflow** for production; it uploads only `dist/`.
- Cloudflare staging `exit 0` / output `/` → Astro preset, `npm run build`, output `dist` (legacy repos unchanged).
- Starter `.htaccess` rule `(^|/)_ → 404` would block Astro's `/_astro/` assets on Hostinger → new Astro `.htaccess` hides only dotfiles and `_headers`/`_redirects`; `check-protection.mjs` fails if `/_astro/` is blocked.
- seo.md told readers to noindex staging with `site.noindex` while deployment.md forbade it → one rule everywhere: host-scoped `X-Robots-Tag` in `_headers` only.
- "Never mass-generate city × service pages" vs dynamic location routes → dynamic routes kept for maintainability; uniqueness enforced (schema requires ≥ 3 local details; validate fails near-duplicates).

### Added
- **Astro starter** (`templates/astro/`): Astro 7.4.0 static, TypeScript, pinned deps, `.node-version` 22.22.0; `BaseLayout` + service/location/post layouts; components (Seo, JsonLd, Tracking, Header with accessible mobile menu, Footer, Hero, CtaBand, FaqList, ServiceCards, Testimonials, Breadcrumbs, ContactForm, ResponsiveImage); design tokens; content collections (blog with pagination, services, locations, testimonials) with zod schemas enforcing SEO minimums; static dynamic routes; `[...permalink]` route that keeps old URLs exactly; contact form for GHL/Formspree/custom; production-host-only tracking; `CLAUDE.md` with the agency rules; `quality.yml` and `deploy-production.yml` workflows.
- `integrations/hosting-files.mjs` (in the starter): writes `sitemap.xml` (indexable, self-canonical only), `robots.txt`, `_redirects` and `.htaccess` redirects from `site.config.json → redirects`; **fails the build** on redirect chains, self-redirects, missing targets or redirects from URLs that still have a page.
- **Deploy production workflow**: manual `workflow_dispatch` only, `main` only, typed-domain confirmation, `production` environment (required reviewer), `npm ci` → build → validate → check-protection → host backup → upload `dist/` only → read-only live verification (homepage is the Astro build, real 404, private paths not served, no noindex). Targets: Hostinger (SSH/rsync, tarball backup, `.well-known` protected), WP Engine (SSH Gateway, backup, never `--delete`, refuses to overwrite WordPress unless the owner sets `WPENGINE_ALLOW_ROOT=true`, skips Apache/Cloudflare-only files), Cloudflare Pages (separate production project and token; refuses the staging project).
- `lib/project.mjs`: every script detects Astro vs legacy static and inspects the right folder (`dist/` vs repo root).
- `lib/deploy.mjs`: deploy-workflow rules — deploying workflows must be manual-only, upload only `dist/`, take credentials from secrets (inline credentials, private keys, automatic triggers and non-dist uploads are errors; missing `environment: production`, `set -x`, `--delete` on WP Engine are warnings). Legacy repos keep the v1 rule (no deploy workflows).
- `protect.mjs`: `scanDist` / `auditDist` — no configs, Markdown/TS/Astro sources, env files, archives or dotfiles in `dist/` (source maps warned), Apache rules correct for `/_astro/`, staging noindex, `.htaccess` hidden on Cloudflare.
- `validate.mjs`: Astro mode on `dist/`; `--build` runs the build and reports build errors; `build-missing`/`build-stale`; `img-placeholder`; **near-duplicate page detection** (5-word shingles with the swapped place/service name masked; ≥ 80% = error on Astro, warning on legacy; ≥ 60% warning) and **thin-content** warnings.
- `check-protection.mjs`: Astro mode (build output, `.gitignore`, committed `dist/`/`node_modules`/`.env`, deploy workflows); `--production <host>`.
- `deploy-settings.mjs`: Astro staging settings and `--host hostinger|wpengine|cloudflare-pages` needs/limits (WP Engine redirect list for the User Portal).
- `optimize-images.mjs`: Astro master mode — one renamed, rotated, stripped, ≤ 2400 px master per photo in `src/assets/images/` + `<ResponsiveImage>` import snippet (Astro generates AVIF/WebP sizes); `--variants` keeps the v1 behaviour.
- `serve.mjs`: serves `dist/` for Astro; Hostinger mode now applies `.htaccess` `Redirect`/`RedirectMatch` 301s.
- `migration-check.mjs`: reads redirects from `site.config.json`, `dist/_redirects` and `dist/.htaccess`; checks pages in `dist/`.
- `staging-check.mjs`, `browser-check.mjs`: use the built site and its sitemap; Astro source probes.
- `build.mjs`: delegates to `npm run build` in Astro projects (same release command everywhere); `--check` reports dist freshness.
- `init.mjs`: Astro starter by default; merges package.json without clobbering; refuses to scaffold Astro over an existing HTML site; `--legacy-static` for maintaining v1 repos.
- `sync-skill.sh`: refuses MAJOR version jumps unless `--accept-major`; `--dry-run`; reports the project type.
- `cloudflare-pages.mjs` diagnoses: Astro content-schema errors, unsafe redirect maps, Node ≥ 22.22.
- `examples/astro-sample/` (fictional) and `scripts/selftest-astro.mjs` (16 steps: unit tests for detection, starter integrity, redirects, dist audit, workflow rules; end to end with real `npm install` + `astro build`, validate 0/0/0, sitemap/redirect/permalink output, unsafe redirects fail the build, stale/duplicate/schema failures caught, protection regressions caught, migration-check, Hostinger + Cloudflare local hosts, staging-check, deploy-settings). `selftest.mjs` runs it after the legacy steps (`--skip-astro` to skip).
- References rewritten for Astro: architecture, deployment (per-host production setup and limitations, permission separation), content-collections, images (honesty rules for AI/stock images), seo, migrations (WordPress → Astro, HTML → Astro), qa, security, integrations, performance, design (avoiding generic AI layouts), distribution, worked example.

### Changed
- `templates/starter/` → `templates/static/` (legacy). `init.mjs --static`/`--legacy-static` uses it.
- Legacy repos: behaviour unchanged except new duplicate/thin-content **warnings** (never blocking on legacy sites).

### Upgrading client repos
- **Legacy HTML repos:** `sync-skill.sh <src> --accept-major`. No site files change; `build.mjs --check` reports 0 changed files; validation is the same plus new warnings. Production stays the owner's Hostinger Redeploy.
- **Existing Astro repos built outside this skill:** sync, then compare with `templates/astro/` (`init.mjs --only public/.htaccess,public/_headers,integrations,.github/workflows` copies missing files without overwriting), run `npm run build && validate.mjs && check-protection.mjs`.
- **New sites:** `init.mjs` (Astro). Migrating a legacy site to Astro is a separate, approved project (references/migrations.md).

## 1.2.3 — 2026-10-16

Fixes found while auditing a hand-built client site (own header/footer sync script, `<FilesMatch>` rules):

- `components/`, `partials/` and `includes/` count as private source folders. Any top-level folder or file that the site's own `.htaccess` already hides is now also treated as private, so `check-protection.mjs` requires a matching `_redirects` rule. Before this, such folders were exposed on Cloudflare staging without a warning.
- The `.htaccess` evaluator understands `<Files>`/`<FilesMatch>` sections containing `Require all denied` / `Deny from all`. These were reported as unprotected before.
- Page discovery in `validate.mjs` and `browser-check.mjs` follows the same private list, so header/footer partials in `components/` are no longer validated as pages. On the audited repo, this removed about 30 false validation errors and 16 false browser-check errors.
- Selftest: 1 new step (37 total).

## 1.2.2 — 2026-10-16

Claude can now manage the Cloudflare Pages **staging** project through the Cloudflare API. The workflow doesn't change: one repo, `main` only, one set of files, automatic staging, and a manual Hostinger Redeploy by the owner.

- New `cloudflare-pages.mjs`:
  - `doctor`: checks the token, the account and Pages access.
  - `detect`: finds an existing project by connected repo, name or staging URL before anything is created.
  - `create`: makes a GitHub-connected project with `main` deploying automatically, previews off, and the `deploy-settings.mjs` build command and output. Dry run unless `--yes`. Refuses to create a second project, a name used by another repo, or a site with unprotected dev files. Records `deploy.staging.url` and `project`.
  - `configure`: diffs the staging build and branch settings and applies them with `--yes`.
  - `status [--wait]`: shows the deployment for local `HEAD`, with its stages.
  - `logs`: prints the build log tail and a plain-language diagnosis of known errors.
  - `retry --yes`: re-runs a failed staging deployment.
  - `verify`: checks HTTPS, noindex on both `<project>.pages.dev` and `<hash>.<project>.pages.dev`, security headers, exposed files and custom domains, then runs `staging-check.mjs` and `browser-check.mjs`.
- New `lib/cloudflare.mjs` API client. Guardrails are in code: an allow-list of API calls with no DELETE, no domain writes, no DNS, Workers or direct uploads. PATCH is limited to build and branch fields.
- Behind an HTTPS proxy, scripts re-run themselves with `NODE_USE_ENV_PROXY=1`, because Node's built-in fetch ignores `HTTPS_PROXY`.
- `staging-check.mjs` now checks security headers (`X-Content-Type-Options`, `Referrer-Policy`, framing) and flags `http://` resources on https staging (`mixed-content`).
- Starter `_headers` adds a `/*` security-header block that matches the starter `.htaccess`.
- Docs: SKILL.md non-negotiable #4 lists what needs the owner's explicit approval: Hostinger deploys, DNS, deleting Cloudflare projects, and custom or live domains. A site's `CLAUDE.md` that forbids Cloudflare changes still wins. Also updated:
  - deployment.md: API workflow, detect-before-create table, troubleshooting table, verify, dashboard fallback.
  - qa.md, starter CLAUDE.md, release sequence.
- Fixed the stale "export step" wording in the `site-noindex` error.
- Selftest: 8 new steps (36 total), all run against a local mock of the Cloudflare API, never the real account.

Upgrading client repos: run `sync-skill.sh`. Nothing changes in site files. Optional: add the starter's `/*` security block to `_headers`, and `"project": "<pages-project>"` to `deploy.staging`.

## 1.2.1 — 2026-10-16

- Fix: `browser-check.mjs` and `validate.mjs` no longer treat HTML inside private source folders (`src/`, `tools/`, …) as pages. Found on a repo whose build turns `src/pages/` into root pages: those templates correctly 404 on both hosts.

## 1.2.0 — 2026-10-16

One repo, one branch, one set of files. Staging and production serve the same committed web root; no export/copy folder.

- **Removed `export-static.mjs` and the `_staging/` folder.** Cloudflare Pages now publishes the existing web root (`exit 0`, output `/`) — the same files Hostinger serves.
- **Dev-file protection on both hosts, checked separately.** Hostinger reads only `.htaccess`; Cloudflare reads only `_redirects`/`_headers`.
  - New `check-protection.mjs` (+ `lib/protect.mjs`): detects private entries in the web root (dotfiles, `_*`, `.claude`, `src/`, `tools/`, `node_modules`, config/docs, `deploy.private`), evaluates the real `.htaccess` rules and `_redirects` rules against each, verifies host-scoped staging noindex in `_headers`, and prints the exact lines to add. Exit 1 on any gap.
  - `validate.mjs` `deploy` group uses it (`hostinger-exposed`, `cloudflare-exposed`, `staging-noindex` errors).
  - Starter ships `_redirects` (dev paths → `/404/`, including `.htaccess`, which Cloudflare would otherwise serve) and `_headers` (noindex only on `https://:project.pages.dev/*` and `https://:version.:project.pages.dev/*`).
  - deployment.md documents the production probe to run after a Redeploy that changes `.htaccess` (staging can't prove Hostinger protection).
- `deploy-settings.mjs`: recommends publishing the committed web root; recognizes committed builds (`src/`→root, `public_html/`) vs uncommitted SSG output; prints a protection summary.
- `serve.mjs`: default mode applies the site's actual `.htaccess` 404 rules (Hostinger); `--cloudflare` applies `_redirects`/`_headers`, ignores `.htaccess`, and uses SPA fallback without `404.html`.
- `staging-check.mjs`: probes every detected private entry with a real file inside it.
- Fixed false positive: deploy-workflow detection ignores comments and matches actual deploy steps.
- Workflow rule: commit directly to `main` once checks pass (unless the site's CLAUDE.md says otherwise); never create branches.
- `site.config.json` `deploy`: removed `outputDir`/`exclude`; added `private` / `public` lists.
- Selftest: export steps replaced by protection, Hostinger-mode and Cloudflare-mode tests.

Upgrading client repos from 1.1.0: remove `_staging/` from `.gitignore`, set the Cloudflare build command to `exit 0` and output to the web root, add `_redirects`/`_headers` (run `check-protection.mjs` for the lines), confirm `.htaccess` covers the same paths.

## 1.1.0 — 2026-10-16

Staging + production workflow: GitHub `main` → Cloudflare Pages staging (automatic, noindexed) → owner approval → manual Hostinger Redeploy. Backward compatible; staging is optional.

- New `export-static.mjs`: Cloudflare build command. Copies the committed site into `_staging/` without dev/private files, writes `_headers` (`X-Robots-Tag: noindex` + security headers), converts simple `.htaccess` redirects to `_redirects`, fails without `404.html`. Never builds content, so staging = production files.
- New `deploy-settings.mjs`: inspects the repo (skill layout, subfolder static sites, Astro/Eleventy/Hugo/Jekyll/Vite/Next/Gatsby/CRA) and prints the Cloudflare build command + output directory; flags deploy workflows, missing 404, gitignore.
- New `staging-check.mjs`: live staging QA — noindex on every page, exposed private files, sitemap pages 200, real 404 (SPA soft-404 detection), nav/internal links, images/assets, form actions, embeds listed for manual TEST submissions.
- `browser-check.mjs --base-url` checks a live deployment (responsive overflow, menu, console, axe).
- `serve.mjs` applies `_headers` (local staging preview), plus `--raw` and `--spa-fallback` simulation modes.
- `validate.mjs` `deploy` group: errors on `site.noindex: true` when main also feeds production, committed `_staging/`, deploying GitHub workflows, `staging.noindex: false`; warns on missing gitignore entry and missing `.htaccess` private-path rules; missing `404.html` is an error with Cloudflare staging.
- Starter: `deploy` block in `site.config.json`, `_staging/` in `.gitignore`, CLAUDE.md hosting section, tracking partial loads GTM/GA4/Clarity only on the production hostname.
- Docs: deployment.md rewritten (workflow, Cloudflare setup, build settings decision table, staging protection, release sequence); staging QA in qa.md; notes in integrations, security, architecture, worked example; SKILL.md non-negotiable #4 and release sequence.
- Selftest: 11 new steps (24 total).

Upgrading existing client repos: run `sync-skill.sh`. Add a `deploy` block to `site.config.json` only for sites using staging. Existing `_partials/head-tracking.html` files are not changed — copy the hostname guard from the starter if the site has tracking.

## 1.0.0 — 2026-10-16

- Initial release.
- SKILL.md workflow router + 14 reference documents (architecture, design, images, SEO, performance, collections, migrations, integrations, accessibility, security, QA, deployment, distribution, worked example).
- Zero-dependency scripts: `build.mjs` (includes, collections, pagination, categories, JSON-LD, asset versioning, sitemap, stale cleanup, `--check`), `validate.mjs`, `serve.mjs`, `init.mjs`, `migration-check.mjs`, `selftest.mjs`, `sync-skill.sh`.
- Optional-dependency scripts: `optimize-images.mjs` (sharp), `browser-check.mjs` (Playwright, axe-core, pngjs+pixelmatch).
- Starter template: config, header/footer/tracking partials, article + archive templates, home/contact/404 pages, CSS, JS, `.htaccess`, robots.txt, CLAUDE.md.
