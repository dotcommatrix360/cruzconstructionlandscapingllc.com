# local-business-website-builder

Dotcom Matrix 360's Claude Code skill for building, migrating, publishing and maintaining local business websites.
Claude reads `SKILL.md`; this file is for humans.

**Standard since 2.0.0: every new website is Astro with static output** (including 5-page sites). Legacy hand-built
HTML client repos keep working with the same scripts until a migration is approved.

## Start a new client site

```bash
mkdir client-site && cd client-site && git init -b main
bash /path/to/agency-website-skills/skills/local-business-website-builder/scripts/sync-skill.sh /path/to/agency-website-skills/skills/local-business-website-builder
node .claude/skills/local-business-website-builder/scripts/init.mjs     # Astro starter; never overwrites
npm install && npm run dev
```

Then in Claude Code: `/local-business-website-builder build the homepage from the attached Figma export` — or just
describe the task; Claude loads the skill automatically when the request matches.

## What the starter gives you (`templates/astro/`)

- Astro 7 (`output: 'static'`, trailing-slash directory URLs), TypeScript, exact pinned dependencies, `.node-version`.
- Layouts + components: SEO tags, JSON-LD (LocalBusiness, Service, BreadcrumbList, BlogPosting, FAQPage), header with accessible mobile menu, footer with NAP/hours, hero, CTA band, FAQ, service cards, testimonials (real only), breadcrumbs, contact form (GHL / Formspree / custom), responsive AVIF/WebP images.
- Content collections with SEO-enforcing schemas: blog (paginated), services, locations (dynamic static routes), testimonials; `permalink:` keeps old URLs.
- `site.config.json` as the single source of truth, including redirects → generated `_redirects` + `.htaccess`.
- Design tokens in one file; neutral starter look that every client must replace.
- `.github/workflows/quality.yml` (checks on push) and `deploy-production.yml` (manual, owner-approved production deploy to Hostinger, WP Engine or Cloudflare Pages).
- Placeholder content is marked `TODO:` and fails validation, so it can't be deployed or mistaken for real client facts.

## Staging & production

One repo, one branch (`main`), one source of truth; `dist/` is never committed.

- **Staging (automatic):** Cloudflare Pages builds every push to `main` (framework Astro, `npm run build`, output `dist`), noindexed on `*.pages.dev` by `_headers`. Claude manages the staging project via `scripts/cloudflare-pages.mjs` (detect → create → status → logs/retry → verify) using `CLOUDFLARE_API_TOKEN` (Pages: Edit) or proxy-injected credentials. It can't delete projects, touch domains or DNS.
- **Production (manual):** after approving staging, the owner runs **Actions → Deploy production** (types the domain; the `production` environment reviewer approves). It builds `main`, re-runs the checks, backs up the live site, uploads only `dist/` (Hostinger via SSH, WP Engine via SSH Gateway, or a separate Cloudflare Pages project) and probes the result. Claude never runs it without explicit approval.

Details and per-host setup/limitations: `references/deployment.md`; `scripts/deploy-settings.mjs --host <host>` prints them for a repo.

## Requirements

- Node **22.22+** (Astro 7). npm.
- Installed by the starter: `astro`, `sharp`, `@astrojs/check`, `typescript`.
- Optional per repo: `playwright` + `axe-core` (browser + accessibility checks), `pngjs` + `pixelmatch` (visual diff), `html-validate`.
- Legacy static repos still need nothing beyond Node 18+.

## Verify the skill itself

```bash
node scripts/selftest.mjs              # legacy (static) steps + Astro end to end (needs network for npm install)
node scripts/selftest.mjs --skip-astro # offline: legacy steps only
LBWB_NODE_MODULES=/path/to/node_modules node scripts/selftest-astro.mjs   # reuse an install
```

See `references/distribution.md` for versioning, syncing client repos and rolling out major versions; `CHANGELOG.md` for history.
