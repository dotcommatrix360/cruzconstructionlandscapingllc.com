# Migrations & Recreations

Matching the design ≠ completing the migration. SEO equity lives in URLs, content, metadata, schema, internal links
and redirects. **Preserve all of them unless the owner explicitly approves a change** (and record the approval).
Every migration target is Astro (static output).

## Phase 1 — Inventory (before building)

1. **URLs**: old `sitemap.xml` (WordPress: `/sitemap_index.xml` or `/wp-sitemap.xml`; Wix/Squarespace: `/sitemap.xml`), plus a crawl and any list from the client. Save to `_migration/old-urls.txt` (one absolute URL per line).
   - `node $S/migration-check.mjs https://oldsite.com/sitemap_index.xml --save _migration/old-urls.txt` (expands sitemap indexes; needs network). Sites behind a bot check (Cloudflare "Just a moment") need a headless browser (Playwright) instead of plain HTTP.
   - Sitemaps miss things: also collect URLs from the old menus, internal links and Search Console.
2. **Traffic priority**: Search Console / GA4 exports → mark top landing pages; these must keep URL + content parity.
3. **Per-page capture** for every page that continues to exist: title, meta description, H1, main copy, images (+ alt), internal links, schema, canonical, FAQs. Store in `_migration/` (text dumps, screenshots). `_migration/` is source-only — never in `dist/`.
4. **Existing redirects** (`.htaccess`, Redirection/Yoast plugin export, platform settings) → carry forward, flattened to one hop.
5. **Assets**: images, PDFs, video — download originals, rename, `optimize-images.mjs`. Look at every image; don't import stock/AI images as client work.
6. **Functionality**: forms (and where they deliver!), booking, chat, tracking (GTM/GA4/Ads/pixels), GBP links, embeds, payment links, popups.
7. **Platform quirks**: WordPress `/category/`, `/tag/`, `/author/`, `/feed/`, attachment pages, `?p=123`, `-2` slug duplicates and `*-old` drafts; Wix `/post/`; Squarespace `/blog?offset=`; GoDaddy `/m/`.

## Phase 2 — Build (Astro)

- **Same path for every page that continues to exist.** Pages in `src/pages/` at the old path, or collection entries with `permalink: /old-path/` (WordPress root-level posts, old service URLs). `trailingSlash: 'always'` keeps WordPress-style URLs identical.
- Keep titles/descriptions of ranking pages (`seoTitle` when the old title is long); improve weak ones only with approval for high-traffic pages.
- Content parity: no dropped sections, FAQs or internal links on ranking pages without the owner's say-so. Fix only obvious typos.
- Schema: carry over legitimate structured data (LocalBusiness, FAQ, BreadcrumbList); drop self-serving review markup.
- Near-duplicate old pages (WordPress town pages with only the name swapped) are a finding to report, not something to copy blindly: `validate.mjs` fails them on Astro. Options for the owner: write genuinely local content, merge into one page + 301s, or keep only the ones with real substance.

## Phase 3 — Redirect map

Every old URL without an equivalent path gets a 301 to the closest matching page in `site.config.json → redirects`
(the build writes `_redirects` + `.htaccess`, and refuses chains, loops, missing targets). Low-value URLs (tags,
attachments, authors, `-old` duplicates) → their parent/closest page. Never mass-redirect to the homepage.
WP Engine production: also add the list in the User Portal.

## Phase 4 — Verify

```bash
npm run build && node $S/validate.mjs && node $S/check-protection.mjs
node $S/migration-check.mjs _migration/old-urls.txt      # every old URL: kept, redirected, or MISSING (exit 1)
node $S/serve.mjs   # spot-check redirects locally in Hostinger mode (--cloudflare for Cloudflare rules)
```

Also manually: canonical host/https in canonicals and sitemap, forms deliver to the right place, tracking fires on production only.

## Phase 5 — Report (`_migration/report.md`)

- Old URL count; preserved / redirected / intentionally dropped (with reasons and who approved).
- Content or features not recreated; metadata changes on priority pages.
- Redirect rules added; duplicate/thin pages found and what was decided.
- Tests run + results; manual items: Search Console sitemap resubmission, GBP website link, 404 monitoring for 2–4 weeks.

## WordPress → Astro specifics

- Posts → `src/content/blog/*.md` (front matter: title, description, original `date`, `updated`, image + alt, `permalink: /slug/` when posts lived at the root).
- Pages → `src/pages/` or a collection (services/locations) when they share a layout.
- Shortcodes, page-builder markup (Divi, Elementor) → rebuild as components; don't paste builder HTML.
- Popups, sliders and plugins (reviews widgets, Trustindex) → a static component or a lazy third-party embed; never fake the review data.
- Forms (Gravity Forms, CF7) → the client's CRM/form provider (GHL, Formspree…) via `integrations.form`; test-submit on staging.

## HTML → Astro (migrating a legacy v1 client repo)

A legacy repo is maintained as-is until the owner approves migrating it. When approved:

1. In the same repo and branch, scaffold Astro **without** the legacy pages being served twice: move the old HTML out of the web root into `_migration/legacy-html/` in the same commit that adds the Astro pages (one source of truth at any time).
2. Port partials → components, `_content/` posts → `src/content/blog/` (keep slugs/permalinks), `_templates/` → layouts, `assets/css/main.css` tokens → `src/styles/tokens.css`, `.htaccess` redirects → `site.config.json → redirects`.
3. Run `migration-check.mjs` against the old sitemap; compare page-by-page screenshots (old site vs new build) at 1440 and 390.
4. Switch Cloudflare staging to `npm run build` / `dist` (`cloudflare-pages.mjs configure --yes`) and production to the Deploy production workflow (owner turns off Hostinger Git auto-deploy).

## Go-live boundaries

DNS, hosting panels, Hostinger/WP Engine settings, domains/SSL and production deploys: **never without explicit
authorization.** Provide the exact steps for the owner instead.
